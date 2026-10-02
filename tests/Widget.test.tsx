import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultWorkspace,
  type CalendarResult,
  type Employee,
  type Group,
  type Workspace,
} from '../src/domain';

const mocks = vi.hoisted(() => ({
  exportGroups: vi.fn(),
  fetchCalendar: vi.fn(),
  fetchDirectory: vi.fn(),
  loadWorkspace: vi.fn(),
  mergeGroups: vi.fn(),
  parseImport: vi.fn(),
  saveWorkspace: vi.fn(),
  subscribeWorkspace: vi.fn(),
}));

vi.mock('../src/adapter', () => ({
  fetchCalendar: mocks.fetchCalendar,
  fetchDirectory: mocks.fetchDirectory,
}));

vi.mock('../src/storage', () => ({
  exportGroups: mocks.exportGroups,
  loadWorkspace: mocks.loadWorkspace,
  mergeGroups: mocks.mergeGroups,
  parseImport: mocks.parseImport,
  saveWorkspace: mocks.saveWorkspace,
  subscribeWorkspace: mocks.subscribeWorkspace,
}));

import { Widget } from '../src/Widget';

const scope = 'hbhr:user:42';
const employees: Employee[] = [
  {
    id: '1',
    name: 'Avery Stone',
    department: 'Engineering',
    manager: 'Jules North',
    region: 'East',
  },
  {
    id: '2',
    name: 'Mira Vale',
    department: 'Engineering',
    manager: 'Jules North',
    region: 'West',
  },
  {
    id: '3',
    name: 'Rowan Lake',
    department: 'Research',
    manager: 'Casey Hill',
    region: 'East',
  },
];

function workspaceWithGroup(memberIds: string[] = ['1', '2']): Workspace {
  const group: Group = { id: 'engineering', name: 'Engineering', memberIds };
  return {
    version: 1,
    groups: [group],
    preferences: { ...defaultWorkspace().preferences, selectedGroupId: group.id },
  };
}

function resultForMonth(month: string): CalendarResult {
  return {
    leaves: [
      {
        id: 'approved-1',
        userId: '1',
        start: `${month}-03`,
        end: `${month}-03`,
        label: 'Annual leave',
        status: 'approved',
      },
      {
        id: 'pending-2',
        userId: '2',
        start: `${month}-03`,
        end: `${month}-03`,
        label: 'Requested leave',
        status: 'pending',
      },
    ],
    holidays: [{ start: `${month}-04`, end: `${month}-04`, label: 'Founders Day' }],
    warnings: [],
  };
}

function setupMocks(initialWorkspace: Workspace = defaultWorkspace()): void {
  mocks.loadWorkspace.mockResolvedValue(initialWorkspace);
  mocks.fetchDirectory.mockResolvedValue(employees);
  mocks.fetchCalendar.mockImplementation((month: string) => Promise.resolve(resultForMonth(month)));
  mocks.saveWorkspace.mockResolvedValue(undefined);
  mocks.subscribeWorkspace.mockReturnValue(vi.fn());
  mocks.exportGroups.mockImplementation((currentScope: string, groups: Group[]) =>
    JSON.stringify({ version: 1, scope: currentScope, groups }),
  );
}

