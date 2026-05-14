const AP_VERSION = '2.0.0';

const LOCATIONS = {
  Ontario: [
    'Brampton, ON','Mississauga, ON','Etobicoke, ON','Concord, ON','Oakville, ON',
    'Cambridge, ON','Kitchener, ON','Hamilton, ON','Stony Creek, ON','Scarborough, ON',
    'Toronto, ON','Richmond Hill, ON','Whitby, ON','Ajax, ON','Bolton, ON',
    'St Thomas, ON','London, ON','Windsor, ON','Belleville, ON','Ottawa, ON','Barrhaven, ON',
  ],
  Alberta: ['Edmonton, AB','Acheson, AB','Nisku, AB','Calgary, AB','Balzac, AB','Rocky View County, AB'],
  'British Columbia': [
    'Sidney, BC','Delta, BC','Burnaby, BC','Langley, BC','Richmond, BC',
    'New Westminster, BC','Pitt Meadows, BC','Coquitlam, BC','Tsawwassen First Nation, BC',
  ],
  'Nova Scotia': ['Dartmouth, NS'],
  Manitoba: ['Winnipeg, MB'],
};

const STATUS = {
  SCANNING:   {label:'Scanning Jobs…',        color:'#00c853', pulse:true},
  POLLING:    {label:'Polling Schedules…',    color:'#00c853', pulse:true},
  SCHEDULING: {label:'Fetching Schedule…',    color:'#ff9100', pulse:true},
  APPLYING:   {label:'Applying…',             color:'#2979ff', pulse:true},
  QUESTIONS:  {label:'Answering Questions…',  color:'#aa00ff', pulse:true},
  APPLIED:    {label:'Applied ✓',             color:'#00897b', pulse:false},
  IDLE:       {label:'Idle — Starting…',      color:'#9e9e9e', pulse:false},
  STOPPED:    {label:'Restarting…',           color:'#ff9100', pulse:true},
  NO_JOB_ID:  {label:'Enter Job ID first',    color:'#ef5350', pulse:false},
};

window.JS_MODE             = 'jobs';
window.JS_LOCATION_FILTERS = [];
window.JS_EXCLUDE_MODE     = false;
window.JS_JOB_ID           = '';

const _save = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_){} };
const _load = (k, fb) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb; } catch(_){ return fb; } };

let _swTimer = null, _swSecs = 0;
function _startSw() {
  _stopSw(true);
  const el = document.getElementById('ap-sw');
  if (el) { el.textContent = '00:00'; el.style.display = 'inline'; }
  _swTimer = setInterval(() => {
    _swSecs++;
    const el = document.getElementById('ap-sw');
    if (el) el.textContent = `${String(Math.floor(_swSecs/60)).padStart(2,'0')}:${String(_swSecs%60).padStart(2,'0')}`;
  }, 1000);
}
function _stopSw(reset = false) {
  clearInterval(_swTimer); _swTimer = null;
  if (reset) { _swSecs = 0; const el = document.getElementById('ap-sw'); if (el) { el.textContent='00:00'; el.style.display='none'; } }
}

let _replayBtn = null;

