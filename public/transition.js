// Runs before page parsing: never let the native dashboard paint underneath
// the dedicated extension route. This hides content only, not HBHR navigation.
(() => {
  const attribute = 'data-hbhr-team-leave-loading';
  let timer;
  const style = document.createElement('style');
  style.textContent = `html[${attribute}] .page-content .container-fluid > :not(#hbhr-team-leave-extension), html[${attribute}] .user-dashboard-grid { visibility: hidden !important; }`;
  document.documentElement.append(style);
  const release = () => {
    clearTimeout(timer);
    document.documentElement.removeAttribute(attribute);
  };
  const update = () => {
    release();
    if (!['/', '/home', '/home/'].includes(location.pathname) || location.hash !== '#hbhr-team-leave') return;
    if (document.querySelector('#hbhr-team-leave-extension')) return;
    document.documentElement.setAttribute(attribute, '');
    // Fail open if HBHR changes its layout or the main script cannot mount.
    timer = setTimeout(release, 10000);
  };
  window.addEventListener('hashchange', update);
  window.addEventListener('popstate', update);
  window.addEventListener('hbhr-team-leave-ready', release);
  window.addEventListener('pagehide', release);
  window.addEventListener('pageshow', update);
  update();
})();