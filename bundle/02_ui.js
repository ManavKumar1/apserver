// ui.js — Badge UI with city selector panel

const PRESET_CITIES = [
  // Ontario
  'Brampton', 'Mississauga', 'Etobicoke', 'Concord', 'Oakville', 'Cambridge',
  'Kitchener', 'Hamilton', 'Stony Creek', 'Scarborough', 'Toronto', 'Richmond Hill',
  'Whitby', 'Ajax', 'Bolton', 'St Thomas', 'London', 'Windsor', 'Belleville',
  'Ottawa', 'Barrhaven',
  // Alberta
  'Edmonton', 'Acheson', 'Nisku', 'Calgary', 'Balzac', 'Rocky View County',
  // British Columbia
  'Sidney', 'Delta', 'Burnaby', 'Langley', 'Richmond', 'New Westminster',
  'Pitt Meadows', 'Coquitlam', 'Tsawwassen First Nation',
  // Nova Scotia
  'Dartmouth',
  // Manitoba
  'Winnipeg',
];

const PROVINCE_GROUPS = {
  'Ontario': ['Brampton', 'Mississauga', 'Etobicoke', 'Concord', 'Oakville', 'Cambridge', 'Kitchener', 'Hamilton', 'Stony Creek', 'Scarborough', 'Toronto', 'Richmond Hill', 'Whitby', 'Ajax', 'Bolton', 'St Thomas', 'London', 'Windsor', 'Belleville', 'Ottawa', 'Barrhaven'],
  'Alberta': ['Edmonton', 'Acheson', 'Nisku', 'Calgary', 'Balzac', 'Rocky View County'],
  'British Columbia': ['Sidney', 'Delta', 'Burnaby', 'Langley', 'Richmond', 'New Westminster', 'Pitt Meadows', 'Coquitlam', 'Tsawwassen First Nation'],
  'Nova Scotia': ['Dartmouth'],
  'Manitoba': ['Winnipeg'],
};

const STORAGE_KEY_CITIES = 'ap_selected_cities';
const STORAGE_KEY_MODE = 'ap_mode';
const STORAGE_KEY_JOBID = 'ap_job_id';

const STATUS = {
  SCANNING: { label: 'Scanning Jobs\u2026', color: '#00c853', pulse: true },
  POLLING: { label: 'Polling Schedules\u2026', color: '#00c853', pulse: true },
  SCHEDULING: { label: 'Fetching Schedule\u2026', color: '#ff9100', pulse: true },
  APPLYING: { label: 'Creating Application\u2026', color: '#2979ff', pulse: true },
  QUESTIONS: { label: 'Answering Questions\u2026', color: '#aa00ff', pulse: true },
  APPLIED: { label: 'Job Applied \u2713', color: '#00897b', pulse: false },
  IDLE: { label: 'Idle \u2014 Starting\u2026', color: '#9e9e9e', pulse: false },
  STOPPED: { label: 'Restarting\u2026', color: '#ff9100', pulse: true },
  NO_JOB_ID: { label: 'Enter a Job ID first', color: '#ef5350', pulse: false },
};

window.JS_MODE = 'jobs';
window.JS_CITY_FILTERS = [];
window.JS_CITY_FILTER = '';
window.JS_JOB_ID = '';

function storageSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
}
function storageLoad(key, cb) {
  try { const v = localStorage.getItem(key); cb(v !== null ? JSON.parse(v) : null); }
  catch (e) { cb(null); }
}

