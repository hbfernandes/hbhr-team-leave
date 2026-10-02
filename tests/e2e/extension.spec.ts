import AxeBuilder from '@axe-core/playwright';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, test as base, expect, type BrowserContext, type Page, type Route } from '@playwright/test';

const test = base.extend<{ context: BrowserContext }>({
  context: async ({}, use) => {
    const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hbhr-team-leave-'));
    const packagedExtensionDirectory = await preparePackagedExtension();
    const context = await chromium.launchPersistentContext(userDataDirectory, {
      args: [
        `--disable-extensions-except=${packagedExtensionDirectory}`,
        `--load-extension=${packagedExtensionDirectory}`,
      ],
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 900 },
    });

    try {
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDirectory, { force: true, recursive: true });
      await rm(packagedExtensionDirectory, { force: true, recursive: true });
    }
  },
});

const HOST_SELECTOR = '#hbhr-team-leave-extension';
const NAV_SELECTOR = '#hbhr-team-leave-nav';
const TEAM_LEAVE_HASH = '#hbhr-team-leave';
const TEAM_LEAVE_URL = `https://app.hbhr.io/${TEAM_LEAVE_HASH}`;
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const HOSTILE_NAME = '<img src=x onerror="window.__hbhrXss = true">';

type CalendarMode = 'ok' | 'auth';
type HeaderVariant = 'docs' | 'info' | 'both';

interface FixtureOptions {
  accountId?: string;
  calendarMode?: CalendarMode;
  headerVariant?: HeaderVariant;
  hostileName?: string;
  mileageIdentityOnly?: boolean;
}

interface FixtureController {
  calendarRequests: URL[];
  directoryRequests: URL[];
  setCalendarMode(mode: CalendarMode): void;
}

