import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultWorkspace,
  type Group,
  type Workspace,
} from '../src/domain';
import {
  exportGroups,
  inspectWorkspace,
  legacyUserScope,
  loadWorkspace,
  mergeGroups,
  parseImport,
  recoverLegacyWorkspace,
  saveWorkspace,
  subscribeWorkspace,
  validateWorkspace,
} from '../src/storage';

type Change = { newValue?: unknown };
type Listener = (changes: Record<string, Change>, areaName: string) => void;

const scope = 'hbhr:user:123';
const otherScope = 'hbhr:user:456';
const companyScope = 'hbhr:company:10:user:123';
const otherCompanyScope = 'hbhr:company:11:user:123';

function group(id: string, name = id, memberIds: string[] = ['1']): Group {
  return { id, name, memberIds };
}

function workspace(groups: Group[] = [group('engineering', 'Engineering', ['1', '2'])]): Workspace {
  return {
    version: 1,
    groups,
    preferences: {
      ...defaultWorkspace().preferences,
      selectedGroupId: groups[0]?.id ?? '',
    },
  };
}

describe('scoped chrome storage CRUD', () => {
  let values: Record<string, unknown>;
  let listeners: Listener[];
  let localGet: ReturnType<typeof vi.fn>;
  let localSet: ReturnType<typeof vi.fn>;
  let addListener: ReturnType<typeof vi.fn>;
  let removeListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    values = {};
    listeners = [];
    localGet = vi.fn(async (key: string) => (
      Object.prototype.hasOwnProperty.call(values, key) ? { [key]: values[key] } : {}
    ));
    localSet = vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    });
    addListener = vi.fn((listener: Listener) => {
      listeners.push(listener);
    });
    removeListener = vi.fn((listener: Listener) => {
      listeners = listeners.filter((current) => current !== listener);
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: localGet, set: localSet },
        onChanged: { addListener, removeListener },
      },
    });
  });

  it('loads defaults, saves validated workspaces, and supports empty-group CRUD', async () => {
    await expect(loadWorkspace(scope)).resolves.toEqual(defaultWorkspace());
    expect(localGet).toHaveBeenCalledWith(`hbhr:workspace:${scope}`);

    const saved = workspace();
    await saveWorkspace(scope, saved);
    expect(localSet).toHaveBeenCalledWith({ [`hbhr:workspace:${scope}`]: saved });
    await expect(loadWorkspace(scope)).resolves.toEqual(saved);

    const empty = workspace([]);
    await saveWorkspace(scope, empty);
    await expect(loadWorkspace(scope)).resolves.toEqual(empty);
  });

  it('keeps workspaces separated by scope', async () => {
    const first = workspace([group('one', 'One', ['1'])]);
    const second = workspace([group('two', 'Two', ['2'])]);
    await saveWorkspace(scope, first);
    await saveWorkspace(otherScope, second);

    await expect(loadWorkspace(scope)).resolves.toEqual(first);
    await expect(loadWorkspace(otherScope)).resolves.toEqual(second);
    expect(Object.keys(values)).toEqual([
      `hbhr:workspace:${scope}`,
      `hbhr:workspace:${otherScope}`,
    ]);
  });

  it('keeps the same user ID isolated between verified companies', async () => {
    const first = workspace([group('one', 'Company one', ['1'])]);
    const second = workspace([group('two', 'Company two', ['2'])]);
    await saveWorkspace(companyScope, first);
    await saveWorkspace(otherCompanyScope, second);

    await expect(loadWorkspace(companyScope)).resolves.toEqual(first);
    await expect(loadWorkspace(otherCompanyScope)).resolves.toEqual(second);
    expect(Object.keys(values)).toEqual([
      `hbhr:workspace:${companyScope}`,
      `hbhr:workspace:${otherCompanyScope}`,
    ]);
  });

  it('falls back to defaults for invalid stored data and rejects invalid scopes', async () => {
    values[`hbhr:workspace:${scope}`] = {
      version: 1,
      groups: [{ id: 'one', name: 'One', memberIds: ['1'], token: 'secret' }],
      preferences: workspace().preferences,
    };
    await expect(loadWorkspace(scope)).resolves.toEqual(defaultWorkspace());
    await expect(loadWorkspace('../other')).rejects.toThrow('Invalid scope');
    await expect(saveWorkspace('bad scope', workspace())).rejects.toThrow('Invalid scope');
  });

  it('migrates legacy version-zero workspace fields', async () => {
    values[`hbhr:workspace:${scope}`] = {
      version: 0,
      groups: [group('legacy', 'Legacy', ['1', '1'])],
      selectedGroupId: 'legacy',
      pending: true,
      threshold: 5,
      collapsed: true,
    };

    await expect(loadWorkspace(scope)).resolves.toEqual({
      version: 1,
      groups: [group('legacy', 'Legacy', ['1'])],
      preferences: {
        selectedGroupId: 'legacy',
        pending: true,
        threshold: 5,
        collapsed: true,
      },
    });
  });

  it('distinguishes missing, valid, and invalid stored entries', async () => {
    await expect(inspectWorkspace(companyScope)).resolves.toEqual({ status: 'missing' });
    values[`hbhr:workspace:${companyScope}`] = workspace();
    await expect(inspectWorkspace(companyScope)).resolves.toEqual({ status: 'valid', workspace: workspace() });
    values[`hbhr:workspace:${companyScope}`] = { version: 99, groups: [] };
    await expect(inspectWorkspace(companyScope)).resolves.toEqual({ status: 'invalid' });
  });

  it('requires explicit confirmation and preserves the legacy source during recovery', async () => {
    const legacyScope = legacyUserScope('123');
    const legacy = workspace([group('legacy', 'Legacy', ['1'])]);
    values[`hbhr:workspace:${legacyScope}`] = legacy;

    await expect(recoverLegacyWorkspace(companyScope, legacyScope, false)).rejects.toThrow(
      'Legacy workspace recovery requires confirmation',
    );
    await expect(recoverLegacyWorkspace(companyScope, legacyScope, true)).resolves.toEqual({
      status: 'recovered',
      workspace: legacy,
    });
    expect(values[`hbhr:workspace:${legacyScope}`]).toEqual(legacy);
    expect(values[`hbhr:workspace:${companyScope}`]).toEqual(legacy);
  });

  it('lets an existing destination win and does not overwrite it on repeated recovery', async () => {
    const legacyScope = legacyUserScope('123');
    const legacy = workspace([group('legacy', 'Legacy', ['1'])]);
    const destination = workspace([group('current', 'Current', ['2'])]);
    values[`hbhr:workspace:${legacyScope}`] = legacy;
    values[`hbhr:workspace:${companyScope}`] = destination;

    await expect(recoverLegacyWorkspace(companyScope, legacyScope, true)).resolves.toEqual({
      status: 'destination-exists',
      workspace: destination,
    });
    expect(values[`hbhr:workspace:${companyScope}`]).toEqual(destination);
    expect(localSet).not.toHaveBeenCalled();
  });

  it('reports invalid or missing legacy entries and keeps them untouched when writes fail', async () => {
    const legacyScope = legacyUserScope('123');
    values[`hbhr:workspace:${legacyScope}`] = { version: 99 };
    await expect(recoverLegacyWorkspace(companyScope, legacyScope, true)).resolves.toEqual({ status: 'source-invalid' });
    expect(values[`hbhr:workspace:${companyScope}`]).toBeUndefined();

    delete values[`hbhr:workspace:${legacyScope}`];
    await expect(recoverLegacyWorkspace(companyScope, legacyScope, true)).resolves.toEqual({ status: 'source-missing' });

    values[`hbhr:workspace:${legacyScope}`] = workspace([group('legacy', 'Legacy', ['1'])]);
    localSet.mockRejectedValueOnce(new Error('write failed'));
    await expect(recoverLegacyWorkspace(companyScope, legacyScope, true)).rejects.toThrow('write failed');
    expect(values[`hbhr:workspace:${legacyScope}`]).toEqual(workspace([group('legacy', 'Legacy', ['1'])]));
  });
});

