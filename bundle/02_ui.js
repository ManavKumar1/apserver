// ui.js — Badge UI with location selector panel (locationName-based filtering + exclude mode)
const AP_VERSION = '1.0.3';

// Locations use "City, Province" format to match API's locationName field
const PRESET_LOCATIONS = [
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
  'Ontario': [
    'Brampton, ON', 'Mississauga, ON', 'Etobicoke, ON', 'Concord, ON', 'Oakville, ON',
    'Cambridge, ON', 'Kitchener, ON', 'Hamilton, ON', 'Stony Creek, ON', 'Scarborough, ON',
    'Toronto, ON', 'Richmond Hill, ON', 'Whitby, ON', 'Ajax, ON', 'Bolton, ON',
    'St Thomas, ON', 'London, ON', 'Windsor, ON', 'Belleville, ON', 'Ottawa, ON', 'Barrhaven, ON',
  ],
  'Alberta': ['Edmonton, AB', 'Acheson, AB', 'Nisku, AB', 'Calgary, AB', 'Balzac, AB', 'Rocky View County, AB'],
  'British Columbia': [
    'Sidney, BC', 'Delta, BC', 'Burnaby, BC', 'Langley, BC', 'Richmond, BC',
    'New Westminster, BC', 'Pitt Meadows, BC', 'Coquitlam, BC', 'Tsawwassen First Nation, BC',
  ],
  'Nova Scotia': ['Dartmouth, NS'],
  'Manitoba': ['Winnipeg, MB'],
};

const STORAGE_KEY_LOCATIONS = 'ap_selected_locations';
const STORAGE_KEY_EXCLUDE   = 'ap_exclude_mode';
const STORAGE_KEY_MODE      = 'ap_mode';
const STORAGE_KEY_JOBID     = 'ap_job_id';

const STATUS = {
  SCANNING:    { label: 'Scanning Jobs\u2026',        color: '#00c853', pulse: true  },
  POLLING:     { label: 'Polling Schedules\u2026',    color: '#00c853', pulse: true  },
  SCHEDULING:  { label: 'Fetching Schedule\u2026',    color: '#ff9100', pulse: true  },
  APPLYING:    { label: 'Creating Application\u2026', color: '#2979ff', pulse: true  },
  QUESTIONS:   { label: 'Answering Questions\u2026',  color: '#aa00ff', pulse: true  },
  APPLIED:     { label: 'Job Applied \u2713',          color: '#00897b', pulse: false },
  IDLE:        { label: 'Idle \u2014 Starting\u2026', color: '#9e9e9e', pulse: false },
  STOPPED:     { label: 'Restarting\u2026',           color: '#ff9100', pulse: true  },
  NO_JOB_ID:   { label: 'Enter a Job ID first',       color: '#ef5350', pulse: false },
};

window.JS_MODE             = 'jobs';
window.JS_LOCATION_FILTERS = [];
window.JS_LOCATION_FILTER  = '';
window.JS_EXCLUDE_MODE     = false;
window.JS_JOB_ID           = '';

function storageSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function storageLoad(key, cb) {
  try {
    const v = localStorage.getItem(key);
    cb(v !== null ? JSON.parse(v) : null);
  } catch (e) { cb(null); }
}

// ── Stopwatch ──────────────────────────────────────────────────────────────────
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

/* mode row */
#ap-mode-row{display:flex;align-items:center;gap:6px;}
#ap-mode-toggle{position:relative;width:36px;height:17px;flex-shrink:0;}
#ap-mode-toggle input{opacity:0;width:0;height:0;}
#ap-mode-slider{position:absolute;inset:0;border-radius:17px;background:#bdbdbd;transition:background 0.25s;cursor:pointer;}
#ap-mode-slider::before{content:'';position:absolute;width:13px;height:13px;border-radius:50%;background:#fff;left:2px;top:2px;transition:transform 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.25);}
#ap-mode-cb:checked+#ap-mode-slider{background:#00c853;}
#ap-mode-cb:checked+#ap-mode-slider::before{transform:translateX(19px);}
#ap-mode-lbl{color:rgb(60,60,60);font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;}

