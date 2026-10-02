import { describe, expect, it } from 'vitest';
import {
  dateOnly,
  defaultWorkspace,
  monthDays,
  overlaps,
  shiftMonth,
  type Leave,
} from '../src/domain';

describe('domain date helpers', () => {
  it('returns the default workspace shape', () => {
    expect(defaultWorkspace()).toEqual({
      version: 1,
      groups: [],
      preferences: {
        selectedGroupId: '',
        pending: false,
        threshold: 3,
        collapsed: false,
      },
    });
  });

  it('generates complete month ranges including leap days', () => {
    expect(monthDays('2026-10')).toHaveLength(31);
    expect(monthDays('2026-10').slice(0, 2)).toEqual(['2026-10-01', '2026-10-02']);
    expect(monthDays('2026-10').at(-1)).toBe('2026-10-31');
    expect(monthDays('2024-02')).toHaveLength(29);
    expect(monthDays('2023-02')).toHaveLength(28);
  });

  it('shifts months across year and leap-year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2024-02', 12)).toBe('2025-02');
    expect(() => shiftMonth('2026-10', 1.5)).toThrow('Invalid month delta');
    expect(() => shiftMonth('2026-13', 1)).toThrow('Invalid month');
  });

  it('keeps date-only strings stable across timezone offsets', () => {
    expect(dateOnly(' 2026-10-02T23:59:59-07:00 ')).toBe('2026-10-02');
    expect(dateOnly('2026-03-08 23:00:00+14:00')).toBe('2026-03-08');
    expect(dateOnly(new Date('2026-10-03T00:30:00+01:00'))).toBe('2026-10-02');
    expect(dateOnly('2026-02-29')).toBeNull();
    expect(dateOnly('2026-10-00')).toBeNull();
    expect(dateOnly('not-a-date')).toBeNull();
    expect(dateOnly(null)).toBeNull();
  });
});

describe('overlaps', () => {
  it('uses inclusive dates, preserves member order, and deduplicates pending people', () => {
    const leaves: Leave[] = [
      {
        id: 'pending-1',
        userId: '1',
        start: '2026-10-02T23:00:00-07:00',
        end: '2026-10-04T00:00:00+00:00',
        status: 'pending',
        label: 'Requested leave',
      },
      {
        id: 'pending-1-duplicate',
        userId: '1',
        start: '2026-10-02',
        end: '2026-10-04',
        status: 'pending',
        label: 'Duplicate request',
      },
      {
        id: 'approved-1',
        userId: '1',
        start: '2026-10-03',
        end: '2026-10-03',
        status: 'approved',
        label: 'Approved leave',
      },
      {
        id: 'approved-2',
        userId: '2',
        start: '2026-10-04',
        end: '2026-10-04',
        status: 'approved',
        label: 'One day away',
      },
      {
        id: 'outside',
        userId: '3',
        start: '2026-10-02',
        end: '2026-10-04',
        status: 'approved',
        label: 'Unselected member',
      },
    ];

    expect(overlaps(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], leaves, ['2', '1', '2'])).toEqual([
      { date: '2026-10-01', approved: [], pending: [] },
      { date: '2026-10-02', approved: [], pending: ['1'] },
      { date: '2026-10-03', approved: ['1'], pending: [] },
      { date: '2026-10-04', approved: ['2'], pending: ['1'] },
    ]);
  });

  it('removes pending status when approved leave exists for same person and day', () => {
    const leaves: Leave[] = [
      {
        id: 'pending',
        userId: '1',
        start: '2026-10-03',
        end: '2026-10-03',
        status: 'pending',
        label: 'Pending',
      },
      {
        id: 'approved',
        userId: '1',
        start: '2026-10-03',
        end: '2026-10-03',
        status: 'approved',
        label: 'Approved',
      },
    ];

    expect(overlaps(['2026-10-03'], leaves, ['1'])).toEqual([
      { date: '2026-10-03', approved: ['1'], pending: [] },
    ]);
  });

  it('ignores invalid records, invalid members, and reversed ranges', () => {
    const invalidLeaves = [
      {
        id: 'bad-date',
        userId: '1',
        start: '2026-02-30',
        end: '2026-02-30',
        status: 'approved',
        label: 'Bad date',
      },
      {
        id: 'reversed',
        userId: '1',
        start: '2026-10-04',
        end: '2026-10-02',
        status: 'approved',
        label: 'Reversed',
      },
      {
        id: 'bad-status',
        userId: '1',
        start: '2026-10-02',
        end: '2026-10-02',
        status: 'cancelled',
        label: 'Cancelled',
      },
      null,
    ] as unknown as Leave[];

    expect(overlaps(['2026-10-02'], invalidLeaves, ['1'])).toEqual([
      { date: '2026-10-02', approved: [], pending: [] },
    ]);
  });
});