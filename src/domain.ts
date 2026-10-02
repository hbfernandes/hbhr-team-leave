export interface Employee {
  id: string;
  name: string;
  department: string;
  manager: string;
  region: string;
}

export interface Group {
  id: string;
  name: string;
  memberIds: string[];
}

export interface Preferences {
  selectedGroupId: string;
  pending: boolean;
  threshold: number;
  collapsed: boolean;
}

export interface Workspace {
  version: 1;
  groups: Group[];
  preferences: Preferences;
}

export interface Leave {
  id: string;
  userId: string;
  start: string;
  end: string;
  status: 'approved' | 'pending';
  label: string;
}

export interface Holiday {
  start: string;
  end: string;
  label: string;
}

export interface CalendarResult {
  leaves: Leave[];
  holidays: Holiday[];
  warnings: string[];
}

interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDateString(value: string): ParsedDate | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

function formatDate({ year, month, day }: ParsedDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMonth(month: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new RangeError(`Invalid month: ${month}`);
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new RangeError(`Invalid month: ${month}`);
  }

  return { year, month: monthNumber };
}

function formatMonth(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function defaultWorkspace(): Workspace {
  return {
    version: 1,
    groups: [],
    preferences: {
      selectedGroupId: '',
      pending: false,
      threshold: 3,
      collapsed: false,
    },
  };
}

export function monthDays(month: string): string[] {
  const { year, month: monthNumber } = parseMonth(month);
  const totalDays = daysInMonth(year, monthNumber);
  return Array.from({ length: totalDays }, (_, index) =>
    formatDate({ year, month: monthNumber, day: index + 1 }),
  );
}

export function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonth(month);
  if (!Number.isInteger(delta) || !Number.isSafeInteger(delta)) {
    throw new RangeError(`Invalid month delta: ${delta}`);
  }

  const absoluteMonth = parsed.year * 12 + (parsed.month - 1) + delta;
  const year = Math.floor(absoluteMonth / 12);
  const monthNumber = ((absoluteMonth % 12) + 12) % 12 + 1;
  if (year < 0 || year > 9999) {
    throw new RangeError(`Month out of range: ${month}`);
  }

  return formatMonth(year, monthNumber);
}

export function dateOnly(input: unknown): string | null {
  if (typeof input === 'string') {
    const value = input.trim();
    const datePart = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(value)?.[1];
    if (!datePart) {
      return null;
    }

    const parsed = parseDateString(datePart);
    return parsed ? formatDate(parsed) : null;
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return formatDate({
      year: input.getUTCFullYear(),
      month: input.getUTCMonth() + 1,
      day: input.getUTCDate(),
    });
  }

  return null;
}

export function overlaps(
  days: string[],
  leaves: Leave[],
  memberIds: string[],
): Array<{ date: string; approved: string[]; pending: string[] }> {
  const memberOrder = Array.from(
    new Set(memberIds.filter((memberId): memberId is string => typeof memberId === 'string')),
  );
  const memberSet = new Set(memberOrder);
  const normalizedLeaves = (Array.isArray(leaves) ? leaves : []).flatMap((leave) => {
    if (!leave || !memberSet.has(leave.userId)) {
      return [];
    }

    const start = dateOnly(leave.start);
    const end = dateOnly(leave.end);
    if (!start || !end || start > end || (leave.status !== 'approved' && leave.status !== 'pending')) {
      return [];
    }

    return [{ ...leave, start, end }];
  });

  return days.map((day) => {
    const date = dateOnly(day) ?? day;
    const approved = new Set<string>();
    const pending = new Set<string>();

    for (const leave of normalizedLeaves) {
      if (date < leave.start || date > leave.end) {
        continue;
      }

      if (leave.status === 'approved') {
        approved.add(leave.userId);
        pending.delete(leave.userId);
      } else if (!approved.has(leave.userId)) {
        pending.add(leave.userId);
      }
    }

    return {
      date,
      approved: memberOrder.filter((memberId) => approved.has(memberId)),
      pending: memberOrder.filter((memberId) => pending.has(memberId)),
    };
  });
}