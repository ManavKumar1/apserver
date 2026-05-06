// content.js — Poller (chained async, no setInterval)

console.log('[ApplyPilot] Bundle executing…', window.location.href);

const API_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';

const hostname = window.location.hostname;
const pathname = window.location.pathname;
const ALLOWED_HOSTS = ['hiring.amazon.com', 'hiring.amazon.ca'];
const isAllowedDomain = ALLOWED_HOSTS.some(h => hostname === h);
const isHomepage = pathname === '/' || pathname === '' || pathname === '/app';

if (!isAllowedDomain || !isHomepage) {
  // not homepage — do nothing
} else {

  console.log('[AP] calling injectBadge, body=', !!document.body);
  try {
    if (document.body) injectBadge();
    else document.addEventListener('DOMContentLoaded', injectBadge);
  } catch (e) { console.error('[AP] injectBadge CRASHED:', e); }

  const isCanada = hostname.includes('.ca');
  const locale = isCanada ? 'en-CA' : 'en-US';
  const country = isCanada ? 'Canada' : 'United States';
  const today = new Date().toISOString().split('T')[0];

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
    let startTime = Date.now();
    let found = false;
    let running = false;

    // ── Query builders ──────────────────────────────────────────────────────────
    const getJobsBody = () => ({
      query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
          jobCards { jobId jobTitle city }
        }
      }`,
      variables: {
        searchJobRequest: {
          locale, country, keyWords: '',
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
          pageSize: 100, jobId: job.jobId, consolidateSchedule: true,
        }
      },
      query: `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
        searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
          scheduleCards { jobId scheduleId city }
        }
      }`,
    });

    const getScheduleBodyForId = (jobId) => ({
      operationName: 'searchScheduleCards',
      variables: {
        searchScheduleRequest: {
          locale, country,
          equalFilters: [{ key: 'shiftType', val: 'All' }],
          containFilters: [{ key: 'isPrivateSchedule', val: ['false'] }],
          dateFilters: [{ key: 'firstDayOnSite', range: { startDate: today } }],
          pageSize: 100, jobId, consolidateSchedule: true,
        }
      },
      query: `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
        searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
          scheduleCards { jobId scheduleId city }
        }
      }`,
    });

    function filterJobs(jobCards) {
      const filters = Array.isArray(window.JS_CITY_FILTERS) ? window.JS_CITY_FILTERS : [];
      if (filters.length === 0) return jobCards;
      return jobCards.filter(j => {
        if (!j.city) return false;
        const c = j.city.toLowerCase();
        return filters.some(f => c.includes(f.toLowerCase()));
      });
    }

    // ── Chained async loops (no setInterval) ────────────────────────────────────
    // Each request fires immediately after the previous one resolves.
    // This is faster than setInterval (no idle time between response and next req)
    // and never piles up concurrent requests.

    async function loopJobs() {
      while (running && !found) {
        try {
          requestCount++;
          const res = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getJobsBody()) });
          const data = await res.json();
          const all = data?.data?.searchJobCardsByLocation?.jobCards || [];
          const matched = filterJobs(all);

          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Jobs: ${requestCount} reqs, ${rate}/s, matched: ${matched.length}`);
          }

          if (matched.length > 0 && !found) {
            found = true; running = false;
            setStatus('SCHEDULING');
            const job = matched[0];
            try {
              const sr = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getScheduleBodyForJob(job)) });
              const sd = await sr.json();
              const scheds = sd?.data?.searchScheduleCards?.scheduleCards || [];
              if (scheds.length > 0) {
                redirectToConsent(scheds[0].jobId, scheds[0].scheduleId);
              } else {
                found = false; running = true;
                setStatus('SCANNING');
              }
            } catch (e) {
              found = false; running = true;
              setStatus('SCANNING');
            }
          }
        } catch (e) { /* network hiccup — just continue */ }
      }
    }

    async function loopSchedules() {
      while (running && !found) {
        const jobId = (window.JS_JOB_ID || '').trim();
        if (!jobId) {
          setStatus('NO_JOB_ID');
          // wait briefly then recheck (user might type the ID)
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        const headers = { ...baseHeaders, 'X-Original-URL': randomIPv6(), 'x-forwarded-for': randomIPv6() };
        try {
          requestCount++;
          const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(getScheduleBodyForId(jobId)) });
          const data = await res.json();
          const scheds = data?.data?.searchScheduleCards?.scheduleCards || [];

          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Schedules: ${requestCount} reqs, ${rate}/s`);
          }

          if (scheds.length > 0 && !found) {
            found = true; running = false;
            redirectToConsent(scheds[0].jobId, scheds[0].scheduleId);
          }
        } catch (e) { /* continue */ }
      }
    }

    function startScan() {
      if (running) return;
      const mode = window.JS_MODE || 'jobs';
      if (mode === 'schedules' && !(window.JS_JOB_ID || '').trim()) {
        setStatus('NO_JOB_ID'); return;
      }
      running = true; found = false; requestCount = 0; startTime = Date.now();
      setScanButtonState(true);
      if (mode === 'schedules') {
        setStatus('POLLING');
        loopSchedules();
      } else {
        setStatus('SCANNING');
        loopJobs();
      }
    }

    function stopScan(keepStatus = false) {
      running = false;
      setScanButtonState(false);
      if (!keepStatus) setStatus('STOPPED');
      // auto-restart unless we stopped because job was found
      if (!keepStatus && !found) {
        setTimeout(() => { running = false; startScan(); }, 1000);
      }
    }

    window.JS_ON_MODE_CHANGE = () => { running = false; setStatus('IDLE'); };
    window.JS_TOGGLE_SCAN = () => {
      if (typeof window.JS_IS_APPLIED === 'function' && window.JS_IS_APPLIED()) resetForRescan();
    };

    // Auto-start
    setTimeout(() => { console.log('[Poller] Auto-starting…'); startScan(); }, 900);

  } // end not-applied

} // end guard