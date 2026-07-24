const hostname = window.location.hostname;
const pathname = window.location.pathname;
const ALLOWED_HOSTS = ['hiring.amazon.com', 'hiring.amazon.ca'];
const isAllowedDomain = ALLOWED_HOSTS.some(h => hostname === h);

const isHomepage = pathname === '/' || pathname === '' || pathname === '/app';

const isCanada = hostname.includes('.ca');
const API_URL = isCanada ? 'https://hiring.amazon.ca/graphql' : 'https://hiring.amazon.com/graphql';
const locale = isCanada ? 'en-CA' : 'en-US';
const country = isCanada ? 'Canada' : 'United States';


const TG_BOT_TOKEN = '8633890890:AAEMieuzz659me1c_UvpfYVdrdIWRryfYeY';
const TG_CHAT_IDS = ['782166806', '-5214514656'];

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

// ── Exact coordinates for every filterable location ────────────────────────
// Sourced from Amazon's geoInfo API. One entry per location chip.
const LOC_COORDS = {
  // ── Canada ──
  'Brampton, ON':                { lat: 43.685271, lng: -79.759924 },
  'Mississauga, ON':             { lat: 43.58882,  lng: -79.644378 },
  'Etobicoke, ON':               { lat: 43.65421,  lng: -79.56711  },
  'Concord, ON':                 { lat: 43.80011,  lng: -79.48291  },
  'Oakville, ON':                { lat: 43.467517, lng: -79.687666 },
  'Cambridge, ON':               { lat: 43.36143,  lng: -80.314646 },
  'Kitchener, ON':               { lat: 43.45038,  lng: -80.487829 },
  'Hamilton, ON':                { lat: 43.25549,  lng: -79.873376 },
  'Stony Creek, ON':             { lat: 43.21681,  lng: -79.76633  },
  'Scarborough, ON':             { lat: 43.77223,  lng: -79.25666  },
  'Toronto, ON':                 { lat: 43.653524, lng: -79.383907 },
  'Richmond Hill, ON':           { lat: 43.870669, lng: -79.437863 },
  'Whitby, ON':                  { lat: 43.897858, lng: -78.943434 },
  'Ajax, ON':                    { lat: 43.850814, lng: -79.020296 },
  'Bolton, ON':                  { lat: 43.87952,  lng: -79.73791  },
  'St Thomas, ON':               { lat: 42.779226, lng: -81.192734 },
  'London, ON':                  { lat: 42.988148, lng: -81.246092 },
  'Windsor, ON':                 { lat: 42.317438, lng: -83.035225 },
  'Belleville, ON':              { lat: 44.25716,  lng: -77.37039  },
  'Ottawa, ON':                  { lat: 45.425226, lng: -75.699963 },
  'Barrhaven, ON':               { lat: 45.27489,  lng: -75.74919  },
  'Edmonton, AB':                { lat: 53.54545,  lng: -113.49014 },
  'Acheson, AB':                 { lat: 53.548701, lng: -113.76261 },
  'Nisku, AB':                   { lat: 53.337845, lng: -113.531304 },
  'Calgary, AB':                 { lat: 51.045113, lng: -114.057141 },
  'Balzac, AB':                  { lat: 51.212985, lng: -114.007862 },
  'Rocky View County, AB':       { lat: 51.12623,  lng: -113.71466 },
  'Sidney, BC':                  { lat: 48.650629, lng: -123.398604 },
  'Delta, BC':                   { lat: 49.08958,  lng: -123.05730 },
  'Burnaby, BC':                 { lat: 49.249392, lng: -122.979646 },
  'Langley, BC':                 { lat: 49.103945, lng: -122.656775 },
  'Richmond, BC':                { lat: 49.163469, lng: -123.137766 },
  'New Westminster, BC':         { lat: 49.20686,  lng: -122.911229 },
  'Pitt Meadows, BC':            { lat: 49.220795, lng: -122.690446 },
  'Coquitlam, BC':               { lat: 49.283859, lng: -122.791859 },
  'Tsawwassen First Nation, BC': { lat: 49.04387,  lng: -123.10585 },
  'Dartmouth, NS':               { lat: 44.67134,  lng: -63.57719  },
  'Winnipeg, MB':                { lat: 49.899897, lng: -97.138865 },

  // ── United States ──
  // Add US locations here as needed, e.g.:
  'Kent, WA':                   { lat: 47.380933, lng: -122.234843 },
  'Kent, WA':                   { lat: 41.262821, lng: -85.253499 },
};

