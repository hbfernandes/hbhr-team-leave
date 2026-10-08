import { defaultWorkspace, type Group, type Preferences, type Workspace } from './domain';

const STORAGE_PREFIX = 'hbhr:workspace:';
const MAX_GROUPS = 100;
const MAX_GROUP_MEMBERS = 1_000;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MAX_IMPORT_BYTES = 256 * 1024;
const MAX_THRESHOLD = 1_000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type WorkspaceInspection =
  | { status: 'missing' }
  | { status: 'valid'; workspace: Workspace }
  | { status: 'invalid' };

export type LegacyRecoveryResult =
  | { status: 'recovered'; workspace: Workspace }
  | { status: 'destination-exists'; workspace: Workspace }
  | { status: 'source-missing' }
  | { status: 'source-invalid' }
  | { status: 'destination-invalid' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, label: string, maxLength: number): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Invalid ${label}.`);
  }
}

function assertSafeId(value: unknown, label: string): asserts value is string {
  assertString(value, label, MAX_ID_LENGTH);
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function assertScope(scope: unknown): asserts scope is string {
  assertString(scope, 'scope', 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(scope)) {
    throw new Error('Invalid scope.');
  }
}

function rejectSensitiveKeys(value: Record<string, unknown>): void {
  for (const key of ['leaves', 'holidays', 'calendar', 'events', 'credentials', 'token', 'cookie']) {
    if (key in value) {
      throw new Error('Workspace contains unsupported data.');
    }
  }
}

function normalizeGroup(value: unknown): Group {
  if (!isRecord(value)) {
    throw new Error('Invalid group.');
  }
  rejectSensitiveKeys(value);
  assertSafeId(value.id, 'group id');
  assertString(value.name, 'group name', MAX_NAME_LENGTH);
  if (!value.name.trim()) {
    throw new Error('Invalid group name.');
  }
  if (!Array.isArray(value.memberIds) || value.memberIds.length > MAX_GROUP_MEMBERS) {
    throw new Error('Invalid group members.');
  }

  const memberIds: string[] = [];
  const seen = new Set<string>();
  for (const memberId of value.memberIds) {
    assertSafeId(memberId, 'member id');
    if (!seen.has(memberId)) {
      seen.add(memberId);
      memberIds.push(memberId);
    }
  }

  return { id: value.id, name: value.name, memberIds };
}

function normalizePreferences(value: unknown, groups: Group[]): Preferences {
  if (!isRecord(value)) {
    throw new Error('Invalid preferences.');
  }
  rejectSensitiveKeys(value);
  if (typeof value.selectedGroupId !== 'string' || value.selectedGroupId.length > MAX_ID_LENGTH) {
    throw new Error('Invalid selected group.');
  }
  if (
    value.selectedGroupId !== '' &&
    !groups.some((group) => group.id === value.selectedGroupId)
  ) {
    throw new Error('Selected group does not exist.');
  }
  if (typeof value.pending !== 'boolean' || typeof value.collapsed !== 'boolean') {
    throw new Error('Invalid preferences.');
  }
  if (
    typeof value.threshold !== 'number' ||
    !Number.isSafeInteger(value.threshold) ||
    value.threshold < 1 ||
    value.threshold > MAX_THRESHOLD
  ) {
    throw new Error('Invalid warning threshold.');
  }

  return {
    selectedGroupId: value.selectedGroupId,
    pending: value.pending,
    threshold: value.threshold,
    collapsed: value.collapsed,
  };
}

function normalizeWorkspace(value: unknown, allowLegacyVersion = false): Workspace {
  if (!isRecord(value)) {
    throw new Error('Invalid workspace.');
  }
  rejectSensitiveKeys(value);
  if (value.version !== 1 && !(allowLegacyVersion && value.version === undefined)) {
    throw new Error('Unsupported workspace version.');
  }
  if (!Array.isArray(value.groups) || value.groups.length > MAX_GROUPS) {
    throw new Error('Invalid workspace groups.');
  }

  const groups = value.groups.map(normalizeGroup);
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (groupIds.has(group.id)) {
      throw new Error('Duplicate group id.');
    }
    groupIds.add(group.id);
  }

  return {
    version: 1,
    groups,
    preferences: normalizePreferences(value.preferences, groups),
  };
}

export function validateWorkspace(value: unknown): Workspace {
  return normalizeWorkspace(value);
}

function storageKey(scope: string): string {
  assertScope(scope);
  return `${STORAGE_PREFIX}${scope}`;
}

export function legacyUserScope(userId: string): string {
  assertSafeId(userId, 'user ID');
  return `hbhr:user:${userId}`;
}

function legacyWorkspace(value: unknown): Workspace {
  if (!isRecord(value)) {
    throw new Error('Invalid workspace.');
  }
  if (value.version !== undefined && value.version !== 0) {
    throw new Error('Unsupported workspace version.');
  }
  return normalizeWorkspace(
    {
      version: 1,
      groups: value.groups,
      preferences:
        value.preferences ?? {
          selectedGroupId: value.selectedGroupId ?? '',
          pending: value.pending ?? false,
          threshold: value.threshold ?? defaultWorkspace().preferences.threshold,
          collapsed: value.collapsed ?? false,
        },
    },
    true,
  );
}

function storedValue(stored: unknown, key: string): unknown {
  return isRecord(stored) && Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : undefined;
}

function inspectStoredValue(value: unknown): WorkspaceInspection {
  if (value === undefined) {
    return { status: 'missing' };
  }

  try {
    return { status: 'valid', workspace: validateWorkspace(value) };
  } catch {
    try {
      return { status: 'valid', workspace: legacyWorkspace(value) };
    } catch {
      return { status: 'invalid' };
    }
  }
}

export async function inspectWorkspace(scope: string): Promise<WorkspaceInspection> {
  const key = storageKey(scope);
  const stored = await chrome.storage.local.get(key);
  return inspectStoredValue(storedValue(stored, key));
}

export async function loadWorkspace(scope: string): Promise<Workspace> {
  const inspection = await inspectWorkspace(scope);
  return inspection.status === 'valid' ? inspection.workspace : defaultWorkspace();
}

export async function recoverLegacyWorkspace(
  destinationScope: string,
  legacyScope: string,
  confirmed: boolean,
): Promise<LegacyRecoveryResult> {
  if (!confirmed) {
    throw new Error('Legacy workspace recovery requires confirmation.');
  }

  const source = await inspectWorkspace(legacyScope);
  if (source.status === 'missing') {
    return { status: 'source-missing' };
  }
  if (source.status === 'invalid') {
    return { status: 'source-invalid' };
  }

  const destination = await inspectWorkspace(destinationScope);
  if (destination.status === 'valid') {
    return { status: 'destination-exists', workspace: destination.workspace };
  }
  if (destination.status === 'invalid') {
    return { status: 'destination-invalid' };
  }

  // Chrome storage has no compare-and-swap. Rechecking immediately before this
  // write prevents ordinary repeated recovery from overwriting a destination.
  await saveWorkspace(destinationScope, source.workspace);
  return { status: 'recovered', workspace: source.workspace };
}

export async function saveWorkspace(scope: string, value: Workspace): Promise<void> {
  const key = storageKey(scope);
  const workspace = validateWorkspace(value);
  await chrome.storage.local.set({ [key]: workspace });
}

export function subscribeWorkspace(
  scope: string,
  callback: (value: Workspace) => void,
): () => void {
  const key = storageKey(scope);
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ): void => {
    if (areaName !== 'local' || !changes[key]) {
      return;
    }

    const nextValue = changes[key].newValue;
    if (nextValue === undefined) {
      callback(defaultWorkspace());
      return;
    }

    try {
      callback(validateWorkspace(nextValue));
    } catch {
      callback(defaultWorkspace());
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

function normalizeGroups(groups: Group[]): Group[] {
  if (!Array.isArray(groups) || groups.length > MAX_GROUPS) {
    throw new Error('Invalid groups.');
  }
  const normalized = groups.map(normalizeGroup);
  const ids = new Set<string>();
  for (const group of normalized) {
    if (ids.has(group.id)) {
      throw new Error('Duplicate group id.');
    }
    ids.add(group.id);
  }
  return normalized;
}

export function exportGroups(scope: string, groups: Group[]): string {
  assertScope(scope);
  const normalizedGroups = normalizeGroups(groups);
  return JSON.stringify({ version: 1, scope, groups: normalizedGroups });
}

export function parseImport(text: string): { scope: string; groups: Group[] } {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    throw new Error('Import is too large.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Import is not valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new Error('Import is malformed.');
  }
  rejectSensitiveKeys(parsed);
  if (parsed.version !== 1) {
    throw new Error('Unsupported import version.');
  }
  assertScope(parsed.scope);
  if (!Array.isArray(parsed.groups)) {
    throw new Error('Import groups are missing.');
  }
  return { scope: parsed.scope, groups: normalizeGroups(parsed.groups) };
}

export function mergeGroups(current: Group[], incoming: Group[]): Group[] {
  const existing = normalizeGroups(current);
  const additions = normalizeGroups(incoming);
  const merged = existing.map((group) => ({ ...group, memberIds: [...group.memberIds] }));
  const byId = new Map(merged.map((group) => [group.id, group]));

  for (const group of additions) {
    const currentGroup = byId.get(group.id);
    if (!currentGroup) {
      const copy = { ...group, memberIds: [...group.memberIds] };
      merged.push(copy);
      byId.set(copy.id, copy);
      continue;
    }

    currentGroup.name = group.name;
    currentGroup.memberIds = Array.from(new Set([...currentGroup.memberIds, ...group.memberIds]));
    if (currentGroup.memberIds.length > MAX_GROUP_MEMBERS) {
      throw new Error('Merged group members exceed limit.');
    }
  }

  if (merged.length > MAX_GROUPS) {
    throw new Error('Merged groups exceed limit.');
  }
  return merged;
}