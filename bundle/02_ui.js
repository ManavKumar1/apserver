// ui.js — Badge UI with include / exclude location filter
const AP_VERSION = ‘1.1.0’;

// ── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY_INCLUDE = ‘ap_include_locations’;
const STORAGE_KEY_EXCLUDE = ‘ap_exclude_locations’;
const STORAGE_KEY_MODE    = ‘ap_mode’;
const STORAGE_KEY_JOBID   = ‘ap_job_id’;

// ── Status map ────────────────────────────────────────────────────────────────
const STATUS = {
SCANNING:   { label: ‘Scanning Jobs\u2026’,        color: ‘#00c853’, pulse: true  },
POLLING:    { label: ‘Polling Schedules\u2026’,    color: ‘#00c853’, pulse: true  },
SCHEDULING: { label: ‘Fetching Schedule\u2026’,    color: ‘#ff9100’, pulse: true  },
APPLYING:   { label: ‘Creating Application\u2026’, color: ‘#2979ff’, pulse: true  },
QUESTIONS:  { label: ‘Answering Questions\u2026’,  color: ‘#aa00ff’, pulse: true  },
APPLIED:    { label: ‘Job Applied \u2713’,         color: ‘#00897b’, pulse: false },
IDLE:       { label: ‘Idle \u2014 Starting\u2026’, color: ‘#9e9e9e’, pulse: false },
STOPPED:    { label: ‘Restarting\u2026’,           color: ‘#ff9100’, pulse: true  },
NO_JOB_ID:  { label: ‘Enter a Job ID first’,       color: ‘#ef5350’, pulse: false },
};

// ── Globals consumed by content.js ───────────────────────────────────────────
window.JS_MODE              = ‘jobs’;
window.JS_INCLUDE_LOCATIONS = [];   // only accept jobs matching these terms
window.JS_EXCLUDE_LOCATIONS = [];   // reject jobs matching these terms
window.JS_JOB_ID            = ‘’;
// Backwards-compat alias (content.js old path may reference these)
Object.defineProperty(window, ‘JS_CITY_FILTERS’, { get: () => window.JS_INCLUDE_LOCATIONS });
Object.defineProperty(window, ‘JS_CITY_FILTER’,  { get: () => window.JS_INCLUDE_LOCATIONS[0] || ‘’ });

// ── Storage helpers ───────────────────────────────────────────────────────────
function storageSave(key, value) {
try { localStorage.setItem(key, JSON.stringify(value)); } catch (*) {}
}
function storageLoad(key, cb) {
try { const v = localStorage.getItem(key); cb(v !== null ? JSON.parse(v) : null); }
catch (*) { cb(null); }
}

// ── Stopwatch ─────────────────────────────────────────────────────────────────
let _swInterval = null, _swSeconds = 0;
const _swFmt = s =>
`${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

function startStopwatch() {
stopStopwatch(true); _swSeconds = 0;
const el = document.getElementById(‘js-stopwatch’);
if (el) { el.textContent = ‘00:00’; el.style.display = ‘inline’; }
_swInterval = setInterval(() => {
_swSeconds++;
const el = document.getElementById(‘js-stopwatch’);
if (el) el.textContent = _swFmt(_swSeconds);
}, 1000);
}
function stopStopwatch(reset = false) {
clearInterval(_swInterval); _swInterval = null;
if (reset) {
_swSeconds = 0;
const el = document.getElementById(‘js-stopwatch’);
if (el) { el.textContent = ‘00:00’; el.style.display = ‘none’; }
}
}

let badgeEl = null, startBtnEl = null;

function injectBadge() {
if (badgeEl) return;

// ── Styles ──────────────────────────────────────────────────────────────────
const style = document.createElement(‘style’);
style.textContent = `
/* ── Wrapper ────────────────────────────────────────────────────────────── */
#ap-wrap {
position:fixed; top:14px; right:14px; z-index:2147483647;
display:flex; flex-direction:column; align-items:flex-end; gap:6px;
font-family:-apple-system,BlinkMacSystemFont,‘Segoe UI’,sans-serif; user-select:none;
}

/* ── Main pill ───────────────────────────────────────────────────────────── */
#ap-pill {
display:flex; align-items:flex-start;
background:linear-gradient(135deg,rgba(255,255,255,0.62),rgba(255,255,255,0.42));
backdrop-filter:blur(18px) saturate(160%); -webkit-backdrop-filter:blur(18px) saturate(160%);
border-radius:18px; padding:12px 10px 12px 14px; gap:10px; width:318px;
border:1px solid rgba(255,255,255,0.4);
box-shadow:inset 0 1px 0 rgba(255,255,255,0.7),0 6px 25px rgba(0,0,0,0.3);
cursor:grab;
}
#ap-pill:active { cursor:grabbing; }

/* ── Status dot ──────────────────────────────────────────────────────────── */
#ap-dot { width:8px; height:8px; border-radius:50%; background:#9e9e9e; flex-shrink:0; margin-top:5px; transition:background 0.3s; }
#ap-dot.pulse { animation:apDotPulse 1s ease-in-out infinite; }
@keyframes apDotPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.7)} }

/* ── Body ────────────────────────────────────────────────────────────────── */
#ap-body  { display:flex; flex-direction:column; flex:1; min-width:0; gap:6px; }
#ap-label { color:rgb(30,30,30); font-size:11.5px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; line-height:1.3; }
#ap-version   { color:rgb(180,180,180); font-size:9px; font-weight:600; letter-spacing:0.04em; }
#ap-stopwatch { color:rgb(80,80,80); font-size:10px; font-weight:600; font-variant-numeric:tabular-nums; display:none; }

/* ── Mode row ────────────────────────────────────────────────────────────── */
#ap-mode-row  { display:flex; align-items:center; gap:6px; }
#ap-mode-toggle { position:relative; width:36px; height:17px; flex-shrink:0; }
#ap-mode-toggle input { opacity:0; width:0; height:0; }
#ap-mode-slider { position:absolute; inset:0; border-radius:17px; background:#bdbdbd; transition:background .25s; cursor:pointer; }
#ap-mode-slider::before { content:’’; position:absolute; width:13px; height:13px; border-radius:50%; background:#fff; left:2px; top:2px; transition:transform .25s; box-shadow:0 1px 3px rgba(0,0,0,.25); }
#ap-mode-cb:checked + #ap-mode-slider { background:#00c853; }
#ap-mode-cb:checked + #ap-mode-slider::before { transform:translateX(19px); }
#ap-mode-lbl { color:rgb(60,60,60); font-size:10px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; }

/* ── Location summary row (chips inside pill) ────────────────────────────── */
#ap-loc-summary { display:flex; flex-wrap:wrap; gap:3px; min-height:14px; }
#ap-loc-summary:empty::before { content:‘No filter — all locations’; color:rgb(170,170,170); font-size:9.5px; font-style:italic; line-height:1.6; }

/* ── Chips ───────────────────────────────────────────────────────────────── */
.ap-chip {
display:inline-flex; align-items:center; gap:2px;
border-radius:20px; padding:1px 7px 1px 8px;
font-size:9.5px; font-weight:600; white-space:nowrap;
}
.ap-chip.inc { background:rgba(0,180,70,.12); border:1px solid rgba(0,180,70,.35); color:rgb(0,110,45); }
.ap-chip.exc { background:rgba(239,83,80,.1);  border:1px solid rgba(239,83,80,.4);  color:rgb(180,30,30); }
.ap-chip-x { cursor:pointer; font-size:11px; opacity:0.5; margin-left:1px; }
.ap-chip-x:hover { opacity:1; }

/* ── Location panel toggle button ────────────────────────────────────────── */
#ap-loc-toggle-btn {
background:rgba(0,0,0,.06); border:1px solid rgba(0,0,0,.12);
border-radius:8px; padding:3px 9px; font-size:10px; font-weight:600;
color:rgb(60,60,60); cursor:pointer; align-self:flex-start;
}
#ap-loc-toggle-btn:hover { background:rgba(0,0,0,.1); }

/* ── Poll mode button ────────────────────────────────────────────────────── */
#ap-poll-mode-btn {
background:rgba(41,121,255,.1); border:1px solid rgba(41,121,255,.35);
border-radius:8px; padding:3px 9px; font-size:10px; font-weight:600;
color:rgb(20,70,180); cursor:pointer; align-self:flex-start;
}
#ap-poll-mode-btn:hover { background:rgba(41,121,255,.2); }

/* ── Job ID row ──────────────────────────────────────────────────────────── */
#ap-jobid-row    { display:none; align-items:center; gap:4px; }
#ap-jobid-prefix { color:rgb(80,80,80); font-size:10px; font-weight:600; white-space:nowrap; }
#ap-jobid-input  {
background:rgba(255,255,255,.6); border:1px solid rgba(0,0,0,.15);
border-radius:8px; outline:none; padding:3px 8px;
font-size:10.5px; font-family:inherit; color:rgb(40,40,40); width:65px;
}

/* ── Location panel ──────────────────────────────────────────────────────── */
#ap-loc-panel {
display:none; flex-direction:column;
background:white; border:1px solid rgba(0,0,0,.12);
border-radius:12px; overflow:hidden;
box-shadow:0 4px 20px rgba(0,0,0,.15);
width:318px;
}
#ap-loc-panel.open { display:flex; }