describe('Widget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('shows first-run empty state and does not request a calendar without a group', async () => {
    render(<Widget scope={scope} />);

    expect(await screen.findByRole('heading', { name: 'No team selected' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create your first team' })).toBeVisible();
    expect(mocks.fetchCalendar).not.toHaveBeenCalled();
  });

  it('searches employee names only while retaining separate metadata filters', async () => {
    const user = userEvent.setup();
    render(<Widget scope={scope} />);
    await user.click(await screen.findByRole('button', { name: 'Create your first team' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create team' });
    const search = within(dialog).getByLabelText('Search employees');
    for (const term of ['Engineering', 'Jules', 'East', '1']) {
      await user.clear(search);
      await user.type(search, term);
      expect(dialog.querySelectorAll('.employee-option')).toHaveLength(0);
    }
    await user.clear(search);
    await user.type(search, '  aVeRy  ');
    expect(dialog.querySelectorAll('.employee-option')).toHaveLength(1);
    expect(within(dialog).getByRole('checkbox', { name: /Avery Stone/ })).toBeVisible();
    await user.clear(search);
    await user.selectOptions(within(dialog).getByLabelText('Department'), 'Research');
    expect(dialog.querySelectorAll('.employee-option')).toHaveLength(1);
    expect(within(dialog).getByRole('checkbox', { name: /Rowan Lake/ })).toBeVisible();
  });

  it('puts selected members above other employees and updates the divider on selection', async () => {
    const user = userEvent.setup();
    mocks.loadWorkspace.mockResolvedValue(workspaceWithGroup(['3']));
    render(<Widget scope={scope} />);
    await user.click(await screen.findByRole('button', { name: 'Manage teams' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit team' });
    const order = () => Array.from(dialog.querySelectorAll('.employee-option strong')).map((node) => node.textContent);
    expect(order()).toEqual(['Rowan Lake', 'Avery Stone', 'Mira Vale']);
    expect(within(dialog).getByRole('heading', { name: 'Selected members (1)' })).toBeVisible();
    expect(within(dialog).getByRole('heading', { name: 'Other employees (2)' })).toHaveClass('employee-section-heading--divider');
    await user.click(within(dialog).getByRole('checkbox', { name: /Mira Vale/ }));
    expect(order()).toEqual(['Mira Vale', 'Rowan Lake', 'Avery Stone']);
    await user.click(within(dialog).getByRole('checkbox', { name: /Rowan Lake/ }));
    expect(order()).toEqual(['Mira Vale', 'Avery Stone', 'Rowan Lake']);
    await user.click(within(dialog).getByRole('checkbox', { name: /Mira Vale/ }));
    expect(within(dialog).queryByRole('heading', { name: /Selected members/ })).not.toBeInTheDocument();
    expect(dialog.querySelector('.employee-section-heading--divider')).toBeNull();
    expect(order()).toEqual(['Avery Stone', 'Mira Vale', 'Rowan Lake']);
  });

  it('creates a team, persists it, and requests only selected members', async () => {
    const user = userEvent.setup();
    render(<Widget scope={scope} />);

    await user.click(await screen.findByRole('button', { name: 'Create your first team' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create team' });
    await user.type(within(dialog).getByLabelText('Team name'), 'Platform');
    await user.click(within(dialog).getByRole('checkbox', { name: /Avery Stone/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Mira Vale/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save team' }));

    await waitFor(() => expect(mocks.saveWorkspace).toHaveBeenCalled());
    const saved = mocks.saveWorkspace.mock.calls.at(-1)?.[1] as Workspace;
    expect(saved.groups[0].name).toBe('Platform');
    expect(saved.groups[0].memberIds).toEqual(['1', '2']);
    expect(saved.preferences.selectedGroupId).toBe(saved.groups[0].id);
    await waitFor(() => expect(mocks.fetchCalendar).toHaveBeenCalledWith(
      expect.any(String),
      ['1', '2'],
      expect.any(AbortSignal),
    ));
  });

  it('renders approved leave by default, keeps pending disjoint, and shows threshold warnings', async () => {
    const user = userEvent.setup();
    mocks.loadWorkspace.mockResolvedValue(workspaceWithGroup());
    render(<Widget scope={scope} />);

    expect(await screen.findByRole('grid', { name: /team leave timeline/i })).toBeVisible();
    expect(screen.getByLabelText(/Avery Stone, .*03: approved/)).toBeVisible();
    expect(screen.getByLabelText(/Mira Vale, .*03: available/)).toBeVisible();
    expect(screen.getByText('No days meet the current threshold.')).toBeVisible();

    await user.click(screen.getByRole('checkbox', { name: 'Show pending' }));
    expect(screen.getByLabelText(/Mira Vale, .*03: pending/)).toBeVisible();

    const threshold = screen.getByRole('spinbutton', { name: /Warn at/ });
    await user.clear(threshold);
    await user.type(threshold, '2');
    expect(await screen.findByText('2 away')).toBeVisible();
    expect(screen.getByText(/Confirmed \+ pending/)).toBeVisible();
  });

  it('lists only this month’s holiday dates chronologically and explains whole summary cells', async () => {
    mocks.loadWorkspace.mockResolvedValue(workspaceWithGroup());
    mocks.fetchCalendar.mockImplementation((month: string) => Promise.resolve({
      ...resultForMonth(month),
      holidays: [
        { start: `${month}-08`, end: `${month}-09`, label: 'Two-day holiday' },
        { start: `${month}-04`, end: `${month}-04`, label: 'Founders Day' },
        { start: '1999-01-01', end: '1999-01-01', label: 'Outside month' },
      ],
    }));
    render(<Widget scope={scope} />);
    await screen.findByRole('grid', { name: /team leave timeline/i });
    const section = screen.getByRole('region', { name: /Holidays in/ });
    const dates = Array.from(section.querySelectorAll('time'));
    expect(dates.map((date) => date.dateTime.slice(-2))).toEqual(['04', '08', '09']);
    expect(dates.every((date) => Boolean(date.textContent?.includes(date.dateTime.slice(0, 4))))).toBe(true);
    expect(within(section).queryByText('Outside month')).not.toBeInTheDocument();
    const summary = screen.getByRole('gridcell', { name: /: 1 confirmed, 1 pending$/ });
    expect(summary.title.split('\n').slice(1)).toEqual(['1 approved leave', '1 additional pending requests']);
    const holidaySummary = screen.getByRole('gridcell', { name: /public holiday: Founders Day/ });
    expect(holidaySummary.title).toContain('H: Founders Day (public holiday, not leave)');
    expect(holidaySummary).toHaveClass('is-holiday');
    expect(holidaySummary.querySelector('.holiday-label')).not.toHaveAttribute('title');
  });

  it('shows only leave type in whole-day tooltips, without member names or status', async () => {
    const user = userEvent.setup();
    mocks.loadWorkspace.mockResolvedValue(workspaceWithGroup());
    mocks.fetchCalendar.mockImplementation((month: string) => {
      const result = resultForMonth(month);
      result.leaves[0].label = "Avery Stone (Avery)'s Holidays/Annual Leave is approved";
      result.leaves[1].label = 'Mira Vale’s Sick Leave is pending';
      return Promise.resolve(result);
    });
    render(<Widget scope={scope} />);
    const approved = await screen.findByLabelText(/Avery Stone, .*03: approved/);
    expect(approved).toHaveAttribute('title', 'Holidays/Annual Leave');
    expect(approved.querySelector('.leave-block')).not.toHaveAttribute('title');
    await user.click(screen.getByRole('checkbox', { name: 'Show pending' }));
    expect(screen.getByLabelText(/Mira Vale, .*03: pending/)).toHaveAttribute('title', 'Sick Leave');
  });

  it('preserves missing member IDs after directory refresh fails', async () => {
    mocks.loadWorkspace.mockResolvedValue(workspaceWithGroup(['1', 'missing-id']));
    mocks.fetchDirectory.mockRejectedValue(new Error('Directory unavailable'));

    render(<Widget scope={scope} />);

    expect(await screen.findByText(/2 saved members not found/)).toBeVisible();
    expect(screen.getByText(/Directory unavailable/)).toBeVisible();
    expect(screen.getByText(/Unknown employee \(missing-id\)/)).toBeVisible();
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
  });

  it('renames and deletes the selected team only after confirmation', async () => {
    const user = userEvent.setup();
    mocks.loadWorkspace.mockResolvedValue(workspaceWithGroup());
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Widget scope={scope} />);

    await user.click(await screen.findByRole('button', { name: 'Manage teams' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit team' });
    const nameInput = within(dialog).getByLabelText('Team name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Platform');
    await user.click(within(dialog).getByRole('button', { name: 'Save team' }));

    await waitFor(() => expect(mocks.saveWorkspace).toHaveBeenCalled());
    expect((mocks.saveWorkspace.mock.calls.at(-1)?.[1] as Workspace).groups[0].name).toBe('Platform');

    await user.click(screen.getByRole('button', { name: 'Manage teams' }));
    const editedDialog = await screen.findByRole('dialog', { name: 'Edit team' });
    await user.click(within(editedDialog).getByRole('button', { name: 'Delete team' }));
    expect(window.confirm).toHaveBeenCalledWith('Delete team "Platform"? This cannot be undone.');
    expect(screen.getByRole('dialog', { name: 'Edit team' })).toBeVisible();

    vi.mocked(window.confirm).mockReturnValue(true);
    await user.click(within(screen.getByRole('dialog', { name: 'Edit team' })).getByRole('button', { name: 'Delete team' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'No team selected' })).toBeVisible());
  });

  it('cancels obsolete month requests and keeps newest result', async () => {
    const user = userEvent.setup();
    const requests: Array<{ month: string; signal: AbortSignal; resolve: (result: CalendarResult) => void }> = [];
    mocks.fetchCalendar.mockImplementation((month: string, _ids: string[], signal: AbortSignal) =>
      new Promise<CalendarResult>((resolve) => requests.push({ month, signal, resolve })),
    );
    mocks.loadWorkspace.mockResolvedValue(workspaceWithGroup());
    render(<Widget scope={scope} />);

    await waitFor(() => expect(requests).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal.aborted).toBe(true);

    requests[0].resolve(resultForMonth(requests[0].month));
    requests[1].resolve(resultForMonth(requests[1].month));
    expect(await screen.findByRole('grid', { name: /team leave timeline/i })).toBeVisible();
    expect(screen.getByText(new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${requests[1].month}-01T00:00:00Z`)))).toBeVisible();
  });

  it('requires scope and replacement confirmation for imports', async () => {
    const user = userEvent.setup();
    mocks.parseImport.mockReturnValue({
      scope: 'hbhr:user:99',
      groups: [{ id: 'imported', name: 'Imported', memberIds: ['1', 'unknown'] }],
    });
    mocks.mergeGroups.mockReturnValue(workspaceWithGroup().groups);
    render(<Widget scope={scope} />);

    await user.click(await screen.findByRole('button', { name: 'Manage teams' }));
    await user.click(screen.getByRole('button', { name: 'Import teams' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import teams' });
    await user.click(within(dialog).getByLabelText('Team definition JSON'));
    await user.paste('{"version":1}');
    await user.click(within(dialog).getByRole('button', { name: 'Preview import' }));

    expect(await within(dialog).findByText(/not in current directory/)).toBeVisible();
    expect(within(dialog).getByText(/another workspace/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Import teams' })).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: /another workspace/ }));
    await user.click(within(dialog).getByLabelText(/Replace current teams/));
    expect(within(dialog).getByRole('button', { name: 'Import teams' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /Replace all current teams/ }));
    expect(within(dialog).getByRole('button', { name: 'Import teams' })).toBeEnabled();
  });
});
