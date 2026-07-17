// ui.js — Badge UI with location + job type selector panels
const AP_VERSION = '2.0.52';

const LOCATIONS = [
  // Ontario
  'Brampton, ON', 'Mississauga, ON', 'Etobicoke, ON', 'Concord, ON', 'Oakville, ON',
  'Cambridge, ON', 'Kitchener, ON', 'Hamilton, ON', 'Stony Creek, ON', 'Scarborough, ON',
  'Toronto, ON', 'Richmond Hill, ON', 'Whitby, ON', 'Ajax, ON', 'Bolton, ON',
  'St Thomas, ON', 'London, ON', 'Windsor, ON', 'Belleville, ON', 'Ottawa, ON', 'Barrhaven, ON',
  // Alberta
  'Edmonton, AB', 'Acheson, AB', 'Nisku, AB', 'Calgary, AB', 'Balzac, AB', 'Rocky View County, AB',
  // British Columbia
  'Sidney, BC', 'Delta, BC', 'Burnaby, BC', 'Langley, BC', 'Richmond, BC',
  'New Westminster, BC', 'Pitt Meadows, BC', 'Coquitlam, BC', 'Tsawwassen First Nation, BC',
  // Nova Scotia
  'Dartmouth, NS',
  // Manitoba
  'Winnipeg, MB',
];

const PROVINCE_GROUPS = {
  'Ontario': LOCATIONS.filter(l => l.endsWith(', ON')),
  'Alberta': LOCATIONS.filter(l => l.endsWith(', AB')),
  'British Columbia': LOCATIONS.filter(l => l.endsWith(', BC')),
  'Nova Scotia': LOCATIONS.filter(l => l.endsWith(', NS')),
  'Manitoba': LOCATIONS.filter(l => l.endsWith(', MB')),
};

// ── Job Type definitions ──────────────────────────────────────────────────────
// Keys match what the API returns inside the semicolon-delimited jobType field.
const JOB_TYPES = [
  { key: 'FULL_TIME',    label: 'Full Time' },
  { key: 'PART_TIME',    label: 'Part Time' },
  { key: 'REDUCED_TIME', label: 'Reduced Time' },
  { key: 'FLEX_TIME',    label: 'Flex Time' },
];

const STORAGE_KEY_LOCS      = 'ap_selected_locs';
const STORAGE_KEY_LOCMODE   = 'ap_loc_mode';    // 'include' | 'exclude'
const STORAGE_KEY_JOBTYPES  = 'ap_selected_job_types';
const STORAGE_KEY_JTMODE    = 'ap_jt_mode';     // 'include' | 'exclude'
const STORAGE_KEY_MODE      = 'ap_mode';
const STORAGE_KEY_JOBID     = 'ap_job_id';

const STATUS = {
  SCANNING:   { label: 'Scanning Jobs\u2026',         color: '#00c853', pulse: true  },
  POLLING:    { label: 'Polling Schedules\u2026',     color: '#00c853', pulse: true  },
  SCHEDULING: { label: 'Fetching Schedule\u2026',     color: '#ff9100', pulse: true  },
  APPLYING:   { label: 'Creating Application\u2026',  color: '#2979ff', pulse: true  },
  QUESTIONS:  { label: 'Answering Questions\u2026',   color: '#aa00ff', pulse: true  },
  APPLIED:    { label: 'Job Applied \u2713',           color: '#00897b', pulse: false },
  IDLE:       { label: 'Idle \u2014 Starting\u2026',  color: '#9e9e9e', pulse: false },
  STOPPED:    { label: 'Restarting\u2026',            color: '#ff9100', pulse: true  },
  NO_JOB_ID:  { label: 'Enter a Job ID first',        color: '#ef5350', pulse: false },
};

// Globals read by content.js
window.JS_MODE         = 'jobs';
window.JS_LOC_FILTERS  = [];        // selected location strings
window.JS_LOC_MODE     = 'include'; // 'include' | 'exclude'
window.JS_JT_FILTERS   = [];        // selected job-type keys  e.g. ['FULL_TIME']
window.JS_JT_MODE      = 'include'; // 'include' | 'exclude'
window.JS_JOB_ID       = '';