async function preparePackagedExtension(): Promise<string> {
  const sourceDirectory = fileURLToPath(new URL('../../dist', import.meta.url));
  const packagedExtensionDirectory = await mkdtemp(path.join(os.tmpdir(), 'hbhr-team-leave-extension-'));
  await copyFile(path.join(sourceDirectory, 'manifest.json'), path.join(packagedExtensionDirectory, 'manifest.json'));
  await copyFile(path.join(sourceDirectory, 'content.js'), path.join(packagedExtensionDirectory, 'content.js'));
  await copyFile(path.join(sourceDirectory, 'transition.js'), path.join(packagedExtensionDirectory, 'transition.js'));
  for (const size of [16, 32, 48, 128]) {
    await copyFile(path.join(sourceDirectory, `icon-${size}.png`), path.join(packagedExtensionDirectory, `icon-${size}.png`));
  }
  return packagedExtensionDirectory;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function headerFixture(variant: HeaderVariant = 'both'): string {
  const docsLink = variant === 'info' ? '' : '<a id="myDocsButton" href="/docs">Documents</a>';
  const infoLink = variant === 'docs' ? '' : '<a id="myInfoButton" href="/info">Information</a>';
  return `<header id="hbhr-header">
      <nav aria-label="HBHR navigation">
        <div class="docs-wrapper">${docsLink}${infoLink}</div>
      </nav>
    </header>`;
}

function dashboardFixture(accountId: string, headerVariant: HeaderVariant = 'both'): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>HBHR Home</title></head>
  <body data-layout-mode="light" style="background: #fff; font-family: Poppins, sans-serif; font-size: 13px;">
    ${headerFixture(headerVariant)}
    <main class="page-content">
      <div class="container-fluid">
        <div class="user-dashboard-grid">
          <h1>HBHR Home</h1>
          <section class="dashboard-custom-widgets-container">
            <section class="custom-calendar-wrapper">
              <div id="native-host-fixture">
                <div id="user-calendar">Native HBHR calendar remains unchanged.</div>
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
    <script id="hbhr-current-user">window.__hbhrXss = false; window.current_user_id = '${accountId}';</script>
    <script id="hbhr-event-signal">const event = { event: { user_id: '${accountId}' } }; if (event.event.user_id == '${accountId}') { document.body.dataset.hbhrVerified = 'yes'; }</script>
    <script id="hbhr-vehicle-rate-signal">window.vehicleRates = { path: '/user/vehicle-rates', user_id: '${accountId}' };</script>
  </body>
</html>`;
}

function directoryFixture(hostileName?: string, headerVariant: HeaderVariant = 'both'): string {
  const employees = [
    ['201', hostileName ?? 'Ada Lovelace', 'Platform', 'Grace Hopper', 'East'],
    ['202', 'Lin Turing', 'Platform', 'Grace Hopper', 'West'],
  ];
  const rows = employees
    .map(
      ([id, name, department, manager, region]) => `<tr>
        <td><a href="/people-directory/view/${id}">${escapeHtml(name)}</a></td>
        <td>${escapeHtml(department)}</td>
        <td>${escapeHtml(manager)}</td>
        <td>${escapeHtml(region)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>People directory</title></head>
  <body>
    ${headerFixture(headerVariant)}
    <main>
      <table id="user-profile">
        <thead><tr><th>Name</th><th>Department</th><th>Line Manager</th><th>Region</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </main>
  </body>
</html>`;
}

function loginFixture(): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Sign in</title></head>
  <body><form action="/login"><label>Password <input type="password"></label><button type="submit">Sign in</button></form></body>
</html>`;
}

function requestDate(month: string, day: number): string {
  const date = new Date(`${month}-${String(day).padStart(2, '0')}T12:00:00Z`);
  const parts = date.toUTCString().slice(0, 16).replace(',', '').split(' ');
  return `${parts[0]} ${parts[2]} ${parts[1]} ${parts[3]}`;
}

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function calendarFixture(month: string): object {
  return {
    success: true,
    calendar_data: [
        {
          type: 'leave',
          id: 'leave-201-approved',
          user_id: '201',
          start: `${month}-03`,
          end: `${month}-03`,
          status: 'approved',
          only_text: "Ada Lovelace (Ada)'s Holidays/Annual Leave is approved",
        },
        {
          type: 'leave',
          id: 'leave-202-pending',
          user_id: '202',
          start: `${month}-03`,
          end: `${month}-03`,
          status: 'pending',
          only_text: "Lin Turing's Sick Leave is pending",
        },
        {
          type: 'public-holiday',
          start: `${month}-04`,
          end: `${month}-04`,
          only_text: 'Founders Day',
        },
    ],
  };
}

async function fulfill(route: Route, body: string | object, contentType: string, status = 200): Promise<void> {
  await route.fulfill({
    body: typeof body === 'string' ? body : JSON.stringify(body),
    contentType,
    status,
  });
}

async function installFixtures(page: Page, options: FixtureOptions = {}): Promise<FixtureController> {
  let calendarMode = options.calendarMode ?? 'ok';
  const accountId = options.accountId ?? '101';
  const calendarRequests: URL[] = [];
  const directoryRequests: URL[] = [];

  await page.route('https://app.hbhr.io/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/home/get-calendar') {
      calendarRequests.push(url);
      if (calendarMode === 'auth') {
        await fulfill(route, JSON.stringify({ error: 'expired' }), 'application/json', 401);
        return;
      }
      await fulfill(route, calendarFixture(CURRENT_MONTH), 'application/json');
      return;
    }

    if (url.pathname === '/people-directory') {
      directoryRequests.push(url);
      await fulfill(route, directoryFixture(options.hostileName, options.headerVariant), 'text/html');
      return;
    }

    if (url.pathname === '/login') {
      await fulfill(route, loginFixture(), 'text/html');
      return;
    }

    if (['/', '/home', '/home/'].includes(url.pathname)) {
      let html = dashboardFixture(accountId, options.headerVariant);
      if (options.mileageIdentityOnly) {
        html = html.replace(/<script id="hbhr-current-user">[\s\S]*?<\/script>/, '')
          .replace(/<script id="hbhr-event-signal">[\s\S]*?<\/script>/, '');
      }
      await fulfill(route, html, 'text/html');
      return;
    }

    await fulfill(route, 'Not found', 'text/plain', 404);
  });

  return {
    calendarRequests,
    directoryRequests,
    setCalendarMode(mode) {
      calendarMode = mode;
    },
  };
}

