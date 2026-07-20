// Server module: Amazon Hiring login page automation.
// It receives settings and OTPs only through DOM events from login-bridge.js.
(function () {
  if (location.hostname !== 'auth.hiring.amazon.com' || window.__apLoginModuleLoaded) return;
  window.__apLoginModuleLoaded = true;

  const waitFor = (selector, timeout = 20000) => new Promise((resolve, reject) => {
    const started = Date.now();
    (function find() {
      const element = document.querySelector(selector);
      if (element) return resolve(element);
      if (Date.now() - started >= timeout) return reject(new Error(`Timed out waiting for ${selector}`));
      setTimeout(find, 200);
    })();
  });
  const setValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const click = async (selector) => {
    const button = await waitFor(selector);
    button.click();
  };
  const dispatch = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  let otpRequested = false;
  let completed = false;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function selectCanada() {
    // The country selector is often slower after a long idle/relogin cycle.
    // Keep retrying the same way as the working standalone extension.
    const initialToggle = await waitFor('#country-toggle-button', 20000).catch(() => null);
    if (!initialToggle || (initialToggle.innerText || '').trim().toLowerCase() === 'canada') return;
    for (let attempt = 0; attempt < 15; attempt++) {
      const toggle = document.querySelector('#country-toggle-button') || initialToggle;
      if ((toggle.innerText || '').trim().toLowerCase() === 'canada') return;
      toggle.click();
      await wait(300);
      const menu = document.querySelector('#country-menu');
      const option = menu && Array.from(menu.querySelectorAll('li, [role="option"]'))
        .find(item => (item.innerText || item.textContent || '').trim().toLowerCase() === 'canada');
      if (option) {
        option.click();
        await wait(500);
        return;
      }
      await wait(300);
    }
  }

  async function run(settings) {
    if (!settings.email || !/^\d{6}$/.test(settings.pin)) return;
    try {
      await selectCanada();
      const email = await waitFor('input[data-test-id="input-test-id-login"]');
      setValue(email, settings.email);
      await click('button[data-test-id="button-continue"]');

      const pin = await waitFor('input[data-test-id="input-test-id-pin"]');
      setValue(pin, settings.pin);
      await click('button[data-test-id="button-continue"]');

      await click('button[data-test-id="button-submit"]');
      await waitFor('input[data-test-id="input-test-id-confirmOtp"], #input-test-id-confirmOtp');
      if (!otpRequested) {
        otpRequested = true;
        dispatch('__ap_login_request_otp');
      }
    } catch (error) {
      console.warn('[AP/Login] Login form automation failed:', error.message);
    }
  }

  async function submitOtp(otp) {
    if (!/^\d{6}$/.test(otp) || completed) return;
    try {
      const input = await waitFor('input[data-test-id="input-test-id-confirmOtp"], #input-test-id-confirmOtp');
      setValue(input, otp);
      await click('button[data-test-id="button-test-id-verifyAccount"]');
      const continueButton = await waitFor('button[data-test-id="button-continue"]', 10000).catch(() => null);
      if (continueButton) continueButton.click();

      const started = Date.now();
      const monitor = setInterval(() => {
        const otpField = document.querySelector('input[data-test-id="input-test-id-confirmOtp"], #input-test-id-confirmOtp');
        if (!otpField || Date.now() - started > 20000) {
          clearInterval(monitor);
          if (!otpField && !completed) {
            completed = true;
            dispatch('__ap_login_succeeded');
          }
        }
      }, 400);
    } catch (error) {
      console.warn('[AP/Login] OTP submission failed:', error.message);
    }
  }

  window.addEventListener('__ap_login_settings', event => run(event.detail || {}));
  window.addEventListener('__ap_login_otp', event => submitOtp(event.detail?.otp || ''));
})();
