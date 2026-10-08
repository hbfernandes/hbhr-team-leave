import { createRoot, type Root } from 'react-dom/client';
import { AdapterError, fetchAccountIdentity, type AccountIdentity, type AdapterErrorCode } from './adapter';
import { Widget } from './Widget';
import { legacyUserScope } from './storage';
import styles from './widget.css?inline';

const HOST_ID = 'hbhr-team-leave-extension';
const NAV_ID = 'hbhr-team-leave-nav';
const SECTION_HASH = '#hbhr-team-leave';
let root: Root | null = null;
let host: HTMLElement | null = null;
let mountPoint: HTMLElement | null = null;
let identity = '';
let verifiedIdentity: AccountIdentity | null = null;
let manualScope = '';
let scheduled = false;
let verificationController: AbortController | null = null;
let verificationGeneration = 0;
type StartupState = 'idle' | 'resolving' | 'verified' | 'authentication-failed' | 'retryable-failed' | 'fallback-required' | 'manual';
let startupState: StartupState = 'idle';
let startupErrorCode: AdapterErrorCode | null = null;
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

function cancelVerification(): void {
  verificationGeneration += 1;
  verificationController?.abort();
  verificationController = null;
}

function remove(options: { cancel?: boolean; clearIdentity?: boolean } = {}): void {
  if (options.cancel !== false) cancelVerification();
  root?.unmount(); root = null;
  host?.remove(); host = null;
  mountPoint = null;
  identity = '';
  if (options.clearIdentity !== false) verifiedIdentity = null;
  startupState = 'idle';
  startupErrorCode = null;
  restoreNativeContent();
}

function eligibleRoute(): boolean {
  return ['/', '/home', '/home/'].includes(location.pathname) && location.hash === SECTION_HASH;
}

function createHost(container: Element): HTMLElement {
  host = document.createElement('section'); host.id = HOST_ID;
  host.style.cssText = 'display:block;box-sizing:border-box;width:100%;min-width:0;margin:0;padding:24px 18px 60px;';
  host.setAttribute('aria-label', 'Team Leave extension section');
  host.dataset.theme = darkTheme() ? 'dark' : 'light';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = styles; shadow.append(style);
  const heading = document.createElement('h1'); heading.textContent = 'Team leave workspace';
  heading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
  shadow.append(heading);
  mountPoint = document.createElement('div'); shadow.append(mountPoint);
  container.append(host);
  return mountPoint;
}

function updateHostTheme(): void {
  if (host) host.dataset.theme = darkTheme() ? 'dark' : 'light';
}

function startupCopy(state: StartupState, code: AdapterErrorCode | null): { title: string; message: string } {
  if (state === 'authentication-failed') {
    return {
      title: 'Sign in required',
      message: 'Your HBHR session could not be verified. Sign in to HBHR, then retry account verification.',
    };
  }
  if (state === 'fallback-required') {
    return {
      title: 'Account verification needs help',
      message: code === 'profile-missing-company'
        ? 'HBHR did not provide a company marker for this account. Company markers are not universal across account configurations, so no automatic workspace was selected.'
        : 'HBHR returned an account response this extension cannot verify safely. No saved workspace was loaded.',
    };
  }
  return {
    title: 'Could not verify your HBHR account',
    message: 'Account verification could not complete. Retry without loading saved teams.',
  };
}

function renderStartupShell(state: StartupState, code: AdapterErrorCode | null): void {
  if (!mountPoint) return;
  mountPoint.replaceChildren();
  const shell = document.createElement('section'); shell.className = 'startup-shell';
  shell.dataset.state = state;
  shell.setAttribute('aria-live', state === 'resolving' ? 'polite' : 'assertive');
  const title = document.createElement('h2');
  const info = document.createElement('p');
  if (state === 'resolving') {
    title.textContent = 'Verifying your HBHR account...';
    info.textContent = 'Saved teams and HR data stay closed until account and company identity are verified.';
    shell.append(title, info);
  } else {
    const copy = startupCopy(state, code);
    title.textContent = copy.title;
    info.textContent = copy.message;
    shell.append(title, info);
    if (state === 'authentication-failed') {
      const signIn = document.createElement('a');
      signIn.href = 'https://app.hbhr.io/login';
      signIn.textContent = 'Sign in to HBHR';
      signIn.target = '_self';
      shell.append(signIn);
    }
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = 'Retry verification';
    retry.addEventListener('click', retryVerification);
    shell.append(retry);
    if (state === 'fallback-required') {
      const fallback = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Use a manual workspace label';
      const explanation = document.createElement('p');
      explanation.textContent = 'Manual mode is user-managed account separation. Use a different label for every account; no automatic company isolation is claimed.';
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.required = true; input.maxLength = 80; input.pattern = '[A-Za-z0-9][A-Za-z0-9._-]*';
      input.setAttribute('aria-label', 'Manual workspace label');
      const open = document.createElement('button'); open.type = 'submit'; open.textContent = 'Open manual workspace';
      form.append(input, open);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.checkValidity() || !mountPoint) return;
        manualScope = `hbhr:manual:${input.value}`;
        startupState = 'manual';
        startupErrorCode = null;
        mountWidget(manualScope);
      });
      fallback.append(summary, explanation, form);
      shell.append(fallback);
    }
  }
  mountPoint.append(shell);
}

