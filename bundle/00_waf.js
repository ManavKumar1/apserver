// 00_waf.js — WAF bypass: localStorage cleanup + cookie deletion trigger
// Runs in MAIN world (injected page context) — chrome.runtime is NOT available here.
// Cookie deletion is handled by firing a custom DOM event that loader.js
// (a real content script) listens for and forwards to background.js.

(function () {
  const FUTURE_TIMESTAMP = '1893456000000'; // Jan 1 2030 00:00:00 UTC

  function requestCookieDeletion() {
    // Dispatch a DOM event that loader.js (content script world) will catch
    // and forward to background.js via chrome.runtime.sendMessage.
    window.dispatchEvent(new CustomEvent('__ap_delete_waf_cookie'));
  }

  function cleanLocalStorage() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === 'awswaf_session_storage' || key === 'awswaf_token_refresh_timestamp') {
        toRemove.push(key);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem('awswaf_token_refresh_timestamp', FUTURE_TIMESTAMP);
  }

  function run() {
    requestCookieDeletion();
    cleanLocalStorage();
  }

  run();
  setInterval(run, 10000);

  console.log('[AP] WAF blocker active');
})();
