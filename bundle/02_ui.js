// UI.js — Combined badge: Poll Jobs mode + Poll Schedules mode
// v2: No stop button. Extension always runs. Button is status-only while scanning.

const STATUS = {
  SCANNING:   { label: 'Scanning Jobs\u2026',         color: '#00c853', pulse: true  },
  POLLING:    { label: 'Polling Schedules\u2026',      color: '#00c853', pulse: true  },
  SCHEDULING: { label: 'Fetching Schedule\u2026',      color: '#ff9100', pulse: true  },
  APPLYING:   { label: 'Creating Application\u2026',   color: '#2979ff', pulse: true  },
  QUESTIONS:  { label: 'Answering Questions\u2026',    color: '#aa00ff', pulse: true  },
  APPLIED:    { label: 'Job Applied \u2713',           color: '#00897b', pulse: false },
  IDLE:       { label: 'Idle \u2014 Starting\u2026',   color: '#9e9e9e', pulse: false },
  STOPPED:    { label: 'Restarting\u2026',             color: '#ff9100', pulse: true  },
  NO_JOB_ID:  { label: 'Enter a Job ID first',        color: '#ef5350', pulse: false },
};

// MODE: 'jobs' = poll jobs by city, 'schedules' = poll schedules by job id
window.JS_MODE         = 'jobs';
window.JS_CITY_FILTER  = '';
window.JS_CITY_FILTERS = [];
window.JS_JOB_ID       = '';

function parseCityInput(raw) {
  return [...new Set(
    raw
      .split(',')
      .map(s => s.trim().replace(/\s+/g, ' ').toLowerCase())
      .filter(s => s.length > 0)
  )];
}

let badgeEl    = null;
let startBtnEl = null;

// ── Stopwatch ─────────────────────────────────────────────────────────────────
let _swInterval = null;
let _swSeconds  = 0;