function widget(page: Page) {
  return page.locator(HOST_SELECTOR);
}

async function expectStandaloneWidget(page: Page): Promise<void> {
  await expect(widget(page)).toHaveCount(1);
  await expect(widget(page)).toBeVisible();
  await expect.poll(() => widget(page).evaluate((element) => element.tagName)).toBe('SECTION');
  await expect.poll(() => widget(page).evaluate((element) => element.parentElement?.matches('.page-content > .container-fluid') ?? false)).toBe(true);
  await expect(page.locator('.page-content > .container-fluid > .user-dashboard-grid')).toBeHidden();
  await expect(page.locator('#user-calendar')).toBeAttached();
  await expect(page.locator('#user-calendar')).toBeHidden();
}

async function openHome(page: Page, route = '/home'): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(NAV_SELECTOR)).toBeVisible();
  if (new URL(route, 'https://app.hbhr.io').hash !== TEAM_LEAVE_HASH) {
    await expect(widget(page)).toHaveCount(0);
    await page.locator(NAV_SELECTOR).click();
  }
  await expect(page).toHaveURL(/#hbhr-team-leave$/);
  await expectStandaloneWidget(page);
  await expect(widget(page).getByRole('heading', { name: 'Team Leave', exact: true })).toBeVisible();
}

async function createTeam(page: Page, name = 'Platform', memberPattern: RegExp = /Ada Lovelace|Lin Turing/): Promise<void> {
  const root = widget(page);
  await root.getByRole('button', { name: 'Create your first team' }).click();
  const dialog = root.getByRole('dialog', { name: 'Create team' });
  await dialog.getByLabel('Team name').fill(name);
  const checkboxes = await dialog.getByRole('checkbox', { name: memberPattern }).all();
  for (const checkbox of checkboxes) {
    await checkbox.check();
  }
  await dialog.getByRole('button', { name: 'Save team' }).click();
  await expect(root.getByRole('grid', { name: /team leave timeline/i })).toBeVisible();
}

async function setAccountSignals(page: Page, accountId: string): Promise<void> {
  await page.evaluate((nextAccountId) => {
    const currentUser = document.querySelector<HTMLScriptElement>('#hbhr-current-user');
    const eventSignal = document.querySelector<HTMLScriptElement>('#hbhr-event-signal');
    const vehicleSignal = document.querySelector<HTMLScriptElement>('#hbhr-vehicle-rate-signal');
    if (!currentUser || !eventSignal || !vehicleSignal) {
      throw new Error('Synthetic account signals missing.');
    }
    currentUser.textContent = `window.current_user_id = '${nextAccountId}';`;
    eventSignal.textContent = `const event = { event: { user_id: '${nextAccountId}' } }; if (event.event.user_id == '${nextAccountId}') { document.body.dataset.hbhrVerified = 'yes'; }`;
    vehicleSignal.textContent = `window.vehicleRates = { path: '/user/vehicle-rates', user_id: '${nextAccountId}' };`;
  }, accountId);
}

const headerNavigationCases = [
  ['docs', 'myDocsButton', '/docs'],
  ['info', 'myInfoButton', '/info'],
] as const;

for (const [headerVariant, nativeButtonId, nativeHref] of headerNavigationCases) {
  test(`adds Team Leave navigation after ${headerVariant} header control`, async ({ page }) => {
    await installFixtures(page, { headerVariant });
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    await expect(page.locator(NAV_SELECTOR)).toBeVisible();
    await expect(page.locator(NAV_SELECTOR)).toHaveAttribute('href', TEAM_LEAVE_URL);
    await expect(page.locator('.docs-wrapper + div #hbhr-team-leave-nav')).toHaveCount(1);
    await expect(page.locator(`#${nativeButtonId}`)).toHaveAttribute('href', nativeHref);
    await expect(widget(page)).toHaveCount(0);
  });
}

