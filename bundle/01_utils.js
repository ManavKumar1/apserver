// utils.js — shared helpers
console.log('[ApplyPilot] Bundle executing…', window.location.href);

function humanClick(el) {
  if (!el) return;
  ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  });
}

function randomIPv6() {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 65536).toString(16).padStart(4, '0')
  ).join(':');
}