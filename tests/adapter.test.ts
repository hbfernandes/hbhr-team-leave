import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdapterError,
  fetchAccountIdentity,
  fetchCalendar,
  fetchDirectory,
  parseAccountProfile,
  parseCalendar,
  parseDirectory,
} from '../src/adapter';

function directoryTable(rows: string, headers = ['Name', 'Department', 'Line Manager', 'Region']): string {
  return `
    <div id="user-profile">
      <table>
        <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function directoryRow(values: string[]): string {
  return `<tr>${values.map((value) => `<td>${value}</td>`).join('')}</tr>`;
}

function response(body: string, status = 200, headers: Record<string, string> = {}, url = ''): Response {
  const result = new Response(body, { status, headers });
  if (url) {
    Object.defineProperty(result, 'url', { value: url });
  }
  return result;
}

function profileHtml(options: {
  formIds?: string[];
  snapshot?: unknown;
  includeSnapshot?: boolean;
  includePasswordChange?: boolean;
  script?: string;
} = {}): string {
  const formIds = options.formIds ?? ['123', '123'];
  const forms = formIds
    .map(
      (id, index) => `<form action="/user/settings/profile/${index ? 'personal' : 'work'}-details/update">
        <input type="hidden" name="id" value="${id}">
        <input type="text" name="unrelated-${index}" value="unrelated">
      </form>`,
    )
    .join('');
  const passwordForm = options.includePasswordChange
    ? '<form action="/user/settings/profile/password/update"><input type="password" name="password"></form>'
    : '';
  const snapshot = options.snapshot ?? { data: { user_id: 123, company_id: 456 } };
  const component = options.includeSnapshot === false
    ? ''
    : `<div class="user-dbs-edit-form" wire:snapshot='${JSON.stringify(snapshot)}'></div>`;
  return `<!doctype html><html><head><title>Profile</title></head><body>
    ${forms}${passwordForm}${component}<input id="unrelated-id" value="999">
    <script>${options.script ?? 'window.__profileScriptRan = true;'}</script>
  </body></html>`;
}

function calendarEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'leave',
    id: 10,
    user_id: 123,
    status: 'approved',
    start: '2026-10-02T00:00:00+00:00',
    end: '2026-10-02T23:59:59+00:00',
    only_text: 'Annual leave',
    ...overrides,
  };
}

describe('parseDirectory', () => {
  it('parses verified profile links and requested directory columns', () => {
    const html = directoryTable(
      directoryRow([
        '<a href="/people-directory/view/123">Élodie Brûlé</a>',
        'Engineering',
        'Jules North',
        'East',
      ]),
    );

    expect(parseDirectory(html)).toEqual([
      {
        id: '123',
        name: 'Élodie Brûlé',
        department: 'Engineering',
        manager: 'Jules North',
        region: 'East',
      },
    ]);
  });

  it('maps reordered columns and leaves optional metadata empty', () => {
    const reordered = directoryTable(
      directoryRow(['West', '<a href="/people-directory/view/7">Mira Vale</a>', 'Research']),
      ['Region', 'Name', 'Department'],
    );
    const missingOptional = directoryTable(
      directoryRow(['<a href="/people-directory/view/8">Rowan Lake</a>']),
      ['Name'],
    );

    expect(parseDirectory(reordered)).toEqual([
      { id: '7', name: 'Mira Vale', department: 'Research', manager: '', region: 'West' },
    ]);
    expect(parseDirectory(missingOptional)).toEqual([
      { id: '8', name: 'Rowan Lake', department: '', manager: '', region: '' },
    ]);
  });

  it('deduplicates employee IDs and fills missing duplicate metadata', () => {
    const html = directoryTable(
      directoryRow(['<a href="/people-directory/view/1">Alex Stone</a>', '', 'Jules North', '']) +
        directoryRow(['<a href="/people-directory/view/1">Alex Stone</a>', 'Platform', '', 'East']),
    );

    expect(parseDirectory(html)).toEqual([
      {
        id: '1',
        name: 'Alex Stone',
        department: 'Platform',
        manager: 'Jules North',
        region: 'East',
      },
    ]);
  });

  it('ignores malformed profile links and supports an empty directory', () => {
    const html = directoryTable(
      directoryRow(['<a href="/people-directory/view/not-an-id">Bad</a>', 'Engineering', '', 'East']) +
        directoryRow(['<a href="javascript:alert(1)">Script</a>', 'Engineering', '', 'East']),
    );

    expect(parseDirectory(html)).toEqual([]);
    expect(parseDirectory(directoryTable(''))).toEqual([]);
  });

  it('rejects missing tables, unexpected headers, login pages, and incomplete tables', () => {
    expect(() => parseDirectory('<table><tr><th>Name</th></tr></table>')).toThrow(
      'HBHR directory table was not found',
    );
    expect(() => parseDirectory(directoryTable(directoryRow(['A', 'B']), ['Employee', 'Department']))).toThrow(
      'HBHR directory headers were unexpected',
    );
    expect(() => parseDirectory('<title>Log in</title><input type="password">')).toThrow(
      'Log into HBHR, then refresh',
    );
    expect(() => parseDirectory(`
      <div id="user-profile" data-server-side="true">
        <table><tr><th>Name</th></tr><tr><td><a href="/people-directory/view/1">Alex</a></td></tr></table>
      </div>
    `)).toThrow('HBHR directory is paginated or incomplete');
    expect(() => parseDirectory(`
      ${directoryTable(directoryRow(['<a href="/people-directory/view/1">Alex</a>', 'Engineering', '', 'East']))}
      <script>const grid = { serverSide: true };</script>
    `)).toThrow('HBHR directory is paginated or incomplete');
    expect(() => parseDirectory(`
      <body>Showing 1 to 1 of 86</body>
      ${directoryTable(directoryRow(['<a href="/people-directory/view/1">Alex</a>', 'Engineering', '', 'East']))}
    `)).toThrow('HBHR directory is paginated or incomplete');
  });
});

describe('parseCalendar', () => {
  it('parses verified HBHR calendar_data leave and public-holiday shapes', () => {
    expect(
      parseCalendar(
        {
          success: true,
          calendar_data: [
            calendarEvent({ id: 42, user_id: 123 }),
            {
              type: 'public-holiday',
              start: '2026-10-12T00:00:00+00:00',
              end: '2026-10-12T23:59:59+00:00',
              only_text: 'Founders Day',
            },
          ],
        },
        ['123'],
      ),
    ).toEqual({
      leaves: [
        {
          id: '42',
          userId: '123',
          start: '2026-10-02',
          end: '2026-10-02',
          status: 'approved',
          label: 'Annual leave',
        },
      ],
      holidays: [{ start: '2026-10-12', end: '2026-10-12', label: 'Founders Day' }],
      warnings: [],
    });
  });

  it('filters unselected members locally and accepts nested event containers', () => {
    const result = parseCalendar(
      {
        success: true,
        data: {
          events: [
            calendarEvent({ user_id: 123 }),
            calendarEvent({ id: 11, user_id: 999, only_text: 'Other person' }),
          ],
        },
      },
      ['123'],
    );

    expect(result.leaves).toHaveLength(1);
    expect(result.leaves[0]?.userId).toBe('123');
    expect(result.holidays).toEqual([]);
  });

  it('reports envelope, container, type, status, date, and holiday payload errors', () => {
    expect(() => parseCalendar({ success: false }, ['123'])).toThrow(
      'HBHR calendar request was not successful',
    );
    expect(() => parseCalendar({ success: true }, ['123'])).toThrow(
      'HBHR calendar events were missing',
    );
    expect(() => parseCalendar({ success: true, calendar_data: {} }, ['123'])).toThrow(
      'HBHR calendar calendar_data were malformed',
    );

    const result = parseCalendar(
      {
        success: true,
        calendar_data: [
          calendarEvent({ type: 'training' }),
          calendarEvent({ id: 12, status: 'cancelled' }),
          calendarEvent({ id: 13, start: '2026-02-30', end: '2026-02-30' }),
          { type: 'public-holiday', start: '2026-10-12', end: '2026-10-12' },
          { type: 'public-holiday', start: '2026-10-13', end: '2026-10-13', only_text: 'Holiday' },
        ],
      },
      ['123'],
    );

    expect(result.leaves).toEqual([]);
    expect(result.holidays).toEqual([
      { start: '2026-10-13', end: '2026-10-13', label: 'Holiday' },
    ]);
    expect(result.warnings).toEqual([
      'Ignored unsupported calendar event type.',
      'Ignored malformed leave event.',
      'Ignored malformed leave event.',
      'Ignored malformed holiday event.',
    ]);
  });

  it('accepts empty event containers and rejects malformed success envelopes', () => {
    expect(parseCalendar({ success: true, calendar_data: [] }, ['123'])).toEqual({
      leaves: [],
      holidays: [],
      warnings: [],
    });
    expect(() => parseCalendar(null, ['123'])).toThrow('HBHR calendar response was malformed');
  });
});

describe('parseAccountProfile', () => {
  it('parses matching profile forms and the recognised company snapshot', () => {
    expect(parseAccountProfile(profileHtml())).toEqual({
      userId: '123',
      companyId: '456',
      scope: 'hbhr:company:456:user:123',
      source: 'authenticated-profile',
    });
  });

  it('accepts one recognised form, agreeing duplicate forms, and password-change fields', () => {
    expect(parseAccountProfile(profileHtml({ formIds: ['123'], includePasswordChange: true }))).toMatchObject({
      userId: '123',
      companyId: '456',
    });
    expect(parseAccountProfile(profileHtml({ includePasswordChange: true }))).toMatchObject({
      userId: '123',
      companyId: '456',
    });
  });

  it('ignores unrelated IDs and does not execute profile scripts', () => {
    const result = parseAccountProfile(profileHtml());
    expect(result.userId).toBe('123');
    expect((globalThis as { __profileScriptRan?: boolean }).__profileScriptRan).toBeUndefined();
  });

  it('rejects missing, invalid, conflicting, malformed, and oversized identity values', () => {
    expect(() => parseAccountProfile(profileHtml({ includeSnapshot: false }))).toThrow(
      'HBHR profile company identity was unavailable',
    );
    expect(() => parseAccountProfile(profileHtml({ formIds: ['123', '456'] }))).toThrow(
      'HBHR profile identity conflicted',
    );
    expect(() => parseAccountProfile(profileHtml({ formIds: ['0'] }))).toThrow(
      'HBHR profile user ID was invalid',
    );
    expect(() => parseAccountProfile(profileHtml({ formIds: ['9'.repeat(129)] }))).toThrow(
      'HBHR profile user ID was invalid',
    );
    expect(() => parseAccountProfile(profileHtml({ snapshot: { data: { user_id: 999, company_id: 456 } } }))).toThrow(
      'HBHR profile identity conflicted',
    );
    expect(() => parseAccountProfile(profileHtml({ snapshot: { data: { user_id: 123 } } }))).toThrow(
      'HBHR profile company identity was unavailable',
    );
    expect(() => parseAccountProfile(profileHtml({ snapshot: { data: { user_id: { value: 123 }, company_id: 456 } } }))).toThrow(
      'HBHR profile user ID was invalid',
    );
  });

  it('supports Livewire scalar tuples and rejects malformed snapshots', () => {
    expect(parseAccountProfile(profileHtml({
      snapshot: { data: { user_id: [123, { s: 'int' }], company_id: [456, { s: 'int' }] } },
    }))).toMatchObject({ userId: '123', companyId: '456' });
    expect(() => parseAccountProfile(profileHtml({
      snapshot: { data: { user_id: [123], company_id: 456 } },
    }))).toThrow('HBHR profile user ID field was malformed');
    expect(() => parseAccountProfile(profileHtml({
      snapshot: { data: { user_id: 123, company_id: { nested: 456 } } },
    }))).toThrow('HBHR profile company ID was invalid');
  });
});

describe('adapter requests', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests authenticated profile HTML without exposing password fields to the parser', async () => {
    fetchMock.mockResolvedValue(response(profileHtml({ includePasswordChange: true }), 200, {
      'content-type': 'text/html; charset=UTF-8',
    }, 'https://app.hbhr.io/user/settings/profile'));

    await expect(fetchAccountIdentity()).resolves.toMatchObject({
      userId: '123',
      companyId: '456',
      scope: 'hbhr:company:456:user:123',
    });
    expect(fetchMock).toHaveBeenCalledWith('/user/settings/profile', expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }));
  });

  it('rejects profile auth failures, login redirects, wrong content types, and unexpected URLs', async () => {
    fetchMock.mockResolvedValueOnce(response('', 401, {}, 'https://app.hbhr.io/user/settings/profile'));
    await expect(fetchAccountIdentity()).rejects.toMatchObject({ code: 'authentication' });

    fetchMock.mockResolvedValueOnce(response('<form action="/login"><input type="password"></form>', 200, {
      'content-type': 'text/html',
    }, 'https://app.hbhr.io/login'));
    await expect(fetchAccountIdentity()).rejects.toThrow('Log into HBHR, then refresh');

    fetchMock.mockResolvedValueOnce(response('{}', 200, {
      'content-type': 'application/json',
    }, 'https://app.hbhr.io/user/settings/profile'));
    await expect(fetchAccountIdentity()).rejects.toThrow('HBHR profile response was not HTML');

    fetchMock.mockResolvedValueOnce(response(profileHtml(), 200, {
      'content-type': 'text/html',
    }, 'https://app.hbhr.io/people-directory'));
    await expect(fetchAccountIdentity()).rejects.toThrow('HBHR profile response URL was unexpected');
  });

  it('requests directory endpoint with same-origin HTML headers', async () => {
    fetchMock.mockResolvedValue(
      response(directoryTable(directoryRow(['<a href="/people-directory/view/123">Alex</a>', 'Engineering', '', 'East'])), 200, {
        'content-type': 'text/html',
      }),
    );

    await expect(fetchDirectory()).resolves.toEqual([
      { id: '123', name: 'Alex', department: 'Engineering', manager: '', region: 'East' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('/people-directory', expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
      signal: expect.any(AbortSignal),
    }));
  });

  it('skips calendar request for an empty group', async () => {
    await expect(fetchCalendar('2026-10', [])).resolves.toEqual({
      leaves: [],
      holidays: [],
      warnings: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds inclusive range and repeated user_id[] query parameters', async () => {
    fetchMock.mockResolvedValue(
      response(JSON.stringify({ success: true, calendar_data: [] }), 200, {
        'content-type': 'application/json',
      }),
    );

    await fetchCalendar('2026-10', ['123', '123', '456']);

    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string, 'https://hbhr.invalid');
    expect(requestUrl.pathname).toBe('/home/get-calendar');
    expect(requestUrl.searchParams.get('first_day')).toBe('Thu Oct 01 2026');
    expect(requestUrl.searchParams.get('last_day')).toBe('Sat Oct 31 2026');
    expect(requestUrl.searchParams.getAll('user_id[]')).toEqual(['123', '456']);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }));
  });

  it('filters server-returned events to requested members', async () => {
    fetchMock.mockResolvedValue(
      response(JSON.stringify({
        success: true,
        calendar_data: [
          calendarEvent({ user_id: 123 }),
          calendarEvent({ id: 11, user_id: 999, only_text: 'Unselected' }),
        ],
      }), 200, { 'content-type': 'application/json' }),
    );

    const result = await fetchCalendar('2026-10', ['123']);
    expect(result.leaves.map((leave) => leave.userId)).toEqual(['123']);
    expect(new URL(fetchMock.mock.calls[0]?.[0] as string, 'https://hbhr.invalid').searchParams.getAll('user_id[]')).toEqual(['123']);
  });

  it('propagates parent abort to bounded request signal', async () => {
    const parent = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let release: () => void = () => undefined;
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve) => {
        release = () => resolve(response(JSON.stringify({ success: true, calendar_data: [] }), 200, {
          'content-type': 'application/json',
        }));
      });
    });

    const pending = fetchCalendar('2026-10', ['123'], parent.signal);
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    parent.abort();
    expect(requestSignal?.aborted).toBe(true);
    release();
    await expect(pending).resolves.toEqual({ leaves: [], holidays: [], warnings: [] });
  });

  it('turns auth and login responses into the session-expiry error', async () => {
    fetchMock.mockResolvedValueOnce(response('', 401));
    await expect(fetchDirectory()).rejects.toThrow('Log into HBHR, then refresh');

    fetchMock.mockResolvedValueOnce(response('', 403));
    await expect(fetchCalendar('2026-10', ['123'])).rejects.toThrow('Log into HBHR, then refresh');

    fetchMock.mockResolvedValueOnce(response('<form action="/login"><input type="password"></form>', 200, {
      'content-type': 'text/html',
    }));
    await expect(fetchCalendar('2026-10', ['123'])).rejects.toThrow('Log into HBHR, then refresh');
  });

  it('rejects malformed calendar response bodies', async () => {
    fetchMock.mockResolvedValue(response('{not-json', 200, { 'content-type': 'application/json' }));
    await expect(fetchCalendar('2026-10', ['123'])).rejects.toThrow(
      'HBHR calendar response was malformed',
    );
  });
});