import { createRoot, type Root } from 'react-dom/client';
import { detectAccount } from './adapter';
import { Widget } from './Widget';
import styles from './widget.css?inline';

const HOST_ID = 'hbhr-team-leave-extension';
const NAV_ID = 'hbhr-team-leave-nav';
const SECTION_HASH = '#hbhr-team-leave';
let root: Root | null = null;
let host: HTMLElement | null = null;
let identity = '';
let manualScope = '';
let scheduled = false;
const hiddenContent = new Map<HTMLElement, HTMLElement['hidden']>();
let originalTitle: string | null = null;

function ensureNavigation(): void {
  const anchor = document.querySelector<HTMLAnchorElement>('#myDocsButton') ?? document.querySelector<HTMLAnchorElement>('#myInfoButton');
  if (!anchor || document.getElementById(NAV_ID)) return;
  const wrapper = document.createElement('div'); wrapper.className = 'ml-1';
  const link = document.createElement('a'); link.id = NAV_ID; link.className = anchor.className;
  link.classList.remove('menu-button-active');
  link.href = `https://app.hbhr.io/${SECTION_HASH}`;
  const label = document.createElement('span'); label.textContent = 'Team Leave';
  const badge = document.createElement('span'); badge.className = 'badge badge-pill badge-danger';
  link.append(label, document.createTextNode(' '), badge);
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!['/', '/home', '/home/'].includes(location.pathname) || !document.querySelector('.user-dashboard-grid')) return;
    event.preventDefault();
    if (location.hash !== SECTION_HASH) history.pushState(null, '', link.href);
    reconcile();
  });
  wrapper.append(link);
  if (anchor.parentElement?.tagName === 'DIV') anchor.parentElement.after(wrapper);
  else anchor.after(wrapper);
}

function updateNavigationState(active: boolean): void {
  const link = document.getElementById(NAV_ID);
  if (!link) return;
  if (link.classList.contains('menu-button-active') !== active) {
    link.classList.toggle('menu-button-active', active);
  }
  if (active && link.getAttribute('aria-current') !== 'page') link.setAttribute('aria-current', 'page');
  if (!active && link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
}

function hideNativeContent(container: Element): void {
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement) || child === host) continue;
    if (!hiddenContent.has(child)) hiddenContent.set(child, child.hidden);
    if (!child.hidden) child.hidden = true;
  }
}

function restoreNativeContent(): void {
  for (const [element, wasHidden] of hiddenContent) element.hidden = wasHidden;
  hiddenContent.clear();
  if (originalTitle !== null) { document.title = originalTitle; originalTitle = null; }
}

function darkTheme(): boolean {
  const explicit = document.body.getAttribute('data-layout-mode') ?? document.documentElement.getAttribute('data-bs-theme');
  if (explicit) return explicit === 'dark';
  if (/dark/i.test(document.body.className)) return true;
  const background = getComputedStyle(document.body).backgroundColor;
  const channels = background.match(/\d+/g)?.slice(0, 3).map(Number);
  return !!channels && channels.length === 3 && channels.reduce((a, b) => a + b, 0) < 300;
}

function remove(): void {
  root?.unmount(); root = null;
  host?.remove(); host = null;
  identity = '';
  restoreNativeContent();
}

function reconcile(): void {
  ensureNavigation();
  const dashboard = document.querySelector('.user-dashboard-grid');
  const eligible = ['/', '/home', '/home/'].includes(location.pathname) && location.hash === SECTION_HASH && dashboard;
  updateNavigationState(!!eligible);
  if (!eligible) { remove(); manualScope = ''; return; }
  const container = dashboard.closest('.page-content')?.querySelector('.container-fluid') ?? dashboard.parentElement;
  if (!container) { remove(); return; }
  const scope = detectAccount(document) ?? manualScope;
  if (host?.isConnected && identity === scope) {
    hideNativeContent(container);
    const next = darkTheme() ? 'dark' : 'light';
    if (host.dataset.theme !== next) host.dataset.theme = next;
    window.dispatchEvent(new Event('hbhr-team-leave-ready'));
    return;
  }
  remove();
  if (document.getElementById(HOST_ID)) return;
  host = document.createElement('section'); host.id = HOST_ID;
  host.style.cssText = 'display:block;box-sizing:border-box;width:100%;min-width:0;margin:0;padding:24px 18px 60px;';
  host.setAttribute('aria-label', 'Team Leave extension section');
  host.dataset.theme = darkTheme() ? 'dark' : 'light';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = styles; shadow.append(style);
  const heading = document.createElement('h1'); heading.textContent = 'Team leave workspace';
  heading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
  shadow.append(heading);
  const mount = document.createElement('div'); shadow.append(mount);
  container.append(host);
  hideNativeContent(container);
  originalTitle = document.title; document.title = 'Team Leave | HealthBoxHR';
  identity = scope;
  if (scope) {
    root = createRoot(mount); root.render(<Widget key={scope} scope={scope} />);
  } else {
    const title = document.createElement('h2'); title.textContent = 'Team Leave — select workspace';
    const info = document.createElement('p'); info.textContent = 'Account identity could not be verified. Enter a unique organisation-and-account label. Use a different label for every account; no data loads until selected.';
    const form = document.createElement('form');
    const input = document.createElement('input'); input.required = true; input.maxLength = 80;
    input.pattern = '[A-Za-z0-9][A-Za-z0-9._-]*'; input.setAttribute('aria-label', 'Organisation and account workspace label');
    const button = document.createElement('button'); button.textContent = 'Open workspace';
    form.append(input, button);
    form.addEventListener('submit', event => { event.preventDefault(); if (form.checkValidity()) { manualScope = `hbhr:manual:${input.value}`; reconcile(); } });
    mount.append(title, info, form);
  }
  window.dispatchEvent(new Event('hbhr-team-leave-ready'));
}

const observer = new MutationObserver(records => {
  if (records.every(record => host?.contains(record.target))) return;
  if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; reconcile(); }); }
});
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-layout-mode', 'data-bs-theme'] });
window.addEventListener('popstate', reconcile);
window.addEventListener('hashchange', reconcile);
window.addEventListener('pageshow', () => {
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-layout-mode', 'data-bs-theme'] });
  reconcile();
});
window.addEventListener('pagehide', () => { observer.disconnect(); remove(); });
reconcile();