// Legacy aliases
window.JS_CITY_FILTERS = [];
window.JS_CITY_FILTER  = '';

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
  if (reset) {
    _swSeconds = 0;
    const el = document.getElementById('js-stopwatch');
    if (el) { el.textContent = '00:00'; el.style.display = 'none'; }
  }
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
  border-radius:18px; padding:12px 10px 12px 14px; gap:10px; width:320px;
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
#ap-version{color:rgb(180,180,180);font-size:9px;font-weight:600;letter-spacing:0.04em;}
#ap-stopwatch{color:rgb(80,80,80);font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;display:none;}
#ap-expiry{font-size:9.5px;font-weight:600;color:rgb(130,130,130);display:none;}
#ap-expiry.on{display:block;}
#ap-expiry.warn{color:rgb(200,80,0);}
#ap-lock-view{display:none;flex-direction:column;align-items:center;gap:10px;padding:8px 0 4px;text-align:center;width:100%;}
#ap-lock-view.on{display:flex;}
#ap-lock-icon{font-size:32px;line-height:1;}
#ap-lock-title{font-size:11.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:rgb(40,40,40);}
#ap-lock-msg{font-size:10px;line-height:1.5;color:rgb(90,90,90);}

/* scan mode row */
#ap-mode-row{display:flex;align-items:center;gap:6px;}
#ap-mode-toggle{position:relative;width:36px;height:17px;flex-shrink:0;}
#ap-mode-toggle input{opacity:0;width:0;height:0;}
#ap-mode-slider{position:absolute;inset:0;border-radius:17px;background:#bdbdbd;transition:background 0.25s;cursor:pointer;}
#ap-mode-slider::before{content:'';position:absolute;width:13px;height:13px;border-radius:50%;background:#fff;left:2px;top:2px;transition:transform 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.25);}
#ap-mode-cb:checked+#ap-mode-slider{background:#00c853;}
#ap-mode-cb:checked+#ap-mode-slider::before{transform:translateX(19px);}
#ap-mode-lbl{color:rgb(60,60,60);font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;}

/* shared chips row */
.ap-chips-row{display:flex;flex-wrap:wrap;gap:3px;min-height:14px;}
.ap-chips-row:empty::before{
  content:attr(data-empty-label);
  color:rgb(170,170,170);font-size:9.5px;font-style:italic;line-height:1.6;
}
.ap-chip{
  display:inline-flex;align-items:center;gap:2px;
  border-radius:20px;padding:1px 7px 1px 8px;
  font-size:9.5px;font-weight:600;white-space:nowrap;
}
.ap-chip.inc{background:rgba(0,180,70,0.12);border:1px solid rgba(0,180,70,0.35);color:rgb(0,110,45);}
.ap-chip.exc{background:rgba(239,83,80,0.10);border:1px solid rgba(239,83,80,0.35);color:rgb(180,30,30);}
.ap-chip-x{cursor:pointer;font-size:11px;opacity:0.5;margin-left:1px;}
.ap-chip-x:hover{opacity:1;}

/* shared ctrl row */
.ap-ctrl-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}

/* location toggle btn */
#ap-loc-toggle-btn,#ap-jt-toggle-btn{
  background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.12);
  border-radius:8px;padding:3px 9px;font-size:10px;font-weight:600;
  color:rgb(60,60,60);cursor:pointer;
}
#ap-loc-toggle-btn:hover,#ap-jt-toggle-btn:hover{background:rgba(0,0,0,0.1);}

/* include/exclude toggle — shared class .ap-inc-exc-btn */
.ap-inc-exc-btn{
  border-radius:8px;padding:3px 9px;font-size:10px;font-weight:700;
  cursor:pointer;transition:background 0.2s,color 0.2s,border-color 0.2s;
}
.ap-inc-exc-btn.inc{
  background:rgba(0,200,83,0.12);border:1px solid rgba(0,200,83,0.4);color:rgb(0,110,45);
}
.ap-inc-exc-btn.exc{
  background:rgba(239,83,80,0.10);border:1px solid rgba(239,83,80,0.4);color:rgb(180,30,30);
}
.ap-inc-exc-btn:hover{filter:brightness(0.93);}

