// content.js — Poller
// Polling modes: 'interval' (setInterval 50ms) | 'sequential' (chained async)
// Mode persists across reloads via localStorage

console.log('[ApplyPilot] Bundle executing…', window.location.href);

// const API_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';

const API_URL =  'https://hiring.amazon.com/graphql':

// ── Telegram config ───────────────────────────────────────────────────────────
const TG_BOT_TOKEN = '8633890890:AAEp8zXhAP43z1o8gchJ9vv1XTP4DYKL5lc';
const TG_CHAT_IDS = ['782166806', '-5214514656'];

function tgPersistConfig() {
  try {
    localStorage.setItem('ap_tg_token', TG_BOT_TOKEN);
    localStorage.setItem('ap_tg_ids', JSON.stringify(TG_CHAT_IDS));
  } catch (e) { }
}

// fire and forget — no async, no await, keepalive survives page navigation
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

const hostname = window.location.hostname;
const pathname = window.location.pathname;
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

  // ── Polling mode — persists across reloads ────────────────────────────────────
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
    let intervalHandle = null;

    // ── Query builders ────────────────────────────────────────────────────────────
    const getJobsBody = () => ({
      query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
          jobCards { jobId jobTitle locationName jobType }
        }
      }`,
      variables: {
        searchJobRequest: {
          locale,
          country,
          keyWords: "",
          equalFilters: [{ key: "scheduleRequiredLanguage", val: "en-CA" }],
          containFilters: [{ key: "isPrivateSchedule", val: ["false", "true"] }],
          rangeFilters: [{ key: "hoursPerWeek", range: { minimum: 0, maximum: 80 } }],
          orFilters: [],
          sorters: [{ fieldName: 'totalPayRateMax', ascending: 'false' }],
          pageSize: 40,
          consolidateSchedule: true
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
          scheduleCards { jobId scheduleId locationName }
        }
      }`,
    });

    const getScheduleBodyForId = (jobId) => ({
      operationName: 'searchScheduleCards',
      variables: {
        searchScheduleRequest: {
          locale,
          country,
          keyWords: "",
          equalFilters: [],
          containFilters: [{ key: "isPrivateSchedule", val: ["false"] }],
          rangeFilters: [{ key: "hoursPerWeek", range: { minimum: 0, maximum: 80 } }],
          orFilters: [],
          sorters: [{ fieldName: "totalPayRateMax", ascending: false }],
          pageSize: 15,
          jobId,
          consolidateSchedule: true
        }
      },
      query: `query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
        searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
          scheduleCards { jobId scheduleId locationName }
        }
      }`,
    });

    // ── Location key — locationName only, city/state dropped entirely ─────────────
    function buildLocKey(job) {
      return (job.locationName || '').trim();
    }

    // ── Filters ───────────────────────────────────────────────────────────────────
    // JS_LOC_FILTERS : string[]  e.g. ['Brampton, ON', 'Sidney, BC']
    // JS_LOC_MODE    : 'include' | 'exclude'
    // Matched as a case-insensitive substring of job.locationName.
    //
    // JS_JT_FILTERS  : string[]  e.g. ['FULL_TIME', 'PART_TIME']
    // JS_JT_MODE     : 'include' | 'exclude'
    // jobType is semicolon-delimited ("FULL_TIME;REDUCED_TIME"); hit if ANY token matches.
    function filterJobs(jobCards) {
      // ── Location filter ──────────────────────────────────────────────────────
      const locFilters = Array.isArray(window.JS_LOC_FILTERS) ? window.JS_LOC_FILTERS : [];
      const locMode    = window.JS_LOC_MODE || 'include';

      let results = jobCards;

      if (locFilters.length > 0) {
        results = results.filter(job => {
          const key = buildLocKey(job).toLowerCase();
          const hit = locFilters.some(f => key.includes(f.toLowerCase()));
          return locMode === 'exclude' ? !hit : hit;
        });
      }

      // ── Job Type filter ──────────────────────────────────────────────────────
      const jtFilters = Array.isArray(window.JS_JT_FILTERS) ? window.JS_JT_FILTERS : [];
      const jtMode    = window.JS_JT_MODE || 'include';

      if (jtFilters.length > 0) {
        results = results.filter(job => {
          const types = (job.jobType || '').split(';').map(t => t.trim()).filter(Boolean);
          const hit   = types.some(t => jtFilters.includes(t));
          return jtMode === 'exclude' ? !hit : hit;
        });
      }

      return results;
    }

    // ── Shared: handle a matched job → fetch schedule → redirect ─────────────────
    async function handleJobMatch(job) {
      found = true; running = false;
      if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
      setStatus('SCHEDULING');
      try {
        const sr = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getScheduleBodyForJob(job)) });
        const sd = await sr.json();
        const scheds = sd?.data?.searchScheduleCards?.scheduleCards || [];
        const locationFound = scheds[0]?.locationName || job.locationName || 'Unknown';
        const now = new Date().toLocaleTimeString('en-CA', { hour12: false });

        tgSend(
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '📌  JOB CAUGHT\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '📍  Location   : <b>' + buildLocKey(job) + '</b>\n' +
          '💼  Job        : ' + job.jobTitle + '\n' +
          '🆔  Job ID     : <code>' + job.jobId + '</code>\n' +
          '🕑  Time       : ' + now + '\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '🔍  Fetching schedule...'
        );

        if (scheds.length > 0) {
          const sched = scheds[0];
          sessionStorage.setItem('ap_city', locationFound);
          sessionStorage.setItem('ap_jobtitle', job.jobTitle || '');

          tgSend(
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '🎯  JOB + SCHEDULE FOUND\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '📍  Location   : <b>' + buildLocKey(job) + '</b>\n' +
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
            '📍  Location   : <b>' + buildLocKey(job) + '</b>\n' +
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

    // ── INTERVAL mode ─────────────────────────────────────────────────────────────
    function startIntervalJobs() {
      setStatus('SCANNING');
      intervalHandle = setInterval(async () => {
        if (found) return;
        try {
          requestCount++;
          const res = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getJobsBody()) });
          const data = await res.json();
          const all = data?.data?.searchJobCardsByLocation?.jobCards || [];
          const matched = filterJobs(all);
          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Interval Jobs: ${requestCount} reqs, ${rate}/s`);
          }
          if (matched.length > 0 && !found) handleJobMatch(matched[0]);
        } catch (e) { }
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
          const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(getScheduleBodyForId(jobId)) });
          const data = await res.json();
          const scheds = data?.data?.searchScheduleCards?.scheduleCards || [];
          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Interval Schedules: ${requestCount} reqs, ${rate}/s`);
          }
          if (scheds.length > 0 && !found) {
            found = true; running = false;
            clearInterval(intervalHandle); intervalHandle = null;
            redirectToConsent(scheds[0].jobId, scheds[0].scheduleId);
          }
        } catch (e) { }
      }, 50);
    }

    // ── SEQUENTIAL mode ───────────────────────────────────────────────────────────
    async function loopJobsSequential() {
      while (running && !found) {
        try {
          requestCount++;
          const res = await fetch(API_URL, { method: 'POST', headers: baseHeaders, body: JSON.stringify(getJobsBody()) });
          const data = await res.json();
          const all = data?.data?.searchJobCardsByLocation?.jobCards || [];
          const matched = filterJobs(all);
          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Sequential Jobs: ${requestCount} reqs, ${rate}/s`);
          }
          if (matched.length > 0 && !found) await handleJobMatch(matched[0]);
        } catch (e) { }
      }
    }

    async function loopSchedulesSequential() {
      while (running && !found) {
        const jobId = (window.JS_JOB_ID || '').trim();
        if (!jobId) { setStatus('NO_JOB_ID'); await new Promise(r => setTimeout(r, 600)); continue; }
        const headers = { ...baseHeaders, 'X-Original-URL': randomIPv6(), 'x-forwarded-for': randomIPv6() };
        try {
          requestCount++;
          const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(getScheduleBodyForId(jobId)) });
          const data = await res.json();
          const scheds = data?.data?.searchScheduleCards?.scheduleCards || [];
          if (requestCount % 20 === 0) {
            const rate = (requestCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[Poller] Sequential Schedules: ${requestCount} reqs, ${rate}/s`);
          }
          if (scheds.length > 0 && !found) {
            found = true; running = false;
            redirectToConsent(scheds[0].jobId, scheds[0].scheduleId);
          }
        } catch (e) { }
      }
    }

    // ── startScan ─────────────────────────────────────────────────────────────────
    function startScan() {
      if (running) return;
      const mode = window.JS_MODE || 'jobs';
      if (mode === 'schedules' && !(window.JS_JOB_ID || '').trim()) {
        setStatus('NO_JOB_ID'); return;
      }
      running = true; found = false; requestCount = 0; startTime = Date.now();
      setScanButtonState(true);
      const currentPollMode = localStorage.getItem(POLL_MODE_KEY) || 'sequential';
      console.log('[Poller] Starting in mode:', currentPollMode, '| scan:', mode);
      if (currentPollMode === 'interval') {
        mode === 'schedules' ? startIntervalSchedules() : startIntervalJobs();
      } else {
        if (mode === 'schedules') { setStatus('POLLING'); loopSchedulesSequential(); }
        else { setStatus('SCANNING'); loopJobsSequential(); }
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