/* tabs */
#ap-loc-tabs { display:flex; border-bottom:1px solid rgba(0,0,0,.08); }
.ap-tab {
flex:1; padding:8px 0; text-align:center;
font-size:10.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
cursor:pointer; color:rgb(120,120,120); border-bottom:2px solid transparent;
transition:color .15s, border-color .15s;
}
.ap-tab.active { color:rgb(0,110,45); border-color:#00c853; }
.ap-tab.exc-tab.active { color:rgb(180,30,30); border-color:#ef5350; }

/* tab panes */
.ap-tab-pane { display:none; flex-direction:column; padding:10px; gap:8px; }
.ap-tab-pane.active { display:flex; }

/* input row inside pane */
.ap-loc-input-row { display:flex; gap:6px; }
.ap-loc-input-row input {
flex:1; border:1px solid rgba(0,0,0,.15); border-radius:8px;
padding:5px 10px; font-size:11px; font-family:inherit; outline:none;
}
.ap-loc-input-row input.inc:focus { border-color:#00c853; }
.ap-loc-input-row input.exc:focus { border-color:#ef5350; }
.ap-loc-add-btn {
border-radius:8px; padding:5px 10px; font-size:10px; font-weight:700;
cursor:pointer; white-space:nowrap; border:none;
}
.ap-loc-add-btn.inc { background:rgba(0,200,83,.15); color:rgb(0,110,45); border:1px solid rgba(0,200,83,.4); }
.ap-loc-add-btn.inc:hover { background:rgba(0,200,83,.3); }
.ap-loc-add-btn.exc { background:rgba(239,83,80,.1);  color:rgb(180,30,30); border:1px solid rgba(239,83,80,.4); }
.ap-loc-add-btn.exc:hover { background:rgba(239,83,80,.25); }

/* chips inside pane */
.ap-pane-chips { display:flex; flex-wrap:wrap; gap:4px; min-height:18px; }
.ap-pane-chips:empty::before {
font-size:9.5px; font-style:italic; color:rgb(180,180,180); line-height:1.8;
}
#ap-inc-chips:empty::before { content:‘None — accepts all locations’; }
#ap-exc-chips:empty::before { content:‘None — no exclusions active’; }

/* description text */
.ap-pane-desc { font-size:9.5px; color:rgb(140,140,140); line-height:1.5; }
.ap-pane-desc b { color:rgb(80,80,80); }

/* ── Orb & replay button ─────────────────────────────────────────────────── */
#ap-orb {
width:40px; height:40px; border-radius:50%; flex-shrink:0; margin-top:2px;
background:linear-gradient(135deg,#00e676,#00c853); border:none;
display:flex; align-items:center; justify-content:center; pointer-events:none;
box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 3px 10px rgba(0,200,83,.4);
transition:background .3s, box-shadow .3s;
}
#ap-orb .ap-orb-dot { width:12px; height:12px; border-radius:50%; background:rgba(255,255,255,.9); animation:apOrb 1.2s ease-in-out infinite; }
@keyframes apOrb { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(.6);opacity:.4} }
#ap-replay {
width:40px; height:40px; border-radius:50%; flex-shrink:0; margin-top:2px;
background:linear-gradient(135deg,#26c6da,#00acc1); border:none; cursor:pointer;
display:none; align-items:center; justify-content:center; font-size:19px; color:#fff;
box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 3px 10px rgba(0,172,193,.4);
}
#ap-replay:hover { filter:brightness(1.1); }
`;
document.head.appendChild(style);

const _isCA = window.location.hostname.includes(’.ca’);
const _pfx  = _isCA ? ‘JOB-CA-00000’ : ‘JOB-US-00000’;

// ── Build DOM ────────────────────────────────────────────────────────────────
const wrap = document.createElement(‘div’); wrap.id = ‘ap-wrap’;

// Main pill
const pill = document.createElement(‘div’); pill.id = ‘ap-pill’;
pill.innerHTML = `<span id="ap-dot"></span> <div id="ap-body"> <span id="ap-label">Starting\u2026</span> <span id="ap-version">v${AP_VERSION}</span> <span id="ap-stopwatch">00:00</span> <div id="ap-mode-row"> <label id="ap-mode-toggle"><input type="checkbox" id="ap-mode-cb"/><span id="ap-mode-slider"></span></label> <span id="ap-mode-lbl">Poll Jobs</span> </div> <div id="ap-loc-summary"></div> <button id="ap-loc-toggle-btn">\uD83D\uDCCD Locations</button> <button id="ap-poll-mode-btn" title="Toggle polling mode">\u26A1 Interval</button> <div id="ap-jobid-row"> <span id="ap-jobid-prefix">${_pfx}</span> <input id="ap-jobid-input" type="text" placeholder="12345"/> </div> </div> <div id="ap-orb"><span class="ap-orb-dot"></span></div> <button id="ap-replay">\u27F3</button>`;

// Location panel
const locPanel = document.createElement(‘div’); locPanel.id = ‘ap-loc-panel’;
locPanel.innerHTML = `
<div id="ap-loc-tabs">
<div class="ap-tab active"     data-tab="inc">\u2705 Include</div>
<div class="ap-tab exc-tab"    data-tab="exc">\u274C Exclude</div>
</div>

```
<!-- Include pane -->
<div class="ap-tab-pane active" id="ap-pane-inc">
  <p class="ap-pane-desc">Only match jobs whose city / state / location name contains <b>any</b> of these terms. Leave empty to accept all.</p>
  <div class="ap-loc-input-row">
    <input class="inc" id="ap-inc-input" type="text" placeholder="e.g. Brampton, ON…" autocomplete="off" spellcheck="false"/>
    <button class="ap-loc-add-btn inc" id="ap-inc-add">+ Add</button>
  </div>
  <div class="ap-pane-chips" id="ap-inc-chips"></div>
</div>

<!-- Exclude pane -->
<div class="ap-tab-pane" id="ap-pane-exc">
  <p class="ap-pane-desc">Skip jobs whose city / state / location name contains <b>any</b> of these terms. Exclusions win over includes.</p>
  <div class="ap-loc-input-row">
    <input class="exc" id="ap-exc-input" type="text" placeholder="e.g. Toronto, BC…" autocomplete="off" spellcheck="false"/>
    <button class="ap-loc-add-btn exc" id="ap-exc-add">− Add</button>
  </div>
  <div class="ap-pane-chips" id="ap-exc-chips"></div>
</div>
```

`;

wrap.appendChild(pill);
wrap.appendChild(locPanel);
document.body.appendChild(wrap);

badgeEl    = pill;
startBtnEl = document.getElementById(‘ap-replay’);
startBtnEl.addEventListener(‘click’, () => {
if (typeof window.JS_TOGGLE_SCAN === ‘function’) window.JS_TOGGLE_SCAN();
});

// ── Location filter state ────────────────────────────────────────────────────
let _includes = [];
let _excludes = [];

const summaryRow = document.getElementById(‘ap-loc-summary’);
const incChips   = document.getElementById(‘ap-inc-chips’);
const excChips   = document.getElementById(‘ap-exc-chips’);
const incInput   = document.getElementById(‘ap-inc-input’);
const excInput   = document.getElementById(‘ap-exc-input’);
const incAdd     = document.getElementById(‘ap-inc-add’);
const excAdd     = document.getElementById(‘ap-exc-add’);
const locToggle  = document.getElementById(‘ap-loc-toggle-btn’);

function syncGlobals() {
window.JS_INCLUDE_LOCATIONS = […_includes];
window.JS_EXCLUDE_LOCATIONS = […_excludes];
storageSave(STORAGE_KEY_INCLUDE, _includes);
storageSave(STORAGE_KEY_EXCLUDE, _excludes);
}

// Pill summary chips
function renderSummary() {
summaryRow.innerHTML = ‘’;
_includes.forEach(term => {
const c = document.createElement(‘span’);
c.className = ‘ap-chip inc’;
c.innerHTML = `+${term}<span class="ap-chip-x" data-type="inc" data-term="${term}">\u00D7</span>`;
summaryRow.appendChild(c);
});
_excludes.forEach(term => {
const c = document.createElement(‘span’);
c.className = ‘ap-chip exc’;
c.innerHTML = `\u2212${term}<span class="ap-chip-x" data-type="exc" data-term="${term}">\u00D7</span>`;
summaryRow.appendChild(c);
});
summaryRow.querySelectorAll(’.ap-chip-x’).forEach(x => {
x.addEventListener(‘click’, e => {
e.stopPropagation();
const { type, term } = e.currentTarget.dataset;
if (type === ‘inc’) _includes = _includes.filter(t => t !== term);
else                _excludes = _excludes.filter(t => t !== term);
renderSummary(); renderPaneChips(); syncGlobals();
});
});
}

// Chips inside the panel panes
function makeChip(term, type) {
const c = document.createElement(‘span’);
c.className = `ap-chip ${type}`;
c.innerHTML = `${term}<span class="ap-chip-x" data-type="${type}" data-term="${term}">\u00D7</span>`;
c.querySelector(’.ap-chip-x’).addEventListener(‘click’, e => {
e.stopPropagation();
if (type === ‘inc’) _includes = _includes.filter(t => t !== term);
else                _excludes = _excludes.filter(t => t !== term);
renderSummary(); renderPaneChips(); syncGlobals();
});
return c;
}

function renderPaneChips() {
incChips.innerHTML = ‘’;
excChips.innerHTML = ‘’;
_includes.forEach(t => incChips.appendChild(makeChip(t, ‘inc’)));
_excludes.forEach(t => excChips.appendChild(makeChip(t, ‘exc’)));
}

function addInclude() {
const term = incInput.value.trim();
if (!term || _includes.includes(term)) { incInput.value = ‘’; return; }
_includes.push(term);
renderSummary(); renderPaneChips(); syncGlobals();
incInput.value = ‘’;
}
function addExclude() {
const term = excInput.value.trim();
if (!term || _excludes.includes(term)) { excInput.value = ‘’; return; }
_excludes.push(term);
renderSummary(); renderPaneChips(); syncGlobals();
excInput.value = ‘’;
}

incAdd.addEventListener(‘click’, addInclude);
excAdd.addEventListener(‘click’, addExclude);
incInput.addEventListener(‘keydown’, e => { if (e.key === ‘Enter’) { e.preventDefault(); addInclude(); } });
excInput.addEventListener(‘keydown’, e => { if (e.key === ‘Enter’) { e.preventDefault(); addExclude(); } });

// Load saved filters — load BOTH keys first, then render/sync once.
// If we called syncGlobals() inside the first callback it would re-save
// _excludes=[] and wipe whatever was stored before the second load runs.
storageLoad(STORAGE_KEY_INCLUDE, savedInc => {
_includes = Array.isArray(savedInc) ? savedInc : [];
storageLoad(STORAGE_KEY_EXCLUDE, savedExc => {
_excludes = Array.isArray(savedExc) ? savedExc : [];
renderSummary(); renderPaneChips(); syncGlobals();
});
});

// ── Tab switching ────────────────────────────────────────────────────────────
locPanel.querySelectorAll(’.ap-tab’).forEach(tab => {
tab.addEventListener(‘click’, () => {
locPanel.querySelectorAll(’.ap-tab, .ap-tab-pane’).forEach(el => el.classList.remove(‘active’));
tab.classList.add(‘active’);
document.getElementById(`ap-pane-${tab.dataset.tab}`).classList.add(‘active’);
// focus the right input
if (tab.dataset.tab === ‘inc’) incInput.focus();
else excInput.focus();
});
});

// ── Panel toggle ─────────────────────────────────────────────────────────────
locToggle.addEventListener(‘click’, e => {
e.stopPropagation();
locPanel.classList.toggle(‘open’);
if (locPanel.classList.contains(‘open’)) incInput.focus();
});
document.addEventListener(‘click’, e => {
if (!locPanel.contains(e.target) && e.target !== locToggle)
locPanel.classList.remove(‘open’);
});

// ── Poll mode button ─────────────────────────────────────────────────────────
const pollModeBtn = document.getElementById(‘ap-poll-mode-btn’);
if (pollModeBtn) {
const saved = localStorage.getItem(‘ap_poll_mode’) || ‘sequential’;
pollModeBtn.textContent = saved === ‘interval’ ? ‘\u26A1 Interval’ : ‘\uD83D\uDD17 Sequential’;
pollModeBtn.addEventListener(‘click’, e => {
e.stopPropagation();
if (typeof window.JS_TOGGLE_POLL_MODE === ‘function’) window.JS_TOGGLE_POLL_MODE();
const mode = localStorage.getItem(‘ap_poll_mode’) || ‘sequential’;
pollModeBtn.textContent = mode === ‘interval’ ? ‘\u26A1 Interval’ : ‘\uD83D\uDD17 Sequential’;
});
}

// ── Job ID ───────────────────────────────────────────────────────────────────
const jobidRow   = document.getElementById(‘ap-jobid-row’);
const jobidInput = document.getElementById(‘ap-jobid-input’);
jobidInput.addEventListener(‘input’, () => {
const d = jobidInput.value.replace(/\D/g, ‘’);
jobidInput.value = d;
window.JS_JOB_ID = d ? _pfx + d : ‘’;
storageSave(STORAGE_KEY_JOBID, d);
});
storageLoad(STORAGE_KEY_JOBID, saved => {
if (saved) { jobidInput.value = saved; window.JS_JOB_ID = _pfx + saved; }
});

// ── Scan mode toggle (Jobs vs Schedules) ──────────────────────────────────
const modeCb  = document.getElementById(‘ap-mode-cb’);
const modeLbl = document.getElementById(‘ap-mode-lbl’);

function applyMode(isSchedule) {
window.JS_MODE = isSchedule ? ‘schedules’ : ‘jobs’;
modeLbl.textContent = isSchedule ? ‘Poll Schedules’ : ‘Poll Jobs’;
// Location filter is only useful in Jobs mode
locToggle.style.display  = isSchedule ? ‘none’ : ‘’;
summaryRow.style.display = isSchedule ? ‘none’ : ‘’;
jobidRow.style.display   = isSchedule ? ‘flex’  : ‘none’;
if (!isSchedule) locPanel.classList.remove(‘open’);
storageSave(STORAGE_KEY_MODE, window.JS_MODE);
}

modeCb.addEventListener(‘change’, () => {
applyMode(modeCb.checked);
if (typeof window.JS_ON_MODE_CHANGE === ‘function’) window.JS_ON_MODE_CHANGE();
});
storageLoad(STORAGE_KEY_MODE, saved => {
const isSched = saved === ‘schedules’;
modeCb.checked = isSched; applyMode(isSched);
});

// ── Drag ─────────────────────────────────────────────────────────────────────
let dragging = false, dragOffX = 0, dragOffY = 0;
pill.addEventListener(‘mousedown’, e => {
if (e.target.closest(‘input,button,label,.ap-chip-x’)) return;
dragging = true;
const rect = wrap.getBoundingClientRect();
dragOffX = e.clientX - rect.left; dragOffY = e.clientY - rect.top;
wrap.style.right = ‘auto’; wrap.style.bottom = ‘auto’;
wrap.style.left  = rect.left + ‘px’; wrap.style.top = rect.top + ‘px’;
e.preventDefault();
});
document.addEventListener(‘mousemove’, e => {
if (!dragging) return;
wrap.style.left = (e.clientX - dragOffX) + ‘px’;
wrap.style.top  = (e.clientY - dragOffY) + ‘px’;
});
document.addEventListener(‘mouseup’, () => { dragging = false; });

setStatus(‘IDLE’);
}

// ── setStatus ─────────────────────────────────────────────────────────────────
function setStatus(key) {
const cfg = STATUS[key] || STATUS.IDLE;
const dot = document.getElementById(‘ap-dot’);
const lbl = document.getElementById(‘ap-label’);
const orb = document.getElementById(‘ap-orb’);
if (!dot || !lbl) return;

dot.style.background = cfg.color;
dot.className = cfg.pulse ? ‘pulse’ : ‘’;
lbl.textContent = cfg.label;

if (orb) {
orb.style.background = `linear-gradient(135deg,${cfg.color}cc,${cfg.color})`;
orb.style.boxShadow  = `inset 0 1px 0 rgba(255,255,255,.4),0 3px 10px ${cfg.color}55`;
const d = orb.querySelector(’.ap-orb-dot’);
if (d) d.style.animationPlayState = cfg.pulse ? ‘running’ : ‘paused’;
}

if (key === ‘SCANNING’ || key === ‘POLLING’) startStopwatch();
else if ([‘IDLE’, ‘NO_JOB_ID’].includes(key)) stopStopwatch(true);
else stopStopwatch(false);

// Alert beep when manual questions are needed
if (key === ‘QUESTIONS’ && !setStatus._beeped) {
setStatus.*beeped = true;
try {
const ctx = new (window.AudioContext || window.webkitAudioContext)();
[[880, 0], [880, 0.18]].forEach(([f, d]) => {
const o = ctx.createOscillator(), g = ctx.createGain();
o.connect(g); g.connect(ctx.destination); o.type = ‘square’;
o.frequency.setValueAtTime(f, ctx.currentTime + d);
g.gain.setValueAtTime(0, ctx.currentTime + d);
g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + d + 0.02);
g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.14);
o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.18);
});
} catch (*) {}
}

if (key === ‘APPLIED’) {
if (orb)      orb.style.display      = ‘none’;
if (startBtnEl) startBtnEl.style.display = ‘flex’;
} else {
if (orb)      orb.style.display      = ‘flex’;
if (startBtnEl) startBtnEl.style.display = ‘none’;
}
}

function setScanButtonState(_) { /* reserved */ }

function resetForRescan() {
sessionStorage.removeItem(‘js_applied’);
stopStopwatch(true); setStatus._beeped = false;
const isCA = window.location.hostname.includes(’.ca’);
window.location.href = isCA ? ‘https://hiring.amazon.ca/’ : ‘https://hiring.amazon.com/’;
}

window.JS_IS_APPLIED = () => startBtnEl && startBtnEl.style.display === ‘flex’;
