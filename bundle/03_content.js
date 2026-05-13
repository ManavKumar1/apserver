// content.js — Poller
// Polling modes: 'interval' (setInterval 50ms) | 'sequential' (chained async)
// Mode persists across reloads via localStorage

console.log('[ApplyPilot] Bundle executing…', window.location.href);

// ── API endpoints (updated — same-origin graphql, not AppSync) ─────────────────
const API_URL_CA = 'https://hiring.amazon.ca/graphql';
const API_URL_US = 'https://hiring.amazon.com/graphql';

// ── Telegram config ───────────────────────────────────────────────────────────
const TG_BOT_TOKEN = '8633890890:AAEp8zXhAP43z1o8gchJ9vv1XTP4DYKL5lc';
const TG_CHAT_IDS  = ['782166806', '-5214514656'];

function tgPersistConfig() {
  try {
    localStorage.setItem('ap_tg_token', TG_BOT_TOKEN);
    localStorage.setItem('ap_tg_ids', JSON.stringify(TG_CHAT_IDS));
  } catch (e) {}
}

function tgSend(text) {
  for (const chatId of TG_CHAT_IDS) {
    fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      keepalive: true,
    }).catch(() => {});
  }
}

const hostname  = window.location.hostname;
const pathname  = window.location.pathname;
const ALLOWED_HOSTS = ['hiring.amazon.com', 'hiring.amazon.ca'];
const isAllowedDomain = ALLOWED_HOSTS.some(h => hostname === h);
const isHomepage = pathname === '/' || pathname === '' || pathname === '/app';

