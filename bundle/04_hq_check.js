// 04_hq_check.js — Self-contained HQ licence checker
// Runs in MAIN world as the LAST file in the bundle.
//
// This file is the SINGLE SOURCE OF TRUTH for HQ state in the bundle. It:
//   1. Reads `licence_key` from localStorage
//   2. POSTs directly to HQ (no background.js bridge needed)
//   3. Parses the response per HQ V4 priority order
//   4. Dispatches `__ap_hq_status` DOM events that the rest of the bundle listens to
//   5. Caches the result in localStorage with a 24h TTL
//   6. Re-checks every 10 minutes (bypasses cache) to catch runtime state changes
//
// ── Why this file exists ─────────────────────────────────────────────────────
// Previous versions relied on background.js → loader.js → DOM event bridging.
// That bridge was never wired up, so the bundle never received HQ state —
// which is why the expiry date showed "not available" even though HQ was
// returning the date correctly. This file removes that dependency entirely.
//
// ── CORS requirement ─────────────────────────────────────────────────────────
// The fetch is made from the page context (origin: https://hiring.amazon.com),
// so HQ's CORS_ORIGINS must include:
//   https://hiring.amazon.com,https://hiring.amazon.ca
// Set this in HQ's .env:
//   CORS_ORIGINS=https://hiring.amazon.com,https://hiring.amazon.ca
//
// ── Licence key storage ──────────────────────────────────────────────────────
// The key is stored in localStorage under `licence_key`. It's set by the
// activation UI in 02_ui.js (which calls window.__AP_HQ__.activate(key)).
// Never hardcode the key in source.
//
// ── Public API ───────────────────────────────────────────────────────────────
//   window.__AP_HQ__.check()      — force a fresh HQ check (bypasses cache)
//   window.__AP_HQ__.activate(k)  — validate a key, store if valid, re-check
//   window.__AP_HQ__.resetKey()   — clear the key + cache, return to activation
//   window.__AP_HQ__.getState()   — returns { blocked, reason, detail }

