// Server module: extracts a recent Amazon six-digit OTP from Gmail's rendered UI.
// It does not persist mail contents or communicate with Chrome APIs directly.
(function () {
  if (location.hostname !== 'mail.google.com' || window.__apGmailOtpModuleLoaded) return;
  window.__apGmailOtpModuleLoaded = true;

  const OTP = /\b(\d{6})\b/g;
  const amazonMessage = (element) => /no-reply@jobs\.amazon\.com|amazon jobs|verification code|one-time|security code/i.test(element.innerText || '');
  const event = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function messageTime(element) {
    const value = element.getAttribute('data-time') || element.querySelector('[data-time]')?.getAttribute('data-time');
    return Number(value || 0);
  }

  async function scrape(requestTime) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const rows = Array.from(document.querySelectorAll('tr.zA, div[role="listitem"]'));
      const candidates = rows.filter(amazonMessage).sort((a, b) => messageTime(b) - messageTime(a));
      const row = candidates.find(item => !requestTime || !messageTime(item) || messageTime(item) >= requestTime - 120000);
      if (!row) { await wait(1000); continue; }
      row.click();
      await wait(1800);
      const text = Array.from(document.querySelectorAll('div[role="main"] div.a3s, div[role="main"]'))
        .map(element => element.innerText || '').join('\n');
      const matches = Array.from(text.matchAll(OTP));
      if (matches.length) {
        event('__ap_gmail_otp', { otp: matches[matches.length - 1][1] });
        return;
      }
      await wait(1000);
    }
    console.warn('[AP/Gmail] No recent Amazon OTP found.');
  }

  window.addEventListener('__ap_gmail_start', event => scrape(Number(event.detail?.requestTime) || Date.now()));
})();
