import {
  type CalendarResult,
  dateOnly,
  type Employee,
  type Holiday,
  type Leave,
  monthDays,
} from './domain';

const DIRECTORY_PATH = '/people-directory';
const CALENDAR_PATH = '/home/get-calendar';
const REQUEST_TIMEOUT_MS = 10_000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

class AdapterError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizedHeader(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isTruthyFlag(value: string | null): boolean {
  return value !== null && /^(?:1|true|yes|on|server)$/i.test(value.trim());
}

function looksLikeLogin(document: Document): boolean {
  if (document.querySelector('input[type="password"], form[action*="login" i]')) {
    return true;
  }

  const title = cleanText(document.querySelector('title')?.textContent).toLowerCase();
  const body = cleanText(document.body?.textContent).toLowerCase();
  return /\blog\s*in\b|\bsign\s*in\b/.test(title) && body.length < 20_000;
}

function profileIdFromHref(href: string | null): string | null {
  if (!href || /^\s*(?:javascript:|data:|mailto:)/i.test(href)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(href, 'https://hbhr.invalid/');
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  for (const key of ['user_id', 'userId', 'employee_id', 'employeeId', 'id']) {
    const value = url.searchParams.get(key);
    if (value && SAFE_ID_PATTERN.test(value)) {
      return value;
    }
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  for (let index = pathParts.length - 1; index >= 0; index -= 1) {
    const pathPart = pathParts[index];
    const parentPart = (pathParts[index - 1] ?? '').toLowerCase();
    if (
      SAFE_ID_PATTERN.test(pathPart) &&
      (/^\d+$/.test(pathPart) ||
        /^(?:user|users|profile|profiles|employee|employees|person|people|staff)$/.test(parentPart))
    ) {
      return pathPart;
    }
  }

  return null;
}

function tableIsIncomplete(root: Element, document: Document, rowCount: number): boolean {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  const serverFlagNames = ['data-server-side', 'data-serverside', 'data-server-side-pagination'];
  if (
    elements.some((element) =>
      serverFlagNames.some((name) => isTruthyFlag(element.getAttribute(name))) ||
      isTruthyFlag(element.getAttribute('serverside')),
    )
  ) {
    return true;
  }

  if (
    elements.some((element) => {
      const pagination = element.getAttribute('data-pagination');
      const mode = element.getAttribute('data-mode');
      return pagination?.toLowerCase() === 'server' || mode?.toLowerCase() === 'server';
    })
  ) {
    return true;
  }

  const pageIndicators = elements.filter((element) =>
    [
      'data-page',
      'data-current-page',
      'data-total-pages',
      'data-page-count',
      'data-total-rows',
      'data-total-count',
    ].some(
      (name) => element.hasAttribute(name),
    ),
  );
  if (pageIndicators.length > 0) {
    return true;
  }

  const summary = cleanText(document.body?.textContent);
  const summaryMatch =
    /showing\s+\d+\s+(?:to|-)?\s*\d+\s+of\s+(\d+)/i.exec(summary) ??
    /\b\d+\s*(?:-|to)\s*\d+\s+of\s+(\d+)\b/i.exec(summary);
  if (summaryMatch && Number(summaryMatch[1]) > rowCount) {
    return true;
  }

  const ariaRowCount = root.getAttribute('aria-rowcount');
  if (ariaRowCount && Number(ariaRowCount) > rowCount) {
    return true;
  }

  const scripts = Array.from(document.scripts)
    .filter((script) => !script.src)
    .map((script) => script.textContent ?? '')
    .join('\n');
  return /\bserverSide\s*:\s*true\b|["']serverSide["']\s*:\s*true\b/.test(scripts);
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizedHeader);
  const normalizedAliases = aliases.map(normalizedHeader);
  return normalized.findIndex((header) => normalizedAliases.includes(header));
}

function directCells(row: Element): Element[] {
  return Array.from(row.children).filter((child) => /^(?:TH|TD)$/i.test(child.tagName));
}

export function parseDirectory(html: string): Employee[] {
  if (typeof html !== 'string') {
    throw new AdapterError('Directory response was not HTML.');
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  if (looksLikeLogin(document)) {
    throw new AdapterError('Log into HBHR, then refresh.');
  }

  const root = document.querySelector('#user-profile');
  if (!root) {
    throw new AdapterError('HBHR directory table was not found.');
  }

  const table = root.matches('table') ? root : root.closest('table') ?? root.querySelector('table');
  if (!table) {
    throw new AdapterError('HBHR directory table was not found.');
  }

  const rows = Array.from(table.querySelectorAll('tr'));
  const headerRow = rows.find((row) =>
    directCells(row).some(
      (cell) =>
        cell.tagName.toLowerCase() === 'th' ||
        cell.getAttribute('role')?.toLowerCase() === 'columnheader',
    ) || row.parentElement?.tagName.toLowerCase() === 'thead',
  );
  if (!headerRow) {
    throw new AdapterError('HBHR directory headers were not found.');
  }

  const headerCells = directCells(headerRow);
  const headers = headerCells.map(
    (cell) =>
      cell.getAttribute('data-field') ??
      cell.getAttribute('data-column') ??
      cell.getAttribute('data-key') ??
      cell.getAttribute('aria-label') ??
      cell.textContent ??
      '',
  );
  const nameIndex = findHeaderIndex(headers, [
    'name',
    'fullname',
    'employeename',
    'displayname',
    'user',
    'username',
  ]);
  if (nameIndex < 0) {
    throw new AdapterError('HBHR directory headers were unexpected.');
  }

  const departmentIndex = findHeaderIndex(headers, ['department', 'team', 'division']);
  const managerIndex = findHeaderIndex(headers, ['manager', 'Line Manager', 'reportsTo', 'supervisor', 'lead']);
  const regionIndex = findHeaderIndex(headers, ['region', 'location', 'office']);
  const dataRows = rows.filter((row) => row !== headerRow);
  if (tableIsIncomplete(root, document, dataRows.length)) {
    throw new AdapterError('HBHR directory is paginated or incomplete.');
  }

  const people = new Map<string, Employee>();
  for (const row of dataRows) {
    const cells = directCells(row);
    if (cells.length === 0) {
      continue;
    }

    const profileLink = row.querySelector('a[href]');
    const id = profileIdFromHref(profileLink?.getAttribute('href') ?? null);
    if (!id) {
      continue;
    }

    const valueAt = (index: number): string => cleanText(index >= 0 ? cells[index]?.textContent : '');
    const name = valueAt(nameIndex) || cleanText(profileLink?.textContent);
    if (!name) {
      continue;
    }

    const employee: Employee = {
      id,
      name,
      department: valueAt(departmentIndex),
      manager: valueAt(managerIndex),
      region: valueAt(regionIndex),
    };
    const existing = people.get(id);
    if (!existing) {
      people.set(id, employee);
    } else {
      people.set(id, {
        id,
        name: existing.name || employee.name,
        department: existing.department || employee.department,
        manager: existing.manager || employee.manager,
        region: existing.region || employee.region,
      });
    }
  }

  return Array.from(people.values());
}

function eventType(value: unknown): 'leave' | 'holiday' | 'unknown' | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
  if (
    ['leave', 'absence', 'vacation', 'timeoff'].includes(normalized) ||
    normalized.includes('leave') ||
    normalized.includes('absence')
  ) {
    return 'leave';
  }
  if (['holiday', 'publicholiday', 'bankholiday'].includes(normalized) || normalized.includes('holiday')) {
    return 'holiday';
  }
  return 'unknown';
}

function readCalendarEvents(input: Record<string, unknown>): Array<{ value: unknown; hint?: 'leave' | 'holiday' }> {
  const payload = isRecord(input.data) ? input.data : input.data;
  const sources: unknown[] = [input, payload];
  const events: Array<{ value: unknown; hint?: 'leave' | 'holiday' }> = [];

  for (const source of sources) {
    if (Array.isArray(source)) {
      events.push(...source.map((value) => ({ value })));
      continue;
    }
    if (!isRecord(source)) {
      continue;
    }

    if (Array.isArray(source.calendar_data)) {
      events.push(...source.calendar_data.map((value) => ({ value })));
    }

    if (Array.isArray(source.events)) {
      events.push(...source.events.map((value) => ({ value })));
    }
    if (Array.isArray(source.leaves)) {
      events.push(...source.leaves.map((value) => ({ value, hint: 'leave' as const })));
    }
    if (Array.isArray(source.holidays)) {
      events.push(...source.holidays.map((value) => ({ value, hint: 'holiday' as const })));
    }

    if (Array.isArray(source.calendar)) {
      events.push(...source.calendar.map((value) => ({ value })));
    } else if (isRecord(source.calendar)) {
      const nested = readCalendarEvents({ success: true, data: source.calendar });
      events.push(...nested);
    }
  }

  return events;
}

function hasCalendarEventContainer(input: Record<string, unknown>): boolean {
  if (Array.isArray(input.calendar_data)) return true;
  if ('events' in input || 'leaves' in input || 'holidays' in input) {
    return true;
  }

  if (Array.isArray(input.data)) {
    return true;
  }
  if (Array.isArray(input.calendar)) {
    return true;
  }
  if (isRecord(input.calendar)) {
    return hasCalendarEventContainer(input.calendar);
  }
  if (!isRecord(input.data)) {
    return false;
  }

  return (
    'events' in input.data ||
    'leaves' in input.data ||
    'holidays' in input.data ||
    (Array.isArray(input.data.calendar) ||
      (isRecord(input.data.calendar) && hasCalendarEventContainer(input.data.calendar)))
  );
}

function validateCalendarEventContainers(input: Record<string, unknown>): void {
  for (const key of ['calendar_data', 'events', 'leaves', 'holidays']) {
    if (key in input && !Array.isArray(input[key])) {
      throw new AdapterError(`HBHR calendar ${key} were malformed.`);
    }
  }

  if (isRecord(input.data)) {
    validateCalendarEventContainers(input.data);
  }
  if (isRecord(input.calendar)) {
    validateCalendarEventContainers(input.calendar);
  }
  if (isRecord(input.data) && isRecord(input.data.calendar)) {
    validateCalendarEventContainers(input.data.calendar);
  }
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return String(value);
  }
  return null;
}

function idValue(value: unknown): string | null {
  const result = stringValue(value);
  return result && SAFE_ID_PATTERN.test(result) ? result : null;
}

function warningFor(kind: string): string {
  return `Ignored malformed ${kind} event.`;
}

export function parseCalendar(input: unknown, memberIds: string[]): CalendarResult {
  if (!isRecord(input) || input.success !== true) {
    throw new AdapterError(
      isRecord(input) && input.success === false
        ? 'HBHR calendar request was not successful.'
        : 'HBHR calendar response was malformed.',
    );
  }

  validateCalendarEventContainers(input);
  const rawEvents = readCalendarEvents(input);
  if (rawEvents.length === 0 && !hasCalendarEventContainer(input)) {
    throw new AdapterError('HBHR calendar events were missing.');
  }

  const selected = new Set(
    memberIds.filter((memberId): memberId is string => typeof memberId === 'string'),
  );
  const leaves: Leave[] = [];
  const holidays: Holiday[] = [];
  const warnings: string[] = [];

  rawEvents.forEach(({ value, hint }) => {
    if (!isRecord(value)) {
      warnings.push(warningFor('calendar'));
      return;
    }

    const type = hint ?? eventType(value.type ?? value.event_type ?? value.category);
    const hasUser = value.user_id !== undefined || value.userId !== undefined;
    const resolvedType = type ?? (hasUser ? 'leave' : 'holiday');
    if (resolvedType === 'unknown') {
      warnings.push('Ignored unsupported calendar event type.');
      return;
    }

    const start = dateOnly(value.start ?? value.start_date ?? value.date);
    const end = dateOnly(value.end ?? value.end_date ?? value.date ?? value.start);
    if (!start || !end || start > end) {
      warnings.push(warningFor(resolvedType));
      return;
    }

    if (resolvedType === 'holiday') {
      const label = stringValue(value.only_text ?? value.label ?? value.name ?? value.title);
      if (!label) {
        warnings.push(warningFor('holiday'));
        return;
      }
      holidays.push({ start, end, label });
      return;
    }

    const userId = idValue(value.user_id ?? value.userId);
    const id = idValue(value.id ?? value.event_id);
    const status = typeof value.status === 'string' ? value.status.toLowerCase() : '';
    const label = stringValue(value.only_text ?? value.label ?? value.name ?? value.title);
    if (
      !userId ||
      !id ||
      !label ||
      !selected.has(userId) ||
      (status !== 'approved' && status !== 'pending')
    ) {
      if (!userId || !id || !label || (status !== 'approved' && status !== 'pending')) {
        warnings.push(warningFor('leave'));
      }
      return;
    }

    leaves.push({ id, userId, start, end, status, label });
  });

  return { leaves, holidays, warnings };
}

function currentUserIds(scriptText: string, scriptElement: HTMLScriptElement): Set<string> {
  const ids = new Set<string>();
  const currentContext = /\b(?:current[_\s-]?user|currentUser|logged[_\s-]?in[_\s-]?user|authenticated[_\s-]?user|current[_\s-]?account|currentAccount)\b/i;
  const direct = /\b(?:current[_\s-]?user|logged[_\s-]?in[_\s-]?user|authenticated[_\s-]?user)(?:[_\s-]?id)?\s*[:=]\s*["']?(\d+)["']?/gi;
  const objectProperty =
    /["']?\b(?:current[_\s-]?user|logged[_\s-]?in[_\s-]?user|authenticated[_\s-]?user)\b["']?\s*(?:[:=])\s*\{[^{}]{0,500}?["']?\buser_id\b["']?\s*:\s*["'](\d+)["']/gi;
  const elementContext = Array.from(scriptElement.attributes)
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .join(' ');

  for (const match of scriptText.matchAll(direct)) {
    ids.add(match[1]);
  }

  // Verified HBHR mileage form embeds the signed-in user's ID explicitly.
  if (scriptText.includes('/user/vehicle-rates')) {
    for (const match of scriptText.matchAll(/\buser_id\s*:\s*["'](\d+)["']/g)) ids.add(match[1]);
  }

  for (const match of scriptText.matchAll(objectProperty)) {
    ids.add(match[1]);
  }

  if (currentContext.test(scriptElement.id) || currentContext.test(elementContext)) {
    const property = /\buser_id\s*[:=]\s*["'](\d+)["']/gi;
    for (const match of scriptText.matchAll(property)) {
      ids.add(match[1]);
    }
  }

  return ids;
}

/**
 * HBHR does not expose a verified organisation identifier here. Scope uses the
 * verified user ID and must not be treated as globally unique across organisations.
 */
export function detectAccount(document: Document): string | null {
  const verifiedIds = new Set<string>();
  const currentIds = new Set<string>();
  const verifiedPattern = /\bevent\s*\.\s*event\s*\.\s*user_id\s*={2,3}\s*["'](\d+)["']/g;

  for (const script of Array.from(document.scripts)) {
    if (script.src) {
      continue;
    }

    const text = script.textContent ?? '';
    for (const match of text.matchAll(verifiedPattern)) {
      verifiedIds.add(match[1]);
    }
    for (const id of currentUserIds(text, script)) {
      currentIds.add(id);
    }
  }

  // The calendar script is optional (e.g. hidden/native widget variants).
  // A unique explicit current-user signal suffices; calendar IDs corroborate
  // when present, but may never contradict the current-user identity.
  if (verifiedIds.size > 1 || currentIds.size !== 1) {
    return null;
  }

  const [verifiedId] = verifiedIds;
  const [currentId] = currentIds;
  return verifiedIds.size === 0 || verifiedId === currentId ? `hbhr:user:${currentId}` : null;
}

interface RequestSignal {
  signal: AbortSignal;
  dispose: () => void;
}

function boundedSignal(parent?: AbortSignal): RequestSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = (): void => controller.abort();
  if (parent) {
    if (parent.aborted) {
      controller.abort();
    } else {
      parent.addEventListener('abort', abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    },
  };
}

function responseIsAuthFailure(response: Response): boolean {
  return response.status === 401 || response.status === 403 || response.status === 419 || response.redirected && /\/login(?:[/?#]|$)/i.test(response.url);
}

function throwForResponse(response: Response): void {
  if (responseIsAuthFailure(response)) {
    throw new AdapterError('Log into HBHR, then refresh.');
  }
  throw new AdapterError(`HBHR request failed (${response.status}).`);
}

function isLoginHtml(html: string): boolean {
  const lower = html.toLowerCase();
  return /<input[^>]+type\s*=\s*["']?password\b/.test(lower) || /<form[^>]+action\s*=\s*["'][^"']*login/.test(lower);
}

export async function fetchDirectory(signal?: AbortSignal): Promise<Employee[]> {
  const request = boundedSignal(signal);
  try {
    const response = await fetch(DIRECTORY_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
      signal: request.signal,
    });
    if (!response.ok) {
      throwForResponse(response);
    }

    const html = await response.text();
    if (isLoginHtml(html) || /\/login(?:[/?#]|$)/i.test(response.url)) {
      throw new AdapterError('Log into HBHR, then refresh.');
    }
    return parseDirectory(html);
  } finally {
    request.dispose();
  }
}

export async function fetchCalendar(
  month: string,
  memberIds: string[],
  signal?: AbortSignal,
): Promise<CalendarResult> {
  const ids = Array.from(
    new Set(memberIds.filter((memberId): memberId is string => typeof memberId === 'string' && memberId.length > 0)),
  );
  if (ids.length === 0) {
    return { leaves: [], holidays: [], warnings: [] };
  }

  const days = monthDays(month);

  const params = new URLSearchParams({
    first_day: calendarDate(days[0]),
    last_day: calendarDate(days[days.length - 1]),
  });
  for (const id of ids) {
    params.append('user_id[]', id);
  }

  const request = boundedSignal(signal);
  try {
    const response = await fetch(`${CALENDAR_PATH}?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: request.signal,
    });
    if (!response.ok) {
      throwForResponse(response);
    }

    const contentType = (response.headers?.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new AdapterError('Log into HBHR, then refresh.');
    }

    const body = await response.text();
    if (isLoginHtml(body)) {
      throw new AdapterError('Log into HBHR, then refresh.');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new AdapterError('HBHR calendar response was malformed.');
    }
    return parseCalendar(payload, ids);
  } finally {
    request.dispose();
  }
}

function calendarDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${weekdays[value.getUTCDay()]} ${months[value.getUTCMonth()]} ${String(value.getUTCDate()).padStart(2, '0')} ${value.getUTCFullYear()}`;
}