describe('workspace validation and merges', () => {
  it('normalizes duplicate member IDs while preserving safe text as data', () => {
    const value = validateWorkspace({
      version: 1,
      groups: [group('safe', '<script>alert(1)</script>', ['1', '1', '2'])],
      preferences: {
        selectedGroupId: 'safe',
        pending: false,
        threshold: 3,
        collapsed: false,
      },
    });

    expect(value.groups[0]).toEqual(group('safe', '<script>alert(1)</script>', ['1', '2']));
  });

  it('rejects duplicate groups, hostile IDs, sensitive fields, and invalid preferences', () => {
    expect(() => validateWorkspace({
      version: 1,
      groups: [group('same'), group('same')],
      preferences: workspace().preferences,
    })).toThrow('Duplicate group id');
    expect(() => validateWorkspace({
      version: 1,
      groups: [group('bad id')],
      preferences: workspace().preferences,
    })).toThrow('Invalid group id');
    expect(() => validateWorkspace({
      version: 1,
      groups: [{ ...group('one'), calendar: [] }],
      preferences: workspace().preferences,
    })).toThrow('Workspace contains unsupported data');
    expect(() => validateWorkspace({
      version: 1,
      groups: [group('one')],
      preferences: { ...workspace().preferences, selectedGroupId: 'missing' },
    })).toThrow('Selected group does not exist');
    expect(() => validateWorkspace({
      version: 1,
      groups: [group('one')],
      preferences: { ...workspace([group('one')]).preferences, threshold: 0 },
    })).toThrow('Invalid warning threshold');
  });

  it('merges groups by ID, deduplicates members, and does not mutate inputs', () => {
    const current = [group('one', 'Old name', ['1', '2'])];
    const incoming = [group('one', 'New name', ['2', '3']), group('two', 'Two', ['4'])];

    expect(mergeGroups(current, incoming)).toEqual([
      group('one', 'New name', ['1', '2', '3']),
      group('two', 'Two', ['4']),
    ]);
    expect(current).toEqual([group('one', 'Old name', ['1', '2'])]);
    expect(incoming).toEqual([group('one', 'New name', ['2', '3']), group('two', 'Two', ['4'])]);
  });
});

