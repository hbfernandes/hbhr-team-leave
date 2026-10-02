import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(root, 'store-assets');
await mkdir(assets, { recursive: true });

// Original calendar artwork, not an HBHR logo. No remote fonts or assets.
const iconArtwork = `<rect x="16" y="16" width="96" height="96" rx="23" fill="#204c95"/>
  <rect x="30" y="36" width="68" height="59" rx="9" fill="#fff"/>
  <path d="M30 54h68" stroke="#204c95" stroke-width="5"/>
  <path d="M46 30v14m36-14v14" stroke="#d6e5ff" stroke-width="7" stroke-linecap="round"/>
  <rect x="41" y="64" width="19" height="9" rx="3" fill="#247b5b"/>
  <rect x="41" y="79" width="31" height="9" rx="3" fill="#247b5b"/>
  <rect x="66" y="64" width="20" height="9" rx="3" fill="#e4a72e"/>`;

async function graphics() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const size of [16, 32, 48, 128]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>body{margin:0;background:transparent}svg{display:block}</style>
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">${iconArtwork}</svg>`);
      await page.screenshot({ path: path.join(root, `public/icon-${size}.png`), omitBackground: true });
    }
    await page.setViewportSize({ width: 440, height: 280 });
    await page.setContent(`<style>body{margin:0}svg{display:block}</style>
      <svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
        <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#183d86"/><stop offset="1" stop-color="#315fa7"/></linearGradient></defs>
        <rect width="440" height="280" fill="url(#bg)"/>
        <circle cx="408" cy="22" r="115" fill="#fff" opacity=".04"/>
        <g transform="translate(26 20) scale(.62)">${iconArtwork}</g>
        <text x="118" y="59" fill="#fff" font-family="Arial,sans-serif" font-weight="700" font-size="26">Team Leave</text>
        <text x="118" y="83" fill="#dae7ff" font-family="Arial,sans-serif" font-size="14">Monthly overlap at a glance</text>
        <rect x="36" y="120" width="368" height="119" rx="12" fill="#fff"/>
        <rect x="36" y="120" width="368" height="25" rx="12" fill="#eaf0fa"/>
        <path d="M116 145v94m48-94v94m48-94v94m48-94v94m48-94v94m48-94v94M36 176h368M36 207h368" stroke="#e3e9f3"/>
        <g fill="#c6d2e5"><rect x="49" y="157" width="48" height="7" rx="3"/><rect x="49" y="188" width="40" height="7" rx="3"/><rect x="49" y="219" width="52" height="7" rx="3"/></g>
        <g fill="#d8efe2"><rect x="125" y="153" width="125" height="16" rx="4"/><rect x="173" y="184" width="126" height="16" rx="4"/></g>
        <rect x="221" y="215" width="126" height="16" rx="4" fill="#fff0c7"/>
        <text x="220" y="262" text-anchor="middle" fill="#dae7ff" font-family="Arial,sans-serif" font-size="12">Independent extension for HBHR</text>
      </svg>`);
    await page.screenshot({ path: path.join(assets, 'promo-440x280.png') });
  } finally {
    await browser.close();
  }
}

// All identities, dates and leave records below are synthetic. Network requests
// are fulfilled locally; this script never signs in or contacts the real HR site.
const people = [
  ['901', 'Alex Morgan', 'Engineering', 'Jordan Avery', 'West'],
  ['902', 'Sam Rivera', 'Engineering', 'Jordan Avery', 'East'],
  ['903', 'Taylor Brooks', 'Product', 'Casey Quinn', 'West'],
  ['904', 'Jamie Parker', 'Design', 'Casey Quinn', 'East'],
  ['905', 'Robin Hayes', 'Engineering', 'Jordan Avery', 'West'],
];
const directory = `<table id="user-profile"><thead><tr><th>Name</th><th>Department</th><th>Line Manager</th><th>Region</th></tr></thead><tbody>${people.map(([id, name, department, manager, region]) =>
  `<tr><td><a href="/people-directory/view/${id}">${name}</a></td><td>${department}</td><td>${manager}</td><td>${region}</td></tr>`).join('')}</tbody></table>`;