/* chips row */
#ap-chips-row{display:flex;flex-wrap:wrap;gap:3px;min-height:14px;}
#ap-chips-row:empty::before{content:'All locations';color:rgb(170,170,170);font-size:9.5px;font-style:italic;line-height:1.6;}
.ap-chip{
  display:inline-flex;align-items:center;gap:2px;
  border-radius:20px;padding:1px 7px 1px 8px;
  font-size:9.5px;font-weight:600;white-space:nowrap;
  transition:background 0.2s,border-color 0.2s,color 0.2s;
}
.ap-chip.include{background:rgba(0,180,70,0.12);border:1px solid rgba(0,180,70,0.35);color:rgb(0,110,45);}
.ap-chip.exclude{background:rgba(239,83,80,0.12);border:1px solid rgba(239,83,80,0.45);color:rgb(180,30,30);}
.ap-chip-x{cursor:pointer;font-size:11px;opacity:0.5;margin-left:1px;}
.ap-chip-x:hover{opacity:1;}

/* filter mode indicator */
#ap-filter-mode-row{display:flex;align-items:center;gap:5px;min-height:14px;}
#ap-filter-mode-badge{
  font-size:9px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;
  padding:1px 7px;border-radius:20px;
  background:rgba(0,180,70,0.12);border:1px solid rgba(0,180,70,0.35);color:rgb(0,110,45);
  transition:background 0.2s,border-color 0.2s,color 0.2s;
}
#ap-filter-mode-badge.exclude{background:rgba(239,83,80,0.12);border:1px solid rgba(239,83,80,0.4);color:rgb(180,30,30);}

/* location selector toggle btn */
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

/* location panel */
#ap-city-panel{
  display:none;flex-direction:column;gap:0;
  background:white;border:1px solid rgba(0,0,0,0.12);
  border-radius:12px;overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,0.15);
  width:320px;
}
#ap-city-panel.open{display:flex;}

/* panel search area */
#ap-city-search{
  position:sticky;top:0;z-index:1;
  padding:8px 10px 6px;border-bottom:1px solid rgba(0,0,0,0.08);background:white;
}
#ap-city-search input[type=text]{
  width:100%;box-sizing:border-box;
  border:1px solid rgba(0,0,0,0.15);border-radius:8px;
  padding:5px 10px;font-size:11px;font-family:inherit;outline:none;
  caret-color:#00c853;
}

/* exclude toggle row inside panel */
#ap-exclude-toggle-row{
  display:flex;align-items:center;justify-content:space-between;
  padding:6px 10px;border-bottom:1px solid rgba(0,0,0,0.06);
  background:rgb(249,249,249);
}
#ap-exclude-label-text{font-size:10px;font-weight:700;color:rgb(60,60,60);letter-spacing:0.04em;text-transform:uppercase;}
#ap-exclude-desc{font-size:9px;color:rgb(140,140,140);margin-top:1px;}
/* exclude toggle switch */
#ap-exclude-toggle{position:relative;width:40px;height:19px;flex-shrink:0;}
#ap-exclude-toggle input{opacity:0;width:0;height:0;}
#ap-exclude-slider{position:absolute;inset:0;border-radius:19px;background:#bdbdbd;transition:background 0.25s;cursor:pointer;}
#ap-exclude-slider::before{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;left:2px;top:2px;transition:transform 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.25);}
#ap-exclude-cb:checked+#ap-exclude-slider{background:#ef5350;}
#ap-exclude-cb:checked+#ap-exclude-slider::before{transform:translateX(21px);}