function _swFmt(s) {
  const m   = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function startStopwatch() {
  stopStopwatch(true);
  _swSeconds = 0;
  const el = document.getElementById('js-stopwatch');
  if (el) { el.textContent = '00:00'; el.style.display = 'inline'; }
  _swInterval = setInterval(() => {
    _swSeconds++;
    const el = document.getElementById('js-stopwatch');
    if (el) el.textContent = _swFmt(_swSeconds);
  }, 1000);
}

function stopStopwatch(reset = false) {
  clearInterval(_swInterval);
  _swInterval = null;
  if (reset) {
    _swSeconds = 0;
    const el = document.getElementById('js-stopwatch');
    if (el) { el.textContent = '00:00'; el.style.display = 'none'; }
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function injectBadge() {
  if (badgeEl) return;

  const style = document.createElement('style');
  style.textContent = `
#js-badge-wrap {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  user-select: none;
}

/* Glass pill */
#js-main-pill {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.35));
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border-radius: 60px;
  padding: 10px 10px 10px 16px;
  gap: 12px;
  min-width: 300px;
  border: 1px solid rgba(255,255,255,0.35);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.65), 0 6px 25px rgba(0,0,0,0.35);
  cursor: grab;
}
#js-main-pill:active { cursor: grabbing; }

/* Dot */
#js-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #9e9e9e;
  flex-shrink: 0;
  transition: background 0.3s;
}
#js-dot.pulse { animation: jsDotPulse 1s ease-in-out infinite; }
@keyframes jsDotPulse {
  0%,100% { opacity:1; transform:scale(1); }
  50%      { opacity:0.3; transform:scale(0.7); }
}

/* Text area */
#js-text-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
#js-label {
  color: rgb(40,40,40);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
#js-stopwatch {
  color: rgb(80,80,80);
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  margin-top: 1px;
  display: none;
}

/* Mode toggle row */
#js-mode-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
#js-mode-toggle {
  position: relative;
  width: 38px;
  height: 18px;
  flex-shrink: 0;
}
#js-mode-toggle input { opacity:0; width:0; height:0; }
#js-mode-slider {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background: #9e9e9e;
  transition: background 0.25s;
  cursor: pointer;
}
#js-mode-slider::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  left: 2px;
  top: 2px;
  transition: transform 0.25s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
#js-mode-checkbox:checked + #js-mode-slider { background: #00c853; }
#js-mode-checkbox:checked + #js-mode-slider::before { transform: translateX(20px); }
#js-mode-label {
  color: rgb(60,60,60);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Input row (city or job id) */
#js-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
}
#js-input-prefix-label {
  color: rgb(80,80,80);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}
#js-input-prefix-static {
  color: rgb(80,80,80);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  display: none;
}
#js-main-input {
  background: transparent;
  border: none;
  outline: none;
  color: rgb(60,60,60);
  font-size: 10.5px;
  font-family: inherit;
  font-weight: 400;
  width: 130px;
  caret-color: #00c853;
  padding: 0;
  cursor: text;
}
#js-main-input::placeholder { color: rgb(140,140,140); }

/* Status indicator (replaces start/stop button) */
#js-status-orb {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(135deg, #00e676, #00c853);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 3px 10px rgba(0,200,83,0.45);
  transition: background 0.3s, box-shadow 0.3s;
  /* Not a button — purely decorative status indicator */
  pointer-events: none;
}
#js-status-orb .js-orb-icon {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  animation: orbPulse 1.2s ease-in-out infinite;
}
@keyframes orbPulse {
  0%,100% { transform: scale(1);   opacity: 0.9; }
  50%      { transform: scale(0.6); opacity: 0.4; }
}
#js-status-orb.orb-idle {
  background: linear-gradient(135deg, #bdbdbd, #9e9e9e);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 3px 10px rgba(0,0,0,0.2);
}
#js-status-orb.orb-idle .js-orb-icon { animation: none; opacity: 0.5; }

/* Replay button — shown only after APPLIED, so client can start a new scan */
#js-start-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(135deg,#26c6da,#00acc1);
  border: none;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s, filter 0.12s;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 3px 10px rgba(0,172,193,0.45);
  font-size: 20px;
  color: #fff;
  line-height: 1;
}
#js-start-btn:hover  { filter: brightness(1.1); }
#js-start-btn:active { transform: scale(0.93); }
`;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.id = 'js-badge-wrap';

  const mainPill = document.createElement('div');
  mainPill.id = 'js-main-pill';

  const dot = document.createElement('span');
  dot.id = 'js-dot';

  const _isCA = window.location.hostname.includes('.ca');
  const _jobPrefix = _isCA ? 'JOB-CA-00000' : 'JOB-US-00000';

  const textArea = document.createElement('div');
  textArea.id = 'js-text-area';
  textArea.innerHTML = `
    <span id="js-label">Starting\u2026</span>
    <span id="js-stopwatch">00:00</span>
    <div id="js-mode-row">
      <label id="js-mode-toggle">
        <input type="checkbox" id="js-mode-checkbox" />
        <span id="js-mode-slider"></span>
      </label>
      <span id="js-mode-label">Poll Jobs</span>
    </div>
    <div id="js-input-row">
      <span id="js-input-prefix-label">City :</span>
      <span id="js-input-prefix-static">${_jobPrefix}</span>
      <input id="js-main-input" type="text" placeholder="Enter city (optional)" spellcheck="false" autocomplete="off" />
    </div>
  `;

  // Status orb (not clickable while running)
  const orbEl = document.createElement('div');
  orbEl.id = 'js-status-orb';
  orbEl.innerHTML = `<span class="js-orb-icon"></span>`;

  // Replay button (only shown after APPLIED)
  startBtnEl = document.createElement('button');
  startBtnEl.id = 'js-start-btn';
  startBtnEl.textContent = '\u27F3';
  startBtnEl.title = 'Scan again';
  startBtnEl.addEventListener('click', () => {
    if (typeof window.JS_TOGGLE_SCAN === 'function') window.JS_TOGGLE_SCAN();
  });

  mainPill.appendChild(dot);
  mainPill.appendChild(textArea);
  mainPill.appendChild(orbEl);
  mainPill.appendChild(startBtnEl);
  wrap.appendChild(mainPill);
  document.body.appendChild(wrap);

  // ── Mode toggle handler ──────────────────────────────────────────────────────
  const modeCheckbox   = document.getElementById('js-mode-checkbox');
  const modeLabelEl    = document.getElementById('js-mode-label');
  const prefixLabelEl  = document.getElementById('js-input-prefix-label');
  const prefixStaticEl = document.getElementById('js-input-prefix-static');
  const mainInputEl    = document.getElementById('js-main-input');

  function applyMode(isScheduleMode) {
    window.JS_MODE = isScheduleMode ? 'schedules' : 'jobs';
    if (isScheduleMode) {
      modeLabelEl.textContent       = 'Poll Schedules';
      prefixLabelEl.textContent     = 'Job ID :';
      prefixStaticEl.style.display  = 'inline';
      mainInputEl.placeholder       = '12345';
      mainInputEl.style.width       = '55px';
      mainInputEl.value             = '';
      window.JS_JOB_ID              = '';
      window.JS_CITY_FILTER         = '';
      window.JS_CITY_FILTERS        = [];
    } else {
      modeLabelEl.textContent       = 'Poll Jobs';
      prefixLabelEl.textContent     = 'City :';
      prefixStaticEl.style.display  = 'none';
      mainInputEl.placeholder       = 'e.g. toronto, ottawa';
      mainInputEl.style.width       = '130px';
      mainInputEl.value             = '';
      window.JS_CITY_FILTER         = '';
      window.JS_CITY_FILTERS        = [];
      window.JS_JOB_ID              = '';
    }
  }

  modeCheckbox.addEventListener('change', () => {
    applyMode(modeCheckbox.checked);
    if (typeof window.JS_ON_MODE_CHANGE === 'function') window.JS_ON_MODE_CHANGE();
  });

  mainInputEl.addEventListener('input', (e) => {
    if (window.JS_MODE === 'schedules') {
      const digits = e.target.value.replace(/\D/g, '');
      e.target.value   = digits;
      window.JS_JOB_ID = digits ? _jobPrefix + digits : '';
    } else {
      const parsed = parseCityInput(e.target.value);
      window.JS_CITY_FILTERS = parsed;
      window.JS_CITY_FILTER  = parsed[0] || '';
    }
  });

  // ── Drag ──────────────────────────────────────────────────────────────────────
  let dragging = false, dragOffX = 0, dragOffY = 0;
  mainPill.addEventListener('mousedown', (e) => {
    if (e.target.closest('input, button, label')) return;
    dragging = true;
    const rect = wrap.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    wrap.style.right  = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.left   = rect.left + 'px';
    wrap.style.top    = rect.top  + 'px';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    wrap.style.left = (e.clientX - dragOffX) + 'px';
    wrap.style.top  = (e.clientY - dragOffY)  + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  badgeEl = mainPill;
  setStatus('IDLE');
}

// ── setStatus ─────────────────────────────────────────────────────────────────
function setStatus(key) {
  const cfg   = STATUS[key] || STATUS.IDLE;
  const dot   = document.getElementById('js-dot');
  const label = document.getElementById('js-label');
  const orb   = document.getElementById('js-status-orb');
  if (!dot || !label) return;

  dot.style.background = cfg.color;
  dot.className        = cfg.pulse ? 'pulse' : '';
  label.textContent    = cfg.label;

  // Update orb color to match status
  if (orb) {
    orb.style.background = `linear-gradient(135deg, ${cfg.color}cc, ${cfg.color})`;
    orb.style.boxShadow  = `inset 0 1px 0 rgba(255,255,255,0.4), 0 3px 10px ${cfg.color}66`;
    const orbIcon = orb.querySelector('.js-orb-icon');
    if (orbIcon) orbIcon.style.animationPlayState = cfg.pulse ? 'running' : 'paused';
  }

  // Stopwatch
  if (key === 'SCANNING' || key === 'POLLING') {
    startStopwatch();
  } else if (['IDLE', 'NO_JOB_ID'].includes(key)) {
    stopStopwatch(true);
  } else if (['APPLIED','APPLYING','QUESTIONS','SCHEDULING','STOPPED'].includes(key)) {
    stopStopwatch(false);
  }

  // Alert beep on QUESTIONS
  if (key === 'QUESTIONS' && !setStatus._questionsSoundPlayed) {
    setStatus._questionsSoundPlayed = true;
    try {
      const ctx    = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.9, ctx.currentTime);
      master.connect(ctx.destination);
      [[880, 0], [880, 0.18]].forEach(([freq, delay]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(master);
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.14);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime  + delay + 0.18);
      });
    } catch (e) { /* ignore */ }
  }

  // Show replay button only after APPLIED — hide orb
  if (key === 'APPLIED') {
    if (orb) orb.style.display = 'none';
    if (startBtnEl) startBtnEl.style.display = 'flex';
  } else {
    if (orb) orb.style.display = 'flex';
    if (startBtnEl) startBtnEl.style.display = 'none';
  }
}

// setScanButtonState is a no-op now — orb handles visual state via setStatus
function setScanButtonState(_running) { /* intentionally empty */ }

function resetForRescan() {
  sessionStorage.removeItem('js_applied');
  stopStopwatch(true);
  setStatus._questionsSoundPlayed = false;
  const isCA = window.location.hostname.includes('.ca');
  window.location.href = isCA
    ? 'https://hiring.amazon.ca/'
    : 'https://hiring.amazon.com/';
}

window.JS_IS_APPLIED = () =>
  startBtnEl && startBtnEl.style.display === 'flex';
