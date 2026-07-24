const hostname = window.location.hostname;
const pathname = window.location.pathname;
const ALLOWED_HOSTS = ['hiring.amazon.com', 'hiring.amazon.ca'];
const isAllowedDomain = ALLOWED_HOSTS.some(h => hostname === h);

const isHomepage = pathname === '/' || pathname === '' || pathname === '/app';

const isCanada = hostname.includes('.ca');
// const API_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';
const API_URL = isCanada ? 'https://hiring.amazon.ca/graphql' : 'https://hiring.amazon.com/graphql';
const locale = isCanada ? 'en-CA' : 'en-US';
const country = isCanada ? 'Canada' : 'United States';


const TG_BOT_TOKEN = '8633890890:AAEMieuzz659me1c_UvpfYVdrdIWRryfYeY';
const TG_CHAT_IDS = ['782166806', '-5214514656'];

// console.log("tokens", TG_BOT_TOKEN, TG_CHAT_IDS)

function tgSend(text) {
  for (const chatId of TG_CHAT_IDS) {
    fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      keepalive: true,
    }).catch(() => { });
  }
}

if (!isAllowedDomain || !isHomepage) {
} else {

  console.log('[AP] calling injectBadge, body=', !!document.body);
  try {
    if (document.body) injectBadge();
    else document.addEventListener('DOMContentLoaded', injectBadge);
  } catch (e) { console.error('[AP] injectBadge CRASHED:', e); }

  // Evaluated while each GraphQL body is created, so the request date does
  // not become stale if the page stays open across midnight.
  const requestDate = () => new Date().toISOString().split('T')[0];

  const baseHeaders = {
    'accept': '*/*',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'authorization': 'Status|unauthenticated|Session|null',
    'country': country,
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'iscanary': 'false',
    'pragma': 'no-cache',
    'x-amz-user-agent': 'aws-amplify/2.0.0',
  };

  const POLL_MODE_KEY = 'ap_poll_mode';
  let pollMode = localStorage.getItem(POLL_MODE_KEY) === 'interval' ? 'interval' : 'sequential';
  let restartForPollModeChange = null;

  function setPollMode(mode) {
    mode = mode === 'interval' ? 'interval' : 'sequential';
    if (pollMode === mode) return;
    pollMode = mode;
    localStorage.setItem(POLL_MODE_KEY, mode);
    const btn = document.getElementById('ap-poll-mode-btn');
    if (btn) btn.textContent = mode === 'interval' ? '⚡ Interval' : '🔗 Sequential';
    console.log('[Poller] Poll mode set to:', mode);
    if (typeof restartForPollModeChange === 'function') restartForPollModeChange();
  }

  window.JS_TOGGLE_POLL_MODE = () => {
    setPollMode(pollMode === 'interval' ? 'sequential' : 'interval');
  };
  window.JS_POLL_MODE = () => pollMode;

  function redirectToConsent(jobId, scheduleId) {
    const base = isCanada
      ? 'https://hiring.amazon.ca/application/ca/#/consent'
      : 'https://hiring.amazon.com/application/us/#/consent';
    const url = `${base}?country=${isCanada ? 'ca' : 'us'}&jobId=${jobId}&locale=${locale}&scheduleId=${scheduleId}`;
    setStatus('Manual application form Filling');
    window.location.replace(url);
  }

  if (sessionStorage.getItem('js_applied') === '1') {
    setStatus('MANUALLY APPLIED');
  } else {

    let requestCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let inFlightCount = 0;
    let startTime = Date.now();
    let found = false;
    let running = false;
    // Kept separately from `running`: a scan can be requested while Schedule
    // mode is waiting for a Job ID, and must resume when the user switches back.
    let scanWanted = false;
    let intervalHandle = null;
    let scanGeneration = 0;
    let lastErrorLogAt = 0;
    const activeRequests = new Set();
    const INTERVAL_MS = 100;

    const getJobsBody = () => ({
      operationName: 'searchJobCardsByLocation',
      variables: {
        searchJobRequest: {
          locale,
          country,
          keyWords: "",
          containFilters: [{ key: "isPrivateSchedule", val: ["false", "true"] }],
          // geoQueryClause: {lat: 51.045113, lng: -114.057141, unit: "km", distance: 100},
          // we dont actually need these
          
          // equalFilters: [{ key: "scheduleRequiredLanguage", val: locale }],
          // rangeFilters: [{ key: "hoursPerWeek", range: { minimum: 0, maximum: 80 } }],
          // orFilters: [],
          // sorters: [{ fieldName: 'totalPayRateMax', ascending: 'false' }],
          // dateFilters: [{ key: 'firstDayOnSite', range: { startDate: requestDate() } }],

          // Fresh date on every API request; avoids a stale midnight filter.
          pageSize: 100,
          // consolidateSchedule: true,
        }
      },
      query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
          jobCards { jobId locationName jobType }
        }
      }`,
    });

    // Used both for a manually entered Job ID and for the Job ID selected
    // after a jobs scan finds a matching job.
    const getScheduleBodyForJobId = (jobId) => ({
      operationName: 'searchScheduleCards',
      variables: {
        searchScheduleRequest: {
          locale,
          country,
          keyWords: "",
          equalFilters: [],
          containFilters: [{ key: 'isPrivateSchedule', val: ['false', 'true'] }],
          rangeFilters: [{ key: 'hoursPerWeek', range: { minimum: 0, maximum: 80 } }],
          orFilters: [],
          sorters: [{ fieldName: 'totalPayRateMax', ascending: 'false' }],
          // Fresh date on every API request; avoids a stale midnight filter.
          dateFilters: [{ key: 'firstDayOnSite', range: { startDate: requestDate() } }],
          pageSize: 1000,
          jobId,
          consolidateSchedule: true,
        }
      },
      query: `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
        searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
          scheduleCards { jobId scheduleId city }
        }
      }`,
    });

    function buildLocKey(job) {
      return (job.locationName || '').trim();
    }

    const buildSchedLocation = sched => sched.city || 'Unknown';

    function filterJobs(jobCards) {
      const locFilters = Array.isArray(window.JS_LOC_FILTERS) ? window.JS_LOC_FILTERS : [];
      const locMode = window.JS_LOC_MODE || 'include';
      const locationNeedles = locFilters.map(value => String(value).toLowerCase());
      let results = jobCards;

      if (locationNeedles.length > 0) {
        results = results.filter(job => {
          const key = buildLocKey(job).toLowerCase();
          const hit = locationNeedles.some(filter => key.includes(filter));
          return locMode === 'exclude' ? !hit : hit;
        });
      }

      const jtFilters = Array.isArray(window.JS_JT_FILTERS) ? window.JS_JT_FILTERS : [];
      const jtMode = window.JS_JT_MODE || 'include';
      const jobTypeFilters = new Set(jtFilters);

      if (jobTypeFilters.size > 0) {
        results = results.filter(job => {
          const types = (job.jobType || '').split(';').map(t => t.trim()).filter(Boolean);
          const hit = types.some(type => jobTypeFilters.has(type));
          return jtMode === 'exclude' ? !hit : hit;
        });
      }

      return results;
    }

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const isCurrentScan = generation => running && !found && generation === scanGeneration;

    function clearIntervalPoller() {
      if (intervalHandle) clearInterval(intervalHandle);
      intervalHandle = null;
    }

    function abortOutstandingRequests() {
      for (const controller of activeRequests) controller.abort();
      activeRequests.clear();
    }

    function clearPollingWork() {
      clearIntervalPoller();
      abortOutstandingRequests();
    }

    function logStats(label) {
      if (!completedCount || completedCount % 20 !== 0) return;
      const seconds = Math.max((Date.now() - startTime) / 1000, 0.001);
      console.log(`[Poller] ${label}: ${completedCount}/${requestCount} completed, ` +
        `${(completedCount / seconds).toFixed(1)}/s, ${inFlightCount} in flight, ${failedCount} failed`);
    }

    function reportRequestError(label, error) {
      if (error?.name === 'AbortError') return;
      failedCount++;
      if (Date.now() - lastErrorLogAt < 5000) return;
      lastErrorLogAt = Date.now();
      console.warn(`[Poller] ${label} request failed:`, error?.message || error);
    }

    async function postGraphQL(body, label) {
      const controller = new AbortController();
      activeRequests.add(controller);
      requestCount++;
      inFlightCount++;
      try {
        const res = await fetch(API_URL, {
          method: 'POST', headers: baseHeaders, body: JSON.stringify(body), signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        completedCount++;
        logStats(label);
        return { ok: true, data };
      } catch (error) {
        reportRequestError(label, error);
        return { ok: false, error };
      } finally {
        inFlightCount--;
        activeRequests.delete(controller);
      }
    }

    async function handleJobMatch(jobs, generation) {
      if (!isCurrentScan(generation) || !jobs.length) return;
      found = true;
      running = false;
      clearPollingWork();
      setStatus('SCHEDULING');

      const now = new Date().toLocaleTimeString('en-CA', { hour12: false });
      const job = jobs[Math.floor(Math.random() * jobs.length)];
      tgSend(
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '📌  JOBS CAUGHT: ' + jobs.length + '\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        jobs.map(j => '📍 ' + buildLocKey(j) + ' — <code>' + j.jobId + '</code>').join('\n') + '\n' +
        '🕑  Time       : ' + now + '\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '🎲  Picked job ' + (jobs.indexOf(job) + 1) + ' of ' + jobs.length + ': <code>' + job.jobId + '</code>\n' +
        '🔍  Fetching schedule...'
      );

      const scheduleResponse = await postGraphQL(getScheduleBodyForJobId(job.jobId), 'Schedule lookup');
      const scheds = scheduleResponse.ok
        ? scheduleResponse.data?.data?.searchScheduleCards?.scheduleCards || []
        : [];

      if (scheds.length > 0) {
        const sched = scheds[Math.floor(Math.random() * scheds.length)];
        const locationFound = buildSchedLocation(sched);
        sessionStorage.setItem('ap_city', locationFound);
        tgSend(
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '🎯  SCHEDULE PICKED\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '📍  Location   : <b>' + locationFound + '</b>\n' +
          '🆔  Job ID     : <code>' + sched.jobId + '</code>\n' +
          '📅  Schedule   : <code>' + sched.scheduleId + '</code>\n' +
          '🕑  Time       : ' + now + '\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '🚀  Redirecting...'
        );
        redirectToConsent(sched.jobId, sched.scheduleId);
        return;
      }

      tgSend(scheduleResponse.ok
        ? '⚠️ Job found, but no schedules — resuming scan.'
        : '⚠️ Schedule fetch error — resuming scan.');
      found = false;
      setStatus('SCANNING');
      startScan();
    }

    async function pollJobs(generation, label) {
      const response = await postGraphQL(getJobsBody(), label);
      if (!response.ok || !isCurrentScan(generation)) return;
      const matched = filterJobs(response.data?.data?.searchJobCardsByLocation?.jobCards || []);
      if (matched.length) await handleJobMatch(matched, generation);
    }

    async function pollSchedules(generation, label) {
      const jobId = (window.JS_JOB_ID || '').trim();
      if (!jobId) { setStatus('NO_JOB_ID'); return; }
      const response = await postGraphQL(getScheduleBodyForJobId(jobId), label);
      if (!response.ok || !isCurrentScan(generation)) return;
      const scheds = response.data?.data?.searchScheduleCards?.scheduleCards || [];
      if (!scheds.length) return;
      found = true;
      running = false;
      clearPollingWork();
      const sched = scheds[Math.floor(Math.random() * scheds.length)];
      redirectToConsent(sched.jobId, sched.scheduleId);
    }

    function startIntervalJobs(generation) {
      setStatus('SCANNING');
      const dispatch = () => { if (isCurrentScan(generation)) void pollJobs(generation, 'Interval jobs'); };
      dispatch();
      intervalHandle = setInterval(dispatch, INTERVAL_MS);
    }

    function startIntervalSchedules(generation) {
      setStatus('POLLING');
      const dispatch = () => { if (isCurrentScan(generation)) void pollSchedules(generation, 'Interval schedules'); };
      dispatch();
      intervalHandle = setInterval(dispatch, INTERVAL_MS);
    }

    async function loopJobsSequential(generation) {
      while (isCurrentScan(generation)) {
        const response = await postGraphQL(getJobsBody(), 'Sequential jobs');
        if (!response.ok) { await delay(250); continue; }
        if (!isCurrentScan(generation)) return;
        const matched = filterJobs(response.data?.data?.searchJobCardsByLocation?.jobCards || []);
        if (matched.length) await handleJobMatch(matched, generation);
      }
    }

    async function loopSchedulesSequential(generation) {
      while (isCurrentScan(generation)) {
        const jobId = (window.JS_JOB_ID || '').trim();
        if (!jobId) { setStatus('NO_JOB_ID'); await delay(600); continue; }
        const response = await postGraphQL(getScheduleBodyForJobId(jobId), 'Sequential schedules');
        if (!response.ok) { await delay(250); continue; }
        if (!isCurrentScan(generation)) return;
        const scheds = response.data?.data?.searchScheduleCards?.scheduleCards || [];
        if (scheds.length) {
          found = true;
          running = false;
          const sched = scheds[Math.floor(Math.random() * scheds.length)];
          redirectToConsent(sched.jobId, sched.scheduleId);
        }
      }
    }

    function startScan() {
      scanWanted = true;
      if (running) return;
      const mode = window.JS_MODE || 'jobs';
      if (mode === 'schedules' && !(window.JS_JOB_ID || '').trim()) {
        setStatus('NO_JOB_ID');
        return;
      }
      clearPollingWork();
      const generation = ++scanGeneration;
      running = true;
      found = false;
      requestCount = completedCount = failedCount = inFlightCount = 0;
      startTime = Date.now();
      console.log('[Poller] Starting in mode:', pollMode, '| scan:', mode);
      if (pollMode === 'interval') {
        mode === 'schedules' ? startIntervalSchedules(generation) : startIntervalJobs(generation);
      } else if (mode === 'schedules') {
        setStatus('POLLING');
        void loopSchedulesSequential(generation);
      } else {
        setStatus('SCANNING');
        void loopJobsSequential(generation);
      }
    }

    function stopScan(status = 'STOPPED', keepScanWanted = false) {
      running = false;
      if (!keepScanWanted) scanWanted = false;
      scanGeneration++;
      clearPollingWork();
      setStatus(status);
    }

    restartForPollModeChange = () => {
      if (!scanWanted) return;
      stopScan('IDLE', true);
      startScan();
    };

    window.JS_ON_MODE_CHANGE = () => {
      // A mode switch is not a request to stop.  In particular, Schedule mode
      // can be paused for a missing Job ID and must start again after Jobs is
      // selected without the user having to press Start a second time.
      const shouldResume = scanWanted;
      stopScan('IDLE', true);
      if (shouldResume) startScan();
    };
    window.JS_TOGGLE_SCAN = () => {
      if (typeof window.JS_IS_APPLIED === 'function' && window.JS_IS_APPLIED()) {
        resetForRescan();
        return;
      }
      if (running || scanWanted) stopScan();
      else startScan();
    };

    // Delay auto-start so the injected UI has time to initialise.
    setTimeout(() => { console.log('[Poller] Auto-starting…'); startScan(); }, 1500);

  }
}