if (!isAllowedDomain || !isHomepage) {
  // not homepage — do nothing
} else {

  tgPersistConfig();
  console.log('[AP] calling injectBadge, body=', !!document.body);
  try {
    if (document.body) injectBadge();
    else document.addEventListener('DOMContentLoaded', injectBadge);
  } catch (e) { console.error('[AP] injectBadge CRASHED:', e); }

  const isCanada = hostname.includes('.ca');
  const API_URL  = isCanada ? API_URL_CA : API_URL_US;
  const locale   = isCanada ? 'en-CA' : 'en-US';
  const country  = isCanada ? 'Canada' : 'United States';
  const today    = new Date().toISOString().split('T')[0];

  const baseHeaders = {
    'accept':           '*/*',
    'accept-language':  'en-US,en;q=0.9',
    'authorization':    'Status|unauthenticated|Session|null',
    'cache-control':    'no-cache',
    'content-type':     'application/json',
    'country':          country,
    'iscanary':         'false',
    'pragma':           'no-cache',
    'x-amz-user-agent': 'aws-amplify/2.0.0',
  };

  // ── Polling mode ───────────────────────────────────────────────────────────────
  const POLL_MODE_KEY = 'ap_poll_mode';
  let pollMode = 'sequential';
  localStorage.setItem(POLL_MODE_KEY, 'sequential');

  function setPollMode(mode) {
    pollMode = mode;
    localStorage.setItem(POLL_MODE_KEY, mode);
    const btn = document.getElementById('ap-poll-mode-btn');
    if (btn) btn.textContent = mode === 'interval' ? '⚡ Interval' : '🔗 Sequential';
    console.log('[Poller] Poll mode set to:', mode);
  }

  window.JS_TOGGLE_POLL_MODE = () => {
    setPollMode(pollMode === 'interval' ? 'sequential' : 'interval');
  };
  window.JS_POLL_MODE = () => pollMode;

  // ── Full GQL fragment — requests locationName + all fields ─────────────────────
  const JOB_CARDS_FRAGMENT = `
    jobId language dataSource requisitionType jobTitle jobType employmentType
    city state postalCode locationName
    totalPayRateMin totalPayRateMax tagLine bannerText image jobPreviewVideo
    distance featuredJob bonusJob bonusPay scheduleCount currencyCode
    geoClusterDescription surgePay jobTypeL10N employmentTypeL10N bonusPayL10N
    surgePayL10N totalPayRateMinL10N totalPayRateMaxL10N distanceL10N
    monthlyBasePayMin monthlyBasePayMinL10N monthlyBasePayMax monthlyBasePayMaxL10N
    jobContainerJobMetaL1 virtualLocation poolingEnabled payFrequency
    jobLocationType internalStaffingOrgId agencyName __typename
  `;

  // ── Query builders ─────────────────────────────────────────────────────────────

  // ALL_SHIFTS ensures we don't miss jobs restricted to specific shift windows.
  // This is the primary reason premium/specific-location jobs were being missed.
  const ALL_SHIFTS = ['EarlyMorning', 'Daytime', 'Evening', 'Night', 'Weekday', 'Weekend'];

  const getJobsBody = () => {
    // Canada and US have slightly different required filter shapes.
    const variables = isCanada
      ? {
          searchJobRequest: {
            locale,
            country,
            keyWords: '',
            pageSize: 100,
            equalFilters:   [],
            containFilters: [
              { key: 'isPrivateSchedule', val: ['true', 'false'] },
              { key: 'scheduleShift',     val: ALL_SHIFTS },
            ],
            rangeFilters: [],
            orFilters:    [],
            dateFilters:  [{ key: 'firstDayOnSite', range: { startDate: today } }],
            sorters:      [{ fieldName: 'totalPayRateMax', ascending: 'false' }],
          },
        }
      : {
          searchJobRequest: {
            locale,
            country,
            keyWords: '',
            pageSize: 100,
            consolidateSchedule: true,
            equalFilters:   [{ key: 'scheduleRequiredLanguage', val: locale }],
            containFilters: [
              { key: 'isPrivateSchedule', val: ['true', 'false'] },
              { key: 'scheduleShift',     val: ALL_SHIFTS },
            ],
            rangeFilters: [{ key: 'hoursPerWeek', range: { minimum: 0, maximum: 80 } }],
            orFilters:    [],
            dateFilters:  [{ key: 'firstDayOnSite', range: { startDate: today } }],
            sorters:      [{ fieldName: 'totalPayRateMax', ascending: 'false' }],
          },
        };

    return {
      operationName: 'searchJobCardsByLocation',
      variables,
      query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
          nextToken
          jobCards { ${JOB_CARDS_FRAGMENT} }
          __typename
        }
      }`,
    };
  };

  const getScheduleBodyForJob = (job) => ({
    operationName: 'searchScheduleCards',
    variables: {
      searchScheduleRequest: {
        locale, country,
        equalFilters:   [{ key: 'shiftType', val: 'All' }],
        containFilters: [
          { key: 'isPrivateSchedule', val: ['true', 'false'] },
          { key: 'jobTitle',          val: [job.jobTitle] },
        ],
        dateFilters: [{ key: 'firstDayOnSite', range: { startDate: today } }],
        pageSize: 100, jobId: job.jobId, consolidateSchedule: true,
      },
    },
    query: `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
      searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
        scheduleCards { jobId scheduleId city locationName }
      }
    }`,
  });

  const getScheduleBodyForId = (jobId) => ({
    operationName: 'searchScheduleCards',
    variables: {
      searchScheduleRequest: {
        locale, country,
        equalFilters:   [{ key: 'shiftType', val: 'All' }],
        containFilters: [
          { key: 'isPrivateSchedule', val: ['true', 'false'] },
        ],
        dateFilters: [{ key: 'firstDayOnSite', range: { startDate: today } }],
        pageSize: 100, jobId, consolidateSchedule: true,
      },
    },
    query: `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
      searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
        scheduleCards { jobId scheduleId city locationName }
      }
    }`,
  });

  // ── filterJobs — uses locationName, supports exclude mode ─────────────────────
  // locationName from the API looks like "Brampton, ON" — matches our preset list.
  function filterJobs(jobCards) {
    const filters     = Array.isArray(window.JS_LOCATION_FILTERS) ? window.JS_LOCATION_FILTERS : [];
    const excludeMode = window.JS_EXCLUDE_MODE === true;

    // No filter selected → pass all
    if (filters.length === 0) return jobCards;

    return jobCards.filter(job => {
      // Build a searchable string from locationName (primary) + city fallback
      const locationName = (job.locationName || '').toLowerCase();
      const city         = (job.city         || '').toLowerCase();
      const haystack     = locationName || city;   // prefer locationName

      // Does any selected filter match this job?
      const matched = filters.some(f => haystack.includes(f.toLowerCase()));

      // Include mode: keep only matched jobs
      // Exclude mode: keep only UN-matched jobs
      return excludeMode ? !matched : matched;
    });
  }

  function redirectToConsent(jobId, scheduleId) {
    const base = isCanada
      ? 'https://hiring.amazon.ca/application/ca/#/consent'
      : 'https://hiring.amazon.com/application/us/#/consent';
    const url = `${base}?country=${isCanada ? 'ca' : 'us'}&jobId=${jobId}&locale=${locale}&scheduleId=${scheduleId}`;
    setStatus('APPLYING');
    window.location.replace(url);
  }

  if (sessionStorage.getItem('js_applied') === '1') {
    setStatus('APPLIED');
  } else {

    let requestCount = 0;
    let startTime    = Date.now();
    let found        = false;
    let running      = false;
    let intervalHandle = null;

    // ── Shared: handle a matched job → fetch schedule → redirect ──────────────────
    async function handleJobMatch(job) {
      found = true; running = false;
      if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
      setStatus('SCHEDULING');

      try {
        const sr   = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getScheduleBodyForJob(job)) });
        const sd   = await sr.json();
        const scheds = sd?.data?.searchScheduleCards?.scheduleCards || [];

        // Prefer locationName from schedule card, fall back to job
        const lastSched = scheds[scheds.length - 1];
        const cityFound = lastSched?.locationName || lastSched?.city || job.locationName || job.city || 'Unknown';
        const now = new Date().toLocaleTimeString('en-CA', { hour12: false });

        tgSend(
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '📌  JOB CAUGHT\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '📍  Location   : <b>' + cityFound + '</b>\n' +
          '💼  Job        : ' + job.jobTitle + '\n' +
          '🆔  Job ID     : <code>' + job.jobId + '</code>\n' +
          '🕑  Time       : ' + now + '\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '🔍  Fetching schedule...'
        );

        if (scheds.length > 0) {
          const sched = scheds[scheds.length - 1];
          sessionStorage.setItem('ap_location',  cityFound);
          sessionStorage.setItem('ap_jobtitle',  job.jobTitle || '');

          tgSend(
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '🎯  JOB + SCHEDULE FOUND\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '📍  Location   : <b>' + cityFound + '</b>\n' +
            '💼  Job        : ' + job.jobTitle + '\n' +
            '🆔  Job ID     : <code>' + sched.jobId + '</code>\n' +
            '📅  Schedule   : <code>' + sched.scheduleId + '</code>\n' +
            '🕑  Time       : ' + now + '\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '🚀  Redirecting...'
          );

          redirectToConsent(sched.jobId, sched.scheduleId);

        } else {
          tgSend(
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '⚠️  JOB FOUND — NO SCHEDULE\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '📍  Location   : <b>' + cityFound + '</b>\n' +
            '💼  Job        : ' + job.jobTitle + '\n' +
            '🆔  Job ID     : <code>' + job.jobId + '</code>\n' +
            '🕑  Time       : ' + now + '\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '⏳  Resuming scan...'
          );
          found = false; running = true;
          setStatus('SCANNING');
          startScan();
        }

      } catch (e) {
        found = false; running = true;
        setStatus('SCANNING');
        startScan();
      }
    }

    // ── INTERVAL mode ──────────────────────────────────────────────────────────────
    function startIntervalJobs() {
      setStatus('SCANNING');
      intervalHandle = setInterval(async () => {
        if (found) return;
        try {
          requestCount++;
          const res  = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getJobsBody()) });
          const data = await res.json();
          const all  = data?.data?.searchJobCardsByLocation?.jobCards || [];
          const matched = filterJobs(all);
          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Interval Jobs: ${requestCount} reqs, ${rate}/s | results: ${all.length} | matched: ${matched.length}`);
          }
          if (matched.length > 0 && !found) handleJobMatch(matched[0]);
        } catch (e) {}
      }, 50);
    }

    function startIntervalSchedules() {
      setStatus('POLLING');
      intervalHandle = setInterval(async () => {
        if (found) return;
        const jobId = (window.JS_JOB_ID || '').trim();
        if (!jobId) { setStatus('NO_JOB_ID'); return; }
        const headers = { ...baseHeaders, 'X-Original-URL': randomIPv6(), 'x-forwarded-for': randomIPv6() };
        try {
          requestCount++;
          const res  = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(getScheduleBodyForId(jobId)) });
          const data = await res.json();
          const scheds = data?.data?.searchScheduleCards?.scheduleCards || [];
          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Interval Schedules: ${requestCount} reqs, ${rate}/s`);
          }
          if (scheds.length > 0 && !found) {
            found = true; running = false;
            clearInterval(intervalHandle); intervalHandle = null;
            redirectToConsent(scheds[scheds.length - 1].jobId, scheds[scheds.length - 1].scheduleId);
          }
        } catch (e) {}
      }, 50);
    }

    // ── SEQUENTIAL mode ────────────────────────────────────────────────────────────
    async function loopJobsSequential() {
      while (running && !found) {
        try {
          requestCount++;
          const res  = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getJobsBody()) });
          const data = await res.json();
          const all  = data?.data?.searchJobCardsByLocation?.jobCards || [];
          const matched = filterJobs(all);
          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Sequential Jobs: ${requestCount} reqs, ${rate}/s | results: ${all.length} | matched: ${matched.length}`);
          }
          if (matched.length > 0 && !found) await handleJobMatch(matched[0]);
        } catch (e) {}
      }
    }

    async function loopSchedulesSequential() {
      while (running && !found) {
        const jobId = (window.JS_JOB_ID || '').trim();
        if (!jobId) { setStatus('NO_JOB_ID'); await new Promise(r => setTimeout(r, 600)); continue; }
        const headers = { ...baseHeaders, 'X-Original-URL': randomIPv6(), 'x-forwarded-for': randomIPv6() };
        try {
          requestCount++;
          const res  = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(getScheduleBodyForId(jobId)) });
          const data = await res.json();
          const scheds = data?.data?.searchScheduleCards?.scheduleCards || [];
          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Sequential Schedules: ${requestCount} reqs, ${rate}/s`);
          }
          if (scheds.length > 0 && !found) {
            found = true; running = false;
            redirectToConsent(scheds[scheds.length - 1].jobId, scheds[scheds.length - 1].scheduleId);
          }
        } catch (e) {}
      }
    }

    // ── startScan ──────────────────────────────────────────────────────────────────
    function startScan() {
      if (running) return;
      const mode = window.JS_MODE || 'jobs';
      if (mode === 'schedules' && !(window.JS_JOB_ID || '').trim()) {
        setStatus('NO_JOB_ID'); return;
      }
      running = true; found = false; requestCount = 0; startTime = Date.now();
      setScanButtonState(true);
      const currentPollMode = localStorage.getItem(POLL_MODE_KEY) || 'sequential';
      console.log('[Poller] Starting | poll mode:', currentPollMode, '| scan mode:', mode,
        '| filters:', window.JS_LOCATION_FILTERS, '| exclude:', window.JS_EXCLUDE_MODE);
      if (currentPollMode === 'interval') {
        mode === 'schedules' ? startIntervalSchedules() : startIntervalJobs();
      } else {
        if (mode === 'schedules') { setStatus('POLLING'); loopSchedulesSequential(); }
        else                      { setStatus('SCANNING'); loopJobsSequential(); }
      }
    }

    function stopScan(keepStatus = false) {
      running = false;
      if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
      setScanButtonState(false);
      if (!keepStatus) setStatus('STOPPED');
      if (!keepStatus && !found) setTimeout(() => { running = false; startScan(); }, 1000);
    }

    window.JS_ON_MODE_CHANGE = () => { running = false; setStatus('IDLE'); };
    window.JS_TOGGLE_SCAN = () => {
      if (typeof window.JS_IS_APPLIED === 'function' && window.JS_IS_APPLIED()) resetForRescan();
    };

    // Auto-start
    setTimeout(() => { console.log('[Poller] Auto-starting…'); startScan(); }, 900);

  } // end not-applied
} // end guard
