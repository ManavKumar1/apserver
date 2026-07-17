// 01_hq.js — HQ boundary for the injected bundle
//
// Licence validation, key handling, encrypted bundle delivery, and revocation
// are owned by ThinExtension/background.js.  Code in the page's MAIN world
// must never retain a licence key or make its own competing HQ decision.
//
// 02_ui.js receives __ap_hq_lock / __ap_hq_unlock events forwarded by
// ThinExtension/loader.js and updates the visible lock state.
(function () {
  // Remove credentials/caches left by the pre-thin-extension HQ implementation.
  // This is a one-way migration: no new page-local HQ state is ever written.
  try {
    localStorage.removeItem('licence_key');
    localStorage.removeItem('ap_hq_cache');
  } catch (_) { }

  window.__AP_HQ_BUNDLE__ = Object.freeze({
    authority: 'thin-extension-background',
  });
})();