// ── Stopwatch ─────────────────────────────────────────────────────────────────
let _swInterval = null, _swSeconds = 0;
function _swFmt(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
function startStopwatch() {
  stopStopwatch(true); _swSeconds = 0;
  const el = document.getElementById('js-stopwatch');
  if (el) { el.textContent = '00:00'; el.style.display = 'inline'; }
  _swInterval = setInterval(() => {
    _swSeconds++;
    const el = document.getElementById('js-stopwatch');
    if (el) el.textContent = _swFmt(_swSeconds);
  }, 1000);
}
function stopStopwatch(reset = false) {
  clearInterval(_swInterval); _swInterval = null;
  if (reset) { _swSeconds = 0; const el = document.getElementById('js-stopwatch'); if (el) { el.textContent = '00:00'; el.style.display = 'none'; } }
}

let badgeEl = null, startBtnEl = null;

function injectBadge() {
  if (badgeEl) return;

  const style = document.createElement('style');
  style.textContent = `
#ap-wrap {
  position:fixed; top:14px; right:14px; z-index:2147483647;
  display:flex; flex-direction:column; align-items:flex-end; gap:6px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; user-select:none;
}
#ap-pill {
  display:flex; align-items:flex-start;
  background:linear-gradient(135deg,rgba(255,255,255,0.6),rgba(255,255,255,0.4));
  backdrop-filter:blur(18px) saturate(160%); -webkit-backdrop-filter:blur(18px) saturate(160%);
  border-radius:18px; padding:12px 10px 12px 14px; gap:10px; width:310px;
  border:1px solid rgba(255,255,255,0.4);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.7),0 6px 25px rgba(0,0,0,0.3);
  cursor:grab;
}
#ap-pill:active{cursor:grabbing;}
#ap-dot{width:8px;height:8px;border-radius:50%;background:#9e9e9e;flex-shrink:0;margin-top:5px;transition:background 0.3s;}
#ap-dot.pulse{animation:apDotPulse 1s ease-in-out infinite;}
@keyframes apDotPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.3;transform:scale(0.7)}}
#ap-body{display:flex;flex-direction:column;flex:1;min-width:0;gap:6px;}
#ap-label{color:rgb(30,30,30);font-size:11.5px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;line-height:1.3;}
#ap-stopwatch{color:rgb(80,80,80);font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;display:none;}

/* mode row */
#ap-mode-row{display:flex;align-items:center;gap:6px;}
#ap-mode-toggle{position:relative;width:36px;height:17px;flex-shrink:0;}
#ap-mode-toggle input{opacity:0;width:0;height:0;}
#ap-mode-slider{position:absolute;inset:0;border-radius:17px;background:#bdbdbd;transition:background 0.25s;cursor:pointer;}
#ap-mode-slider::before{content:'';position:absolute;width:13px;height:13px;border-radius:50%;background:#fff;left:2px;top:2px;transition:transform 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.25);}
#ap-mode-cb:checked+#ap-mode-slider{background:#00c853;}
#ap-mode-cb:checked+#ap-mode-slider::before{transform:translateX(19px);}
#ap-mode-lbl{color:rgb(60,60,60);font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;}

/* selected chips row */
#ap-chips-row{display:flex;flex-wrap:wrap;gap:3px;min-height:14px;}
#ap-chips-row:empty::before{content:'All cities';color:rgb(170,170,170);font-size:9.5px;font-style:italic;line-height:1.6;}
.ap-chip{
  display:inline-flex;align-items:center;gap:2px;
  background:rgba(0,180,70,0.12);border:1px solid rgba(0,180,70,0.35);
  border-radius:20px;padding:1px 7px 1px 8px;
  font-size:9.5px;font-weight:600;color:rgb(0,110,45);white-space:nowrap;
}
.ap-chip-x{cursor:pointer;font-size:11px;opacity:0.5;margin-left:1px;}
.ap-chip-x:hover{opacity:1;}

/* city selector toggle btn */
#ap-city-toggle-btn{
  background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.12);
  border-radius:8px;padding:3px 9px;font-size:10px;font-weight:600;
  color:rgb(60,60,60);cursor:pointer;align-self:flex-start;
}
#ap-city-toggle-btn:hover{background:rgba(0,0,0,0.1);}

/* poll mode btn */
#ap-poll-mode-btn{
  background:rgba(41,121,255,0.1);border:1px solid rgba(41,121,255,0.35);
  border-radius:8px;padding:3px 9px;font-size:10px;font-weight:600;
  color:rgb(20,70,180);cursor:pointer;align-self:flex-start;
}
#ap-poll-mode-btn:hover{background:rgba(41,121,255,0.2);}

/* city panel */
#ap-city-panel{
  display:none;flex-direction:column;gap:0;
  background:white;border:1px solid rgba(0,0,0,0.12);
  border-radius:12px;overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,0.15);
  width:310px;max-height:320px;overflow-y:auto;
}
#ap-city-panel.open{display:flex;}
#ap-city-search{
  position:sticky;top:0;z-index:1;
  padding:8px 10px;border-bottom:1px solid rgba(0,0,0,0.08);background:white;
}
#ap-city-search input{
  width:100%;box-sizing:border-box;
  border:1px solid rgba(0,0,0,0.15);border-radius:8px;
  padding:5px 10px;font-size:11px;font-family:inherit;outline:none;
  caret-color:#00c853;
}
.ap-province-label{
  padding:5px 10px 3px;font-size:9px;font-weight:800;letter-spacing:0.08em;
  text-transform:uppercase;color:rgb(140,140,140);background:rgb(248,248,248);
  border-bottom:1px solid rgba(0,0,0,0.05);
}
.ap-city-item{
  padding:7px 12px;font-size:11px;color:rgb(40,40,40);cursor:pointer;
  display:flex;align-items:center;justify-content:space-between;
  border-bottom:1px solid rgba(0,0,0,0.04);transition:background 0.1s;
}
.ap-city-item:hover{background:rgba(0,200,83,0.07);}
.ap-city-item.selected{color:rgb(0,130,50);font-weight:600;}
.ap-city-item.selected::after{content:'✓';font-size:11px;color:#00c853;}
.ap-city-item.hidden{display:none;}

/* job id row */
#ap-jobid-row{display:none;align-items:center;gap:4px;}
#ap-jobid-prefix{color:rgb(80,80,80);font-size:10px;font-weight:600;white-space:nowrap;}
#ap-jobid-input{
  background:rgba(255,255,255,0.6);border:1px solid rgba(0,0,0,0.15);
  border-radius:8px;outline:none;padding:3px 8px;
  font-size:10.5px;font-family:inherit;color:rgb(40,40,40);width:65px;
}

/* custom city input */
#ap-custom-row{display:flex;gap:4px;margin-top:6px;}
#ap-custom-input{
  flex:1;border:1px solid rgba(0,0,0,0.15);border-radius:8px;
  padding:4px 8px;font-size:10.5px;font-family:inherit;outline:none;
  caret-color:#00c853;
}
#ap-custom-add{
  background:rgba(0,200,83,0.15);border:1px solid rgba(0,200,83,0.4);
  border-radius:8px;padding:4px 8px;font-size:10px;font-weight:700;
  color:rgb(0,110,45);cursor:pointer;white-space:nowrap;
}
#ap-custom-add:hover{background:rgba(0,200,83,0.3);}

/* orb & replay */
#ap-orb{
  width:40px;height:40px;border-radius:50%;flex-shrink:0;margin-top:2px;
  background:linear-gradient(135deg,#00e676,#00c853);border:none;
  display:flex;align-items:center;justify-content:center;pointer-events:none;
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.4),0 3px 10px rgba(0,200,83,0.4);
  transition:background 0.3s,box-shadow 0.3s;
}
#ap-orb .ap-orb-dot{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,0.9);animation:apOrb 1.2s ease-in-out infinite;}
@keyframes apOrb{0%,100%{transform:scale(1);opacity:0.9}50%{transform:scale(0.6);opacity:0.4}}
#ap-replay{
  width:40px;height:40px;border-radius:50%;flex-shrink:0;margin-top:2px;
  background:linear-gradient(135deg,#26c6da,#00acc1);border:none;cursor:pointer;
  display:none;align-items:center;justify-content:center;font-size:19px;color:#fff;
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.4),0 3px 10px rgba(0,172,193,0.4);
}
#ap-replay:hover{filter:brightness(1.1);}
`;
  document.head.appendChild(style);

  const _isCA = window.location.hostname.includes('.ca');
  const _pfx = _isCA ? 'JOB-CA-00000' : 'JOB-US-00000';

  // ── Build DOM ─────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div'); wrap.id = 'ap-wrap';

  // Main pill
  const pill = document.createElement('div'); pill.id = 'ap-pill';
  pill.innerHTML = `
    <span id="ap-dot"></span>
    <div id="ap-body">
      <span id="ap-label">Starting\u2026</span>
      <span id="ap-stopwatch">00:00</span>
      <div id="ap-mode-row">
        <label id="ap-mode-toggle"><input type="checkbox" id="ap-mode-cb"/><span id="ap-mode-slider"></span></label>
        <span id="ap-mode-lbl">Poll Jobs</span>
      </div>
      <div id="ap-chips-row"></div>
      <button id="ap-city-toggle-btn">\u271a Cities</button>
      <button id="ap-poll-mode-btn" title="Toggle polling mode">\u26a1 Interval</button>
      <div id="ap-jobid-row">
        <span id="ap-jobid-prefix">${_pfx}</span>
        <input id="ap-jobid-input" type="text" placeholder="12345"/>
      </div>
    </div>
    <div id="ap-orb"><span class="ap-orb-dot"></span></div>
    <button id="ap-replay">\u27F3</button>
  `;

  // City panel (separate element, below pill)
  const panel = document.createElement('div'); panel.id = 'ap-city-panel';
  panel.innerHTML = `
    <div id="ap-city-search">
      <input id="ap-city-search-input" type="text" placeholder="Search city…" autocomplete="off" spellcheck="false"/>
      <div id="ap-custom-row">
        <input id="ap-custom-input" type="text" placeholder="Type custom city…" autocomplete="off" spellcheck="false"/>
        <button id="ap-custom-add">+ Add</button>
      </div>
    </div>
    <div id="ap-city-list"></div>
  `;

  wrap.appendChild(pill);
  wrap.appendChild(panel);
  document.body.appendChild(wrap);
  badgeEl = pill;
  startBtnEl = document.getElementById('ap-replay');
  startBtnEl.addEventListener('click', () => {
    if (typeof window.JS_TOGGLE_SCAN === 'function') window.JS_TOGGLE_SCAN();
  });

  // ── City selector ─────────────────────────────────────────────────────────────
  let _selected = [];
  const chipsRow = document.getElementById('ap-chips-row');
  const cityList = document.getElementById('ap-city-list');
  const searchInput = document.getElementById('ap-city-search-input');
  const toggleBtn = document.getElementById('ap-city-toggle-btn');

  function syncGlobals() {
    window.JS_CITY_FILTERS = [..._selected];
    window.JS_CITY_FILTER = _selected[0] || '';
    storageSave(STORAGE_KEY_CITIES, _selected);
  }

  function renderChips() {
    chipsRow.innerHTML = '';
    _selected.forEach(city => {
      const chip = document.createElement('span');
      chip.className = 'ap-chip';
      chip.innerHTML = `${city}<span class="ap-chip-x" data-city="${city}">\u00d7</span>`;
      chip.querySelector('.ap-chip-x').addEventListener('click', (e) => {
        e.stopPropagation();
        _selected = _selected.filter(c => c !== city);
        renderChips(); updateCityList(); syncGlobals();
      });
      chipsRow.appendChild(chip);
    });
  }

  function buildCityList() {
    cityList.innerHTML = '';
    Object.entries(PROVINCE_GROUPS).forEach(([province, cities]) => {
      const lbl = document.createElement('div');
      lbl.className = 'ap-province-label'; lbl.textContent = province;
      cityList.appendChild(lbl);
      cities.forEach(city => {
        const item = document.createElement('div');
        item.className = 'ap-city-item';
        item.textContent = city;
        item.dataset.city = city;
        if (_selected.includes(city)) item.classList.add('selected');
        item.addEventListener('click', () => {
          if (_selected.includes(city)) {
            _selected = _selected.filter(c => c !== city);
            item.classList.remove('selected');
          } else {
            _selected.push(city);
            item.classList.add('selected');
          }
          renderChips(); syncGlobals();
        });
        cityList.appendChild(item);
      });
    });
  }

  function updateCityList() {
    cityList.querySelectorAll('.ap-city-item').forEach(item => {
      item.classList.toggle('selected', _selected.includes(item.dataset.city));
    });
  }

  function filterCityList(q) {
    const query = q.toLowerCase();
    let lastProvince = null;
    cityList.childNodes.forEach(node => {
      if (node.classList?.contains('ap-province-label')) {
        lastProvince = node; return;
      }
      if (node.classList?.contains('ap-city-item')) {
        const match = !query || node.dataset.city.toLowerCase().includes(query);
        node.classList.toggle('hidden', !match);
      }
    });
    // hide province labels with no visible children
    cityList.querySelectorAll('.ap-province-label').forEach(lbl => {
      let sib = lbl.nextSibling; let anyVisible = false;
      while (sib && !sib.classList?.contains('ap-province-label')) {
        if (!sib.classList?.contains('hidden')) anyVisible = true;
        sib = sib.nextSibling;
      }
      lbl.style.display = anyVisible ? '' : 'none';
    });
  }

  // Poll mode toggle button
  const pollModeBtn = document.getElementById('ap-poll-mode-btn');
  if (pollModeBtn) {
    // Init label from saved state
   const saved = localStorage.getItem('ap_poll_mode') || 'sequential';
    pollModeBtn.textContent = saved === 'interval' ? '\u26a1 Interval' : '\uD83D\uDD17 Sequential';
    pollModeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.JS_TOGGLE_POLL_MODE === 'function') window.JS_TOGGLE_POLL_MODE();
      // update label
      const mode = localStorage.getItem('ap_poll_mode') || 'interval';
      pollModeBtn.textContent = mode === 'interval' ? '\u26a1 Interval' : '\uD83D\uDD17 Sequential';
    });
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) searchInput.focus();
  });

  searchInput.addEventListener('input', () => filterCityList(searchInput.value));

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== toggleBtn) {
      panel.classList.remove('open');
    }
  });

  // Custom city add
  const customInput = document.getElementById('ap-custom-input');
  const customAdd = document.getElementById('ap-custom-add');
  function addCustomCity() {
    const city = customInput.value.trim();
    if (!city || _selected.includes(city)) { customInput.value = ''; return; }
    _selected.push(city);
    // add to list UI dynamically
    const item = document.createElement('div');
    item.className = 'ap-city-item selected';
    item.textContent = city;
    item.dataset.city = city;
    item.addEventListener('click', () => {
      if (_selected.includes(city)) {
        _selected = _selected.filter(c => c !== city);
        item.classList.remove('selected');
      } else {
        _selected.push(city);
        item.classList.add('selected');
      }
      renderChips(); syncGlobals();
    });
    // insert under a "Custom" label (create once)
    let customGroup = document.getElementById('ap-custom-group');
    if (!customGroup) {
      customGroup = document.createElement('div');
      customGroup.id = 'ap-custom-group';
      const lbl = document.createElement('div');
      lbl.className = 'ap-province-label'; lbl.textContent = 'Custom';
      customGroup.appendChild(lbl);
      cityList.appendChild(customGroup);
    }
    customGroup.appendChild(item);
    renderChips(); syncGlobals();
    customInput.value = '';
  }
  customAdd.addEventListener('click', addCustomCity);
  customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCity(); } });

  // Load saved cities, then build list
  storageLoad(STORAGE_KEY_CITIES, (saved) => {
    _selected = Array.isArray(saved) ? saved : [];
    buildCityList();
    renderChips();
    syncGlobals();
  });

  // ── Job ID ────────────────────────────────────────────────────────────────────
  const jobidRow = document.getElementById('ap-jobid-row');
  const jobidInput = document.getElementById('ap-jobid-input');
  jobidInput.addEventListener('input', () => {
    const d = jobidInput.value.replace(/\D/g, '');
    jobidInput.value = d;
    window.JS_JOB_ID = d ? _pfx + d : '';
    storageSave(STORAGE_KEY_JOBID, d);
  });
  storageLoad(STORAGE_KEY_JOBID, (saved) => {
    if (saved) { jobidInput.value = saved; window.JS_JOB_ID = _pfx + saved; }
  });

  // ── Mode toggle ───────────────────────────────────────────────────────────────
  const modeCb = document.getElementById('ap-mode-cb');
  const modeLbl = document.getElementById('ap-mode-lbl');
  const citySection = [chipsRow, toggleBtn];

  function applyMode(isSchedule) {
    window.JS_MODE = isSchedule ? 'schedules' : 'jobs';
    modeLbl.textContent = isSchedule ? 'Poll Schedules' : 'Poll Jobs';
    citySection.forEach(el => el.style.display = isSchedule ? 'none' : '');
    jobidRow.style.display = isSchedule ? 'flex' : 'none';
    if (!isSchedule) panel.classList.remove('open');
    storageSave(STORAGE_KEY_MODE, window.JS_MODE);
  }

  modeCb.addEventListener('change', () => {
    applyMode(modeCb.checked);
    if (typeof window.JS_ON_MODE_CHANGE === 'function') window.JS_ON_MODE_CHANGE();
  });

  storageLoad(STORAGE_KEY_MODE, (saved) => {
    const isSched = saved === 'schedules';
    modeCb.checked = isSched; applyMode(isSched);
  });

  // ── Drag ──────────────────────────────────────────────────────────────────────
  let dragging = false, dragOffX = 0, dragOffY = 0;
  pill.addEventListener('mousedown', (e) => {
    if (e.target.closest('input,button,label,.ap-chip-x')) return;
    dragging = true;
    const rect = wrap.getBoundingClientRect();
    dragOffX = e.clientX - rect.left; dragOffY = e.clientY - rect.top;
    wrap.style.right = 'auto'; wrap.style.bottom = 'auto';
    wrap.style.left = rect.left + 'px'; wrap.style.top = rect.top + 'px';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    wrap.style.left = (e.clientX - dragOffX) + 'px'; wrap.style.top = (e.clientY - dragOffY) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  setStatus('IDLE');
}

// ── setStatus ─────────────────────────────────────────────────────────────────
function setStatus(key) {
  const cfg = STATUS[key] || STATUS.IDLE;
  const dot = document.getElementById('ap-dot');
  const lbl = document.getElementById('ap-label');
  const orb = document.getElementById('ap-orb');
  if (!dot || !lbl) return;
  dot.style.background = cfg.color;
  dot.className = cfg.pulse ? 'pulse' : '';
  lbl.textContent = cfg.label;
  if (orb) {
    orb.style.background = `linear-gradient(135deg,${cfg.color}cc,${cfg.color})`;
    orb.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.4),0 3px 10px ${cfg.color}55`;
    const d = orb.querySelector('.ap-orb-dot');
    if (d) d.style.animationPlayState = cfg.pulse ? 'running' : 'paused';
  }
  if (key === 'SCANNING' || key === 'POLLING') startStopwatch();
  else if (['IDLE', 'NO_JOB_ID'].includes(key)) stopStopwatch(true);
  else stopStopwatch(false);
  if (key === 'QUESTIONS' && !setStatus._beeped) {
    setStatus._beeped = true;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[880, 0], [880, 0.18]].forEach(([f, d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'square';
        o.frequency.setValueAtTime(f, ctx.currentTime + d);
        g.gain.setValueAtTime(0, ctx.currentTime + d);
        g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.14);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.18);
      });
    } catch (e) { }
  }
  if (key === 'APPLIED') {
    if (orb) orb.style.display = 'none';
    if (startBtnEl) startBtnEl.style.display = 'flex';
  } else {
    if (orb) orb.style.display = 'flex';
    if (startBtnEl) startBtnEl.style.display = 'none';
  }
}

function setScanButtonState(_) { }

function resetForRescan() {
  sessionStorage.removeItem('js_applied');
  stopStopwatch(true); setStatus._beeped = false;
  const isCA = window.location.hostname.includes('.ca');
  window.location.href = isCA ? 'https://hiring.amazon.ca/' : 'https://hiring.amazon.com/';
}

window.JS_IS_APPLIED = () => startBtnEl && startBtnEl.style.display === 'flex';