/* poll mode btn */
#ap-poll-mode-btn{
  background:rgba(41,121,255,0.1);border:1px solid rgba(41,121,255,0.35);
  border-radius:8px;padding:3px 9px;font-size:10px;font-weight:600;
  color:rgb(20,70,180);cursor:pointer;
}
#ap-poll-mode-btn:hover{background:rgba(41,121,255,0.2);}

/* ── shared panel base ─────────────────────────────────────────────────────── */
.ap-panel{
  display:none;flex-direction:column;
  background:white;border:1px solid rgba(0,0,0,0.12);
  border-radius:12px;overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,0.15);
  width:320px;
}
.ap-panel.open{display:flex;}

/* location panel */
#ap-loc-panel{max-height:320px;overflow-y:auto;}
#ap-loc-search-wrap{
  position:sticky;top:0;z-index:1;
  padding:8px 10px;border-bottom:1px solid rgba(0,0,0,0.08);background:white;
  display:flex;flex-direction:column;gap:5px;
}
#ap-loc-search-input{
  width:100%;box-sizing:border-box;
  border:1px solid rgba(0,0,0,0.15);border-radius:8px;
  padding:5px 10px;font-size:11px;font-family:inherit;outline:none;
  caret-color:#00c853;
}
#ap-custom-row{display:flex;gap:4px;}
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
.ap-province-label{
  padding:5px 10px 3px;font-size:9px;font-weight:800;letter-spacing:0.08em;
  text-transform:uppercase;color:rgb(140,140,140);background:rgb(248,248,248);
  border-bottom:1px solid rgba(0,0,0,0.05);
}
.ap-loc-item{
  padding:7px 12px;font-size:11px;color:rgb(40,40,40);cursor:pointer;
  display:flex;align-items:center;justify-content:space-between;
  border-bottom:1px solid rgba(0,0,0,0.04);transition:background 0.1s;
}
.ap-loc-item:hover{background:rgba(0,200,83,0.07);}
.ap-loc-item.selected.inc{color:rgb(0,130,50);font-weight:600;}
.ap-loc-item.selected.inc::after{content:'✓';font-size:11px;color:#00c853;}
.ap-loc-item.selected.exc{color:rgb(180,30,30);font-weight:600;}
.ap-loc-item.selected.exc::after{content:'✕';font-size:11px;color:#ef5350;}
.ap-loc-item.hidden{display:none;}

/* ── job type panel ─────────────────────────────────────────────────────────── */
#ap-jt-panel{padding:8px 10px;gap:4px;}
.ap-jt-item{
  padding:7px 12px;font-size:11px;color:rgb(40,40,40);cursor:pointer;
  display:flex;align-items:center;justify-content:space-between;
  border:1px solid rgba(0,0,0,0.07);border-radius:8px;transition:background 0.1s;
}
.ap-jt-item:hover{background:rgba(0,200,83,0.07);}
.ap-jt-item.selected.inc{color:rgb(0,130,50);font-weight:600;background:rgba(0,200,83,0.08);border-color:rgba(0,200,83,0.3);}
.ap-jt-item.selected.inc::after{content:'✓';font-size:11px;color:#00c853;}
.ap-jt-item.selected.exc{color:rgb(180,30,30);font-weight:600;background:rgba(239,83,80,0.07);border-color:rgba(239,83,80,0.3);}
.ap-jt-item.selected.exc::after{content:'✕';font-size:11px;color:#ef5350;}
#ap-jt-select-all{
  margin-top:2px;padding:4px 0;font-size:9.5px;font-weight:700;color:rgb(100,100,100);
  text-align:center;cursor:pointer;letter-spacing:0.04em;
}
#ap-jt-select-all:hover{color:rgb(0,130,50);}

/* job id row */
#ap-jobid-row{display:none;align-items:center;gap:4px;}
#ap-jobid-prefix{color:rgb(80,80,80);font-size:10px;font-weight:600;white-space:nowrap;}
#ap-jobid-input{
  background:rgba(255,255,255,0.6);border:1px solid rgba(0,0,0,0.15);
  border-radius:8px;outline:none;padding:3px 8px;
  font-size:10.5px;font-family:inherit;color:rgb(40,40,40);width:65px;
}

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
  const _pfx  = _isCA ? 'JOB-CA-00000' : 'JOB-US-00000';

  // ── Build DOM ─────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div'); wrap.id = 'ap-wrap';

  const pill = document.createElement('div'); pill.id = 'ap-pill';
  pill.innerHTML = `
    <span id="ap-dot"></span>
    <div id="ap-body">
      <span id="ap-label">Starting\u2026</span>
      <span id="ap-version">v${AP_VERSION}</span>
      <span id="ap-expiry"></span>
      <span id="ap-stopwatch">00:00</span>

      <div id="ap-lock-view">
        <div id="ap-lock-icon"></div>
        <div id="ap-lock-title"></div>
        <div id="ap-lock-msg"></div>
      </div>

      <div id="ap-normal-view">
        <div id="ap-mode-row">
          <label id="ap-mode-toggle"><input type="checkbox" id="ap-mode-cb"/><span id="ap-mode-slider"></span></label>
          <span id="ap-mode-lbl">Poll Jobs</span>
        </div>

        <div id="ap-loc-chips-row" class="ap-chips-row" data-empty-label="All locations"></div>
        <div id="ap-loc-ctrl-row" class="ap-ctrl-row">
          <button id="ap-loc-toggle-btn">\u271a Locations</button>
          <button id="ap-loc-inc-exc-btn" class="ap-inc-exc-btn inc">Include</button>
          <button id="ap-poll-mode-btn" title="Toggle polling mode">\uD83D\uDD17 Sequential</button>
        </div>

        <div id="ap-jt-chips-row" class="ap-chips-row" data-empty-label="All job types"></div>
        <div id="ap-jt-ctrl-row" class="ap-ctrl-row">
          <button id="ap-jt-toggle-btn">\u2714 Job Type</button>
          <button id="ap-jt-inc-exc-btn" class="ap-inc-exc-btn inc">Include</button>
        </div>

        <div id="ap-jobid-row">
          <span id="ap-jobid-prefix">${_pfx}</span>
          <input id="ap-jobid-input" type="text" placeholder="12345"/>
        </div>
      </div>
    </div>
    <div id="ap-orb"><span class="ap-orb-dot"></span></div>
    <button id="ap-replay">\u27F3</button>
  `;

  // Location panel
  const locPanel = document.createElement('div');
  locPanel.id = 'ap-loc-panel';
  locPanel.className = 'ap-panel';
  locPanel.innerHTML = `
    <div id="ap-loc-search-wrap">
      <input id="ap-loc-search-input" type="text" placeholder="Search location\u2026" autocomplete="off" spellcheck="false"/>
      <div id="ap-custom-row">
        <input id="ap-custom-input" type="text" placeholder="Custom location, e.g. Barrie, ON" autocomplete="off" spellcheck="false"/>
        <button id="ap-custom-add">+ Add</button>
      </div>
    </div>
    <div id="ap-loc-list"></div>
  `;

  // Job Type panel
  const jtPanel = document.createElement('div');
  jtPanel.id = 'ap-jt-panel';
  jtPanel.className = 'ap-panel';
  // items built dynamically below

  wrap.appendChild(pill);
  wrap.appendChild(locPanel);
  wrap.appendChild(jtPanel);
  document.body.appendChild(wrap);
  badgeEl    = pill;
  startBtnEl = document.getElementById('ap-replay');
  startBtnEl.addEventListener('click', () => {
    if (typeof window.JS_TOGGLE_SCAN === 'function') window.JS_TOGGLE_SCAN();
  });

  // ══════════════════════════════════════════════════════════════════════════════
  //  LOCATION FILTER
  // ══════════════════════════════════════════════════════════════════════════════
  let _locSelected = [];
  let _locMode     = 'include';

  const locChipsRow   = document.getElementById('ap-loc-chips-row');
  const locList       = document.getElementById('ap-loc-list');
  const locSearchInput = document.getElementById('ap-loc-search-input');
  const locToggleBtn  = document.getElementById('ap-loc-toggle-btn');
  const locIncExcBtn  = document.getElementById('ap-loc-inc-exc-btn');

  function syncGlobals() {
    window.JS_LOC_FILTERS = [..._locSelected];
    window.JS_LOC_MODE    = _locMode;
    window.JS_JT_FILTERS  = [..._jtSelected];
    window.JS_JT_MODE     = _jtMode;
    window.JS_CITY_FILTERS = [];
    window.JS_CITY_FILTER  = '';
    if (_initializing) return;
    storageSave(STORAGE_KEY_LOCS,     _locSelected);
    storageSave(STORAGE_KEY_LOCMODE,  _locMode);
    storageSave(STORAGE_KEY_JOBTYPES, _jtSelected);
    storageSave(STORAGE_KEY_JTMODE,   _jtMode);
  }

  // chips
  function renderLocChips() {
    locChipsRow.innerHTML = '';
    locChipsRow.dataset.emptyLabel = _locMode === 'include' ? 'All locations' : 'No exclusions';
    _locSelected.forEach(loc => {
      const chip = document.createElement('span');
      chip.className = `ap-chip ${_locMode === 'include' ? 'inc' : 'exc'}`;
      chip.innerHTML = `${loc}<span class="ap-chip-x" data-loc="${loc}">\u00d7</span>`;
      chip.querySelector('.ap-chip-x').addEventListener('click', (e) => {
        e.stopPropagation();
        _locSelected = _locSelected.filter(l => l !== loc);
        renderLocChips(); updateLocList(); syncGlobals();
      });
      locChipsRow.appendChild(chip);
    });
  }

  function makeLocItem(loc) {
    const item = document.createElement('div');
    item.className = 'ap-loc-item';
    item.textContent = loc;
    item.dataset.loc = loc;
    if (_locSelected.includes(loc)) item.classList.add('selected', _locMode);
    item.addEventListener('click', () => {
      if (_locSelected.includes(loc)) {
        _locSelected = _locSelected.filter(l => l !== loc);
        item.classList.remove('selected', 'inc', 'exc');
      } else {
        _locSelected.push(loc);
        item.classList.add('selected', _locMode);
      }
      renderLocChips(); syncGlobals();
    });
    return item;
  }

  function buildLocList() {
    locList.innerHTML = '';
    Object.entries(PROVINCE_GROUPS).forEach(([province, locs]) => {
      const lbl = document.createElement('div');
      lbl.className = 'ap-province-label'; lbl.textContent = province;
      locList.appendChild(lbl);
      locs.forEach(loc => locList.appendChild(makeLocItem(loc)));
    });
  }

  function updateLocList() {
    locList.querySelectorAll('.ap-loc-item').forEach(item => {
      const sel = _locSelected.includes(item.dataset.loc);
      item.classList.toggle('selected', sel);
      item.classList.toggle('inc', sel && _locMode === 'include');
      item.classList.toggle('exc', sel && _locMode === 'exclude');
    });
  }

  function filterLocList(q) {
    const query = q.toLowerCase();
    locList.querySelectorAll('.ap-loc-item').forEach(item => {
      const match = !query || item.dataset.loc.toLowerCase().includes(query);
      item.classList.toggle('hidden', !match);
    });
    locList.querySelectorAll('.ap-province-label').forEach(lbl => {
      let sib = lbl.nextSibling; let anyVisible = false;
      while (sib && !sib.classList?.contains('ap-province-label')) {
        if (!sib.classList?.contains('hidden')) anyVisible = true;
        sib = sib.nextSibling;
      }
      lbl.style.display = anyVisible ? '' : 'none';
    });
  }

  function applyLocMode(mode) {
    _locMode = mode;
    locIncExcBtn.textContent = mode === 'include' ? 'Include' : 'Exclude';
    locIncExcBtn.className   = `ap-inc-exc-btn ${mode === 'include' ? 'inc' : 'exc'}`;
    locChipsRow.dataset.emptyLabel = mode === 'include' ? 'All locations' : 'No exclusions';
    renderLocChips(); updateLocList(); syncGlobals();
  }

  locIncExcBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    applyLocMode(_locMode === 'include' ? 'exclude' : 'include');
  });

  locToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !locPanel.classList.contains('open');
    locPanel.classList.toggle('open');
    jtPanel.classList.remove('open'); // close the other panel
    if (opening) locSearchInput.focus();
  });

  locSearchInput.addEventListener('input', () => filterLocList(locSearchInput.value));

  // Custom location
  const customInput = document.getElementById('ap-custom-input');
  const customAdd   = document.getElementById('ap-custom-add');

  function addCustomLoc() {
    const loc = customInput.value.trim();
    if (!loc || _locSelected.includes(loc)) { customInput.value = ''; return; }
    _locSelected.push(loc);
    const item = makeLocItem(loc);
    item.classList.add('selected', _locMode);
    let customGroup = document.getElementById('ap-custom-group');
    if (!customGroup) {
      customGroup = document.createElement('div');
      customGroup.id = 'ap-custom-group';
      const lbl = document.createElement('div');
      lbl.className = 'ap-province-label'; lbl.textContent = 'Custom';
      customGroup.appendChild(lbl);
      locList.appendChild(customGroup);
    }
    customGroup.appendChild(item);
    renderLocChips(); syncGlobals();
    customInput.value = '';
  }
  customAdd.addEventListener('click', addCustomLoc);
  customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomLoc(); } });

  // ══════════════════════════════════════════════════════════════════════════════
  //  JOB TYPE FILTER
  // ══════════════════════════════════════════════════════════════════════════════
  let _jtSelected = [];
  let _jtMode     = 'include';

  const jtChipsRow  = document.getElementById('ap-jt-chips-row');
  const jtToggleBtn = document.getElementById('ap-jt-toggle-btn');
  const jtIncExcBtn = document.getElementById('ap-jt-inc-exc-btn');

  function renderJtChips() {
    jtChipsRow.innerHTML = '';
    jtChipsRow.dataset.emptyLabel = _jtMode === 'include' ? 'All job types' : 'No exclusions';
    _jtSelected.forEach(key => {
      const def  = JOB_TYPES.find(t => t.key === key);
      const label = def ? def.label : key;
      const chip = document.createElement('span');
      chip.className = `ap-chip ${_jtMode === 'include' ? 'inc' : 'exc'}`;
      chip.innerHTML = `${label}<span class="ap-chip-x" data-key="${key}">\u00d7</span>`;
      chip.querySelector('.ap-chip-x').addEventListener('click', (e) => {
        e.stopPropagation();
        _jtSelected = _jtSelected.filter(k => k !== key);
        renderJtChips(); updateJtList(); syncGlobals();
      });
      jtChipsRow.appendChild(chip);
    });
  }

  function buildJtList() {
    jtPanel.innerHTML = '';  // clear first
    JOB_TYPES.forEach(({ key, label }) => {
      const item = document.createElement('div');
      item.className = 'ap-jt-item';
      item.textContent = label;
      item.dataset.key = key;
      if (_jtSelected.includes(key)) item.classList.add('selected', _jtMode);
      item.addEventListener('click', () => {
        if (_jtSelected.includes(key)) {
          _jtSelected = _jtSelected.filter(k => k !== key);
          item.classList.remove('selected', 'inc', 'exc');
        } else {
          _jtSelected.push(key);
          item.classList.add('selected', _jtMode);
        }
        renderJtChips(); syncGlobals();
      });
      jtPanel.appendChild(item);
    });
    // Select All / Clear All
    const selectAll = document.createElement('div');
    selectAll.id = 'ap-jt-select-all';
    selectAll.textContent = 'Select All';
    selectAll.addEventListener('click', (e) => {
      e.stopPropagation();
      const allKeys = JOB_TYPES.map(t => t.key);
      if (_jtSelected.length === allKeys.length) {
        // clear
        _jtSelected = [];
        selectAll.textContent = 'Select All';
      } else {
        _jtSelected = [...allKeys];
        selectAll.textContent = 'Clear All';
      }
      renderJtChips(); updateJtList(); syncGlobals();
    });
    jtPanel.appendChild(selectAll);
  }

  function updateJtList() {
    jtPanel.querySelectorAll('.ap-jt-item').forEach(item => {
      const sel = _jtSelected.includes(item.dataset.key);
      item.classList.toggle('selected', sel);
      item.classList.toggle('inc', sel && _jtMode === 'include');
      item.classList.toggle('exc', sel && _jtMode === 'exclude');
    });
    // update select-all label
    const sa = document.getElementById('ap-jt-select-all');
    if (sa) sa.textContent = (_jtSelected.length === JOB_TYPES.length) ? 'Clear All' : 'Select All';
  }

  function applyJtMode(mode) {
    _jtMode = mode;
    jtIncExcBtn.textContent = mode === 'include' ? 'Include' : 'Exclude';
    jtIncExcBtn.className   = `ap-inc-exc-btn ${mode === 'include' ? 'inc' : 'exc'}`;
    jtChipsRow.dataset.emptyLabel = mode === 'include' ? 'All job types' : 'No exclusions';
    renderJtChips(); updateJtList(); syncGlobals();
  }

  jtIncExcBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    applyJtMode(_jtMode === 'include' ? 'exclude' : 'include');
  });

  jtToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    jtPanel.classList.toggle('open');
    locPanel.classList.remove('open'); // close the other panel
  });

  // ── Close panels on outside click ────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    if (!locPanel.contains(e.target) && e.target !== locToggleBtn) locPanel.classList.remove('open');
    if (!jtPanel.contains(e.target)  && e.target !== jtToggleBtn)  jtPanel.classList.remove('open');
  });

  // ── Poll mode button ──────────────────────────────────────────────────────────
  const pollModeBtn = document.getElementById('ap-poll-mode-btn');
  if (pollModeBtn) {
    const saved = localStorage.getItem('ap_poll_mode') || 'sequential';
    pollModeBtn.textContent = saved === 'interval' ? '\u26a1 Interval' : '\uD83D\uDD17 Sequential';
    pollModeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.JS_TOGGLE_POLL_MODE === 'function') window.JS_TOGGLE_POLL_MODE();
      const mode = localStorage.getItem('ap_poll_mode') || 'sequential';
      pollModeBtn.textContent = mode === 'interval' ? '\u26a1 Interval' : '\uD83D\uDD17 Sequential';
    });
  }

  // ── Job ID ────────────────────────────────────────────────────────────────────
  const jobidRow   = document.getElementById('ap-jobid-row');
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

  // ── Scan mode toggle (Jobs / Schedules) ───────────────────────────────────────
  const modeCb  = document.getElementById('ap-mode-cb');
  const modeLbl = document.getElementById('ap-mode-lbl');
  const locSection = [
    locChipsRow,
    document.getElementById('ap-loc-ctrl-row'),
    jtChipsRow,
    document.getElementById('ap-jt-ctrl-row'),
  ];

  function applyMode(isSchedule) {
    window.JS_MODE = isSchedule ? 'schedules' : 'jobs';
    modeLbl.textContent = isSchedule ? 'Poll Schedules' : 'Poll Jobs';
    locSection.forEach(el => el.style.display = isSchedule ? 'none' : '');
    jobidRow.style.display = isSchedule ? 'flex' : 'none';
    if (!isSchedule) { locPanel.classList.remove('open'); jtPanel.classList.remove('open'); }
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

  // ── Init — load saved state ───────────────────────────────────────────────────
  let _initializing = true;

  storageLoad(STORAGE_KEY_LOCMODE, (saved) => {
    _locMode = (saved === 'exclude') ? 'exclude' : 'include';
    applyLocMode(_locMode);
  });
  storageLoad(STORAGE_KEY_LOCS, (saved) => {
    _locSelected = Array.isArray(saved) ? saved : [];
    buildLocList();
    renderLocChips();
    syncGlobals();
  });

  storageLoad(STORAGE_KEY_JTMODE, (saved) => {
    _jtMode = (saved === 'exclude') ? 'exclude' : 'include';
    applyJtMode(_jtMode);
  });
  storageLoad(STORAGE_KEY_JOBTYPES, (saved) => {
    _jtSelected = Array.isArray(saved) ? saved.filter(k => JOB_TYPES.some(t => t.key === k)) : [];
    buildJtList();
    renderJtChips();
    syncGlobals();
    _initializing = false;
  });

  setStatus('IDLE');

  // ── Expiry ────────────────────────────────────────────────────────────────
  function _apSetExpiry(d) {
    var el = document.getElementById('ap-expiry');
    if (!el) return;
    var raw = d && (d.expires_iso || d.expires);
    if (!raw) { el.className = ''; el.textContent = ''; return; }
    var dt = new Date(raw);
    if (!isNaN(dt.getTime())) {
      el.textContent = 'Expiry: ' + dt.toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' });
      el.className = (dt - Date.now()) / 86400000 < 7 ? 'warn on' : 'on';
    } else {
      var txt = String(d.expires || '').trim();
      el.textContent = txt ? 'Expiry: ' + txt : '';
      el.className = txt ? 'on' : '';
    }
  }

  // ── Lock / unlock normal-view ────────────────────────────────────────────
  var _LOCK_ICONS  = { maintenance:'\uD83D\uDD27', disabled:'\uD83D\uDEAB', expired:'\u23F0', invalid:'\u26D4', offline:'\uD83D\uDCF5' };
  var _LOCK_TITLES = { maintenance:'Down for Maintenance', disabled:'Access Disabled', expired:'Licence Expired', invalid:'Invalid Licence', offline:'Cannot Reach HQ' };
  var _LOCK_MSGS   = { maintenance:'Down for maintenance. Check back soon.', disabled:'Your access has been paused. Contact support.', expired:'Your licence has expired. Please renew.', invalid:'Licence check failed. Please reinstall or contact support.', offline:'Cannot reach the licence server. Retrying\u2026' };

  function _apLock(d) {
    var r = d.reason || 'disabled';
    document.getElementById('ap-lock-icon').textContent  = _LOCK_ICONS[r]  || _LOCK_ICONS.disabled;
    document.getElementById('ap-lock-title').textContent = _LOCK_TITLES[r] || _LOCK_TITLES.disabled;
    document.getElementById('ap-lock-msg').textContent   = d.message || _LOCK_MSGS[r] || _LOCK_MSGS.disabled;
    document.getElementById('ap-lock-view').classList.add('on');
    document.getElementById('ap-normal-view').style.display = 'none';
  }

  function _apUnlock() {
    document.getElementById('ap-lock-view').classList.remove('on');
    document.getElementById('ap-normal-view').style.display = '';
  }

  // ── HQ listeners ─────────────────────────────────────────────────────────
  window.addEventListener('__ap_hq_status', function(e) {
    var d = e.detail || {};
    _apSetExpiry(d);
    if (d.allow) _apUnlock(); else _apLock(d);
  });
  window.addEventListener('__ap_hq_lock', function(e) {
    var d = e.detail || {};
    _apSetExpiry(d);
    _apLock({ reason: d.reason || 'disabled', message: d.message || '' });
  });
  window.addEventListener('__ap_hq_unlock', _apUnlock);
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

// Keep a short event buffer while the badge is being constructed.  The thin
// extension owns HQ checks and may send a lock event during this window.
(function () {
  var _d = null;
  function _s(e) { _d = e.detail || {}; }
  window.addEventListener('__ap_hq_status', _s);
  setTimeout(function () {
    window.removeEventListener('__ap_hq_status', _s);
    if (_d) window.dispatchEvent(new CustomEvent('__ap_hq_status', { detail: _d }));
  }, 1200);
})();
