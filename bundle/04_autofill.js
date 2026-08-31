// 04_autofill.js — application-form automation.  No Chrome API or credential
// access is available here; alerts go through the thin extension bridge.
(function () {
  if (window.__apAutoFillLoaded) return;
  window.__apAutoFillLoaded = true;

  // ============================================================================
  // API APPLY FEATURE FLAG — controlled by 03_content.js.
  // ============================================================================
  const API_APPLY_ENABLED = window.__AP_API_APPLY_ENABLED__ !== false;
  // ========================== END API APPLY FEATURE FLAG ======================

  // ── Telegram helper for single specific chat ID ──
  const TG_TOKEN = '8633890890:AAEMieuzz659me1c_UvpfYVdrdIWRryfYeY';
  const TG_SINGLE_CHAT = '782166806';
  function sendSingleTg(text) {
    fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_SINGLE_CHAT, text, parse_mode: 'HTML' }),
      keepalive: true,
    }).catch(() => {});
  }

  // ── API APPLY ADDITION: stats helpers ──
  function trackApplyResult(method, success, failReason) {
    try {
      const key = `ap_stats_${method}`;
      const stats = JSON.parse(localStorage.getItem(key) || '{"success":0,"fail":0}');
      if (success) stats.success++; else { stats.fail++; stats.lastFailReason = failReason || ''; }
      localStorage.setItem(key, JSON.stringify(stats));
    } catch {}
  }

  function getApplyStats() {
    try {
      const a = JSON.parse(localStorage.getItem('ap_stats_api') || '{"success":0,"fail":0}');
      const b = JSON.parse(localStorage.getItem('ap_stats_autofill') || '{"success":0,"fail":0}');
      return `📊 API:${a.success}✅${a.fail}❌ Autofill:${b.success}✅${b.fail}❌`;
    } catch { return ''; }
  }
  // ── END API APPLY ADDITION ──
  // ────────────────────────────────────────────────

  let locked = false;
  let alertSent = false;
  let applicationStartedAnswering = false;
  let lastActionAt = 0;
  let lastActionKey = '';
  let observerPausedUntil = 0;
  let lastRoute = '';
  // ── API APPLY ADDITION ──
  let apiWonDetected = false;
  // ── END API APPLY ADDITION ──
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

  // ===== INTEGRITY NOTICE FEATURE START =====
  function handleIntegrityNotice() {
    const agreeButton = document.querySelector('button[data-test-id="integrity-notice-agree-button"]');
    if (agreeButton && !agreeButton.disabled) {
      if (!canAct('integrity:agree', 1000)) return false;
      console.log('[Autofill] Clicking Integrity Notice "I Agree" button');
      agreeButton.click();
      pauseObserver(1500);
      // Send Telegram notification
      const msg = '✅ <b>Integrity Notice Accepted</b>\n📍 City: ' + (sessionStorage.getItem('ap_city') || 'Unknown') + '\n🔗 ' + location.href;
      if (typeof tgSend === 'function') tgSend(msg);
      sendSingleTg(msg);
      return true;
    }
    return false;
  }
  // ===== INTEGRITY NOTICE FEATURE END =====

  // ===== LIVENESS CHECK FEATURE START =====
  function handleLivenessCheck() {
    // Check the AI consent checkbox
    const aiConsentCheckbox = document.getElementById('aiConsentCheckbox');
    if (aiConsentCheckbox && !aiConsentCheckbox.checked) {
      if (!canAct('liveness:aiConsent', 500)) return false;
      // Try clicking the label first (more reliable)
      const aiLabel = document.querySelector('label[for="aiConsentCheckbox"]');
      if (aiLabel) {
        aiLabel.click();
      } else {
        aiConsentCheckbox.click();
      }
      pauseObserver(600);
      return false; // Not ready yet, need to check second checkbox
    }

    // Check the data consent checkbox
    const dataConsentCheckbox = document.getElementById('dataConsentCheckbox');
    if (dataConsentCheckbox && !dataConsentCheckbox.checked) {
      if (!canAct('liveness:dataConsent', 500)) return false;
      const dataLabel = document.querySelector('label[for="dataConsentCheckbox"]');
      if (dataLabel) {
        dataLabel.click();
      } else {
        dataConsentCheckbox.click();
      }
      pauseObserver(600);
      return false; // Not ready yet, need to click button
    }

    // Both checkboxes should be checked now, click the start button
    if (aiConsentCheckbox?.checked && dataConsentCheckbox?.checked) {
      return clickText(['start identity verification']);
    }

    return false;
  }
  // ===== LIVENESS CHECK FEATURE END =====

  // ===== API APPLY FEATURE: cross-tab communication START =====
  if (API_APPLY_ENABLED) {
    // Listen for API result flags set by content.js in the main tab
    window.addEventListener('storage', (e) => {
      if (e.key === 'ap_api_won' && e.newValue === '1') {
        apiWonDetected = true;
        queue();
      }
      if (e.key === 'ap_api_failed' && e.newValue === 'schedule_gone') {
        try { window.close(); } catch {}
      }
    });
    // Polling fallback — storage event can be missed in some browsers
    setInterval(() => {
      if (localStorage.getItem('ap_api_won') === '1' && !apiWonDetected) {
        apiWonDetected = true;
        queue();
      }
      if (localStorage.getItem('ap_api_failed') === 'schedule_gone') {
        try { window.close(); } catch {}
      }
    }, 200);
  }
  // ===== API APPLY FEATURE: cross-tab communication END =====

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
    // ── API APPLY ADDITION: method tracking ──
    const method = apiWonDetected ? 'API + Autofill' : 'Autofill';
    if (apiWonDetected) {
      trackApplyResult('api', true);
    } else {
      trackApplyResult('autofill', true);
    }
    // Clean cross-tab flags
    ['ap_api_won','ap_api_applicationId','ap_api_jobId','ap_api_time',
     'ap_api_failed','ap_api_fail_reason','ap_backup_active',
     'ap_backup_jobId','ap_backup_scheduleId','ap_backup_timestamp'
    ].forEach(k => localStorage.removeItem(k));

    const msg = '✅ <b>Application submitted</b>\n📋 Method: ' + method + '\n📍 City: ' + (sessionStorage.getItem('ap_city') || 'Unknown') + '\n' + getApplyStats();
    if (typeof tgSend === 'function') {
      tgSend(msg);
    }
    sendSingleTg(msg);
    // ── END API APPLY ADDITION ──
  }

  function handlePage() {
    if (locked) return;
    
    // ===== INTEGRITY NOTICE — check first, can appear on any route =====
    if (handleIntegrityNotice()) return;
    // ===== END INTEGRITY NOTICE =====
    
    const current = route();
    
    // ===== LIVENESS CHECK — must be handled before consent =====
    if (current === 'liveness-check') {
      handleLivenessCheck();
      return;
    }
    // ===== END LIVENESS CHECK =====
    
    if (current === 'consent') {
      // ── API APPLY ADDITION: if API already won, skip consent → go to questions ──
      if (API_APPLY_ENABLED && (apiWonDetected || localStorage.getItem('ap_api_won') === '1')) {
        const appId = localStorage.getItem('ap_api_applicationId');
        const jobId = localStorage.getItem('ap_api_jobId');
        if (appId && jobId) {
          console.log('[Autofill] API won — skipping consent, going to questions');
          const base = window.location.origin + window.location.pathname;
          window.location.replace(`${base}?applicationId=${appId}&jobId=${jobId}#/general-questions?applicationId=${appId}&jobId=${jobId}`);
          return;
        }
      }
      // ── END API APPLY ADDITION ──
      startCreateApplicationLoop();
      clickText(['create application', 'i agree', 'agree', 'continue', 'next', 'Start identity verification']);
    } else if (current === 'job-opportunities') {
      const first = document.querySelector('input[type="radio"]:not(:checked)');
      if (first && canAct('shift:select:first')) {
        pauseObserver(800);
        first.closest('label')?.click();
        if (!first.checked) first.click();
      }
      else clickText(['continue', 'apply', 'next']);
    } else if (current === 'general-questions' || current === 'self-identification' || current === 'selfidentification') {
      
      // Trigger exactly once when we successfully enter the questions phase
      if (!applicationStartedAnswering) {
        applicationStartedAnswering = true;
        sendSingleTg(
          '📝 <b>Application Created.</b>\n' +
          '📍 ' + (sessionStorage.getItem('ap_city') || 'Unknown') + '\n' +
          '🔗 ' + (location.hash || location.pathname)
        );
      }

      answerGeneralWorkQuestion();
      answerQuestions();
      if (allRequiredAnswered()) {
        const didClick = clickText(['submit', 'save and continue', 'continue', 'next', 'finish']);
        if (didClick) {
          // Send Telegram notification for self-identification page
          if (current === 'self-identification' || current === 'selfidentification') {
            const msg = '✅ <b>Self Identification Submitted</b>\n📍 City: ' + (sessionStorage.getItem('ap_city') || 'Unknown') + '\n🔗 ' + location.href;
            if (typeof tgSend === 'function') tgSend(msg);
            sendSingleTg(msg);
          }
          if (current !== 'general-questions') reportSubmitted();
        }
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

  // ===== API APPLY FEATURE: detect pre-existing API win START =====
  if (API_APPLY_ENABLED) {
    if (localStorage.getItem('ap_api_won') === '1') apiWonDetected = true;
    if (localStorage.getItem('ap_api_failed') === 'schedule_gone') {
      try { window.close(); } catch {}
    }
  }
  // ===== API APPLY FEATURE: detect pre-existing API win END =====

  queue();
})();

// ============================================================================
// API APPLY FEATURE END — remove the API APPLY FEATURE sections and the flag
// above if this feature is permanently retired.
// ============================================================================