test('keeps native header links unchanged and does not mount on hashless home', async ({ page }) => {
  const fixture = await installFixtures(page);
  await page.goto('/home', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#myDocsButton')).toHaveAttribute('href', '/docs');
  await expect(page.locator('#myInfoButton')).toHaveAttribute('href', '/info');
  await expect(page.locator(NAV_SELECTOR)).toBeVisible();
  await expect(widget(page)).toHaveCount(0);
  await expect.poll(() => fixture.directoryRequests.length).toBe(0);
  await expect.poll(() => fixture.calendarRequests.length).toBe(0);

  await page.locator(NAV_SELECTOR).click();
  await expect(page).toHaveURL(TEAM_LEAVE_URL);
  await expectStandaloneWidget(page);
  await expect.poll(() => fixture.directoryRequests.length).toBeGreaterThan(0);
});

test('matches native selected button state across navigation, reload and history', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  const nav = page.locator(NAV_SELECTOR);
  await expect(nav).not.toHaveClass(/menu-button-active/);
  await expect(nav).not.toHaveAttribute('aria-current', 'page');
  await nav.click();
  await expect(nav).toHaveClass(/menu-button-active/);
  await expect(nav).toHaveAttribute('aria-current', 'page');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(nav).toHaveClass(/menu-button-active/);
  await page.evaluate(() => { location.hash = ''; });
  await expect(nav).not.toHaveClass(/menu-button-active/);
  await expect(nav).not.toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(nav).toHaveClass(/menu-button-active/);
  await page.goForward();
  await expect(nav).not.toHaveClass(/menu-button-active/);
});

test('suppresses native dashboard paints during deep-link startup', async ({ page }) => {
  await installFixtures(page);
  await page.addInitScript(() => {
    const state = window as unknown as { nativeDashboardFlashed: boolean };
    state.nativeDashboardFlashed = false;
    function inspectFrame(): void {
      const dashboard = document.querySelector('.user-dashboard-grid');
      const host = document.querySelector('#hbhr-team-leave-extension');
      if (dashboard && !host && dashboard.getClientRects().length && getComputedStyle(dashboard).visibility === 'visible') {
        state.nativeDashboardFlashed = true;
      }
      if (!host) requestAnimationFrame(inspectFrame);
    }
    requestAnimationFrame(inspectFrame);
  });
  await openHome(page, `/home${TEAM_LEAVE_HASH}`);
  expect(await page.evaluate(() => (window as unknown as { nativeDashboardFlashed: boolean }).nativeDashboardFlashed)).toBe(false);
  await expect(page.locator('html')).not.toHaveAttribute('data-hbhr-team-leave-loading', '');
  await expect(page.locator('#hbhr-header')).toBeVisible();
});

test('opens Team Leave from home without reloading the document', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(NAV_SELECTOR)).toBeVisible();
  await page.evaluate(() => { document.body.dataset.transitionSentinel = 'same-document'; });
  await page.locator(NAV_SELECTOR).click();
  await expectStandaloneWidget(page);
  await expect(page.locator('body')).toHaveAttribute('data-transition-sentinel', 'same-document');
});