(function () {

  // ── Config ────────────────────────────────────────────────────────────────
  // These match hq-config.json on the bundle server. Hardcoded here because
  // the bundle can't know the bundle server's URL from the page context.
  // Edit these if you move HQ or change the app slug.
  const HQ_URL   = 'https://hq-bpf9.onrender.com';
  const APP_SLUG = 'amazonhiring';

  const CACHE_KEY      = 'ap_hq_cache';
  const LICENCE_KEY_ID = 'licence_key';
  const CACHE_TTL      = 24 * 60 * 60 * 1000;  // 24 hours
  const POLL_INTERVAL  = 10 * 60 * 1000;        // 10 minutes
  const FETCH_TIMEOUT  = 10000;                 // 10s

  // ── Gate to Amazon hiring pages only ──────────────────────────────────────
  // No need to check HQ on random pages — the bundle only operates here.
  const hostname = window.location.hostname;
  if (hostname !== 'hiring.amazon.com' && hostname !== 'hiring.amazon.ca') {
    console.log('[AP/HQ] Not on Amazon hiring page — skipping HQ checks');
    return;
  }

  // ── Storage helpers ───────────────────────────────────────────────────────
  function getLicenceKey() {
    try { return localStorage.getItem(LICENCE_KEY_ID) || ''; }
    catch (e) { return ''; }
  }

  function setLicenceKey(key) {
    try { localStorage.setItem(LICENCE_KEY_ID, key); } catch (e) { }
  }

  function clearLicenceKey() {
    try { localStorage.removeItem(LICENCE_KEY_ID); } catch (e) { }
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (!c || typeof c.timestamp !== 'number' || !c.detail) return null;
      return c;  // { timestamp, detail }
    } catch (e) { return null; }
  }

  function writeCache(detail) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), detail }));
    } catch (e) { }
  }

  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { }
  }

  // ── Response parser — implements HQ V4 priority order ─────────────────────
  // Order: invalid → expired → maintenance → disabled → ok
  // CRITICAL: maintenance must be checked BEFORE !working. When maintenance
  // is ON, the response is { maintenance: true, working: true }. If you check
  // !working first, you'll never reach the maintenance state.
  function parseResponse(status, body) {
    const safeBody = body || {};

    if (status !== 200) {
      return {
        allow: false, reason: 'invalid',
        message: safeBody.error || 'Licence check failed.',
        expires: null, expires_iso: null,
        grace_active: false, master: false, version_lock: null,
      };
    }

    // Common fields passed through on every 200 response
    const common = {
      expires:      safeBody.expires || null,
      expires_iso:  safeBody.expires_iso || null,
      grace_active: !!safeBody.grace_active,
      master:       !!safeBody.master,
      version_lock: safeBody.version_lock || null,
    };

    if (safeBody.expired) {
      return { allow: false, reason: 'expired',
               message: safeBody.message || 'Your licence has expired.',
               ...common };
    }
    if (safeBody.maintenance) {
      return { allow: false, reason: 'maintenance',
               message: safeBody.message || 'Down for maintenance.',
               ...common };
    }
    if (!safeBody.working) {
      return { allow: false, reason: 'disabled',
               message: safeBody.message || 'Access is currently paused.',
               ...common };
    }
    return { allow: true, reason: 'ok',
             message: safeBody.message || '',
             ...common };
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  function dispatch(detail) {
    try {
      window.dispatchEvent(new CustomEvent('__ap_hq_status', { detail }));
      console.log('[AP/HQ] Status dispatched:', detail.reason, detail.allow ? 'ALLOW' : 'BLOCK');
    } catch (e) {
      console.error('[AP/HQ] Failed to dispatch status:', e);
    }
  }

  // ── HQ fetch ──────────────────────────────────────────────────────────────
  // forceFresh=true bypasses the cache (used by the 10-min poll + manual recheck)
  async function check(forceFresh) {
    const key = getLicenceKey();

    // No key → immediate invalid block. Don't hit HQ.
    if (!key) {
      console.log('[AP/HQ] No licence key in storage — dispatching invalid block');
      dispatch({
        allow: false, reason: 'invalid',
        message: 'No licence key entered. Click Activate to enter your key.',
        expires: null, expires_iso: null,
        grace_active: false, master: false, version_lock: null,
      });
      return;
    }

    // Try cache first (unless forceFresh)
    if (!forceFresh) {
      const cached = readCache();
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log('[AP/HQ] Using fresh cache (' + Math.round((Date.now() - cached.timestamp) / 60000) + 'min old)');
        dispatch(cached.detail);
        return;
      }
    }

    // Hit HQ
    try {
      console.log('[AP/HQ] Hitting HQ:', `${HQ_URL}/${APP_SLUG}`);
      const res = await fetch(`${HQ_URL}/${APP_SLUG}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licence_key: key }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      const body = await res.json();
      const detail = parseResponse(res.status, body);

      // Cache only HTTP 200 responses — never cache 403/404
      if (res.status === 200) writeCache(detail);

      dispatch(detail);
      console.log('[AP/HQ] HQ responded:', res.status, detail.reason);

    } catch (err) {
      console.warn('[AP/HQ] HQ unreachable:', err.message);
      // Fallback: stale cache if available, else offline block
      const cached = readCache();
      if (cached) {
        console.log('[AP/HQ] Using stale cache as fallback');
        dispatch(cached.detail);
      } else {
        dispatch({
          allow: false, reason: 'offline',
          message: '',  // bundle shows its own offline fallback text
          expires: null, expires_iso: null,
          grace_active: false, master: false, version_lock: null,
        });
      }
    }
  }

  // ── Activation flow ───────────────────────────────────────────────────────
  // Called by the activation UI in 02_ui.js. Validates the key against HQ
  // before storing it. Per V4 docs: any HTTP 200 = key is real, store it
  // (even if maintenance/disabled — that's a state, not an invalid key).
  async function activate(key) {
    const trimmed = (key || '').trim();
    if (!trimmed) {
      return { ok: false, message: 'Please enter a licence key.' };
    }

    try {
      const res = await fetch(`${HQ_URL}/${APP_SLUG}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licence_key: trimmed }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      const body = await res.json();

      if (res.status !== 200) {
        return { ok: false, message: body.error || 'Invalid licence key.' };
      }
      if (body.expired) {
        return { ok: false, message: 'This key has already expired.' };
      }

      // Any other 200 = valid key. Store it, clear any stale cache (which
      // might be from a previous key), then trigger a fresh check.
      setLicenceKey(trimmed);
      clearCache();
      console.log('[AP/HQ] Licence key stored — triggering fresh check');
      check(true);
      return { ok: true };

    } catch (err) {
      return { ok: false, message: 'Cannot reach HQ. Check your connection and try again.' };
    }
  }

  // ── Reset key ─────────────────────────────────────────────────────────────
  // Called when the user wants to enter a different key (e.g. after an invalid
  // block). Clears the key + cache, then dispatches an invalid block so the
  // activation UI shows again.
  function resetKey() {
    clearLicenceKey();
    clearCache();
    console.log('[AP/HQ] Licence key cleared — showing activation UI');
    check(true);  // will dispatch invalid since no key
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.__AP_HQ__ = {
    check:    () => check(true),
    activate: activate,
    resetKey: resetKey,
    getState: () => (typeof window.__AP_HQ_STATE__ === 'function')
      ? window.__AP_HQ_STATE__()
      : { blocked: false, reason: null, detail: null },
    hasKey:   () => !!getLicenceKey(),
  };

  // ── Boot ─────────────────────────────────────────────────────────────────
  // Use cache if fresh (instant UI), otherwise hit HQ. The 10-min poll will
  // catch any runtime state changes from HQ's dashboard.
  // check(false);
setTimeout(() => check(false), 500); // re-dispatch after UI has likely injected

  // ── 10-minute poll (bypasses cache) ──────────────────────────────────────
  // Catches runtime state changes: you flip maintenance ON in HQ, the next
  // poll picks it up and dispatches the new status. The bundle's polling
  // pauses, the WAF cleanup pauses, the pill shows the maintenance message.
  setInterval(() => check(true), POLL_INTERVAL);

  console.log('[AP/HQ] Self-contained HQ checker active (poll every 10min)');

})();
