// 04_autofill.js — application-form automation.  No Chrome API or credential
// access is available here; alerts go through the thin extension bridge.
(function () {
  if (window.__apAutoFillLoaded) return;
  window.__apAutoFillLoaded = true;

  let locked = false;
  let alertSent = false;
  let lastActionAt = 0;
  const waitBetweenActions = () => {
    const now = Date.now();
    if (now - lastActionAt < 800) return false;
    lastActionAt = now;
    return true;
  };
  window.addEventListener('__ap_hq_lock', () => { locked = true; });
  window.addEventListener('__ap_hq_unlock', () => { locked = false; handlePage(); });

  const route = () => (location.hash || '').replace(/^#\//, '').split('?')[0];
  const buttons = () => Array.from(document.querySelectorAll('button:not([disabled]), [role="button"]:not([aria-disabled="true"])'));
  const clickText = (names) => {
    if (!waitBetweenActions()) return false;
    const button = buttons().find(item => names.some(name => (item.textContent || '').trim().toLowerCase() === name)) ||
      buttons().find(item => names.some(name => (item.textContent || '').trim().toLowerCase().includes(name)));
    if (!button) return false;
    button.click();
    return true;
  };

  function selectAnswer(groupTerms, answers) {
    for (const group of document.querySelectorAll('[role="radiogroup"]')) {
      const label = document.getElementById(group.getAttribute('aria-labelledby'));
      const question = (label?.textContent || group.parentElement?.textContent || '').toLowerCase();
      if (!groupTerms.some(term => question.includes(term))) continue;
      for (const answer of answers) {
        const option = Array.from(group.querySelectorAll('label')).find(item => (item.textContent || '').trim().toLowerCase() === answer);
        if (option) { option.click(); return true; }
      }
    }
    return false;
  }

  function answerQuestions() {
    selectAnswer(['authorized to work', 'work permit', 'legally authorized'], ['yes']);
    selectAnswer(['previously worked', 'worked at amazon', 'former amazon'], ['no']);
    selectAnswer(['referred by', 'referral'], ['no']);
    selectAnswer(['disability', 'veteran', 'gender', 'ethnicity', 'race', 'self-identify'], [
      'i prefer not to answer', 'prefer not to answer', 'decline to answer', 'no',
    ]);
  }

  function allRequiredAnswered() {
    return Array.from(document.querySelectorAll('[role="radiogroup"][aria-required="true"]')).every(group =>
      Array.from(group.querySelectorAll('input[type="radio"]')).some(input => input.checked)
    );
  }

  function reportSubmitted() {
    if (sessionStorage.getItem('ap_autofill_submitted')) return;
    sessionStorage.setItem('ap_autofill_submitted', '1');
    if (typeof tgSend === 'function') {
      tgSend('✅ <b>Application submitted</b>\n📍 City: ' + (sessionStorage.getItem('ap_city') || 'Unknown'));
    }
  }

  function handlePage() {
    if (locked) return;
    const current = route();
    if (current === 'consent') {
      clickText(['create application', 'i agree', 'agree', 'continue', 'next']);
    } else if (current === 'job-opportunities') {
      const first = document.querySelector('input[type="radio"]:not(:checked)');
      if (first && waitBetweenActions()) first.closest('label')?.click();
      else clickText(['continue', 'apply', 'next']);
    } else if (current === 'general-questions' || current === 'self-identification' || current === 'selfidentification') {
      answerQuestions();
      if (allRequiredAnswered()) {
        const didClick = clickText(['submit', 'save and continue', 'continue', 'next', 'finish']);
        if (didClick && current !== 'general-questions') reportSubmitted();
      }
    } else if (['complete', 'confirmation', 'applied', 'success'].includes(current)) {
      reportSubmitted();
    }
  }

  function watchForJobAlert() {
    const job = document.querySelector('div.stencil-ceylqw')?.textContent?.trim();
    const timer = document.querySelector('div.css-hkx0zj')?.textContent?.trim();
    if (!alertSent && (job || timer)) {
      alertSent = true;
      window.dispatchEvent(new CustomEvent('__ap_autofill_alert', { detail: { job, timer } }));
      if (typeof tgSend === 'function') tgSend('🚨 <b>Amazon Job Alert</b>\n📌 Job: ' + (job || 'Available') + '\n⏳ ' + (timer || ''));
    }
  }

  let timer;
  const queue = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { watchForJobAlert(); handlePage(); }, 150);
  };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(watchForJobAlert, 1000);
  queue();
})();
