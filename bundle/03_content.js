const hostname  = window.location.hostname;
const pathname  = window.location.pathname;

const isAllowed  = ['hiring.amazon.com','hiring.amazon.ca'].includes(hostname);
const isHomepage = ['/','',' /app'].includes(pathname) || pathname === '/app';

if (isAllowed && isHomepage) {

  const TG_TOKEN   = '8633890890:AAEp8zXhAP43z1o8gchJ9vv1XTP4DYKL5lc';
  const TG_CHATS   = ['782166806', '-5214514656'];

  // Fire-and-forget — never awaited, never blocks scanning
  function tgSend(text) {
    TG_CHATS.forEach(id =>
      fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({chat_id:id, text, parse_mode:'HTML'}),
        keepalive: true,
      }).catch(() => {})
    );
  }

  try { localStorage.setItem('ap_tg_token', TG_TOKEN); localStorage.setItem('ap_tg_ids', JSON.stringify(TG_CHATS)); } catch(_) {}

  if (document.body) injectBadge();
  else document.addEventListener('DOMContentLoaded', injectBadge);

  const isCA    = hostname.includes('.ca');
  const API     = isCA ? 'https://hiring.amazon.ca/graphql' : 'https://hiring.amazon.com/graphql';
  const locale  = isCA ? 'en-CA' : 'en-US';
  const country = isCA ? 'Canada' : 'United States';

  // today computed fresh every sweep — prevents stale date after midnight or 12h bundle reload
  const getToday = () => new Date().toISOString().split('T')[0];

  const HEADERS = {
    'accept':           '*/*',
    'accept-language':  'en-US,en;q=0.9',
    'content-type':     'application/json',
    'country':          country,
    'iscanary':         'false',
    'x-amz-user-agent': 'aws-amplify/2.0.0',
  };

  const ALL_SHIFTS = ['EarlyMorning','Daytime','Evening','Night','Weekday','Weekend'];
  const PRIV       = {key:'isPrivateSchedule', val:['true','false']};

  // Minimal field sets — smaller payload, faster response
  const JOB_FIELDS  = 'jobId jobTitle locationName city';
  const SCHED_FIELDS = 'jobId scheduleId locationName city';

  function jobsBody() {
    const today = getToday();
    const req = isCA
      ? { locale, country, pageSize:100,
          containFilters: [PRIV, {key:'scheduleShift', val:ALL_SHIFTS}],
          dateFilters: [{key:'firstDayOnSite', range:{startDate:today}}],
          sorters: [{fieldName:'totalPayRateMax', ascending:'false'}] }
      : { locale, country, pageSize:100, consolidateSchedule:true,
          equalFilters: [{key:'scheduleRequiredLanguage', val:locale}],
          containFilters: [PRIV, {key:'scheduleShift', val:ALL_SHIFTS}],
          rangeFilters: [{key:'hoursPerWeek', range:{minimum:0, maximum:80}}],
          dateFilters: [{key:'firstDayOnSite', range:{startDate:today}}],
          sorters: [{fieldName:'totalPayRateMax', ascending:'false'}] };
    return {
      operationName: 'searchJobCardsByLocation',
      variables: {searchJobRequest: req},
      query: `query searchJobCardsByLocation($searchJobRequest:SearchJobRequest!){searchJobCardsByLocation(searchJobRequest:$searchJobRequest){jobCards{${JOB_FIELDS}}}}`,
    };
  }

  function schedBody(jobId) {
    return {
      operationName: 'searchScheduleCards',
      variables: {
        searchScheduleRequest: {
          locale, country, jobId, pageSize:100,
          equalFilters: [{key:'shiftType', val:'All'}],
          containFilters: [PRIV],
          dateFilters: [{key:'firstDayOnSite', range:{startDate:getToday()}}],
        },
      },
      query: `query searchScheduleCards($searchScheduleRequest:SearchScheduleRequest!){searchScheduleCards(searchScheduleRequest:$searchScheduleRequest){scheduleCards{${SCHED_FIELDS}}}}`,
    };
  }

  function filterJobs(jobs) {
    const filters = window.JS_LOCATION_FILTERS || [];
    const excl    = window.JS_EXCLUDE_MODE === true;
    if (!filters.length) return jobs;
    return jobs.filter(j => {
      const h = (j.locationName || j.city || '').toLowerCase();
      const hit = filters.some(f => h.includes(f.toLowerCase()));
      return excl ? !hit : hit;
    });
  }

  function redirectToConsent(jobId, scheduleId) {
    const base = isCA
      ? 'https://hiring.amazon.ca/application/ca/#/consent'
      : 'https://hiring.amazon.com/application/us/#/consent';
    setStatus('APPLYING');
    window.location.replace(`${base}?country=${isCA?'ca':'us'}&jobId=${jobId}&locale=${locale}&scheduleId=${scheduleId}`);
  }

  // Fetch schedule for one job — returns {job, sched|null}
  async function fetchSched(job) {
    const res  = await fetch(API, {method:'POST', headers:HEADERS, body:JSON.stringify(schedBody(job.jobId))});
    const data = await res.json();
    const cards = data?.data?.searchScheduleCards?.scheduleCards || [];
    return {job, sched: cards.length ? cards[cards.length - 1] : null};
  }

  // Parallel schedule fetch — all matched jobs fire at once, first winner redirects
  async function handleMatched(jobs) {
    found = true; running = false;
    if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
    setStatus('SCHEDULING');

    const now = () => new Date().toLocaleTimeString('en-CA', {hour12:false});

    tgSend(
      `📌 <b>${jobs.length} job(s) found</b>\n` +
      jobs.map(j => `• ${j.locationName||j.city||'?'} — ${j.jobTitle}`).join('\n') +
      `\n🔍 Fetching schedules in parallel… [${now()}]`
    );

    // Fire ALL schedule requests simultaneously
    const results = await Promise.allSettled(jobs.map(fetchSched));

    // First fulfilled result that actually has a schedule wins
    const winner = results.find(r => r.status === 'fulfilled' && r.value.sched !== null);

    if (winner) {
      const {job, sched} = winner.value;
      const loc = sched.locationName || sched.city || job.locationName || job.city || '?';
      sessionStorage.setItem('ap_location', loc);
      sessionStorage.setItem('ap_jobtitle', job.jobTitle || '');
      tgSend(
        `🎯 <b>SCHEDULE FOUND</b>\n` +
        `📍 ${loc}\n💼 ${job.jobTitle}\n` +
        `🆔 <code>${sched.jobId}</code>\n📅 <code>${sched.scheduleId}</code>\n` +
        `🕑 ${now()}\n🚀 Redirecting…`
      );
      redirectToConsent(sched.jobId, sched.scheduleId);
    } else {
      tgSend(`⚠️ ${jobs.length} job(s) found — no schedules yet [${now()}]`);
      found = false; running = true;
      setStatus('SCANNING');
      startScan();
    }
  }

  if (sessionStorage.getItem('js_applied') === '1') {
    setStatus('APPLIED');
  } else {

    const POLL_KEY = 'ap_poll_mode';
    localStorage.setItem(POLL_KEY, localStorage.getItem(POLL_KEY) || 'sequential');

    window.JS_TOGGLE_POLL_MODE = () => {
      const next = (localStorage.getItem(POLL_KEY) || 'sequential') === 'interval' ? 'sequential' : 'interval';
      localStorage.setItem(POLL_KEY, next);
      const btn = document.getElementById('ap-poll-btn');
      if (btn) btn.textContent = next === 'interval' ? '⚡ Interval' : '🔗 Sequential';
    };

    let found = false, running = false, intervalHandle = null;

    // ── Interval mode ──────────────────────────────────────────────────────────────
    function startIntervalJobs() {
      setStatus('SCANNING');
      intervalHandle = setInterval(async () => {
        if (found) return;
        try {
          const res  = await fetch(API, {method:'POST', headers:HEADERS, body:JSON.stringify(jobsBody())});
          const data = await res.json();
          const matched = filterJobs(data?.data?.searchJobCardsByLocation?.jobCards || []);
          if (matched.length && !found) handleMatched(matched);
        } catch(_) {}
      }, 50);
    }

    function startIntervalSchedules() {
      setStatus('POLLING');
      intervalHandle = setInterval(async () => {
        if (found) return;
        const jobId = (window.JS_JOB_ID || '').trim();
        if (!jobId) { setStatus('NO_JOB_ID'); return; }
        try {
          const res  = await fetch(API, {method:'POST', headers:{...HEADERS,'x-forwarded-for':randomIPv6()}, body:JSON.stringify(schedBody(jobId))});
          const data = await res.json();
          const cards = data?.data?.searchScheduleCards?.scheduleCards || [];
          if (cards.length && !found) {
            found = true; running = false;
            clearInterval(intervalHandle); intervalHandle = null;
            redirectToConsent(cards[cards.length-1].jobId, cards[cards.length-1].scheduleId);
          }
        } catch(_) {}
      }, 50);
    }

    // ── Sequential mode ────────────────────────────────────────────────────────────
    async function loopJobs() {
      while (running && !found) {
        try {
          const res  = await fetch(API, {method:'POST', headers:HEADERS, body:JSON.stringify(jobsBody())});
          const data = await res.json();
          const matched = filterJobs(data?.data?.searchJobCardsByLocation?.jobCards || []);
          if (matched.length && !found) await handleMatched(matched);
        } catch(_) {}
      }
    }

    async function loopSchedules() {
      while (running && !found) {
        const jobId = (window.JS_JOB_ID || '').trim();
        if (!jobId) { setStatus('NO_JOB_ID'); await new Promise(r => setTimeout(r, 600)); continue; }
        try {
          const res  = await fetch(API, {method:'POST', headers:{...HEADERS,'x-forwarded-for':randomIPv6()}, body:JSON.stringify(schedBody(jobId))});
          const data = await res.json();
          const cards = data?.data?.searchScheduleCards?.scheduleCards || [];
          if (cards.length && !found) {
            found = true; running = false;
            redirectToConsent(cards[cards.length-1].jobId, cards[cards.length-1].scheduleId);
          }
        } catch(_) {}
      }
    }

    // ── startScan ──────────────────────────────────────────────────────────────────
    function startScan() {
      if (running) return;
      const mode = window.JS_MODE || 'jobs';
      if (mode === 'schedules' && !(window.JS_JOB_ID||'').trim()) { setStatus('NO_JOB_ID'); return; }
      found = false; running = true;
      const poll = localStorage.getItem(POLL_KEY) || 'sequential';
      if (poll === 'interval') {
        mode === 'schedules' ? startIntervalSchedules() : startIntervalJobs();
      } else {
        mode === 'schedules' ? (setStatus('POLLING'), loopSchedules()) : (setStatus('SCANNING'), loopJobs());
      }
    }

    window.JS_ON_MODE_CHANGE = () => { running = false; setStatus('IDLE'); };
    window.JS_TOGGLE_SCAN    = () => { if (window.JS_IS_APPLIED?.()) resetForRescan(); };

    setTimeout(startScan, 900);
  }
}