// Province/State → location keys (used by ui.js region buttons for batch-select)
const PROVINCE_LOC_KEYS = {
  ON: Object.keys(LOC_COORDS).filter(k => k.endsWith(', ON')),
  AB: Object.keys(LOC_COORDS).filter(k => k.endsWith(', AB')),
  BC: Object.keys(LOC_COORDS).filter(k => k.endsWith(', BC')),
  NS: Object.keys(LOC_COORDS).filter(k => k.endsWith(', NS')),
  MB: Object.keys(LOC_COORDS).filter(k => k.endsWith(', MB')),
  // Add US state groups as needed, e.g.:
  // WA: Object.keys(LOC_COORDS).filter(k => k.endsWith(', WA')),
};

// .ca uses km, .com uses mi — match what Amazon's API expects per domain
function getGeoUnit() {
  return isCanada ? 'km' : 'mi';
}

function kmToMi(km) {
  return km * 0.621371;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Derive the best geoQueryClause from the currently selected location chips.
//
// Strategy: always use the FIRST selected city as the center point.
// This guarantees the center is a real location where Amazon has data,
// rather than a mathematical centroid that could land in an empty area.
// The radius expands to cover all other selected cities.
//
//   - Include mode + chips  → circle from first city covering all selected
//   - Include mode + no chips → no clause (search everywhere)
//   - Exclude mode           → no clause (text filter handles exclusions)
function resolveGeoClause() {
  const locMode = window.JS_LOC_MODE || 'include';

  // Exclude mode: text filter handles it — never send geo coordinates
  if (locMode === 'exclude') return null;

  const locs = Array.isArray(window.JS_LOC_FILTERS) ? window.JS_LOC_FILTERS : [];

  // No chips selected in include mode: search everywhere, no geo needed
  if (!locs.length) return null;

  const coords = locs.map(loc => LOC_COORDS[loc]).filter(Boolean);
  if (!coords.length) return null;

  const unit = getGeoUnit();

  // Single city: tight radius — 15km for CA, 10mi for US
  if (coords.length === 1) {
    return {
      lat: coords[0].lat,
      lng: coords[0].lng,
      unit,
      distance: unit === 'km' ? 15 : 10,
    };
  }

  // Multiple cities: use FIRST city as center, expand radius to cover the rest
  const center = coords[0];
  let maxDistKm = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm(center.lat, center.lng, coords[i].lat, coords[i].lng);
    if (d > maxDistKm) maxDistKm = d;
  }

  const minRadius = unit === 'km' ? 15 : 10;
  const radiusKm = Math.max(15, Math.ceil((maxDistKm * 1.15) / 5) * 5);
  const radius = unit === 'km'
    ? Math.max(minRadius, radiusKm)
    : Math.max(minRadius, Math.ceil(kmToMi(radiusKm) / 5) * 5);

  return { lat: center.lat, lng: center.lng, unit, distance: radius };
}

if (!isAllowedDomain || !isHomepage) {
} else {

  console.log('[AP] calling injectBadge, body=', !!document.body);
  try {
    if (document.body) injectBadge();
    else document.addEventListener('DOMContentLoaded', injectBadge);
  } catch (e) { console.error('[AP] injectBadge CRASHED:', e); }

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
    let scanWanted = false;
    let intervalHandle = null;
    let scanGeneration = 0;
    let lastErrorLogAt = 0;
    const activeRequests = new Set();
    const INTERVAL_MS = 100;

    const getJobsBody = () => {
      const geo = resolveGeoClause();
      const searchJobRequest = {
        locale,
        country,
        keyWords: "",
        containFilters: [{ key: "isPrivateSchedule", val: ["false", "true"] }],
        // we dont actually need these
          
        // equalFilters: [{ key: "scheduleRequiredLanguage", val: locale }],
        // rangeFilters: [{ key: "hoursPerWeek", range: { minimum: 0, maximum: 80 } }],
        // orFilters: [],
        // sorters: [{ fieldName: 'totalPayRateMax', ascending: 'false' }],
        // dateFilters: [{ key: 'firstDayOnSite', range: { startDate: requestDate() } }],
        // Fresh date on every API request; avoids a stale midnight filter.
        pageSize: 100,
      };
      if (geo) searchJobRequest.geoQueryClause = geo;
      return {
        operationName: 'searchJobCardsByLocation',
        variables: { searchJobRequest },
        query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
          jobCards { jobId locationName jobType }
        }
      }`,
      };
    };

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
      const geo = resolveGeoClause();
      console.log('[Poller] Starting in mode:', pollMode, '| scan:', mode, '| geo:', geo ? `${geo.distance}${geo.unit} @ ${geo.lat},${geo.lng}` : 'none');
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

    setTimeout(() => { console.log('[Poller] Auto-starting…'); startScan(); }, 1500);

  }
}