/* scrollable list */
#ap-city-list-scroll{max-height:260px;overflow-y:auto;}

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
.ap-city-item:hover{background:rgba(0,0,0,0.03);}
.ap-city-item.selected-include{color:rgb(0,130,50);font-weight:600;}
.ap-city-item.selected-include::after{content:'✓';font-size:11px;color:#00c853;}
.ap-city-item.selected-exclude{color:rgb(180,30,30);font-weight:600;}
.ap-city-item.selected-exclude::after{content:'✕';font-size:11px;color:#ef5350;}
.ap-city-item.hidden{display:none;}

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

  // ── Build DOM ──────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div'); wrap.id = 'ap-wrap';

  const pill = document.createElement('div'); pill.id = 'ap-pill';
  pill.innerHTML = `
    <span id="ap-dot"></span>
    <div id="ap-body">
      <span id="ap-label">Starting\u2026</span>
      <span id="ap-version">v${AP_VERSION}</span>
      <span id="ap-stopwatch">00:00</span>
      <div id="ap-mode-row">
        <label id="ap-mode-toggle"><input type="checkbox" id="ap-mode-cb"/><span id="ap-mode-slider"></span></label>
        <span id="ap-mode-lbl">Poll Jobs</span>
      </div>
      <div id="ap-filter-mode-row">
        <span id="ap-filter-mode-badge">Including</span>
      </div>
      <div id="ap-chips-row"></div>
      <button id="ap-city-toggle-btn">\u271a Locations</button>
      <button id="ap-poll-mode-btn">\u26a1 Interval</button>
      <div id="ap-jobid-row">
        <span id="ap-jobid-prefix">${_pfx}</span>
        <input id="ap-jobid-input" type="text" placeholder="12345"/>
      </div>
    </div>
    <div id="ap-orb"><span class="ap-orb-dot"></span></div>
    <button id="ap-replay">\u27F3</button>
  `;

  // City / location panel
  const panel = document.createElement('div'); panel.id = 'ap-city-panel';
  panel.innerHTML = `
    <div id="ap-city-search">
      <input id="ap-city-search-input" type="text" placeholder="Search location\u2026" autocomplete="off" spellcheck="false"/>
      <div id="ap-custom-row">
        <input id="ap-custom-input" type="text" placeholder="Type custom location\u2026" autocomplete="off" spellcheck="false"/>
        <button id="ap-custom-add">+ Add</button>
      </div>
    </div>
    <div id="ap-exclude-toggle-row">
      <div>
        <div id="ap-exclude-label-text">Exclude Mode</div>
        <div id="ap-exclude-desc">Catch all locations <em>except</em> selected</div>
      </div>
      <label id="ap-exclude-toggle">
        <input type="checkbox" id="ap-exclude-cb"/>
        <span id="ap-exclude-slider"></span>
      </label>
    </div>
    <div id="ap-city-list-scroll">
      <div id="ap-city-list"></div>
    </div>
  `;

  wrap.appendChild(pill);
  wrap.appendChild(panel);
  document.body.appendChild(wrap);
  badgeEl    = pill;
  startBtnEl = document.getElementById('ap-replay');
  startBtnEl.addEventListener('click', () => {
    if (typeof window.JS_TOGGLE_SCAN === 'function') window.JS_TOGGLE_SCAN();
  });

  // ── Refs ───────────────────────────────────────────────────────────────────────
  let _selected   = [];         // array of "City, Province" strings
  let _excludeMode = false;

  const chipsRow        = document.getElementById('ap-chips-row');
  const filterModeBadge = document.getElementById('ap-filter-mode-badge');
  const cityList        = document.getElementById('ap-city-list');
  const searchInput     = document.getElementById('ap-city-search-input');
  const toggleBtn       = document.getElementById('ap-city-toggle-btn');
  const excludeCb       = document.getElementById('ap-exclude-cb');

  // ── Sync globals ───────────────────────────────────────────────────────────────
  function syncGlobals() {
    window.JS_LOCATION_FILTERS = [..._selected];
    window.JS_LOCATION_FILTER  = _selected[0] || '';
    window.JS_EXCLUDE_MODE     = _excludeMode;
    storageSave(STORAGE_KEY_LOCATIONS, _selected);
    storageSave(STORAGE_KEY_EXCLUDE,   _excludeMode);
  }

  // ── Chips ──────────────────────────────────────────────────────────────────────
  function renderChips() {
    chipsRow.innerHTML = '';
    _selected.forEach(loc => {
      const chip = document.createElement('span');
      chip.className = `ap-chip ${_excludeMode ? 'exclude' : 'include'}`;
      // Show short label: "Brampton, ON" → "Brampton, ON" (already short enough)
      chip.innerHTML = `${loc}<span class="ap-chip-x" data-loc="${loc}">\u00d7</span>`;
      chip.querySelector('.ap-chip-x').addEventListener('click', (e) => {
        e.stopPropagation();
        _selected = _selected.filter(c => c !== loc);
        renderChips(); updateCityList(); syncGlobals();
      });
      chipsRow.appendChild(chip);
    });
    // Update filter mode badge
    if (_selected.length === 0) {
      filterModeBadge.textContent = 'All Locations';
      filterModeBadge.className   = '';
      filterModeBadge.removeAttribute('class');
      filterModeBadge.id = 'ap-filter-mode-badge';
    } else if (_excludeMode) {
      filterModeBadge.textContent = `Excluding ${_selected.length}`;
      filterModeBadge.className   = 'exclude';
      filterModeBadge.id          = 'ap-filter-mode-badge';
    } else {
      filterModeBadge.textContent = `Including ${_selected.length}`;
      filterModeBadge.className   = '';
      filterModeBadge.id          = 'ap-filter-mode-badge';
    }
  }

  // ── City list ──────────────────────────────────────────────────────────────────
  function getSelectedClass() {
    return _excludeMode ? 'selected-exclude' : 'selected-include';
  }

  function buildCityList() {
    cityList.innerHTML = '';
    Object.entries(PROVINCE_GROUPS).forEach(([province, locations]) => {
      const lbl = document.createElement('div');
      lbl.className = 'ap-province-label'; lbl.textContent = province;
      cityList.appendChild(lbl);
      locations.forEach(loc => {
        const item = document.createElement('div');
        item.className = 'ap-city-item';
        item.textContent = loc;
        item.dataset.loc = loc;
        if (_selected.includes(loc)) item.classList.add(getSelectedClass());
        item.addEventListener('click', () => {
          if (_selected.includes(loc)) {
            _selected = _selected.filter(c => c !== loc);
            item.classList.remove('selected-include', 'selected-exclude');
          } else {
            _selected.push(loc);
            item.classList.remove('selected-include', 'selected-exclude');
            item.classList.add(getSelectedClass());
          }
          renderChips(); syncGlobals();
        });
        cityList.appendChild(item);
      });
    });
  }

  function updateCityList() {
    cityList.querySelectorAll('.ap-city-item').forEach(item => {
      item.classList.remove('selected-include', 'selected-exclude');
      if (_selected.includes(item.dataset.loc)) item.classList.add(getSelectedClass());
    });
  }

  function filterCityList(q) {
    const query = q.toLowerCase();
    cityList.childNodes.forEach(node => {
      if (node.classList?.contains('ap-city-item')) {
        const match = !query || node.dataset.loc.toLowerCase().includes(query);
        node.classList.toggle('hidden', !match);
      }
    });
    cityList.querySelectorAll('.ap-province-label').forEach(lbl => {
      let sib = lbl.nextSibling; let anyVisible = false;
      while (sib && !sib.classList?.contains('ap-province-label')) {
        if (sib.classList?.contains('ap-city-item') && !sib.classList?.contains('hidden')) anyVisible = true;
        sib = sib.nextSibling;
      }
      lbl.style.display = anyVisible ? '' : 'none';
    });
  }

  // ── Exclude toggle ─────────────────────────────────────────────────────────────
  excludeCb.addEventListener('change', () => {
    _excludeMode = excludeCb.checked;
    updateCityList();
    renderChips();
    syncGlobals();
  });

  // ── Poll mode toggle button ────────────────────────────────────────────────────
  const pollModeBtn = document.getElementById('ap-poll-mode-btn');
  if (pollModeBtn) {
    const saved = localStorage.getItem('ap_poll_mode') || 'sequential';
    pollModeBtn.textContent = saved === 'interval' ? '\u26a1 Interval' : '\uD83D\uDD17 Sequential';
    pollModeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.JS_TOGGLE_POLL_MODE === 'function') window.JS_TOGGLE_POLL_MODE();
      const mode = localStorage.getItem('ap_poll_mode') || 'interval';
      pollModeBtn.textContent = mode === 'interval' ? '\u26a1 Interval' : '\uD83D\uDD17 Sequential';
    });
  }

  // ── Location panel open/close ──────────────────────────────────────────────────
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) searchInput.focus();
  });

  searchInput.addEventListener('input', () => filterCityList(searchInput.value));

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== toggleBtn) panel.classList.remove('open');
  });

  // ── Custom location add ────────────────────────────────────────────────────────
  const customInput = document.getElementById('ap-custom-input');
  const customAdd   = document.getElementById('ap-custom-add');

  function addCustomLocation() {
    const loc = customInput.value.trim();
    if (!loc || _selected.includes(loc)) { customInput.value = ''; return; }
    _selected.push(loc);
    const item = document.createElement('div');
    item.className = `ap-city-item ${getSelectedClass()}`;
    item.textContent = loc;
    item.dataset.loc = loc;
    item.addEventListener('click', () => {
      if (_selected.includes(loc)) {
        _selected = _selected.filter(c => c !== loc);
        item.classList.remove('selected-include', 'selected-exclude');
      } else {
        _selected.push(loc);
        item.classList.remove('selected-include', 'selected-exclude');
        item.classList.add(getSelectedClass());
      }
      renderChips(); syncGlobals();
    });
    let customGroup = document.getElementById('ap-custom-group');
    if (!customGroup) {
      customGroup = document.createElement('div'); customGroup.id = 'ap-custom-group';
      const lbl = document.createElement('div');
      lbl.className = 'ap-province-label'; lbl.textContent = 'Custom';
      customGroup.appendChild(lbl);
      cityList.appendChild(customGroup);
    }
    customGroup.appendChild(item);
    renderChips(); syncGlobals();
    customInput.value = '';
  }
  customAdd.addEventListener('click', addCustomLocation);
  customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomLocation(); } });

  // ── Load saved state ───────────────────────────────────────────────────────────
  storageLoad(STORAGE_KEY_LOCATIONS, (savedLocs) => {
    _selected = Array.isArray(savedLocs) ? savedLocs : [];
    storageLoad(STORAGE_KEY_EXCLUDE, (savedExclude) => {
      _excludeMode = savedExclude === true;
      excludeCb.checked = _excludeMode;
      buildCityList();
      renderChips();
      syncGlobals();
    });
  });

  // ── Job ID ─────────────────────────────────────────────────────────────────────
  const jobidRow   = document.getElementById('ap-jobid-row');
  const jobidInput = document.getElementById('ap-jobid-input');
  jobidInput.addEventListener('input', () => {
    const d = jobidInput.value.replace(/\D/g, '');
    jobidInput.value    = d;
    window.JS_JOB_ID   = d ? _pfx + d : '';
    storageSave(STORAGE_KEY_JOBID, d);
  });
  storageLoad(STORAGE_KEY_JOBID, (saved) => {
    if (saved) { jobidInput.value = saved; window.JS_JOB_ID = _pfx + saved; }
  });

  // ── Job/Schedule mode toggle ───────────────────────────────────────────────────
  const modeCb      = document.getElementById('ap-mode-cb');
  const modeLbl     = document.getElementById('ap-mode-lbl');
  const locationSection = [chipsRow, toggleBtn, document.getElementById('ap-filter-mode-row')];

  function applyMode(isSchedule) {
    window.JS_MODE = isSchedule ? 'schedules' : 'jobs';
    modeLbl.textContent = isSchedule ? 'Poll Schedules' : 'Poll Jobs';
    locationSection.forEach(el => { if (el) el.style.display = isSchedule ? 'none' : ''; });
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

  // ── Drag ───────────────────────────────────────────────────────────────────────
  let dragging = false, dragOffX = 0, dragOffY = 0;
  pill.addEventListener('mousedown', (e) => {
    if (e.target.closest('input,button,label,.ap-chip-x')) return;
    dragging = true;
    const rect = wrap.getBoundingClientRect();
    dragOffX = e.clientX - rect.left; dragOffY = e.clientY - rect.top;
    wrap.style.right = 'auto'; wrap.style.bottom = 'auto';
    wrap.style.left  = rect.left + 'px'; wrap.style.top = rect.top + 'px';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    wrap.style.left = (e.clientX - dragOffX) + 'px';
    wrap.style.top  = (e.clientY - dragOffY) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  setStatus('IDLE');
}

// ── setStatus ──────────────────────────────────────────────────────────────────
function setStatus(key) {
  const cfg = STATUS[key] || STATUS.IDLE;
  const dot = document.getElementById('ap-dot');
  const lbl = document.getElementById('ap-label');
  const orb = document.getElementById('ap-orb');
  if (!dot || !lbl) return;
  dot.style.background = cfg.color;
  dot.className        = cfg.pulse ? 'pulse' : '';
  lbl.textContent      = cfg.label;
  if (orb) {
    orb.style.background  = `linear-gradient(135deg,${cfg.color}cc,${cfg.color})`;
    orb.style.boxShadow   = `inset 0 1px 0 rgba(255,255,255,0.4),0 3px 10px ${cfg.color}55`;
    const d = orb.querySelector('.ap-orb-dot');
    if (d) d.style.animationPlayState = cfg.pulse ? 'running' : 'paused';
  }
  if (key === 'SCANNING' || key === 'POLLING') startStopwatch();
  else if (['IDLE', 'NO_JOB_ID'].includes(key))          stopStopwatch(true);
  else                                                    stopStopwatch(false);

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
    } catch (e) {}
  }

  if (key === 'APPLIED') {
    if (orb)       orb.style.display       = 'none';
    if (startBtnEl) startBtnEl.style.display = 'flex';
  } else {
    if (orb)       orb.style.display       = 'flex';
    if (startBtnEl) startBtnEl.style.display = 'none';
  }
}

function setScanButtonState(_) {}

function resetForRescan() {
  sessionStorage.removeItem('js_applied');
  stopStopwatch(true); setStatus._beeped = false;
  const isCA = window.location.hostname.includes('.ca');
  window.location.href = isCA ? 'https://hiring.amazon.ca/' : 'https://hiring.amazon.com/';
}

window.JS_IS_APPLIED = () => startBtnEl && startBtnEl.style.display === 'flex';