const calendar = {
  success: true,
  calendar_data: [
    ['901', '05', '09', 'approved', 'Annual Leave'],
    ['902', '07', '09', 'approved', 'Annual Leave'],
    ['903', '08', '09', 'pending', 'Annual Leave'],
    ['904', '19', '21', 'approved', 'Annual Leave'],
    ['905', '20', '22', 'pending', 'Annual Leave'],
  ].map(([user_id, start, end, status, only_text], index) => ({
    type: 'leave', id: `demo-leave-${index}`, user_id, start: `2026-10-${start}`, end: `2026-10-${end}`, status, only_text,
  })).concat([{ type: 'public-holiday', start: '2026-10-12', end: '2026-10-12', only_text: 'Demo public holiday' }]),
};
const home = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Team Leave demo</title>
  <style>body{margin:0;color:#495057;background:#f7f7fa;font:13px Arial,sans-serif}header{height:64px;background:white;border-bottom:1px solid #e9ecf5;display:flex;align-items:center;justify-content:space-between;padding:0 32px}nav{display:flex;align-items:center;gap:14px}nav a{color:#204c95;text-decoration:none;padding:9px 15px;border-radius:20px}.menu-button-active{background:#204c95;color:white}main{padding:0 14px}footer{position:fixed;bottom:0;left:0;right:0;background:#183d86;color:white;padding:8px 32px;font-size:12px;z-index:1000}</style></head>
  <body data-layout-mode="light"><header><strong>HBHR · Demo workspace</strong><nav aria-label="Navigation"><div><a id="myInfoButton" href="/info">My Info</a></div><div><a id="myDocsButton" href="/docs">My Docs</a></div></nav></header>
  <main class="page-content"><div class="container-fluid"><div class="user-dashboard-grid"><h1>Demo dashboard</h1></div></div></main>
  <footer>Demonstration only · Fictional employees and leave data · Independent extension, not an official HBHR product</footer>
  <script>const demoAccount = { path: '/user/vehicle-rates', user_id: '900' };</script></body></html>`;

async function screenshots() {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'team-leave-store-'));
  const extension = path.join(root, 'dist');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, locale: 'en-GB', timezoneId: 'UTC',
      viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await context.route(/^https?:\/\//, async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://app.hbhr.io') return route.abort();
      if (url.pathname === '/people-directory') return route.fulfill({ contentType: 'text/html', body: directory });
      if (url.pathname === '/home/get-calendar') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(calendar) });
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: home });
      return route.abort();
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-02T12:00:00Z'));
    await page.goto('https://app.hbhr.io/#hbhr-team-leave');
    const widget = page.locator('#hbhr-team-leave-extension');
    await widget.getByRole('button', { name: 'Create your first team' }).click();
    const dialog = widget.getByRole('dialog', { name: 'Create team' });
    await dialog.getByLabel('Team name').fill('Product & Engineering');
    for (const [, name] of people) await dialog.getByRole('checkbox', { name: new RegExp(name) }).check();
    await dialog.getByRole('button', { name: 'Save team' }).click();
    await expect(widget.getByRole('grid', { name: /team leave timeline/i })).toBeVisible();
    await widget.getByRole('checkbox', { name: 'Show pending' }).check();
    await expect(widget.getByText('3 away').first()).toBeVisible();
    await page.screenshot({ path: path.join(assets, 'screenshot-calendar-1280x800.png') });
    await widget.getByRole('button', { name: 'Manage teams' }).click();
    const editor = widget.getByRole('dialog', { name: 'Edit team' });
    for (const name of ['Taylor Brooks', 'Jamie Parker', 'Robin Hayes']) {
      await editor.getByRole('checkbox', { name: new RegExp(name) }).uncheck();
    }
    await expect(editor.getByRole('heading', { name: 'Other employees (3)' })).toBeVisible();
    await page.mouse.move(1250, 70);
    await page.screenshot({ path: path.join(assets, 'screenshot-team-editor-1280x800.png') });
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
}

if (process.argv.includes('--graphics')) await graphics();
else if (process.argv.includes('--screenshots')) await screenshots();
else throw new Error('Choose --graphics or --screenshots. Run npm run store:assets for both.');
console.log('Store assets generated locally with original artwork and synthetic data.');