function mountWidget(scope: string, legacyScope?: string): void {
  if (!mountPoint) return;
  root?.unmount();
  root = createRoot(mountPoint);
  identity = scope;
  root.render(<Widget key={scope} legacyScope={legacyScope} scope={scope} />);
  window.dispatchEvent(new Event('hbhr-team-leave-ready'));
}

function retryVerification(): void {
  if (!mountPoint || !eligibleRoute()) return;
  cancelVerification();
  root?.unmount(); root = null;
  identity = '';
  verifiedIdentity = null;
  startupState = 'resolving';
  startupErrorCode = null;
  renderStartupShell(startupState, startupErrorCode);
  startVerification(mountPoint);
}

function startVerification(target: HTMLElement): void {
  if (verificationController || !eligibleRoute() || target !== mountPoint) return;
  const generation = ++verificationGeneration;
  const controller = new AbortController();
  verificationController = controller;
  void fetchAccountIdentity(controller.signal)
    .then(nextIdentity => {
      if (controller.signal.aborted || generation !== verificationGeneration || target !== mountPoint || !host?.isConnected || !eligibleRoute()) return;
      verificationController = null;
      verifiedIdentity = nextIdentity;
      startupState = 'verified';
      startupErrorCode = null;
      mountWidget(nextIdentity.scope, legacyUserScope(nextIdentity.userId));
    })
    .catch(error => {
      if (controller.signal.aborted || generation !== verificationGeneration || target !== mountPoint || !host?.isConnected || !eligibleRoute()) return;
      verificationController = null;
      const code = error instanceof AdapterError ? error.code : 'network';
      startupErrorCode = code;
      startupState = code === 'authentication'
        ? 'authentication-failed'
        : code === 'profile-missing-company' || code === 'profile-conflict' || code === 'profile-unsupported'
          ? 'fallback-required'
          : 'retryable-failed';
      renderStartupShell(startupState, startupErrorCode);
      window.dispatchEvent(new Event('hbhr-team-leave-ready'));
    });
}

function reconcile(): void {
  ensureNavigation();
  const dashboard = document.querySelector('.user-dashboard-grid');
  const eligible = eligibleRoute() && !!dashboard;
  updateNavigationState(eligible);
  if (!eligible) { remove(); manualScope = ''; return; }
  const container = dashboard?.closest('.page-content')?.querySelector('.container-fluid') ?? dashboard?.parentElement;
  if (!container) { remove(); return; }
  if (host?.isConnected) {
    hideNativeContent(container);
    updateHostTheme();
    return;
  }

  const preservedIdentity = verifiedIdentity;
  remove({ cancel: !preservedIdentity, clearIdentity: !preservedIdentity });
  if (document.getElementById(HOST_ID)) return;
  const target = createHost(container);
  hideNativeContent(container);
  originalTitle = document.title; document.title = 'Team Leave | HealthBoxHR';
  updateHostTheme();
  if (preservedIdentity) {
    verifiedIdentity = preservedIdentity;
    startupState = 'verified';
    mountWidget(preservedIdentity.scope, legacyUserScope(preservedIdentity.userId));
  } else if (manualScope) {
    startupState = 'manual';
    mountWidget(manualScope);
  } else {
    startupState = 'resolving';
    renderStartupShell(startupState, startupErrorCode);
    window.dispatchEvent(new Event('hbhr-team-leave-ready'));
    startVerification(target);
  }
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