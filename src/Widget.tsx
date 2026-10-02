import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  defaultWorkspace,
  monthDays,
  overlaps,
  shiftMonth,
  type CalendarResult,
  type Employee,
  type Group,
  type Preferences,
  type Workspace,
} from './domain';
import { fetchCalendar, fetchDirectory } from './adapter';
import {
  exportGroups,
  loadWorkspace,
  mergeGroups,
  parseImport,
  saveWorkspace,
  subscribeWorkspace,
} from './storage';

type DirectoryStatus = 'idle' | 'loading' | 'ready' | 'error';
type CalendarStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';
type DialogName = 'groups' | 'import' | 'export' | null;

interface GroupDraft {
  id: string | null;
  name: string;
  memberIds: string[];
}

interface ImportPreview {
  scope: string;
  groups: Group[];
  unresolvedIds: string[];
  scopeMismatch: boolean;
}

const MAX_IMPORT_BYTES = 256 * 1024;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatDay(date: string): { number: string; weekday: string } {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return {
    number: String(day),
    weekday: new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(value),
  };
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatLastRefreshed(value: string | null): string {
  if (!value) {
    return 'Last successful refresh: none';
  }

  return `Last successful refresh: ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))}`;
}

function createGroupId(groups: Group[]): string {
  const existing = new Set(groups.map((group) => group.id));
  let candidate = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  while (existing.has(candidate)) {
    candidate = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return candidate;
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function leaveTypeLabel(label: string): string {
  // HBHR descriptions use "Member (nickname)'s Leave Type is pending/approved".
  const description = label.match(/['’]s\s+(.+?)\s+is\s+(?:approved|pending)\.?$/i);
  return description?.[1].trim() || label;
}

function distinctValues(
  employees: Employee[],
  key: keyof Pick<Employee, 'department' | 'manager' | 'region'>,
): string[] {
  return Array.from(new Set(employees.map((employee) => employee[key]).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function WidgetDialog({
  children,
  description,
  id,
  onCancel,
  title,
  dialogRef,
}: {
  children: ReactNode;
  description: string;
  id: string;
  onCancel: () => void;
  title: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
}): ReactElement {
  return (
    <dialog
      aria-describedby={`${id}-description`}
      aria-labelledby={`${id}-title`}
      className="hbhr-dialog"
      id={id}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <div className="hbhr-dialog__panel">
        <div className="hbhr-dialog__header">
          <div>
            <p className="hbhr-kicker">Team Leave</p>
            <h2 id={`${id}-title`}>{title}</h2>
            <p id={`${id}-description`}>{description}</p>
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onCancel} type="button">
            <span aria-hidden="true">x</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Widget({ scope }: { scope: string }): ReactElement {
  const [workspace, setWorkspace] = useState<Workspace>(() => defaultWorkspace());
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceScope, setWorkspaceScope] = useState('');
  const [storageError, setStorageError] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<DirectoryStatus>('idle');
  const [directoryError, setDirectoryError] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [calendar, setCalendar] = useState<CalendarResult | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>('idle');
  const [calendarError, setCalendarError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [directoryRefresh, setDirectoryRefresh] = useState(0);
  const [calendarRefresh, setCalendarRefresh] = useState(0);
  const [thresholdInput, setThresholdInput] = useState('3');
  const [activeDialog, setActiveDialog] = useState<DialogName>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [groupFormError, setGroupFormError] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState('');
  const [importScopeConfirmed, setImportScopeConfirmed] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [exportText, setExportText] = useState('');

  const directoryRequestId = useRef(0);
  const calendarRequestId = useRef(0);
  const calendarKeyRef = useRef('');
  const calendarValueKeyRef = useRef('');
  const calendarValueRef = useRef<CalendarResult | null>(null);
  const saveSequence = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const groupDialogRef = useRef<HTMLDialogElement>(null);
  const importDialogRef = useRef<HTMLDialogElement>(null);
  const exportDialogRef = useRef<HTMLDialogElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);

  const selectedGroupId = workspace.preferences.selectedGroupId;
  const selectedGroup = workspace.groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedMemberKey = selectedGroup?.memberIds.join(',') ?? '';
  const activeCalendarKey = `${scope}|${selectedGroup?.id ?? ''}|${month}|${selectedMemberKey}`;
  const displayedCalendar = calendarValueKeyRef.current === activeCalendarKey ? calendar : null;
  const days = monthDays(month);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const missingMemberIds = selectedGroup
    ? selectedGroup.memberIds.filter((memberId) => !employeeById.has(memberId))
    : [];

  useEffect(() => {
    let active = true;
    setWorkspaceReady(false);
    setWorkspaceScope('');
    setWorkspace(defaultWorkspace());
    setEmployees([]);
    setStorageError('');
    setCalendar(null);
    setCalendarStatus('idle');
    setCalendarError('');
    setLastRefreshedAt(null);
    calendarKeyRef.current = '';
    calendarValueKeyRef.current = '';
    calendarValueRef.current = null;

    let unsubscribe = (): void => undefined;
    try {
      unsubscribe = subscribeWorkspace(scope, (nextWorkspace) => {
        if (!active) {
          return;
        }
        setWorkspace(nextWorkspace);
        setThresholdInput(String(nextWorkspace.preferences.threshold));
      });
    } catch (error) {
      if (active) {
        setStorageError(errorMessage(error, 'Workspace storage is unavailable.'));
      }
    }

    void loadWorkspace(scope)
      .then((loadedWorkspace) => {
        if (!active) {
          return;
        }
        setWorkspace(loadedWorkspace);
        setThresholdInput(String(loadedWorkspace.preferences.threshold));
        setWorkspaceScope(scope);
        setWorkspaceReady(true);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setWorkspace(defaultWorkspace());
        setThresholdInput('3');
        setWorkspaceScope(scope);
        setStorageError(errorMessage(error, 'Could not load saved teams.'));
        setWorkspaceReady(true);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [scope]);

  useEffect(() => {
    const requestId = ++directoryRequestId.current;
    const controller = new AbortController();
    setDirectoryStatus('loading');
    setDirectoryError('');

    void fetchDirectory(controller.signal)
      .then((nextEmployees) => {
        if (controller.signal.aborted || requestId !== directoryRequestId.current) {
          return;
        }
        setEmployees(nextEmployees);
        setDirectoryStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== directoryRequestId.current) {
          return;
        }
        setDirectoryStatus('error');
        setDirectoryError(errorMessage(error, 'Could not refresh the HBHR directory.'));
      });

    return () => controller.abort();
  }, [scope, directoryRefresh]);

  useEffect(() => {
    const group = workspace.groups.find((candidate) => candidate.id === workspace.preferences.selectedGroupId);
    const memberIds = group?.memberIds ?? [];
    const requestKey = `${scope}|${group?.id ?? ''}|${month}|${memberIds.join(',')}`;
    const requestId = ++calendarRequestId.current;
    const controller = new AbortController();
    const keyChanged = calendarKeyRef.current !== requestKey;
    calendarKeyRef.current = requestKey;

    if (keyChanged) {
      setCalendar(null);
      setLastRefreshedAt(null);
      calendarValueKeyRef.current = '';
      calendarValueRef.current = null;
    }

    if (workspaceScope !== scope || !workspaceReady || !group || memberIds.length === 0) {
      controller.abort();
      setCalendarStatus('idle');
      setCalendarError('');
      return () => controller.abort();
    }

    setCalendarStatus('loading');
    setCalendarError('');
    const requestMemberIds = [...memberIds];

    void fetchCalendar(month, requestMemberIds, controller.signal)
      .then((result) => {
        if (
          controller.signal.aborted ||
          requestId !== calendarRequestId.current ||
          calendarKeyRef.current !== requestKey
        ) {
          return;
        }
        setCalendar(result);
        calendarValueKeyRef.current = requestKey;
        calendarValueRef.current = result;
        setCalendarStatus('ready');
        setLastRefreshedAt(new Date().toISOString());
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== calendarRequestId.current ||
          calendarKeyRef.current !== requestKey
        ) {
          return;
        }
        setCalendarStatus(
          calendarValueKeyRef.current === requestKey && calendarValueRef.current ? 'stale' : 'error',
        );
        setCalendarError(errorMessage(error, 'Could not refresh the team calendar.'));
      });

    return () => controller.abort();
  }, [
    calendarRefresh,
    month,
    scope,
    selectedGroupId,
    selectedMemberKey,
    workspaceScope,
    workspaceReady,
  ]);

  useEffect(() => {
    const dialogs: Array<[DialogName, HTMLDialogElement | null]> = [
      ['groups', groupDialogRef.current],
      ['import', importDialogRef.current],
      ['export', exportDialogRef.current],
    ];

    for (const [name, dialog] of dialogs) {
      if (!dialog) {
        continue;
      }
      if (name === activeDialog && !dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
        window.setTimeout(() => {
          dialog.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus();
        }, 0);
      } else if (name !== activeDialog && dialog.open) {
        try {
          dialog.close();
        } catch {
          dialog.removeAttribute('open');
        }
      }
    }
  }, [activeDialog]);

  useEffect(() => {
    setThresholdInput(String(workspace.preferences.threshold));
  }, [workspace.preferences.threshold]);

  function persistWorkspace(nextWorkspace: Workspace): void {
    const sequence = ++saveSequence.current;
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => saveWorkspace(scope, nextWorkspace))
      .then(
        () => {
          if (sequence === saveSequence.current) {
            setStorageError('');
          }
        },
        (error: unknown) => {
          if (sequence === saveSequence.current) {
            setStorageError(`Could not save team settings: ${errorMessage(error, 'storage error')}`);
          }
        },
      );
  }

  function commitWorkspace(nextWorkspace: Workspace): void {
    setWorkspace(nextWorkspace);
    persistWorkspace(nextWorkspace);
  }

  function updatePreferences(patch: Partial<Preferences>): void {
    commitWorkspace({
      ...workspace,
      preferences: { ...workspace.preferences, ...patch },
    });
  }

  function rememberFocus(event: MouseEvent<HTMLButtonElement>): void {
    focusReturnRef.current = event.currentTarget;
  }

  function closeDialog(): void {
    setActiveDialog(null);
    window.setTimeout(() => {
      const target = focusReturnRef.current;
      if (target && target.isConnected) {
        target.focus();
      }
    }, 0);
  }

  function openGroupEditor(event: MouseEvent<HTMLButtonElement>, group?: Group): void {
    rememberFocus(event);
    setGroupFormError('');
    setEmployeeSearch('');
    setDepartmentFilter('');
    setManagerFilter('');
    setRegionFilter('');
    setGroupDraft(
      group
        ? { id: group.id, name: group.name, memberIds: [...group.memberIds] }
        : { id: null, name: '', memberIds: [] },
    );
    setActiveDialog('groups');
  }

  function openImportDialog(event: MouseEvent<HTMLButtonElement>): void {
    rememberFocus(event);
    setImportText('');
    setImportMode('merge');
    setImportPreview(null);
    setImportError('');
    setImportScopeConfirmed(false);
    setReplaceConfirmed(false);
    setActiveDialog('import');
  }

  function openExportDialog(event: MouseEvent<HTMLButtonElement>): void {
    rememberFocus(event);
    try {
      setExportText(exportGroups(scope, workspace.groups));
    } catch (error) {
      setExportText('');
      setStorageError(errorMessage(error, 'Could not export teams.'));
    }
    setActiveDialog('export');
  }

  function handleGroupSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!groupDraft) {
      return;
    }

    const name = groupDraft.name.trim();
    if (!name) {
      setGroupFormError('Enter a team name.');
      return;
    }
    if (name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)) {
      setGroupFormError('Team name must be 200 characters or fewer.');
      return;
    }

    const group: Group = {
      id: groupDraft.id ?? createGroupId(workspace.groups),
      name,
      memberIds: uniqueIds(groupDraft.memberIds),
    };
    const groups = groupDraft.id
      ? workspace.groups.map((candidate) => (candidate.id === group.id ? group : candidate))
      : [...workspace.groups, group];
    const selectedId = workspace.preferences.selectedGroupId || group.id;
    commitWorkspace({
      ...workspace,
      groups,
      preferences: { ...workspace.preferences, selectedGroupId: selectedId },
    });
    setGroupDraft(null);
    closeDialog();
  }

  function handleDeleteGroup(): void {
    if (!groupDraft?.id) {
      return;
    }
    const group = workspace.groups.find((candidate) => candidate.id === groupDraft.id);
    if (!group || !window.confirm(`Delete team "${group.name}"? This cannot be undone.`)) {
      return;
    }

    const groups = workspace.groups.filter((candidate) => candidate.id !== group.id);
    const selectedId = workspace.preferences.selectedGroupId === group.id ? groups[0]?.id ?? '' : workspace.preferences.selectedGroupId;
    commitWorkspace({
      ...workspace,
      groups,
      preferences: { ...workspace.preferences, selectedGroupId: selectedId },
    });
    setGroupDraft(null);
    closeDialog();
  }

  function toggleMember(memberId: string): void {
    if (!groupDraft) {
      return;
    }
    const memberIds = groupDraft.memberIds.includes(memberId)
      ? groupDraft.memberIds.filter((id) => id !== memberId)
      : [...groupDraft.memberIds, memberId];
    setGroupDraft({ ...groupDraft, memberIds });
  }

  function previewImport(): void {
    setImportError('');
    setImportPreview(null);
    try {
      if (new TextEncoder().encode(importText).byteLength > MAX_IMPORT_BYTES) {
        throw new Error('Import is too large.');
      }
      const parsed = parseImport(importText);
      const knownIds = new Set(employees.map((employee) => employee.id));
      const unresolvedIds = uniqueIds(
        parsed.groups.flatMap((group) => group.memberIds.filter((memberId) => !knownIds.has(memberId))),
      );
      setImportPreview({
        scope: parsed.scope,
        groups: parsed.groups,
        unresolvedIds,
        scopeMismatch: parsed.scope !== scope,
      });
    } catch (error) {
      setImportError(errorMessage(error, 'Could not preview import.'));
    }
  }

  function applyImport(): void {
    if (!importPreview) {
      return;
    }
    if (importPreview.scopeMismatch && !importScopeConfirmed) {
      setImportError('Confirm the different workspace scope before importing.');
      return;
    }
    if (importMode === 'replace' && !replaceConfirmed) {
      setImportError('Confirm replacement before importing.');
      return;
    }

    try {
      const groups = importMode === 'merge' ? mergeGroups(workspace.groups, importPreview.groups) : importPreview.groups;
      const selectedId = groups.some((group) => group.id === workspace.preferences.selectedGroupId)
        ? workspace.preferences.selectedGroupId
        : groups[0]?.id ?? '';
      commitWorkspace({
        ...workspace,
        groups,
        preferences: { ...workspace.preferences, selectedGroupId: selectedId },
      });
      closeDialog();
    } catch (error) {
      setImportError(errorMessage(error, 'Could not import teams.'));
    }
  }

  function handleThresholdChange(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    setThresholdInput(value);
    const threshold = Number(value);
    if (Number.isSafeInteger(threshold) && threshold >= 1 && threshold <= 1_000) {
      updatePreferences({ threshold });
    }
  }

  function handleThresholdBlur(): void {
    const threshold = Number(thresholdInput);
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 1_000) {
      setThresholdInput(String(workspace.preferences.threshold));
    }
  }

  function handleRefresh(): void {
    setDirectoryRefresh((value) => value + 1);
    setCalendarRefresh((value) => value + 1);
  }

  const visibleEmployees = employees.filter((employee) => {
    const search = employeeSearch.trim().toLowerCase();
    const searchable = employee.name.toLowerCase();
    return (
      (!search || searchable.includes(search)) &&
      (!departmentFilter || employee.department === departmentFilter) &&
      (!managerFilter || employee.manager === managerFilter) &&
      (!regionFilter || employee.region === regionFilter)
    );
  });

  const overlapRows = selectedGroup && calendar
    ? overlaps(days, displayedCalendar?.leaves ?? [], selectedGroup.memberIds)
    : [];
  const overlapByDate = new Map(overlapRows.map((row) => [row.date, row]));
  const holidayByDate = new Map<string, string[]>();
  for (const holiday of displayedCalendar?.holidays ?? []) {
    for (const date of days) {
      if (dateInRange(date, holiday.start, holiday.end)) {
        holidayByDate.set(date, [...(holidayByDate.get(date) ?? []), holiday.label]);
      }
    }
  }
  const approvedPeople = new Set(overlapRows.flatMap((row) => row.approved));
  const pendingPeople = new Set(overlapRows.flatMap((row) => row.pending));
  const warningDays = overlapRows.filter((row) => {
    const count = workspace.preferences.pending
      ? row.approved.length + row.pending.length
      : row.approved.length;
    return count >= workspace.preferences.threshold;
  });
  const timelineStyle = { '--day-count': days.length } as CSSProperties;
  const today = new Date().toISOString().slice(0, 10);

  function memberName(memberId: string): string {
    return employeeById.get(memberId)?.name ?? `Unknown employee (${memberId})`;
  }

  function leaveFor(memberId: string, date: string): { status: 'approved' | 'pending'; label: string } | null {
    const leaves = (displayedCalendar?.leaves ?? []).filter(
      (leave) => leave.userId === memberId && dateInRange(date, leave.start, leave.end),
    );
    const leave = leaves.find((candidate) => candidate.status === 'approved') ?? leaves[0];
    if (!leave || (leave.status === 'pending' && !workspace.preferences.pending)) {
      return null;
    }
    return { status: leave.status, label: leaveTypeLabel(leave.label) };
  }

  function renderTimeline(): ReactElement {
    return (
      <div className="timeline-shell">
        <div aria-label={`${formatMonth(month)} team leave timeline`} className="timeline" role="grid" style={timelineStyle}>
          <div className="timeline__row timeline__row--header" role="row">
            <div className="timeline__name timeline__name--header" role="columnheader">
              Team member
            </div>
            {days.map((date) => {
              const day = formatDay(date);
              const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
              const holidays = holidayByDate.get(date) ?? [];
              return (
                <div
                  aria-label={`${date}${holidays.length ? `, holiday: ${holidays.join(', ')}` : ''}`}
                  aria-current={date === today ? 'date' : undefined}
                  className={`timeline__day-header${weekday === 0 || weekday === 6 ? ' is-weekend' : ''}${holidays.length ? ' is-holiday' : ''}${date === today ? ' is-today' : ''}`}
                  key={date}
                  role="columnheader"
                  title={holidays.join(', ')}
                >
                  <span>{day.weekday}</span>
                  <strong>{day.number}</strong>
                  {holidays.length > 0 && <i aria-hidden="true" className="holiday-dot" />}
                </div>
              );
            })}
          </div>
          {selectedGroup?.memberIds.map((memberId) => {
            const name = memberName(memberId);
            return (
              <div className="timeline__row" key={memberId} role="row">
                <div className="timeline__name" role="rowheader" title={name}>
                  <span>{name}</span>
                  {missingMemberIds.includes(memberId) && <small>Not in directory</small>}
                </div>
                {days.map((date) => {
                  const leave = leaveFor(memberId, date);
                  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
                  return (
                    <div
                      aria-label={`${name}, ${date}: ${leave ? leave.status : 'available'}`}
                      className={`timeline__cell${weekday === 0 || weekday === 6 ? ' is-weekend' : ''}${holidayByDate.has(date) ? ' is-holiday' : ''}${date === today ? ' is-today' : ''}`}
                      key={`${memberId}-${date}`}
                      role="gridcell"
                      title={leave?.label || undefined}
                    >
                      {leave && (
                        <span className={`leave-block leave-block--${leave.status}`}>
                          <span aria-hidden="true">{leave.status === 'approved' ? 'A' : 'P'}</span>
                          <span className="sr-only">{leave.label || leave.status}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="timeline__row timeline__row--summary" role="row">
            <div className="timeline__name" role="rowheader">
              <strong>Daily summary</strong>
            </div>
            {days.map((date) => {
              const row = overlapByDate.get(date);
              const holiday = holidayByDate.get(date);
              const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
              const approved = row?.approved.length ?? 0;
              const pending = row?.pending.length ?? 0;
              const summaryDescription = [
                formatDate(date),
                `${approved} approved leave`,
                `${pending} additional pending requests`,
                ...(holiday ? [`H: ${holiday.join(', ')} (public holiday, not leave)`] : []),
              ].join('\n');
              return (
                <div
                  aria-label={`${date}: ${approved} confirmed, ${pending} pending${holiday ? `, public holiday: ${holiday.join(', ')}` : ''}`}
                  className={`timeline__summary-cell${weekday === 0 || weekday === 6 ? ' is-weekend' : ''}${holiday ? ' is-holiday' : ''}${date === today ? ' is-today' : ''}`}
                  key={`summary-${date}`}
                  role="gridcell"
                  title={summaryDescription}
                >
                  <b>{approved}</b>
                  <em>{pending}</em>
                  {holiday && <span className="holiday-label">H</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderGroupDialog(): ReactElement {
    const departments = distinctValues(employees, 'department');
    const managers = distinctValues(employees, 'manager');
    const regions = distinctValues(employees, 'region');
    const selectedIds = new Set(groupDraft?.memberIds ?? []);
    const employeeSections = [
      { title: 'Selected members', employees: visibleEmployees.filter((employee) => selectedIds.has(employee.id)) },
      { title: 'Other employees', employees: visibleEmployees.filter((employee) => !selectedIds.has(employee.id)) },
    ].filter((section) => section.employees.length > 0);
    return (
      <WidgetDialog
        description="Create or edit a saved team using HBHR employee IDs."
        dialogRef={groupDialogRef}
        id="team-dialog"
        onCancel={closeDialog}
        title={groupDraft?.id ? 'Edit team' : 'Create team'}
      >
        <form className="dialog-form" onSubmit={handleGroupSubmit}>
          <label className="field-label" htmlFor="team-name">
            Team name
            <input
              autoComplete="off"
              data-dialog-autofocus
              id="team-name"
              maxLength={200}
              onChange={(event) => setGroupDraft(groupDraft ? { ...groupDraft, name: event.target.value } : groupDraft)}
              value={groupDraft?.name ?? ''}
            />
          </label>
          {groupFormError && <p className="form-error" role="alert">{groupFormError}</p>}

          <div className="dialog-actions dialog-actions--secondary">
            <button onClick={openImportDialog} type="button">Import teams</button>
            <button onClick={openExportDialog} type="button">Export teams</button>
          </div>

          <div className="picker-heading">
            <div>
              <h3>Members</h3>
              <p>{groupDraft?.memberIds.length ?? 0} selected. Saved IDs stay selected if directory refresh misses them.</p>
            </div>
            <div className="dialog-actions--secondary">
              <button
                onClick={() => {
                  setGroupFormError('');
                  setEmployeeSearch('');
                  setDepartmentFilter('');
                  setManagerFilter('');
                  setRegionFilter('');
                  setGroupDraft({ id: null, name: '', memberIds: [] });
                }}
                type="button"
              >
                New team
              </button>
              {groupDraft?.id && <button className="danger-button" onClick={handleDeleteGroup} type="button">Delete team</button>}
            </div>
          </div>
          <label className="field-label" htmlFor="employee-search">
            Search employees
            <input
              autoComplete="off"
              id="employee-search"
              onChange={(event) => setEmployeeSearch(event.target.value)}
              placeholder="Employee name"
              value={employeeSearch}
            />
          </label>
          <div className="filter-grid">
            <label className="field-label" htmlFor="department-filter">
              Department
              <select id="department-filter" onChange={(event) => setDepartmentFilter(event.target.value)} value={departmentFilter}>
                <option value="">All departments</option>
                {departments.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="field-label" htmlFor="manager-filter">
              Manager
              <select id="manager-filter" onChange={(event) => setManagerFilter(event.target.value)} value={managerFilter}>
                <option value="">All managers</option>
                {managers.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="field-label" htmlFor="region-filter">
              Region
              <select id="region-filter" onChange={(event) => setRegionFilter(event.target.value)} value={regionFilter}>
                <option value="">All regions</option>
                {regions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="employee-list">
            <legend className="sr-only">Select team members</legend>
            {visibleEmployees.length === 0 && <p className="empty-copy">No employees match these filters.</p>}
            {employeeSections.flatMap((section, index) => [
              <h4 className={`employee-section-heading${index > 0 ? ' employee-section-heading--divider' : ''}`} key={section.title}>
                {section.title} ({section.employees.length})
              </h4>,
              ...section.employees.map((employee) => (
              <label className="employee-option" key={employee.id}>
                <input
                  checked={groupDraft?.memberIds.includes(employee.id) ?? false}
                  data-employee-id={employee.id}
                  onChange={() => toggleMember(employee.id)}
                  type="checkbox"
                />
                <span className="employee-option__copy">
                  <strong>{employee.name}</strong>
                  <small>{[employee.department, employee.manager, employee.region].filter(Boolean).join(' / ') || 'Directory details unavailable'}</small>
                </span>
              </label>
              )),
            ])}
          </fieldset>
          {groupDraft && groupDraft.memberIds.some((memberId) => !employeeById.has(memberId)) && (
            <p className="warning-copy" role="status">Some saved members are absent from the refreshed directory. Their IDs will be preserved.</p>
          )}
          <div className="dialog-actions">
            <button onClick={closeDialog} type="button">Cancel</button>
            <button className="primary-button" type="submit">Save team</button>
          </div>
        </form>
      </WidgetDialog>
    );
  }

  function renderImportDialog(): ReactElement {
    const importReady = Boolean(
      importPreview &&
      (!importPreview.scopeMismatch || importScopeConfirmed) &&
      (importMode === 'merge' || replaceConfirmed),
    );
    return (
      <WidgetDialog
        description="Preview versioned team definitions before storing them in this workspace."
        dialogRef={importDialogRef}
        id="import-dialog"
        onCancel={closeDialog}
        title="Import teams"
      >
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            applyImport();
          }}
        >
          <label className="field-label" htmlFor="import-text">
            Team definition JSON
            <textarea
              data-dialog-autofocus
              id="import-text"
              onChange={(event) => {
                setImportText(event.target.value);
                setImportPreview(null);
                setImportError('');
                setImportScopeConfirmed(false);
                setReplaceConfirmed(false);
              }}
              placeholder="Paste exported team definitions here"
              rows={8}
              value={importText}
            />
          </label>
          <button onClick={previewImport} type="button">Preview import</button>
          {importError && <p className="form-error" role="alert">{importError}</p>}
          {importPreview && (
            <section className="import-preview" aria-label="Import preview">
              <p><strong>{importPreview.groups.length}</strong> team definition{importPreview.groups.length === 1 ? '' : 's'} ready.</p>
              <ul>
                {importPreview.groups.map((group) => <li key={group.id}>{group.name} ({group.memberIds.length} members)</li>)}
              </ul>
              {importPreview.unresolvedIds.length > 0 && (
                <p className="warning-copy">{importPreview.unresolvedIds.length} member ID{importPreview.unresolvedIds.length === 1 ? '' : 's'} not in current directory. IDs will be preserved.</p>
              )}
              {importPreview.scopeMismatch && (
                <label className="confirmation-option">
                  <input
                    checked={importScopeConfirmed}
                    onChange={(event) => setImportScopeConfirmed(event.target.checked)}
                    type="checkbox"
                  />
                  <span>This import is from another workspace ({importPreview.scope}).</span>
                </label>
              )}
              <fieldset className="import-mode">
                <legend>Import action</legend>
                <label><input checked={importMode === 'merge'} name="import-mode" onChange={() => { setImportMode('merge'); setReplaceConfirmed(false); }} type="radio" /> Merge with current teams</label>
                <label><input checked={importMode === 'replace'} name="import-mode" onChange={() => { setImportMode('replace'); setReplaceConfirmed(false); }} type="radio" /> Replace current teams</label>
              </fieldset>
              {importMode === 'replace' && (
                <label className="confirmation-option">
                  <input checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} type="checkbox" />
                  <span>Replace all current teams in this workspace.</span>
                </label>
              )}
            </section>
          )}
          <div className="dialog-actions">
            <button onClick={closeDialog} type="button">Cancel</button>
            <button className="primary-button" disabled={!importReady} type="submit">Import teams</button>
          </div>
        </form>
      </WidgetDialog>
    );
  }

  function renderExportDialog(): ReactElement {
    return (
      <WidgetDialog
        description="Export contains team definitions only. It never includes leave records or credentials."
        dialogRef={exportDialogRef}
        id="export-dialog"
        onCancel={closeDialog}
        title="Export teams"
      >
        <div className="dialog-form">
          <label className="field-label" htmlFor="export-text">
            Team definition JSON
            <textarea data-dialog-autofocus id="export-text" readOnly rows={10} value={exportText} />
          </label>
          <div className="dialog-actions">
            <button onClick={closeDialog} type="button">Close</button>
          </div>
        </div>
      </WidgetDialog>
    );
  }

  return (
    <article aria-busy={directoryStatus === 'loading' || calendarStatus === 'loading'} className="hbhr-team-widget">
      <header className="widget-header">
        <div className="widget-heading">
          <p className="hbhr-kicker">HBHR dashboard</p>
          <h2>Team Leave</h2>
          <p className="widget-subtitle">Monthly overlap for your saved teams.</p>
        </div>
        <div className="widget-controls">
          <div className="team-select-label">
            <select
              aria-label="Team"
              id="team-select"
              onChange={(event) => updatePreferences({ selectedGroupId: event.target.value })}
              value={selectedGroupId}
            >
              <option value="">Select a team</option>
              {workspace.groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.memberIds.length})</option>)}
            </select>
          </div>
          <button onClick={(event) => openGroupEditor(event, selectedGroup ?? undefined)} type="button">Manage teams</button>
          <button aria-label="Refresh team leave" disabled={directoryStatus === 'loading' || calendarStatus === 'loading'} onClick={handleRefresh} type="button">
            Refresh
          </button>
          <button
            aria-controls="team-leave-body"
            aria-expanded={!workspace.preferences.collapsed}
            className="collapse-button"
            onClick={() => updatePreferences({ collapsed: !workspace.preferences.collapsed })}
            type="button"
          >
            {workspace.preferences.collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </header>

      {storageError && <p className="status-message status-message--error" role="alert">{storageError}</p>}
      {directoryError && <p className="status-message status-message--error" role="alert">{directoryError} Saved teams were kept.</p>}

      {!workspace.preferences.collapsed && (
        <div id="team-leave-body">
          <div className="widget-toolbar">
            <div className="month-controls" aria-label="Month navigation">
              <button aria-label="Previous month" onClick={() => setMonth((value) => shiftMonth(value, -1))} type="button">&lt;</button>
              <strong aria-live="polite">{formatMonth(month)}</strong>
              <button aria-label="Next month" onClick={() => setMonth((value) => shiftMonth(value, 1))} type="button">&gt;</button>
              <button onClick={() => setMonth(currentMonth())} type="button">Today</button>
            </div>
            <div className="view-options">
              <label className="checkbox-label">
                <input checked={workspace.preferences.pending} onChange={(event) => updatePreferences({ pending: event.target.checked })} type="checkbox" />
                Show pending
              </label>
              <label className="threshold-label" htmlFor="warning-threshold">
                Warn at
                <input id="warning-threshold" inputMode="numeric" max={1_000} min={1} onBlur={handleThresholdBlur} onChange={handleThresholdChange} type="number" value={thresholdInput} />
                away
              </label>
            </div>
          </div>

          <p className="precision-note" role="note">Daily leave overlap only. This view does not calculate partial-day hours or staffing capacity.</p>
          <p className="refresh-note" aria-live="polite">{formatLastRefreshed(lastRefreshedAt)}</p>

          {directoryStatus === 'loading' && <p className="status-message">Refreshing employee directory...</p>}
          {calendarStatus === 'loading' && <p className="status-message">Loading team calendar...</p>}
          {calendarError && <p className="status-message status-message--error" role="alert">{calendarError}{calendarStatus === 'stale' ? ' Showing the last successful result.' : ''}</p>}

          {!workspaceReady && <section className="empty-state"><h3>Loading saved teams...</h3></section>}
          {workspaceReady && !selectedGroup && (
            <section className="empty-state">
              <span aria-hidden="true" className="empty-mark">+</span>
              <h3>No team selected</h3>
              <p>Create a team or choose one from the selector to see monthly leave overlap.</p>
              <button className="primary-button" onClick={(event) => openGroupEditor(event)} type="button">Create your first team</button>
            </section>
          )}
          {workspaceReady && selectedGroup && selectedGroup.memberIds.length === 0 && (
            <section className="empty-state">
              <span aria-hidden="true" className="empty-mark">+</span>
              <h3>{selectedGroup.name} has no members</h3>
              <p>Add employees to this team before requesting calendar data.</p>
              <button className="primary-button" onClick={(event) => openGroupEditor(event, selectedGroup)} type="button">Add members</button>
            </section>
          )}
          {workspaceReady && selectedGroup && selectedGroup.memberIds.length > 0 && displayedCalendar && (
            <>
              <section aria-label="Team summary" className="summary-strip">
                <div><span>Confirmed away</span><strong>{approvedPeople.size}</strong></div>
                <div><span>Additional pending</span><strong>{pendingPeople.size}</strong></div>
                <div><span>Warning days</span><strong>{warningDays.length}</strong></div>
              </section>
              {missingMemberIds.length > 0 && (
                <p className="warning-copy" role="status">{missingMemberIds.length} saved member{missingMemberIds.length === 1 ? '' : 's'} not found in the refreshed directory. Membership is preserved.</p>
              )}
              {renderTimeline()}
              <section aria-labelledby="warning-days-title" className="warning-section">
                <div className="section-heading">
                  <div>
                    <p className="hbhr-kicker">Coverage watch</p>
                    <h3 id="warning-days-title">Warning days</h3>
                  </div>
                  <span>{workspace.preferences.pending ? 'Confirmed + pending' : 'Confirmed only'}</span>
                </div>
                {warningDays.length === 0 ? (
                  <p className="empty-copy">No days meet the current threshold.</p>
                ) : (
                  <ul className="warning-list">
                    {warningDays.map((row) => {
                      const ids = workspace.preferences.pending ? [...row.approved, ...row.pending] : row.approved;
                      return <li key={row.date}><time dateTime={row.date}>{row.date}</time><strong>{ids.length} away</strong><span>{ids.map(memberName).join(', ')}</span></li>;
                    })}
                  </ul>
                )}
              </section>
              {holidayByDate.size > 0 && (
                <section className="holiday-section" aria-labelledby="month-holidays-title">
                  <div className="section-heading">
                    <div>
                      <p className="hbhr-kicker">Calendar dates</p>
                      <h3 id="month-holidays-title">Holidays in {formatMonth(month)}</h3>
                    </div>
                  </div>
                  <p className="empty-copy">Public holidays are marked H in the calendar. They are not counted as leave.</p>
                  <ul className="holiday-list">
                    {days.filter((date) => holidayByDate.has(date)).map((date) => (
                      <li key={date}>
                        <time dateTime={date}>{formatDate(date)}</time>
                        <strong>{Array.from(new Set(holidayByDate.get(date))).join(', ')}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {displayedCalendar.warnings.length > 0 && (
                <section className="data-notes" aria-label="Calendar notes">
                  <h3>Calendar notes</h3>
                  {displayedCalendar.warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {renderGroupDialog()}
      {renderImportDialog()}
      {renderExportDialog()}
    </article>
  );
}