function injectBadge() {
  if (document.getElementById('ap-wrap')) return;

  const css = document.createElement('style');
  css.textContent = `
#ap-wrap{position:fixed;top:14px;right:14px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;user-select:none}
#ap-pill{display:flex;align-items:flex-start;background:linear-gradient(135deg,rgba(255,255,255,.62),rgba(255,255,255,.42));backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%);border-radius:18px;padding:12px 10px 12px 14px;gap:10px;width:320px;border:1px solid rgba(255,255,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 6px 25px rgba(0,0,0,.28);cursor:grab}
#ap-pill:active{cursor:grabbing}
#ap-dot{width:8px;height:8px;border-radius:50%;background:#9e9e9e;flex-shrink:0;margin-top:5px;transition:background .3s}
#ap-dot.pulse{animation:apPulse 1s ease-in-out infinite}
@keyframes apPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
#ap-body{display:flex;flex-direction:column;flex:1;min-width:0;gap:5px}
#ap-label{color:#1e1e1e;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;line-height:1.3}
#ap-ver{color:#bbb;font-size:9px;font-weight:600;letter-spacing:.04em}
#ap-sw{color:#555;font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;display:none}
#ap-mode-row{display:flex;align-items:center;gap:6px}
#ap-mode-tog{position:relative;width:36px;height:17px;flex-shrink:0}
#ap-mode-tog input{opacity:0;width:0;height:0}
#ap-mode-sl{position:absolute;inset:0;border-radius:17px;background:#bdbdbd;transition:background .25s;cursor:pointer}
#ap-mode-sl::before{content:'';position:absolute;width:13px;height:13px;border-radius:50%;background:#fff;left:2px;top:2px;transition:transform .25s;box-shadow:0 1px 3px rgba(0,0,0,.25)}
#ap-mode-cb:checked+#ap-mode-sl{background:#00c853}
#ap-mode-cb:checked+#ap-mode-sl::before{transform:translateX(19px)}
#ap-mode-lbl{color:#3c3c3c;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
#ap-badge{font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:1px 7px;border-radius:20px;background:rgba(0,180,70,.12);border:1px solid rgba(0,180,70,.35);color:rgb(0,110,45)}
#ap-badge.excl{background:rgba(239,83,80,.12);border-color:rgba(239,83,80,.4);color:rgb(180,30,30)}
#ap-chips{display:flex;flex-wrap:wrap;gap:3px;min-height:14px}
#ap-chips:empty::before{content:'All locations';color:#aaa;font-size:9.5px;font-style:italic;line-height:1.6}
.ap-chip{display:inline-flex;align-items:center;gap:2px;border-radius:20px;padding:1px 7px 1px 8px;font-size:9.5px;font-weight:600;white-space:nowrap}
.ap-chip.inc{background:rgba(0,180,70,.12);border:1px solid rgba(0,180,70,.35);color:rgb(0,110,45)}
.ap-chip.exc{background:rgba(239,83,80,.12);border:1px solid rgba(239,83,80,.45);color:rgb(180,30,30)}
.ap-chip-x{cursor:pointer;font-size:11px;opacity:.5;margin-left:1px}
.ap-chip-x:hover{opacity:1}
.ap-btn{border-radius:8px;padding:3px 9px;font-size:10px;font-weight:600;cursor:pointer;align-self:flex-start}
#ap-loc-btn{background:rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.12);color:#3c3c3c}
#ap-loc-btn:hover{background:rgba(0,0,0,.1)}
#ap-poll-btn{background:rgba(41,121,255,.1);border:1px solid rgba(41,121,255,.35);color:rgb(20,70,180)}
#ap-poll-btn:hover{background:rgba(41,121,255,.2)}
#ap-jobid-row{display:none;align-items:center;gap:4px}
#ap-jobid-pfx{color:#555;font-size:10px;font-weight:600;white-space:nowrap}
#ap-jobid-inp{background:rgba(255,255,255,.6);border:1px solid rgba(0,0,0,.15);border-radius:8px;outline:none;padding:3px 8px;font-size:10.5px;font-family:inherit;color:#282828;width:65px}
#ap-orb{width:40px;height:40px;border-radius:50%;flex-shrink:0;margin-top:2px;background:linear-gradient(135deg,#00e676,#00c853);border:none;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 3px 10px rgba(0,200,83,.4);transition:background .3s,box-shadow .3s}
#ap-orb-dot{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.9);animation:apOrb 1.2s ease-in-out infinite}
@keyframes apOrb{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(.6);opacity:.4}}
#ap-replay{width:40px;height:40px;border-radius:50%;flex-shrink:0;margin-top:2px;background:linear-gradient(135deg,#26c6da,#00acc1);border:none;cursor:pointer;display:none;align-items:center;justify-content:center;font-size:19px;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 3px 10px rgba(0,172,193,.4)}
#ap-replay:hover{filter:brightness(1.1)}
#ap-panel{display:none;flex-direction:column;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15);width:320px}
#ap-panel.open{display:flex}
#ap-psearch{position:sticky;top:0;z-index:1;padding:8px 10px 6px;border-bottom:1px solid rgba(0,0,0,.08);background:#fff}
#ap-psearch-inp,#ap-custom-inp{width:100%;box-sizing:border-box;border:1px solid rgba(0,0,0,.15);border-radius:8px;padding:5px 10px;font-size:11px;font-family:inherit;outline:none;caret-color:#00c853}
#ap-custom-row{display:flex;gap:4px;margin-top:6px}
#ap-custom-inp{flex:1;width:auto}
#ap-custom-add{background:rgba(0,200,83,.15);border:1px solid rgba(0,200,83,.4);border-radius:8px;padding:4px 8px;font-size:10px;font-weight:700;color:rgb(0,110,45);cursor:pointer;white-space:nowrap}
#ap-custom-add:hover{background:rgba(0,200,83,.3)}
#ap-excl-row{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid rgba(0,0,0,.06);background:rgb(249,249,249)}
#ap-excl-title{font-size:10px;font-weight:700;color:#3c3c3c;letter-spacing:.04em;text-transform:uppercase}
#ap-excl-desc{font-size:9px;color:#8c8c8c;margin-top:1px}
#ap-excl-tog{position:relative;width:40px;height:19px;flex-shrink:0}
#ap-excl-tog input{opacity:0;width:0;height:0}
#ap-excl-sl{position:absolute;inset:0;border-radius:19px;background:#bdbdbd;transition:background .25s;cursor:pointer}
#ap-excl-sl::before{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;left:2px;top:2px;transition:transform .25s;box-shadow:0 1px 3px rgba(0,0,0,.25)}
#ap-excl-cb:checked+#ap-excl-sl{background:#ef5350}
#ap-excl-cb:checked+#ap-excl-sl::before{transform:translateX(21px)}
#ap-list-scroll{max-height:260px;overflow-y:auto}
.ap-prov{padding:5px 10px 3px;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8c8c8c;background:rgb(248,248,248);border-bottom:1px solid rgba(0,0,0,.05)}
.ap-loc{padding:7px 12px;font-size:11px;color:#282828;cursor:pointer;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(0,0,0,.04);transition:background .1s}
.ap-loc:hover{background:rgba(0,0,0,.03)}
.ap-loc.sel-inc{color:rgb(0,130,50);font-weight:600}
.ap-loc.sel-inc::after{content:'✓';font-size:11px;color:#00c853}
.ap-loc.sel-exc{color:rgb(180,30,30);font-weight:600}
.ap-loc.sel-exc::after{content:'✕';font-size:11px;color:#ef5350}
.ap-loc.hidden{display:none}
`;
  document.head.appendChild(css);

  const isCA = window.location.hostname.includes('.ca');
  const pfx  = isCA ? 'JOB-CA-00000' : 'JOB-US-00000';

  const wrap = document.createElement('div'); wrap.id = 'ap-wrap';
  wrap.innerHTML = `
    <div id="ap-pill">
      <span id="ap-dot"></span>
      <div id="ap-body">
        <span id="ap-label">Starting…</span>
        <span id="ap-ver">v${AP_VERSION}</span>
        <span id="ap-sw"></span>
        <div id="ap-mode-row">
          <label id="ap-mode-tog"><input type="checkbox" id="ap-mode-cb"><span id="ap-mode-sl"></span></label>
          <span id="ap-mode-lbl">Poll Jobs</span>
        </div>
        <span id="ap-badge">All Locations</span>
        <div id="ap-chips"></div>
        <button class="ap-btn" id="ap-loc-btn">✚ Locations</button>
        <button class="ap-btn" id="ap-poll-btn">⚡ Interval</button>
        <div id="ap-jobid-row">
          <span id="ap-jobid-pfx">${pfx}</span>
          <input id="ap-jobid-inp" type="text" placeholder="12345">
        </div>
      </div>
      <div id="ap-orb"><span id="ap-orb-dot"></span></div>
      <button id="ap-replay">⟳</button>
    </div>
    <div id="ap-panel">
      <div id="ap-psearch">
        <input id="ap-psearch-inp" type="text" placeholder="Search location…" autocomplete="off" spellcheck="false">
        <div id="ap-custom-row">
          <input id="ap-custom-inp" type="text" placeholder="Custom location…" autocomplete="off" spellcheck="false">
          <button id="ap-custom-add">+ Add</button>
        </div>
      </div>
      <div id="ap-excl-row">
        <div>
          <div id="ap-excl-title">Exclude Mode</div>
          <div id="ap-excl-desc">Catch all <em>except</em> selected</div>
        </div>
        <label id="ap-excl-tog"><input type="checkbox" id="ap-excl-cb"><span id="ap-excl-sl"></span></label>
      </div>
      <div id="ap-list-scroll"><div id="ap-list"></div></div>
    </div>
  `;
  document.body.appendChild(wrap);

  _replayBtn = document.getElementById('ap-replay');
  _replayBtn.addEventListener('click', () => {
    if (typeof window.JS_TOGGLE_SCAN === 'function') window.JS_TOGGLE_SCAN();
  });

  // ── Location state ─────────────────────────────────────────────────────────────
  let _sel = _load('ap_locs', []);
  let _excl = _load('ap_excl', false);

  function _sync() {
    window.JS_LOCATION_FILTERS = [..._sel];
    window.JS_EXCLUDE_MODE = _excl;
    _save('ap_locs', _sel);
    _save('ap_excl', _excl);
  }

  function _selClass() { return _excl ? 'sel-exc' : 'sel-inc'; }
  function _chipClass() { return _excl ? 'exc' : 'inc'; }

  function _renderChips() {
    const el = document.getElementById('ap-chips');
    const badge = document.getElementById('ap-badge');
    el.innerHTML = '';
    _sel.forEach(loc => {
      const c = document.createElement('span');
      c.className = `ap-chip ${_chipClass()}`;
      c.innerHTML = `${loc}<span class="ap-chip-x" data-loc="${loc}">×</span>`;
      c.querySelector('.ap-chip-x').addEventListener('click', e => {
        e.stopPropagation();
        _sel = _sel.filter(x => x !== loc);
        _renderChips(); _updateList(); _sync();
      });
      el.appendChild(c);
    });
    if (!_sel.length) {
      badge.textContent = 'All Locations'; badge.className = '';  badge.id = 'ap-badge';
    } else if (_excl) {
      badge.textContent = `Excluding ${_sel.length}`; badge.className = 'excl'; badge.id = 'ap-badge';
    } else {
      badge.textContent = `Including ${_sel.length}`; badge.className = ''; badge.id = 'ap-badge';
    }
  }

  function _updateList() {
    document.querySelectorAll('.ap-loc').forEach(el => {
      el.classList.remove('sel-inc','sel-exc');
      if (_sel.includes(el.dataset.loc)) el.classList.add(_selClass());
    });
  }

  function _buildList() {
    const list = document.getElementById('ap-list');
    list.innerHTML = '';
    Object.entries(LOCATIONS).forEach(([prov, locs]) => {
      const h = document.createElement('div'); h.className = 'ap-prov'; h.textContent = prov;
      list.appendChild(h);
      locs.forEach(loc => {
        const item = document.createElement('div');
        item.className = 'ap-loc'; item.textContent = loc; item.dataset.loc = loc;
        if (_sel.includes(loc)) item.classList.add(_selClass());
        item.addEventListener('click', () => {
          if (_sel.includes(loc)) { _sel = _sel.filter(x => x !== loc); item.classList.remove('sel-inc','sel-exc'); }
          else { _sel.push(loc); item.classList.remove('sel-inc','sel-exc'); item.classList.add(_selClass()); }
          _renderChips(); _sync();
        });
        list.appendChild(item);
      });
    });
  }

  function _addCustom(raw) {
    const loc = raw.trim(); if (!loc || _sel.includes(loc)) return;
    _sel.push(loc);
    let grp = document.getElementById('ap-custom-grp');
    if (!grp) {
      grp = document.createElement('div'); grp.id = 'ap-custom-grp';
      const h = document.createElement('div'); h.className = 'ap-prov'; h.textContent = 'Custom';
      grp.appendChild(h); document.getElementById('ap-list').appendChild(grp);
    }
    const item = document.createElement('div');
    item.className = `ap-loc ${_selClass()}`; item.textContent = loc; item.dataset.loc = loc;
    item.addEventListener('click', () => {
      if (_sel.includes(loc)) { _sel = _sel.filter(x => x !== loc); item.classList.remove('sel-inc','sel-exc'); }
      else { _sel.push(loc); item.classList.remove('sel-inc','sel-exc'); item.classList.add(_selClass()); }
      _renderChips(); _sync();
    });
    grp.appendChild(item); _renderChips(); _sync();
  }

  // search filter
  document.getElementById('ap-psearch-inp').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.ap-loc').forEach(el => el.classList.toggle('hidden', !!q && !el.dataset.loc.toLowerCase().includes(q)));
    document.querySelectorAll('.ap-prov').forEach(h => {
      let sib = h.nextSibling, any = false;
      while (sib && !sib.classList?.contains('ap-prov')) {
        if (sib.classList?.contains('ap-loc') && !sib.classList?.contains('hidden')) any = true;
        sib = sib.nextSibling;
      }
      h.style.display = any ? '' : 'none';
    });
  });

  // custom add
  const custInp = document.getElementById('ap-custom-inp');
  document.getElementById('ap-custom-add').addEventListener('click', () => { _addCustom(custInp.value); custInp.value = ''; });
  custInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _addCustom(custInp.value); custInp.value = ''; } });

  // exclude toggle
  const exclCb = document.getElementById('ap-excl-cb');
  exclCb.checked = _excl;
  exclCb.addEventListener('change', () => { _excl = exclCb.checked; _updateList(); _renderChips(); _sync(); });

  // panel open/close
  const panel = document.getElementById('ap-panel');
  document.getElementById('ap-loc-btn').addEventListener('click', e => {
    e.stopPropagation(); panel.classList.toggle('open');
    if (panel.classList.contains('open')) document.getElementById('ap-psearch-inp').focus();
  });
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== document.getElementById('ap-loc-btn')) panel.classList.remove('open');
  });

  // poll mode button
  const pollBtn = document.getElementById('ap-poll-btn');
  const _setPollLabel = () => {
    pollBtn.textContent = (localStorage.getItem('ap_poll_mode') || 'sequential') === 'interval' ? '⚡ Interval' : '🔗 Sequential';
  };
  _setPollLabel();
  pollBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (typeof window.JS_TOGGLE_POLL_MODE === 'function') window.JS_TOGGLE_POLL_MODE();
    _setPollLabel();
  });

  // job id
  const jobInp = document.getElementById('ap-jobid-inp');
  const savedJob = _load('ap_job_id', '');
  if (savedJob) { jobInp.value = savedJob; window.JS_JOB_ID = pfx + savedJob; }
  jobInp.addEventListener('input', () => {
    const d = jobInp.value.replace(/\D/g,''); jobInp.value = d;
    window.JS_JOB_ID = d ? pfx + d : '';
    _save('ap_job_id', d);
  });

  // job/schedule mode toggle
  const modeCb  = document.getElementById('ap-mode-cb');
  const modeLbl = document.getElementById('ap-mode-lbl');
  const jobidRow = document.getElementById('ap-jobid-row');
  const locEls = () => ['ap-badge','ap-chips','ap-loc-btn'].map(id => document.getElementById(id));

  function _applyMode(isSched) {
    window.JS_MODE = isSched ? 'schedules' : 'jobs';
    modeLbl.textContent = isSched ? 'Poll Schedules' : 'Poll Jobs';
    locEls().forEach(el => { if (el) el.style.display = isSched ? 'none' : ''; });
    jobidRow.style.display = isSched ? 'flex' : 'none';
    if (!isSched) panel.classList.remove('open');
    _save('ap_mode', window.JS_MODE);
  }
  const savedMode = _load('ap_mode', 'jobs');
  modeCb.checked = savedMode === 'schedules'; _applyMode(savedMode === 'schedules');
  modeCb.addEventListener('change', () => {
    _applyMode(modeCb.checked);
    if (typeof window.JS_ON_MODE_CHANGE === 'function') window.JS_ON_MODE_CHANGE();
  });

  // drag
  let _drag = false, _dx = 0, _dy = 0;
  document.getElementById('ap-pill').addEventListener('mousedown', e => {
    if (e.target.closest('input,button,label,.ap-chip-x')) return;
    _drag = true;
    const r = wrap.getBoundingClientRect();
    _dx = e.clientX - r.left; _dy = e.clientY - r.top;
    wrap.style.right = 'auto'; wrap.style.bottom = 'auto';
    wrap.style.left = r.left+'px'; wrap.style.top = r.top+'px';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => { if (_drag) { wrap.style.left=(e.clientX-_dx)+'px'; wrap.style.top=(e.clientY-_dy)+'px'; } });
  document.addEventListener('mouseup', () => { _drag = false; });

  _buildList(); _renderChips(); _sync();
  setStatus('IDLE');
}

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
    orb.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,.4),0 3px 10px ${cfg.color}55`;
    const d = orb.querySelector('#ap-orb-dot');
    if (d) d.style.animationPlayState = cfg.pulse ? 'running' : 'paused';
  }

  if (['SCANNING','POLLING'].includes(key)) _startSw();
  else if (['IDLE','NO_JOB_ID'].includes(key)) _stopSw(true);
  else _stopSw(false);

  if (key === 'QUESTIONS' && !setStatus._beeped) {
    setStatus._beeped = true;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[880,0],[880,.18]].forEach(([f,d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'square';
        o.frequency.setValueAtTime(f, ctx.currentTime+d);
        g.gain.setValueAtTime(0, ctx.currentTime+d);
        g.gain.linearRampToValueAtTime(.25, ctx.currentTime+d+.02);
        g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime+d+.14);
        o.start(ctx.currentTime+d); o.stop(ctx.currentTime+d+.18);
      });
    } catch(_) {}
  }

  const show = key === 'APPLIED';
  if (orb) orb.style.display = show ? 'none' : 'flex';
  if (_replayBtn) _replayBtn.style.display = show ? 'flex' : 'none';
}

function setScanButtonState(_) {}

function resetForRescan() {
  sessionStorage.removeItem('js_applied');
  setStatus._beeped = false;
  _stopSw(true);
  window.location.href = window.location.hostname.includes('.ca')
    ? 'https://hiring.amazon.ca/' : 'https://hiring.amazon.com/';
}

window.JS_IS_APPLIED = () => _replayBtn && _replayBtn.style.display === 'flex';