describe('imports and exports', () => {
  it('round-trips versioned groups and preserves foreign scope for caller review', () => {
    const groups = [group('engineering', '<b>Engineering</b>', ['1', '2', '2'])];
    const text = exportGroups(otherScope, groups);

    expect(parseImport(text)).toEqual({
      scope: otherScope,
      groups: [group('engineering', '<b>Engineering</b>', ['1', '2'])],
    });
  });

  it('rejects malformed, oversized, incompatible, and hostile imports', () => {
    expect(() => parseImport('{')).toThrow('Import is not valid JSON');
    expect(() => parseImport(JSON.stringify({ version: 2, scope, groups: [] }))).toThrow(
      'Unsupported import version',
    );
    expect(() => parseImport(JSON.stringify({ version: 1, scope }))).toThrow('Import groups are missing');
    expect(() => parseImport(JSON.stringify({ version: 1, scope, groups: [], token: 'secret' }))).toThrow(
      'Workspace contains unsupported data',
    );
    expect(() => parseImport(JSON.stringify({ version: 1, scope, groups: [group('bad id')] }))).toThrow(
      'Invalid group id',
    );
    expect(() => parseImport(`${JSON.stringify({ version: 1, scope, groups: [] })}${'x'.repeat(256 * 1024)}`)).toThrow(
      'Import is too large',
    );
    expect(() => parseImport(JSON.stringify({
      version: 1,
      scope,
      groups: Array.from({ length: 101 }, (_, index) => group(`group-${index}`)),
    }))).toThrow('Invalid groups');
  });
});

describe('storage subscriptions', () => {
  let values: Record<string, unknown>;
  let listeners: Listener[];
  let addListener: ReturnType<typeof vi.fn>;
  let removeListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    values = {};
    listeners = [];
    addListener = vi.fn((listener: Listener) => listeners.push(listener));
    removeListener = vi.fn((listener: Listener) => {
      listeners = listeners.filter((current) => current !== listener);
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: values[key] })),
          set: vi.fn(),
        },
        onChanged: { addListener, removeListener },
      },
    });
  });

  it('filters area and scope changes, normalizes valid values, and handles deletion', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeWorkspace(scope, callback);
    const key = `hbhr:workspace:${scope}`;
    const valid = workspace();

    expect(addListener).toHaveBeenCalledTimes(1);
    listeners[0]?.({ [`hbhr:workspace:${otherScope}`]: { newValue: valid } }, 'local');
    listeners[0]?.({ [key]: { newValue: valid } }, 'sync');
    expect(callback).not.toHaveBeenCalled();

    listeners[0]?.({ [key]: { newValue: valid } }, 'local');
    expect(callback).toHaveBeenCalledWith(valid);

    listeners[0]?.({ [key]: { newValue: undefined } }, 'local');
    expect(callback).toHaveBeenLastCalledWith(defaultWorkspace());

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('converts malformed external changes to a default workspace', () => {
    const callback = vi.fn();
    subscribeWorkspace(scope, callback);
    const key = `hbhr:workspace:${scope}`;

    listeners[0]?.({ [key]: { newValue: { version: 99 } } }, 'local');
    expect(callback).toHaveBeenCalledWith(defaultWorkspace());
  });
});