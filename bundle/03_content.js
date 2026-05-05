// content.js — Poller Extension
// Runs ONLY on https://hiring.amazon.com/ and https://hiring.amazon.ca/ (exact homepage)

const API_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';

const hostname = window.location.hostname;
const pathname = window.location.pathname;

// Guard: only run on exact homepages
const ALLOWED_HOSTS = ['hiring.amazon.com', 'hiring.amazon.ca'];
const isAllowedDomain = ALLOWED_HOSTS.some(h => hostname === h);
const isHomepage = pathname === '/' || pathname === '' || pathname === '/app';

if (!isAllowedDomain || !isHomepage) {
  // Not the homepage — bail out silently
} else {

  // ── Inject badge ─────────────────────────────────────────────────────────────
  console.log('[AP] calling injectBadge, body=', !!document.body);
  try {
    if (document.body) injectBadge();
    else document.addEventListener('DOMContentLoaded', injectBadge);
  } catch (e) { console.error('[AP] injectBadge CRASHED:', e); }

  // ── Site config ──────────────────────────────────────────────────────────────
  const isCanada = hostname.includes('.ca');
  const locale = isCanada ? 'en-CA' : 'en-US';
  const country = isCanada ? 'Canada' : 'United States';
  const today = new Date().toISOString().split('T')[0];

  // ── Shared API headers ───────────────────────────────────────────────────────
  const baseHeaders = {
    'accept': '*/*',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'authorization': 'Status|unauthenticated|Session|null',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'country': country,
    'iscanary': 'false',
    'pragma': 'no-cache',
    'x-amz-user-agent': 'aws-amplify/2.0.0',
  };

  // ── Helper: redirect to consent ──────────────────────────────────────────────
  function redirectToConsent(jobId, scheduleId) {
    const base = isCanada
      ? 'https://hiring.amazon.ca/application/ca/#/consent'
      : 'https://hiring.amazon.com/application/us/#/consent';
    const url = `${base}?country=${isCanada ? 'ca' : 'us'}&jobId=${jobId}&locale=${locale}&scheduleId=${scheduleId}`;
    setStatus('APPLYING');
    console.log('[Poller] Redirecting to:', url);
    window.location.replace(url);
  }

  // ── Skip if already applied this session ─────────────────────────────────────
  if (sessionStorage.getItem('js_applied') === '1') {
    console.log('[Poller] Already applied this session.');
    setStatus('APPLIED');
  } else {

    let requestCount = 0;
    let startTime = Date.now();
    let found = false;
    let scanInterval = null;
    let isScanning = false;

    // ── MODE A: Poll Jobs ────────────────────────────────────────────────────────
    const getJobsBody = () => ({
      query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
          jobCards { jobId jobTitle city }
        }
      }`,
      variables: {
        searchJobRequest: {
          locale, country,
          keyWords: '',
          dateFilters: [{ key: 'firstDayOnSite', range: { startDate: today } }],
          sorters: [{ fieldName: 'totalPayRateMax', ascending: 'false' }],
        }
      },
      operationName: 'searchJobCardsByLocation',
    });

    const getScheduleBodyForJob = (job) => ({
      operationName: 'searchScheduleCards',
      variables: {
        searchScheduleRequest: {
          locale, country,
          equalFilters: [{ key: 'shiftType', val: 'All' }],
          containFilters: [
            { key: 'isPrivateSchedule', val: ['false'] },
            { key: 'jobTitle', val: [job.jobTitle] },
          ],
          dateFilters: [{ key: 'firstDayOnSite', range: { startDate: today } }],
          pageSize: 100,
          jobId: job.jobId,
          consolidateSchedule: true,
        }
      },
      query: `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
        searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
          scheduleCards { jobId scheduleId city }
        }
      }`,
    });

    function filterJobs(jobCards) {
      // Support both legacy single-string filter and new multi-city array
      const filters = Array.isArray(window.JS_CITY_FILTERS)
        ? window.JS_CITY_FILTERS
        : [];

      // Fallback: if old JS_CITY_FILTER is still set (shouldn't happen, but just in case)
      if (filters.length === 0) {
        const cf = (window.JS_CITY_FILTER || '').trim().toLowerCase();
        if (!cf) return jobCards;
        return jobCards.filter(j => j.city && j.city.toLowerCase().includes(cf));
      }

      return jobCards.filter(j => {
        if (!j.city) return false;
        const cityLower = j.city.toLowerCase();
        return filters.some(f => cityLower.includes(f));
      });
    }

    async function scanTickJobs() {
      if (found) return;
      requestCount++;
      try {
        const res = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getJobsBody()) });
        const data = await res.json();
        const allCards = data.data.searchJobCardsByLocation.jobCards || [];
        const matched = filterJobs(allCards);

        const _activeFilters = Array.isArray(window.JS_CITY_FILTERS) && window.JS_CITY_FILTERS.length > 0
          ? window.JS_CITY_FILTERS
          : (window.JS_CITY_FILTER ? [window.JS_CITY_FILTER] : []);
        if (_activeFilters.length > 0 && requestCount % 10 === 0) {
          console.log(`[Poller] City filter [${_activeFilters.join(', ')}] matched:`, matched.length);
        }

        if (found) return;

        if (matched.length > 0) {
          found = true;
          stopScan(true);
          setStatus('SCHEDULING');
          const firstJob = matched[0];
          console.log('[Poller] Job found:', firstJob);

          try {
            const sRes = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getScheduleBodyForJob(firstJob)) });
            const sData = await sRes.json();
            const schedules = sData?.data?.searchScheduleCards?.scheduleCards || [];

            if (schedules.length > 0) {
              redirectToConsent(schedules[0].jobId, schedules[0].scheduleId);
            } else {
              found = false;
              if (isScanning) setStatus('SCANNING');
            }
          } catch (err) {
            console.error('[Poller] Schedule fetch error:', err);
            found = false;
            if (isScanning) setStatus('SCANNING');
          }
        }

        if (requestCount % 20 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`[Poller] Jobs rate: ${(requestCount / elapsed).toFixed(1)} req/sec`);
        }
      } catch (err) { /* suppress */ }
    }

    // ── MODE B: Poll Schedules ───────────────────────────────────────────────────
    const getScheduleBodyForId = (jobId) => ({
      operationName: 'searchScheduleCards',
      variables: {
        searchScheduleRequest: {
          locale, country,
          equalFilters: [{ key: 'shiftType', val: 'All' }],
          containFilters: [{ key: 'isPrivateSchedule', val: ['false'] }],
          dateFilters: [{ key: 'firstDayOnSite', range: { startDate: today } }],
          pageSize: 100,
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

    async function scanTickSchedules() {
      if (found) return;

      const jobId = (window.JS_JOB_ID || '').trim();
      if (!jobId) {
        stopScan(false);
        setStatus('NO_JOB_ID');
        return;
      }
      const headers = { ...baseHeaders, 'X-Original-URL': randomIPv6(), 'x-forwarded-for': randomIPv6() };

      requestCount++;
      try {
        const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(getScheduleBodyForId(jobId)) });
        const data = await res.json();
        const schedules = data?.data?.searchScheduleCards?.scheduleCards || [];

        if (found) return;

        if (schedules.length > 0) {
          found = true;
          stopScan(true);
          redirectToConsent(schedules[0].jobId, schedules[0].scheduleId);
        } else {
          if (requestCount % 20 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            console.log(`[Poller] Schedule polling rate: ${(requestCount / elapsed).toFixed(1)} req/sec`);
          }
        }
      } catch (err) { /* suppress */ }
    }

    // ── Start / Stop ─────────────────────────────────────────────────────────────
    function startScan() {
      if (isScanning) return;

      const mode = window.JS_MODE || 'jobs';

      if (mode === 'schedules') {
        const jobId = (window.JS_JOB_ID || '').trim();
        if (!jobId) {
          setStatus('NO_JOB_ID');
          console.warn('[Poller] Cannot start — no Job ID entered.');
          return;
        }
      }

      isScanning = true;
      found = false;
      requestCount = 0;
      startTime = Date.now();
      setScanButtonState(true);

      if (mode === 'schedules') {
        setStatus('POLLING');
        scanInterval = setInterval(scanTickSchedules, 700);
        console.log(`[Poller] Polling schedules for job: ${window.JS_JOB_ID}`);
      } else {
        setStatus('SCANNING');
        scanInterval = setInterval(scanTickJobs, 700);
        console.log('[Poller] Scanning jobs…');
      }
    }

    function stopScan(keepStatus = false) {
      if (!isScanning) return;
      isScanning = false;
      clearInterval(scanInterval);
      scanInterval = null;
      setScanButtonState(false);
      if (!keepStatus) setStatus('STOPPED');
      console.log('[Poller] Scan paused — restarting in 1s…');
      // Auto-restart: if stopped for any reason other than finding a job, restart
      if (!keepStatus && !found) {
        setTimeout(() => {
          console.log('[Poller] Auto-restarting scan…');
          startScan();
        }, 1000);
      }
    }
  }

  window.JS_ON_MODE_CHANGE = () => {
    if (isScanning) stopScan();
    setStatus('IDLE');
  };

  window.JS_TOGGLE_SCAN = () => {
    // Only allow toggle if in APPLIED (replay) state — never allow manual stop
    if (typeof window.JS_IS_APPLIED === 'function' && window.JS_IS_APPLIED()) {
      resetForRescan();
    }
  };

  // ── AUTO-START on page load (play button starts by default) ─────────────────
  // Wait for the badge UI to be fully injected before triggering start
  setTimeout(() => {
    console.log('[Poller] Auto-starting scan…');
    startScan();
  }, 900);

} // end not-applied branch
// end isAllowedDomain && isHomepage