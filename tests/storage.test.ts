import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultWorkspace,
  type Group,
  type Workspace,
} from '../src/domain';
import {
  exportGroups,
  loadWorkspace,
  mergeGroups,
  parseImport,
  saveWorkspace,
  subscribeWorkspace,
  validateWorkspace,
} from '../src/storage';

type Change = { newValue?: unknown };
type Listener = (changes: Record<string, Change>, areaName: string) => void;

const scope = 'hbhr:user:123';
const otherScope = 'hbhr:user:456';

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