test('startup mask fails open when HBHR dashboard cannot be mounted', async ({ page }) => {
  await installFixtures(page);
  await page.route('https://app.hbhr.io/home', route => fulfill(route,
    dashboardFixture('101').replace('class="user-dashboard-grid"', 'class="changed-dashboard"'), 'text/html'));
  await page.goto(`/home${TEAM_LEAVE_HASH}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.changed-dashboard')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-hbhr-team-leave-loading', '');
});

test('mounts from a deep link and remains mounted after reload', async ({ page }) => {
  await installFixtures(page);
  await openHome(page, `/home${TEAM_LEAVE_HASH}`);
  await expect(page).toHaveURL(/\/home#hbhr-team-leave$/);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/home#hbhr-team-leave$/);
  await expectStandaloneWidget(page);
});

test('back link restores dashboard and browser history toggles the standalone section', async ({ page }) => {
  await installFixtures(page);
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await expect(widget(page)).toHaveCount(0);

  await page.locator(NAV_SELECTOR).click();
  await expectStandaloneWidget(page);
  await expect(widget(page).getByRole('link', { name: 'Back to dashboard' })).toHaveCount(0);
  await page.evaluate(() => { location.hash = ''; });

  await expect(widget(page)).toHaveCount(0);
  await expect(page.locator('.page-content > .container-fluid > .user-dashboard-grid')).toBeVisible();
  await expect(page.locator('#user-calendar')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');

  await page.locator(NAV_SELECTOR).click();
  await expectStandaloneWidget(page);
  await page.goBack();
  await expect(widget(page)).toHaveCount(0);
  await expect(page.locator('.page-content > .container-fluid > .user-dashboard-grid')).toBeVisible();

  await page.goForward();
  await expectStandaloneWidget(page);
});

test('mounts on home, not directory or login, and preserves native calendar', async ({ page }) => {
  await installFixtures(page);
  await openHome(page, '/');
  await expect(page.locator('#user-calendar')).toHaveText('Native HBHR calendar remains unchanged.');

  await page.goto('/people-directory', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(NAV_SELECTOR)).toBeVisible();
  await expect(page.locator(HOST_SELECTOR)).toHaveCount(0);
  await expect(page.locator('#myDocsButton')).toHaveAttribute('href', '/docs');
  await expect(page.locator('#myInfoButton')).toHaveAttribute('href', '/info');

  await page.locator(NAV_SELECTOR).click();
  await expect(page).toHaveURL(TEAM_LEAVE_URL);
  await expectStandaloneWidget(page);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(HOST_SELECTOR)).toHaveCount(0);

  await openHome(page);
});

test('opens automatically with mileage identity alone and persists groups after reload', async ({ page }) => {
  await installFixtures(page, { mileageIdentityOnly: true });
  await openHome(page);
  await expect(page.locator(HOST_SELECTOR).getByText('Team Leave — select workspace')).toHaveCount(0);
  await createTeam(page, 'Platform');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/#hbhr-team-leave$/);
  await expect(page.locator(HOST_SELECTOR).getByRole('combobox', { name: 'Team' })).toHaveValue(/group-/);
  await expect(page.locator(HOST_SELECTOR).getByRole('grid', { name: /team leave timeline/i })).toBeVisible();
});

test('creates real groups, requests selected members, and persists them after reload', async ({ page }) => {
  const fixture = await installFixtures(page);
  await openHome(page);
  await createTeam(page, 'Platform');

  const teamSelect = widget(page).getByRole('combobox', { name: 'Team' });
  const selectedTeamId = await teamSelect.inputValue();
  expect(selectedTeamId).not.toBe('');
  await expect(teamSelect).toContainText('Platform (2)');
  await expect.poll(() => fixture.calendarRequests.length).toBeGreaterThan(0);

  const calendarRequest = fixture.calendarRequests.at(-1);
  expect(calendarRequest?.searchParams.getAll('user_id[]')).toEqual(['201', '202']);
  expect(calendarRequest?.searchParams.get('first_day')).toBe(requestDate(CURRENT_MONTH, 1));
  expect(calendarRequest?.searchParams.get('last_day')).toBe(requestDate(CURRENT_MONTH, daysInMonth(CURRENT_MONTH)));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/#hbhr-team-leave$/);
  await expect(widget(page).getByRole('combobox', { name: 'Team' })).toHaveValue(selectedTeamId);
  await expect(widget(page).getByRole('combobox', { name: 'Team' })).toContainText('Platform (2)');
  await expect(widget(page).getByRole('grid', { name: /team leave timeline/i })).toBeVisible();
});

test('renders monthly leave counts, keeps pending disjoint, and shows warnings', async ({ page }) => {
  await installFixtures(page);
  await openHome(page);
  await createTeam(page);

  const root = widget(page);
  await expect(root.getByLabel(new RegExp(`Ada Lovelace, ${CURRENT_MONTH}-03: approved`))).toBeVisible();
  await expect(root.getByLabel(new RegExp(`Lin Turing, ${CURRENT_MONTH}-${String(daysInMonth(CURRENT_MONTH)).padStart(2, '0')}: available`))).toBeVisible();
  await expect(root.getByText('Founders Day')).toBeVisible();
  const holidays = root.getByRole('region', { name: /Holidays in/ });
  await expect(holidays.locator('time')).toHaveAttribute('datetime', `${CURRENT_MONTH}-04`);
  const summaryCell = root.getByRole('gridcell', { name: `${CURRENT_MONTH}-03: 1 confirmed, 1 pending`, exact: true });
  await summaryCell.hover();
  await expect(summaryCell).toHaveAttribute('title', /\n1 approved leave\n1 additional pending requests$/);
  await expect(summaryCell).toHaveCSS('cursor', 'help');
  const approvedCell = root.getByLabel(`Ada Lovelace, ${CURRENT_MONTH}-03: approved`, { exact: true });
  await approvedCell.hover();
  await expect(approvedCell).toHaveCSS('cursor', 'help');
  await expect(approvedCell).toHaveAttribute('title', 'Holidays/Annual Leave');
  await expect(approvedCell.locator('.leave-block')).toHaveCSS('cursor', 'help');
  await expect(root.getByRole('gridcell', { name: /public holiday: Founders Day/ })).toHaveAttribute('title', /H: Founders Day \(public holiday, not leave\)/);
  for (const selector of ['.timeline__day-header', '.timeline__cell', '.timeline__summary-cell']) {
    const weekend = root.locator(`${selector}.is-weekend`).first();
    const holiday = root.locator(`${selector}.is-holiday`).first();
    const weekendBackground = await weekend.evaluate((element) => getComputedStyle(element).backgroundColor);
    await expect(holiday).toHaveCSS('background-color', weekendBackground);
  }
  await expect(root.locator('.summary-strip > div').nth(0)).toContainText('1');
  await expect(root.locator('.summary-strip > div').nth(1)).toContainText('1');
  await expect(root.getByText('No days meet the current threshold.')).toBeVisible();

  await root.getByRole('checkbox', { name: 'Show pending' }).check();
  await expect(root.getByLabel(new RegExp(`Lin Turing, ${CURRENT_MONTH}-03: pending`))).toBeVisible();
  const pendingCell = root.getByLabel(`Lin Turing, ${CURRENT_MONTH}-03: pending`, { exact: true });
  await pendingCell.hover();
  await expect(pendingCell).toHaveCSS('cursor', 'help');
  await expect(pendingCell).toHaveAttribute('title', 'Sick Leave');
  await expect(pendingCell.locator('.leave-block')).toHaveCSS('cursor', 'help');

  const threshold = root.getByRole('spinbutton', { name: 'Warn at' });
  await threshold.fill('2');
  await expect(root.getByText('2 away')).toBeVisible();
  await expect(root.getByText('Confirmed + pending')).toBeVisible();
});

test('keeps last successful calendar visible when auth expires', async ({ page }) => {
  const fixture = await installFixtures(page);
  await openHome(page);
  await createTeam(page);
  const root = widget(page);
  const approvedCell = root.getByLabel(new RegExp(`Ada Lovelace, ${CURRENT_MONTH}-03: approved`));
  await expect(approvedCell).toBeVisible();

  fixture.setCalendarMode('auth');
  await root.getByRole('button', { name: 'Refresh team leave' }).click();
  await expect(root.getByRole('alert')).toContainText('Log into HBHR, then refresh.');
  await expect(root.getByRole('alert')).toContainText('Showing the last successful result.');
  await expect(approvedCell).toBeVisible();
});

test('remounts once after dashboard replacement and clears data across accounts', async ({ page }) => {
  await installFixtures(page);
  await openHome(page);
  await createTeam(page, 'Account 101');

  await page.evaluate(() => {
    const dashboard = document.querySelector('.user-dashboard-grid');
    if (!dashboard) {
      throw new Error('Synthetic dashboard missing.');
    }
    const replacement = document.createElement('div');
    replacement.className = 'user-dashboard-grid';
    replacement.innerHTML = '<section class="dashboard-custom-widgets-container"><section class="custom-calendar-wrapper"><div id="user-calendar">Replacement native calendar.</div></section></section>';
    dashboard.replaceWith(replacement);
  });
  await expectStandaloneWidget(page);
  await expect(widget(page).getByRole('grid', { name: /team leave timeline/i })).toBeVisible();
  await expect(page.locator('#user-calendar')).toHaveText('Replacement native calendar.');

  await setAccountSignals(page, '202');
  await expect(widget(page).getByRole('heading', { name: 'No team selected' })).toBeVisible();
  await expect(widget(page).getByRole('combobox', { name: 'Team' })).toHaveValue('');
  await expect(widget(page).getByRole('option', { name: 'Account 101 (2)' })).toHaveCount(0);
  await expectStandaloneWidget(page);

  await setAccountSignals(page, '101');
  await expect(widget(page).getByRole('grid', { name: /team leave timeline/i })).toBeVisible();
  await expect(widget(page).getByRole('combobox', { name: 'Team' })).toContainText('Account 101 (2)');
  await expectStandaloneWidget(page);
});

test('supports dark theme and horizontal timeline scrolling on narrow screens', async ({ page }) => {
  await installFixtures(page);
  await openHome(page);
  await createTeam(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.body.setAttribute('data-layout-mode', 'dark'));

  await expect(page.locator(HOST_SELECTOR)).toHaveAttribute('data-theme', 'dark');
  const timeline = widget(page).locator('.timeline-shell');
  await expect(timeline).toBeVisible();
  expect(await timeline.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('renders hostile directory text as text', async ({ page }) => {
  await installFixtures(page, { hostileName: HOSTILE_NAME });
  await openHome(page);
  await createTeam(page, 'Safety', /<img/);

  await expect(widget(page).locator('.timeline__name').getByText(HOSTILE_NAME, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean((window as unknown as { __hbhrXss?: boolean }).__hbhrXss))).toBe(false);
  await expect(page.locator('img')).toHaveCount(0);
});

test('uses sibling-page typography, navy actions and compact native spacing', async ({ page }) => {
  await installFixtures(page);
  await openHome(page);
  const root = widget(page);
  expect(await root.evaluate(e => getComputedStyle(e).fontFamily)).toBe('Poppins, sans-serif');
  expect(await root.evaluate(e => getComputedStyle(e).fontSize)).toBe('13px');
  const title = root.getByRole('heading', { name: 'Team Leave', exact: true });
  expect(await title.evaluate(e => getComputedStyle(e).fontSize)).toBe('24px');
  expect(await title.evaluate(e => getComputedStyle(e).color)).toBe('rgb(24, 61, 134)');
  const action = root.getByRole('button', { name: 'Manage teams' });
  expect(await action.evaluate(e => getComputedStyle(e).borderRadius)).toBe('999px');
  expect(await root.evaluate(e => getComputedStyle(e).marginTop)).toBe('0px');
  expect(await root.evaluate(e => getComputedStyle(e).paddingTop)).toBe('24px');
  expect(await root.evaluate(e => getComputedStyle(e).paddingLeft)).toBe('18px');
  await expect(page.locator(`${NAV_SELECTOR} > span`).first()).toHaveText('Team Leave');
  await expect(page.locator(`${NAV_SELECTOR} > .badge`)).toHaveCount(1);
});

test('aligns team dropdown with header actions rather than its label', async ({ page }) => {
  await installFixtures(page);
  await openHome(page);
  const controls = widget(page).locator('.widget-controls');
  await expect(controls.getByText('Team', { exact: true })).toHaveCount(0);
  await expect(controls.getByRole('combobox', { name: 'Team' })).toHaveAccessibleName('Team');
  const selector = await controls.getByRole('combobox', { name: 'Team' }).boundingBox();
  expect(selector).not.toBeNull();
  for (const button of await controls.locator(':scope > button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y - selector!.y)).toBeLessThan(1);
    expect(Math.abs(box!.height - selector!.height)).toBeLessThan(1);
  }
});

test('passes axe for extension UI while excluding minimal host-native fixture', async ({ page }) => {
  await installFixtures(page);
  await openHome(page);

  const results = await new AxeBuilder({ page }).exclude('#native-host-fixture').analyze();
  expect(results.violations).toEqual([]);
});