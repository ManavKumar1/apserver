// 01_hq_overlay.js — HQ runtime lock overlay
// Runs in MAIN world as part of the injected bundle.
// background.js owns the licence check and injection gate (boot-time block).
// This file handles the runtime case: HQ revokes access while the tab is already open.
//
// Flow:
//   background.js checks HQ every 10 minutes via the 'hq-poll' alarm.
//   If access is revoked, it sends a SHOW_HQ_LOCK message to the tab.
//   loader.js (content script) receives it and fires a DOM event.
//   This file listens for that event and shows/hides the overlay.

(function () {

  const LOCK_CFG = {
    maintenance: { icon: '🔧', accent: '#f59e0b', label: 'maintenance', title: 'Down for Maintenance' },
    disabled:    { icon: '🚫', accent: '#ef4444', label: 'disabled',    title: 'Access Disabled'      },
    expired:     { icon: '⏰', accent: '#8b5cf6', label: 'expired',     title: 'Licence Expired'      },
    invalid:     { icon: '⛔', accent: '#ef4444', label: 'invalid',     title: 'Invalid Licence'      },
  };

  function showLockOverlay(reason, message) {
    dismissLockOverlay();
    const cfg = LOCK_CFG[reason] || LOCK_CFG.disabled;
    const defaultMessages = {
      maintenance: 'This app is down for maintenance. Check back soon.',
      disabled:    'Your access has been paused. Contact support.',
      expired:     'Your licence has expired. Please renew.',
      invalid:     'Licence check failed. Please reinstall or contact support.',
    };
    const text = message || defaultMessages[reason] || defaultMessages.disabled;

    const overlay = document.createElement('div');
    overlay.id = 'ap-hq-lock-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999999',
      'background:rgba(0,0,0,0.92)', 'display:flex',
      'align-items:center', 'justify-content:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    overlay.innerHTML = `
      <div style="
        background:#1a1a1a; border:1px solid #333; border-radius:16px;
        padding:40px 48px; max-width:420px; text-align:center;
        box-shadow:0 24px 64px rgba(0,0,0,0.6);
      ">
        <div style="font-size:48px; margin-bottom:16px;">${cfg.icon}</div>
        <span style="
          display:inline-block; background:${cfg.accent}22; color:${cfg.accent};
          border:1px solid ${cfg.accent}44; border-radius:6px;
          font-size:11px; font-weight:700; letter-spacing:1.5px;
          text-transform:uppercase; padding:3px 10px; margin-bottom:20px;
        ">${cfg.label}</span>
        <div style="color:#fff; font-size:20px; font-weight:600; margin-bottom:12px;">
          ${cfg.title}
        </div>
        <div style="
          border-top:1px solid #333; margin:16px 0;
        "></div>
        <div style="color:#aaa; font-size:14px; line-height:1.6;">
          ${text}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    console.log('[AP] HQ lock overlay shown:', reason);
  }

  function dismissLockOverlay() {
    document.getElementById('ap-hq-lock-overlay')?.remove();
  }

  // Listen for events from loader.js (content script bridge)
  window.addEventListener('__ap_hq_lock', (e) => {
    showLockOverlay(e.detail.reason, e.detail.message);
  });

  window.addEventListener('__ap_hq_unlock', () => {
    dismissLockOverlay();
    console.log('[AP] HQ lock overlay dismissed — access restored');
  });

})();
