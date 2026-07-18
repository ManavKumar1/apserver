// 04_autofill.js — application-form automation.  No Chrome API or credential
// access is available here; alerts go through the thin extension bridge.
(function () {
  if (window.__apAutoFillLoaded) return;
  window.__apAutoFillLoaded = true;

  let locked = false;
  let alertSent = false;
  let lastActionAt = 0;
  let lastActionKey = '';
  let observerPausedUntil = 0;
  let lastRoute = '';
  const applyPilotFlow = {
    lastScheduleReadyId: null,
    lastWorkflowStepName: null,
    lastAdsApplicationState: null,
    backendBusyUntil: 0,
  };
  const waitBetweenActions = () => {
    const now = Date.now();
    if (now < observerPausedUntil || now < applyPilotFlow.backendBusyUntil) return false;
    if (now - lastActionAt < 800) return false;
    lastActionAt = now;
    return true;
  };
  const pauseObserver = (ms = 1200) => {
    observerPausedUntil = Date.now() + ms;
    applyPilotFlow.backendBusyUntil = Date.now() + ms;
  };
  const canAct = (key, cooldown = 1200) => {
    const now = Date.now();
    if (lastActionKey === key && now - lastActionAt < cooldown) return false;
    lastActionKey = key;
    lastActionAt = now;
    return true;
  };
  window.addEventListener('__ap_hq_lock', () => { locked = true; });
  window.addEventListener('__ap_hq_unlock', () => { locked = false; handlePage(); });

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'ApplyPilot:GraphQLState') return;
    const update = event.data.payload || {};
    if ((update.scheduleId && update.scheduleId !== applyPilotFlow.lastScheduleReadyId) ||
        (update.workflowStepName && update.workflowStepName !== applyPilotFlow.lastWorkflowStepName) ||
        (update.adsApplicationState && update.adsApplicationState !== applyPilotFlow.lastAdsApplicationState) ||
        /createApplication|updateApplication|create-application|update-application/i.test(update.operationName || '')) {
      applyPilotFlow.lastScheduleReadyId = update.scheduleId || applyPilotFlow.lastScheduleReadyId;
      applyPilotFlow.lastWorkflowStepName = update.workflowStepName || applyPilotFlow.lastWorkflowStepName;
      applyPilotFlow.lastAdsApplicationState = update.adsApplicationState || applyPilotFlow.lastAdsApplicationState;
      queue();
    }
  });

  const route = () => (location.hash || '').replace(/^#\//, '').split('?')[0];
  const buttons = () => {
    const selectors = [
      'button[type="submit"]:not([disabled])',
      'button[data-test-id*="continue"]:not([disabled])',
      'button[data-test-id*="apply"]:not([disabled])',
      'button[data-test-id*="create"]:not([disabled])',
      'button:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
    ];
    const seen = new Set();
    return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
      .filter(button => { if (seen.has(button)) return false; seen.add(button); return true; });
  };
  const clickText = (names) => {
    const button = buttons().find(item => names.some(name => (item.textContent || '').trim().toLowerCase() === name)) ||
      buttons().find(item => names.some(name => (item.textContent || '').trim().toLowerCase().includes(name)));
    if (!button) return false;
    const label = (button.textContent || '').trim().toLowerCase();
    if (!canAct(`button:${label}`)) return false;
    pauseObserver(1000);
    button.click();
    return true;
  };

  function clickRadioLabel(label) {
    if (!label) return false;
    const input = label.querySelector('input[type="radio"]');
    if (input?.checked) return false;
    label.click();
    if (input && !input.checked) input.click();
    return true;
  }

  function selectAnswer(groupTerms, answers) {
    for (const group of document.querySelectorAll('[role="radiogroup"]')) {
      const label = document.getElementById(group.getAttribute('aria-labelledby'));
      const question = (label?.textContent || group.parentElement?.textContent || '').toLowerCase();
      if (!groupTerms.some(term => question.includes(term))) continue;
      for (const answer of answers) {
        const option = Array.from(group.querySelectorAll('label')).find(item => (item.textContent || '').trim().toLowerCase() === answer.toLowerCase()) ||
          group.querySelector(`[data-test-id="${answer}"]`);
        if (clickRadioLabel(option)) return true;
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

  function answerGeneralWorkQuestion() {
    const labels = Array.from(document.querySelectorAll('label'));
    const authorized = labels.find(label => /permanent resident|authorized to work/i.test(label.innerText || ''));
    const no = labels.find(label => (label.innerText || '').trim().toLowerCase() === 'no');
    if (authorized) authorized.click();
    if (no) no.click();
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
      startCreateApplicationLoop();
      clickText(['create application', 'i agree', 'agree', 'continue', 'next']);
    } else if (current === 'job-opportunities') {
      const first = document.querySelector('input[type="radio"]:not(:checked)');
      if (first && canAct('shift:select:first')) {
        pauseObserver(800);
        first.closest('label')?.click();
        if (!first.checked) first.click();
      }
      else clickText(['continue', 'apply', 'next']);
    } else if (current === 'general-questions' || current === 'self-identification' || current === 'selfidentification') {
      answerGeneralWorkQuestion();
      answerQuestions();
      if (allRequiredAnswered()) {
        const didClick = clickText(['submit', 'save and continue', 'continue', 'next', 'finish']);
        if (didClick && current !== 'general-questions') reportSubmitted();
      }
    } else if (['complete', 'confirmation', 'applied', 'success'].includes(current)) {
      reportSubmitted();
    } else {
      clickText(['next', 'continue', 'create application', 'apply', 'save and continue']);
    }
  }

  let createAppClicked = false;
  function startCreateApplicationLoop() {
    if (createAppClicked) return;
    const find = () => {
      if (createAppClicked || route() !== 'consent') return;
      const button = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find(item => /create application/i.test(item.textContent || '') && !item.disabled);
      if (button) { createAppClicked = true; button.click(); return; }
      requestAnimationFrame(find);
    };
    requestAnimationFrame(find);
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

  function watchGeneralQuestions() {
    if (!location.href.includes('#/general-questions')) return;
    const authorized = Array.from(document.querySelectorAll('label'))
      .find(label => /permanent resident|authorized to work/i.test(label.innerText || ''));
    const no = Array.from(document.querySelectorAll('label'))
      .find(label => (label.innerText || '').trim().toLowerCase() === 'no');
    if (authorized) authorized.click();
    if (no) no.click();
  }

  let timer;
  const queue = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      watchForJobAlert();
      watchGeneralQuestions();
      if (Date.now() >= observerPausedUntil) handlePage();
    }, 150);
  };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => { createAppClicked = false; lastRoute = route(); queue(); });
  setInterval(() => {
    const current = route();
    if (current !== lastRoute) { lastRoute = current; createAppClicked = false; queue(); }
  }, 1000);
  setInterval(() => { watchForJobAlert(); watchGeneralQuestions(); }, 1000);
  queue();
})();
