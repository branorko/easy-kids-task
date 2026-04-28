/**
 * ulohy-card.js  –  Úlohy pre domácnosť  v2.5.5
 * Každá osoba má vlastnú farebnú kartu.
 * Novinky v2.1: bodovací systém, log transakcií, stály zoznam, výber kto urobil
 */

// ─── Konštanty ───────────────────────────────────────────────────────────────
const POLL_MS = 15000;

const PALETTE = [
  { bg: '#E6F1FB', border: '#378ADD', text: '#0C447C' },
  { bg: '#EAF3DE', border: '#639922', text: '#27500A' },
  { bg: '#FBEAF0', border: '#D4537E', text: '#72243E' },
  { bg: '#FAEEDA', border: '#BA7517', text: '#633806' },
  { bg: '#EEEDFE', border: '#7F77DD', text: '#3C3489' },
  { bg: '#FAECE7', border: '#D85A30', text: '#712B13' },
  { bg: '#E1F5EE', border: '#1D9E75', text: '#085041' },
  { bg: '#FCEBEB', border: '#E24B4A', text: '#791F1F' },
];

const ROLES = ['Dieťa', 'Rodič', 'Člen'];

// ─── Pomocné ─────────────────────────────────────────────────────────────────
const uid      = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDay(iso) {
  const d   = new Date(iso + 'T12:00:00');
  const DAY = ['Ne','Po','Ut','St','Št','Pi','So'];
  const MON = ['jan','feb','mar','apr','máj','jún','júl','aug','sep','okt','nov','dec'];
  const t   = todayISO();
  const prefix = iso === t ? 'Dnes, ' : iso === addDays(t,-1) ? 'Včera, ' : iso === addDays(t,1) ? 'Zajtra, ' : '';
  return `${prefix}${DAY[d.getDay()]} ${d.getDate()}. ${MON[d.getMonth()]}`;
}

function fmtDateTime(isoStr) {
  const d   = new Date(isoStr);
  const DAY = ['Ne','Po','Ut','St','Št','Pi','So'];
  const MON = ['jan','feb','mar','apr','máj','jún','júl','aug','sep','okt','nov','dec'];
  const pad = n => String(n).padStart(2,'0');
  return `${DAY[d.getDay()]} ${d.getDate()}. ${MON[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function occurrencesOnDate(task, iso) {
  if (!task.repeat || task.repeat === 'none') return task.date === iso;
  if (iso < task.date) return false;
  if (task.repeat === 'daily') return true;
  if (task.repeat === 'weekly') {
    const dow = new Date(iso + 'T12:00:00').getDay();
    return (task.repeatDays || []).includes(dow);
  }
  if (task.repeat === 'monthly') {
    return new Date(iso+'T12:00:00').getDate() === new Date(task.date+'T12:00:00').getDate();
  }
  if (task.repeat === 'yearly') {
    const a = new Date(iso+'T12:00:00'), b = new Date(task.date+'T12:00:00');
    return a.getDate()===b.getDate() && a.getMonth()===b.getMonth();
  }
  return false;
}

function getOcc(task, iso)             { return (task.occurrences||{})[`${task.id}_${iso}`] || 'todo'; }
function setOcc(task, iso, st, doneBy) {
  if (!task.occurrences) task.occurrences = {};
  if (!task.doneBy) task.doneBy = {};
  task.occurrences[`${task.id}_${iso}`] = st;
  if (doneBy !== undefined) task.doneBy[`${task.id}_${iso}`] = doneBy;
}
function getDoneBy(task, iso) { return (task.doneBy||{})[`${task.id}_${iso}`] || []; }

const REPEAT_LABEL = { none:'Jednorazová', daily:'Denne', weekly:'Týždenne', monthly:'Mesačne', yearly:'Ročne' };
const DOW_LABEL    = ['Ne','Po','Ut','St','Št','Pi','So'];

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
:host {
  display: block;
  font-family: var(--primary-font-family, system-ui, sans-serif);
  --r: 12px; --rs: 8px;
  --bg:  var(--card-background-color, #fff);
  --sf:  var(--secondary-background-color, #f5f5f5);
  --bd:  var(--divider-color, rgba(0,0,0,.12));
  --tx:  var(--primary-text-color, #212121);
  --mu:  var(--secondary-text-color, #757575);
  --ac:  var(--primary-color, #1976d2);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Obal karty ── */
.wrap { background: var(--bg); border-radius: var(--r); overflow: hidden; }

/* ── Hlavička ── */
.hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 0;
}
.hdr-title { font-size: 16px; font-weight: 600; color: var(--tx); }
.hdr-acts  { display: flex; gap: 6px; }
.icon-btn {
  background: none; border: none; cursor: pointer;
  color: var(--mu); padding: 6px; border-radius: var(--rs);
  font-size: 16px; line-height: 1; transition: background .15s, color .15s;
}
.icon-btn:hover { background: var(--sf); color: var(--tx); }
.icon-btn.on { color: var(--ac); }

/* ── Saving bar ── */
.sbar { font-size: 11px; color: var(--mu); padding: 2px 16px; min-height: 18px; }

/* ── Navigácia dátumom ── */
.dnav {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px 10px;
  border-bottom: 1px solid var(--bd);
}
.nav-btn {
  background: none; border: 1px solid var(--bd); border-radius: var(--rs);
  width: 28px; height: 28px; cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  color: var(--tx); transition: background .15s;
}
.nav-btn:hover { background: var(--sf); }
.date-lbl { flex: 1; font-size: 14px; font-weight: 500; color: var(--tx); }
.today-chip {
  font-size: 11px; padding: 3px 8px; border: 1px solid var(--bd);
  border-radius: 20px; background: none; cursor: pointer; color: var(--mu);
  font-family: inherit; transition: background .15s;
}
.today-chip:hover { background: var(--sf); }

/* ── Osobné karty – grid ── */
.persons-grid {
  display: flex; flex-direction: column; gap: 10px;
  padding: 12px 16px 16px;
}

/* ── Jedna osobná karta ── */
.pcard {
  border-radius: var(--rs);
  border: 1.5px solid var(--bd);
  overflow: hidden;
  transition: box-shadow .15s;
}
.pcard:hover { box-shadow: 0 2px 8px rgba(0,0,0,.08); }

.pcard-hdr {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border-bottom: 1.5px solid var(--bd);
}
.pcard-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; flex-shrink: 0;
  overflow: hidden; border: 2px solid rgba(0,0,0,.08);
}
.pcard-avatar img { width: 100%; height: 100%; object-fit: cover; }
.pcard-info { flex: 1; min-width: 0; }
.pcard-name { font-size: 14px; font-weight: 600; color: var(--tx); }
.pcard-meta { font-size: 11px; color: var(--mu); margin-top: 1px; }
.pcard-prog {
  font-size: 12px; font-weight: 600; padding: 3px 8px;
  border-radius: 20px; white-space: nowrap; flex-shrink: 0;
}
/* Body badge */
.pts-badge {
  font-size: 11px; font-weight: 700; padding: 3px 9px;
  border-radius: 12px; white-space: nowrap; flex-shrink: 0;
  cursor: pointer; transition: opacity .15s;
  background: #E8F0FE; color: #1565C0; border: 1px solid rgba(21,101,192,.2);
}
.pts-badge.neg { background: #FCEBEB; color: #791F1F; border-color: rgba(121,31,31,.2); }
.pts-badge:hover { opacity: .8; }

/* ── Zoznam úloh v karte ── */
.task-list { padding: 4px 0; }

.task-row {
  border-bottom: 1px solid var(--bd);
  transition: background .1s;
}
.task-row:last-child { border-bottom: none; }

.task-main {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer; user-select: none;
}
.task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-todo    { background: #EF9F27; }
.dot-done    { background: #639922; }
.dot-overdue { background: #E24B4A; }

.task-name {
  flex: 1; font-size: 13px; font-weight: 500; color: var(--tx);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.task-rtag {
  font-size: 10px; padding: 2px 5px; border-radius: 8px;
  background: var(--sf); color: var(--mu);
  border: 1px solid var(--bd); white-space: nowrap; flex-shrink: 0;
}
.task-ptag {
  font-size: 10px; padding: 2px 5px; border-radius: 8px;
  background: #E8F0FE; color: #1565C0;
  border: 1px solid rgba(21,101,192,.2); white-space: nowrap; flex-shrink: 0;
  font-weight: 600;
}
.task-badge {
  font-size: 11px; font-weight: 600; padding: 3px 8px;
  border-radius: 10px; white-space: nowrap; flex-shrink: 0;
}
.badge-todo    { background: #FAEEDA; color: #633806; }
.badge-done    { background: #EAF3DE; color: #27500A; }
.badge-overdue { background: #FCEBEB; color: #791F1F; }

.task-chev { font-size: 11px; color: var(--mu); transition: transform .2s; flex-shrink: 0; }
.task-row.open .task-chev { transform: rotate(90deg); }

/* ── Detail úlohy ── */
.task-detail {
  display: none; padding: 8px 12px 10px;
  background: var(--sf); border-top: 1px solid var(--bd);
  flex-wrap: wrap; gap: 6px; align-items: flex-start;
}
.task-row.open .task-detail { display: flex; }
.task-note { font-size: 12px; color: var(--mu); flex-basis: 100%; margin-bottom: 2px; }

/* Výber kto urobil */
.who-lbl {
  font-size: 11px; font-weight: 600; color: var(--mu);
  text-transform: uppercase; letter-spacing: .05em;
  flex-basis: 100%; margin-bottom: 2px;
}
.who-grid { display: flex; gap: 6px; flex-wrap: wrap; flex-basis: 100%; }
.who-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 9px; border: 1.5px solid var(--bd);
  border-radius: 20px; background: var(--bg);
  cursor: pointer; font-size: 12px; font-weight: 500;
  color: var(--tx); font-family: inherit; transition: border-color .15s, background .15s;
}
.who-btn.sel { border-color: var(--ac); background: #E8F0FE; color: #1565C0; }
.who-av {
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--bd); display: flex; align-items: center;
  justify-content: center; font-size: 9px; font-weight: 700; overflow: hidden;
}
.who-av img { width: 100%; height: 100%; object-fit: cover; }
.confirm-btn {
  font-size: 12px; font-weight: 600; padding: 6px 11px;
  border-radius: var(--rs); border: none; cursor: pointer;
  font-family: inherit; background: #EAF3DE; color: #27500A;
  transition: opacity .15s; margin-top: 2px;
}
.confirm-btn:disabled { opacity: .35; cursor: not-allowed; }
.confirm-btn:not(:disabled):hover { opacity: .85; }
.done-info {
  font-size: 11px; color: #27500A; background: #EAF3DE;
  padding: 3px 8px; border-radius: var(--rs); flex-basis: 100%;
}

.act-btn {
  font-size: 12px; font-weight: 600; padding: 6px 11px;
  border-radius: var(--rs); border: none; cursor: pointer;
  font-family: inherit; transition: opacity .15s;
}
.act-btn:hover { opacity: .85; }
.btn-revert  { background: var(--sf); color: var(--mu); border: 1px solid var(--bd); }
.admin-acts  { margin-left: auto; display: flex; gap: 4px; }
.edit-ic, .del-ic {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: var(--mu); padding: 4px 6px;
  border-radius: 6px; transition: background .15s, color .15s;
}
.edit-ic:hover { background: #FAEEDA; color: #633806; }
.del-ic:hover  { background: #FCEBEB; color: #791F1F; }

/* ── Log transakcií ── */
.log-wrap { border-top: 1px solid var(--bd); }
.log-toggle {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 7px 12px; background: none; border: none;
  cursor: pointer; font-size: 11px; font-weight: 600; color: var(--mu);
  text-transform: uppercase; letter-spacing: .06em; font-family: inherit;
  transition: color .15s, background .15s; text-align: left;
}
.log-toggle:hover { color: var(--tx); background: var(--sf); }
.log-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
.log-table th {
  text-align: left; padding: 6px 10px; font-size: 11px; font-weight: 600;
  color: var(--mu); border-bottom: 2px solid var(--bd); white-space: nowrap;
}
.log-table td { padding: 5px 10px; border-bottom: 1px solid var(--bd); vertical-align: top; }
.log-table tr:last-child td { border-bottom: none; }
.log-pos { color: #27500A; font-weight: 700; }
.log-neg { color: #791F1F; font-weight: 700; }
.log-bal { font-weight: 600; }
.log-ts  { color: var(--mu); white-space: nowrap; font-size: 11px; }

/* ── Stály zoznam sekcia ── */
.perm-section {
  padding: 12px 16px 16px;
  border-top: 2px solid var(--bd);
  margin-top: 4px;
}
.perm-title {
  font-size: 13px; font-weight: 600; color: var(--tx);
  margin-bottom: 10px; display: flex; align-items: center; gap: 6px;
}

/* ── Empty ── */
.empty { text-align: center; padding: 24px 12px; color: var(--mu); font-size: 13px; }
.empty-ico { font-size: 26px; margin-bottom: 6px; }

/* ── Add button ── */
.add-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 8px; margin-top: 4px;
  border: 1px dashed var(--bd); border-radius: var(--rs);
  background: none; cursor: pointer; font-size: 13px; color: var(--mu);
  font-family: inherit; transition: border-color .15s, color .15s;
}
.add-btn:hover { border-color: var(--ac); color: var(--ac); }

/* ── Modal ── */
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .2s;
}
.overlay.open { opacity: 1; pointer-events: all; }
.modal {
  background: var(--bg); border-radius: var(--r); padding: 20px;
  width: min(420px, 93vw); max-height: 88vh; overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
  transform: translateY(12px); transition: transform .2s;
}
.overlay.open .modal { transform: translateY(0); }
.modal-title { font-size: 15px; font-weight: 600; color: var(--tx); margin-bottom: 14px; }
.fg { margin-bottom: 11px; }
.fl { display: block; font-size: 12px; font-weight: 500; color: var(--mu); margin-bottom: 4px; }
.fi, .fsel, .fta {
  width: 100%; padding: 7px 9px; border: 1px solid var(--bd);
  border-radius: var(--rs); background: var(--bg); color: var(--tx);
  font-size: 13px; font-family: inherit; outline: none; transition: border-color .15s;
}
.fi:focus, .fsel:focus, .fta:focus { border-color: var(--ac); }
.fta { min-height: 54px; resize: vertical; }
.wdgrid { display: flex; gap: 5px; flex-wrap: wrap; }
.wdbtn {
  width: 34px; height: 34px; border: 1px solid var(--bd); border-radius: 50%;
  background: none; cursor: pointer; font-size: 11px; font-weight: 500;
  color: var(--mu); font-family: inherit; transition: background .15s, color .15s, border-color .15s;
}
.wdbtn.sel { background: var(--ac); color: #fff; border-color: var(--ac); }
.mfooter {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 14px; padding-top: 11px; border-top: 1px solid var(--bd);
}
.btn-cancel {
  padding: 7px 14px; border: 1px solid var(--bd); border-radius: var(--rs);
  background: none; cursor: pointer; font-size: 13px; color: var(--mu); font-family: inherit;
}
.btn-save {
  padding: 7px 14px; border: none; border-radius: var(--rs);
  background: var(--ac); color: #fff; cursor: pointer;
  font-size: 13px; font-weight: 500; font-family: inherit;
}
.btn-save:hover { opacity: .9; }
.btn-del {
  padding: 7px 14px; border: none; border-radius: var(--rs);
  background: #FCEBEB; color: #791F1F; cursor: pointer;
  font-size: 13px; font-family: inherit; margin-right: auto;
}

/* ── PIN ── */
.pin-wrap { text-align: center; padding: 24px 16px; }
.pin-sub  { font-size: 13px; color: var(--mu); margin-bottom: 8px; }
.pin-dots { display: flex; gap: 12px; justify-content: center; margin: 10px 0; }
.pin-dot  {
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--bd); background: none; transition: background .15s;
}
.pin-dot.f { background: var(--ac); border-color: var(--ac); }
.pin-grid  { display: grid; grid-template-columns: repeat(3,62px); gap: 7px; justify-content: center; margin-top: 8px; }
.pin-key   {
  height: 46px; border: 1px solid var(--bd); border-radius: var(--rs);
  background: var(--sf); cursor: pointer; font-size: 17px; font-weight: 500;
  color: var(--tx); font-family: inherit; transition: background .15s;
}
.pin-key:hover { background: var(--bd); }
.pin-err { font-size: 12px; color: #E24B4A; min-height: 16px; margin-top: 4px; }

/* ── Admin obsah ── */
.adm-wrap { padding: 12px 16px 16px; }
.adm-section-lbl {
  font-size: 11px; font-weight: 600; color: var(--mu);
  text-transform: uppercase; letter-spacing: .06em; margin: 12px 0 8px;
}
.adm-section-lbl:first-child { margin-top: 0; }
.person-chip {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border: 1px solid var(--bd); border-radius: var(--rs); margin-bottom: 6px;
}
.person-chip-name { flex: 1; font-size: 13px; color: var(--tx); }
.person-chip-pts {
  font-size: 11px; font-weight: 700; color: #1565C0;
  background: #E8F0FE; padding: 2px 7px; border-radius: 10px;
}
.pts-adj { display: flex; align-items: center; gap: 4px; }
.pts-btn {
  width: 24px; height: 24px; border: 1px solid var(--bd); border-radius: var(--rs);
  background: var(--sf); cursor: pointer; font-size: 13px; font-weight: 700;
  color: var(--tx); font-family: inherit; display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
.pts-btn:hover { background: var(--bd); }
.pts-inp {
  width: 44px; text-align: center; padding: 3px 4px;
  border: 1px solid var(--bd); border-radius: var(--rs);
  background: var(--bg); color: var(--tx); font-size: 12px; font-family: inherit;
}
.adm-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid var(--bd);
}
.adm-row:last-child { border-bottom: none; }
.adm-row-lbl { font-size: 13px; color: var(--tx); }
.adm-row-sub { font-size: 11px; color: var(--mu); }
`;

// ─── Hlavná trieda ────────────────────────────────────────────────────────────
class UlohyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass      = null;
    this._state     = null;
    this._loaded    = false;
    this._viewDate  = todayISO();
    this._adminOn   = false;
    this._pinInput  = '';
    this._pinMode   = '';
    this._pinFirst  = '';
    this._weekSel   = [];
    this._pollTimer = null;
    this._saving    = '';
    this._showChecked = false;
    this._whoSel    = {};   // taskKey → Set of personIds
  }

  set hass(h) {
    this._hass = h;
    if (!this._loaded) { this._loaded = true; this._load(); }
  }
  setConfig(c) { this._config = c || {}; }
  static getStubConfig() { return {}; }

  disconnectedCallback() {
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  // ── Storage ──────────────────────────────────────────────────────────────
  async _load() {
    try {
      const r = await this._hass.callApi('GET', 'ulohy/data');
      if (r && typeof r === 'object') this._state = r;
    } catch(e) { console.warn('[ulohy] load error', e); }
    if (!this._state) this._state = this._empty();
    // migrácia
    if (!this._state.permanentTasks) this._state.permanentTasks = [];
    if (!this._state.pointsLog) this._state.pointsLog = {};
    for (const p of this._state.persons) {
      if (p.points === undefined) p.points = 0;
    }
    this._render();
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => this._poll(), POLL_MS);
  }

  async _poll() {
    try {
      const r = await this._hass.callApi('GET', 'ulohy/data');
      if (r && typeof r === 'object') {
        this._state = r;
        // Neprerender ak je otvorený nejaký detail – zavrel by ho
        const hasOpen = this.shadowRoot.querySelector('.task-row.open');
        if (!hasOpen) this._renderPersonsGrid();
      }
    } catch(e) {}
  }

  async _save() {
    this._setSaving('Ukladám…');
    try {
      await this._hass.callApi('POST', 'ulohy/data', this._state);
      this._setSaving('Uložené ✓');
    } catch(e) { this._setSaving('Chyba!'); }
    setTimeout(() => this._setSaving(''), 2000);
  }

  _setSaving(m) {
    this._saving = m;
    const el = this.shadowRoot.querySelector('.sbar');
    if (el) el.textContent = m;
  }

  _empty() {
    return { persons: [], tasks: [], permanentTasks: [], pointsLog: {}, adminPin: null, settings: { showChecked: false } };
  }

  // ── Body & log ────────────────────────────────────────────────────────────
  _logEntry(pid, desc, delta, bal) {
    if (!this._state.pointsLog) this._state.pointsLog = {};
    if (!this._state.pointsLog[pid]) this._state.pointsLog[pid] = [];
    this._state.pointsLog[pid].unshift({
      ts: new Date().toISOString(),
      desc, delta: Math.round(delta*10)/10, bal: Math.round(bal*10)/10
    });
    if (this._state.pointsLog[pid].length > 200)
      this._state.pointsLog[pid] = this._state.pointsLog[pid].slice(0, 200);
  }

  _addPoints(personIds, pts, taskName) {
    if (!personIds || !personIds.length || !pts) return;
    const share = pts / personIds.length;
    for (const pid of personIds) {
      const p = this._state.persons.find(x => x.id === pid);
      if (p) { p.points = Math.round(((p.points||0) + share)*10)/10; this._logEntry(pid, taskName||'Úloha', +share, p.points); }
    }
  }

  _removePoints(personIds, pts, taskName) {
    if (!personIds || !personIds.length || !pts) return;
    const share = pts / personIds.length;
    for (const pid of personIds) {
      const p = this._state.persons.find(x => x.id === pid);
      if (p) { p.points = Math.round(((p.points||0) - share)*10)/10; this._logEntry(pid, 'Vrátené: '+(taskName||'Úloha'), -share, p.points); }
    }
  }

  _spendPoints(person, amount) {
    person.points = Math.round(((person.points||0) - amount)*10)/10;
    this._logEntry(person.id, 'Využité body', -amount, person.points);
  }

  _adminAdjust(person, delta) {
    person.points = Math.round(((person.points||0) + delta)*10)/10;
    this._logEntry(person.id, delta > 0 ? 'Admin: +'+delta+' b' : 'Admin: '+delta+' b', delta, person.points);
  }

  // ── Render – shell ────────────────────────────────────────────────────────
  _render() {
    const s = this.shadowRoot;
    if (!s.querySelector('.wrap')) {
      s.innerHTML = `<style>${CSS}</style>
        <ha-card class="wrap">
          <div class="hdr">
            <span class="hdr-title">📋 Úlohy</span>
            <div class="hdr-acts">
              <button class="icon-btn" id="btn-add-task" title="Nová úloha">＋</button>
              <button class="icon-btn${this._showChecked?' on':''}" id="btn-toggle-done" title="Zobraziť dokončené">✔</button>
              <button class="icon-btn" id="btn-perm" title="Stály zoznam">📌</button>
              <button class="icon-btn" id="btn-admin" title="Admin">⚙</button>
            </div>
          </div>
          <div class="sbar"></div>
          <div class="dnav">
            <button class="nav-btn" id="prev-day">‹</button>
            <span class="date-lbl" id="date-lbl"></span>
            <button class="today-chip" id="go-today" style="display:none">Dnes</button>
            <button class="nav-btn" id="next-day">›</button>
          </div>
          <div class="persons-grid" id="pgrid"></div>
          <div class="perm-section" id="perm-section" style="display:none"></div>
        </ha-card>
        <div class="overlay" id="overlay"><div class="modal" id="modal"></div></div>`;

      s.querySelector('#prev-day').addEventListener('click', () => {
        this._viewDate = addDays(this._viewDate, -1); this._renderPersonsGrid();
      });
      s.querySelector('#next-day').addEventListener('click', () => {
        this._viewDate = addDays(this._viewDate, 1); this._renderPersonsGrid();
      });
      s.querySelector('#go-today').addEventListener('click', () => {
        this._viewDate = todayISO(); this._renderPersonsGrid();
      });
      s.querySelector('#btn-add-task').addEventListener('click', () => this._openTaskModal(null));
      s.querySelector('#btn-toggle-done').addEventListener('click', () => {
        this._showChecked = !this._showChecked;
        s.querySelector('#btn-toggle-done').classList.toggle('on', this._showChecked);
        this._renderPersonsGrid();
        this._renderPermSection();
      });
      s.querySelector('#btn-perm').addEventListener('click', () => {
        const sec = s.querySelector('#perm-section');
        const visible = sec.style.display === 'none';
        sec.style.display = visible ? '' : 'none';
        s.querySelector('#btn-perm').classList.toggle('on', visible);
        if (visible) this._renderPermSection();
      });
      s.querySelector('#btn-admin').addEventListener('click', () => this._openAdminModal());
      s.querySelector('#overlay').addEventListener('click', e => {
        if (e.target === s.querySelector('#overlay')) this._closeModal();
      });
    }
    this._renderPersonsGrid();
  }

  // ── Osobné karty ──────────────────────────────────────────────────────────
  _renderPersonsGrid() {
    const grid    = this.shadowRoot.querySelector('#pgrid');
    const dlbl    = this.shadowRoot.querySelector('#date-lbl');
    const gotoday = this.shadowRoot.querySelector('#go-today');
    if (!grid) return;

    const iso     = this._viewDate;
    const isToday = iso === todayISO();
    if (dlbl)    dlbl.textContent = fmtDay(iso);
    if (gotoday) gotoday.style.display = isToday ? 'none' : '';

    if (!this._state || this._state.persons.length === 0) {
      grid.innerHTML = `<div class="empty"><div class="empty-ico">👥</div>Zatiaľ žiadne osoby.<br>Pridaj ich cez ⚙ Admin.</div>`;
      return;
    }

    grid.innerHTML = this._state.persons.map((p, pi) => {
      const pal    = PALETTE[p.colorIdx !== undefined ? p.colorIdx % PALETTE.length : pi % PALETTE.length];
      const tasks  = this._state.tasks.filter(t => t.personId === p.id && occurrencesOnDate(t, iso));
      const visible = tasks.filter(t => this._showChecked || getOcc(t, iso) !== 'done');
      const done   = tasks.filter(t => getOcc(t, iso) !== 'todo').length;
      const pts    = p.points || 0;

      const avatarHTML = p.avatar ? `<img src="${p.avatar}" alt="">` : this._initials(p.name);
      const progStyle  = done === tasks.length && tasks.length > 0
        ? `background:#EAF3DE;color:#27500A`
        : `background:${pal.bg};color:${pal.text}`;

      const taskRows = visible.length === 0
        ? `<div class="empty" style="padding:12px">Žiadne úlohy na tento deň</div>`
        : visible.map(t => this._taskRowHTML(t, iso, isToday)).join('');

      return `
        <div class="pcard" data-pid="${p.id}" style="border-color:${pal.border}">
          <div class="pcard-hdr" style="background:${pal.bg}">
            <div class="pcard-avatar" style="background:${pal.border};color:#fff">${avatarHTML}</div>
            <div class="pcard-info">
              <div class="pcard-name" style="color:${pal.text}">${p.name}</div>
              <div class="pcard-meta">${p.role||'Člen'} · ${done}/${tasks.length} dnes</div>
            </div>
            <span class="pts-badge${pts < 0 ? ' neg' : ''}" data-spend="${p.id}" title="Klikni pre využitie bodov">⭐ ${pts} b</span>
            <span class="pcard-prog" style="${progStyle}">${done}/${tasks.length}</span>
          </div>
          <div class="task-list" id="tlist-${p.id}">${taskRows}</div>
          ${this._adminOn ? `<div style="padding:6px 10px;border-top:1px solid var(--bd)">
            <button class="add-btn" data-add-person="${p.id}">＋ Pridať úlohu pre ${p.name}</button>
          </div>` : ''}
          ${this._renderLogHTML(p)}
        </div>`;
    }).join('');

    this._attachGridListeners(grid);
  }

  _renderLogHTML(person) {
    const log = (this._state.pointsLog||{})[person.id] || [];
    if (log.length === 0) return '';
    return `<div class="log-wrap">
      <button class="log-toggle" data-log-pid="${person.id}">📊 História bodov (${log.length})</button>
    </div>`;
  }

  _openLogModal(person) {
    const log = (this._state.pointsLog||{})[person.id] || [];
    const modal = this.shadowRoot.querySelector('#modal');
    const pts   = person.points || 0;

    let rows = '';
    for (const e of log) {
      const cls  = e.delta >= 0 ? 'log-pos' : 'log-neg';
      const sign = e.delta >= 0 ? '+' : '';
      rows += `<tr>
        <td class="log-ts">${fmtDateTime(e.ts)}</td>
        <td>${e.desc}</td>
        <td class="${cls}">${sign}${e.delta} b</td>
        <td class="log-bal">${e.bal} b</td>
      </tr>`;
    }

    modal.innerHTML = `
      <div class="modal-title">📊 História bodov – ${person.name}</div>
      <div style="font-size:13px;color:var(--mu);margin-bottom:12px">Aktuálny zostatok: <strong style="color:${pts<0?'#791F1F':'#1565C0'}">${pts} b</strong></div>
      ${log.length === 0
        ? `<div class="empty" style="padding:24px 0">Žiadne záznamy</div>`
        : `<div style="overflow-x:auto">
            <table class="log-table">
              <thead><tr>
                <th>Čas</th>
                <th>Popis</th>
                <th>Zmena</th>
                <th>Zostatok</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
      }
      <div class="mfooter">
        <button class="btn-cancel" id="log-close">Zavrieť</button>
      </div>`;

    modal.querySelector('#log-close').addEventListener('click', () => this._closeModal());
    this._openOverlay();
  }

  _taskRowHTML(task, iso, isToday) {
    const raw     = getOcc(task, iso);
    const overdue = raw === 'todo' && iso < todayISO();
    const stDisp  = overdue ? 'overdue' : raw;

    const badges  = { todo:'Treba spraviť', done:'Urobená', overdue:'Nesplnená' };
    const dotCls  = { todo:'dot-todo', done:'dot-done', overdue:'dot-overdue' };
    const badgeCls= { todo:'badge-todo', done:'badge-done', overdue:'badge-overdue' };

    const rtag = task.repeat && task.repeat !== 'none'
      ? `<span class="task-rtag">${REPEAT_LABEL[task.repeat]||task.repeat}</span>` : '';
    const ptag = task.points
      ? `<span class="task-ptag">⭐ ${task.points}b</span>` : '';

    const detail = this._taskDetailHTML(task, iso, raw, stDisp);

    return `
      <div class="task-row" data-tid="${task.id}" data-date="${iso}">
        <div class="task-main">
          <span class="task-dot ${dotCls[stDisp]||'dot-todo'}"></span>
          <span class="task-name">${task.name}</span>
          ${rtag}${ptag}
          <span class="task-badge ${badgeCls[stDisp]||'badge-todo'}">${badges[stDisp]||stDisp}</span>
          <span class="task-chev">›</span>
        </div>
        <div class="task-detail">${detail}</div>
      </div>`;
  }

  _taskDetailHTML(task, iso, raw, stDisp) {
    const persons = this._state.persons;
    const taskKey = task.id + '_' + iso;
    const selSet  = this._whoSel[taskKey] || new Set();
    const doneBy  = getDoneBy(task, iso);
    let html = '';

    if (task.note) html += `<span class="task-note">${task.note}</span>`;

    if (raw === 'todo') {
      if (persons.length > 0) {
        html += `<span class="who-lbl">Kto úlohu urobil?</span><div class="who-grid">`;
        for (const p of persons) {
          const av = p.avatar ? `<img src="${p.avatar}">` : this._initials(p.name);
          html += `<button class="who-btn${selSet.has(p.id)?' sel':''}" data-who="${taskKey}" data-pid="${p.id}">
            <span class="who-av">${av}</span>${p.name}
          </button>`;
        }
        html += `</div>`;
      }
      const pts = task.points || 0;
      const cnt = selSet.size;
      const hint = pts > 0 && cnt > 0 ? ' (+' + Math.round(pts/cnt*10)/10 + 'b/os.)' : '';
      html += `<button class="confirm-btn" data-confirm="${task.id}" data-date="${iso}" ${cnt > 0 ? '' : 'disabled'}>✓ Potvrdiť urobené${hint}</button>`;
    } else if (raw === 'done') {
      const names = doneBy.map(id => persons.find(p=>p.id===id)?.name || '?').join(', ');
      if (names) html += `<span class="done-info">✓ Urobili: ${names}</span>`;
      html += `<button class="act-btn btn-revert" data-action="todo" data-task-id="${task.id}" data-date="${iso}">Vrátiť</button>`;
    }

    if (this._adminOn) {
      html += `<div class="admin-acts">
        <button class="edit-ic" data-edit-task="${task.id}" title="Upraviť">✎</button>
        <button class="del-ic" data-del-task="${task.id}" title="Zmazať">✕</button>
      </div>`;
    }
    return html;
  }

  _attachGridListeners(grid) {
    // toggle open/close
    grid.querySelectorAll('.task-main').forEach(el => {
      el.addEventListener('click', () => {
        const row = el.closest('.task-row');
        row.classList.toggle('open');
        if (row.classList.contains('open')) {
          const task = this._state.tasks.find(t => t.id === row.dataset.tid);
          const iso  = row.dataset.date;
          if (task) {
            // Vyčisti staré listenery nahradením nódu klonom
            const oldDetail = row.querySelector('.task-detail');
            const newDetail = oldDetail.cloneNode(false);
            oldDetail.parentNode.replaceChild(newDetail, oldDetail);
            newDetail.innerHTML = this._taskDetailHTML(task, iso, getOcc(task, iso), getOcc(task,iso)==='todo'&&iso<todayISO()?'overdue':getOcc(task,iso));
            this._attachDetailListeners(row, task, iso);
          }
        }
      });
    });
    grid.querySelectorAll('[data-add-person]').forEach(btn => {
      btn.addEventListener('click', () => this._openTaskModal(null, btn.dataset.addPerson));
    });
    // log toggle → otvori modal
    grid.querySelectorAll('.log-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = this._state.persons.find(x => x.id === btn.dataset.logPid);
        if (p) this._openLogModal(p);
      });
    });
    // pts spend badge
    grid.querySelectorAll('[data-spend]').forEach(badge => {
      badge.addEventListener('click', () => {
        const p = this._state.persons.find(x => x.id === badge.dataset.spend);
        if (p) this._openSpendModal(p);
      });
    });
  }

  _attachDetailListeners(row, task, iso) {
    const taskKey = task.id + '_' + iso;
    // who-btn
    row.querySelectorAll('[data-who]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const pid = btn.dataset.pid;
        if (!this._whoSel[taskKey]) this._whoSel[taskKey] = new Set();
        const sel = this._whoSel[taskKey];
        if (sel.has(pid)) sel.delete(pid); else sel.add(pid);
        btn.classList.toggle('sel', sel.has(pid));
        const cb = row.querySelector('[data-confirm]');
        if (cb) {
          const pts = task.points||0; const cnt = sel.size;
          const hint = pts > 0 && cnt > 0 ? ' (+'+Math.round(pts/cnt*10)/10+'b/os.)' : '';
          cb.disabled = cnt === 0;
          cb.textContent = '✓ Potvrdiť urobené' + hint;
        }
      });
    });
    // confirm
    row.querySelectorAll('[data-confirm]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        // Guard: ak už je done (napr. double-click), nepripisuj body znova
        if (getOcc(task, iso) === 'done') return;
        const doneBy = [...(this._whoSel[taskKey] || new Set())];
        if (doneBy.length === 0) return;
        setOcc(task, iso, 'done', doneBy);
        this._addPoints(doneBy, task.points||0, task.name);
        delete this._whoSel[taskKey];
        this._save(); this._renderPersonsGrid();
      });
    });
    // revert
    row.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.dataset.action === 'todo') {
          const prev = getDoneBy(task, iso);
          if (prev.length) this._removePoints(prev, task.points||0, task.name);
        }
        setOcc(task, iso, btn.dataset.action, []);
        this._save(); this._renderPersonsGrid();
      });
    });
    // edit
    row.querySelectorAll('[data-edit-task]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._openTaskModal(task);
      });
    });
    // del
    row.querySelectorAll('[data-del-task]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Naozaj zmazať úlohu?')) return;
        this._state.tasks = this._state.tasks.filter(t => t.id !== task.id);
        this._save(); this._renderPersonsGrid();
      });
    });
  }

  _initials(name) {
    return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  }

  // ── Stály zoznam ─────────────────────────────────────────────────────────
  _renderPermSection() {
    const sec = this.shadowRoot.querySelector('#perm-section');
    if (!sec || sec.style.display === 'none') return;
    const tasks = this._state.permanentTasks || [];
    const vis   = tasks.filter(pt => this._showChecked || !pt.done);
    let html = `<div class="perm-title">📌 Stály zoznam</div>`;
    if (vis.length === 0) {
      html += `<div class="empty" style="padding:16px 0">Žiadne stále úlohy</div>`;
    } else {
      vis.forEach(pt => { html += this._permRowHTML(pt); });
    }
    html += `<button class="add-btn" id="add-perm-btn">＋ Pridať stálu úlohu</button>`;
    sec.innerHTML = html;
    sec.querySelector('#add-perm-btn').addEventListener('click', () => this._openPermModal(null));
    this._attachPermListeners(sec);
  }

  _permRowHTML(pt) {
    const isDone = pt.done || false;
    const ptag   = pt.points ? `<span class="task-ptag">⭐ ${pt.points}b</span>` : '';
    return `
      <div class="task-row" data-perm-id="${pt.id}">
        <div class="task-main">
          <span class="task-dot ${isDone?'dot-done':'dot-todo'}"></span>
          <span class="task-name">${pt.name}</span>
          ${ptag}
          <span class="task-badge ${isDone?'badge-done':'badge-todo'}">${isDone?'Hotovo':'Čaká'}</span>
          <span class="task-chev">›</span>
        </div>
        <div class="task-detail">${this._permDetailHTML(pt)}</div>
      </div>`;
  }

  _permDetailHTML(pt) {
    const persons = this._state.persons;
    const taskKey = 'perm_' + pt.id;
    const selSet  = this._whoSel[taskKey] || new Set();
    let html = '';
    if (pt.note) html += `<span class="task-note">${pt.note}</span>`;
    if (!pt.done) {
      if (persons.length > 0) {
        html += `<span class="who-lbl">Kto úlohu urobil?</span><div class="who-grid">`;
        for (const p of persons) {
          const av = p.avatar ? `<img src="${p.avatar}">` : this._initials(p.name);
          html += `<button class="who-btn${selSet.has(p.id)?' sel':''}" data-who-perm="${taskKey}" data-pid="${p.id}">
            <span class="who-av">${av}</span>${p.name}
          </button>`;
        }
        html += `</div>`;
      }
      const pts = pt.points||0; const cnt = selSet.size;
      const hint = pts > 0 && cnt > 0 ? ' (+'+Math.round(pts/cnt*10)/10+'b/os.)' : '';
      html += `<button class="confirm-btn" data-confirm-perm="${pt.id}" ${cnt>0?'':'disabled'}>✓ Potvrdiť urobené${hint}</button>`;
    } else {
      const names = (pt.doneBy||[]).map(id => persons.find(p=>p.id===id)?.name||'?').join(', ');
      if (names) html += `<span class="done-info">✓ Urobili: ${names}</span>`;
      html += `<button class="act-btn btn-revert" data-revert-perm="${pt.id}">Vrátiť</button>`;
    }
    if (this._adminOn) {
      html += `<div class="admin-acts">
        <button class="edit-ic" data-edit-perm="${pt.id}">✎</button>
        <button class="del-ic" data-del-perm="${pt.id}">✕</button>
      </div>`;
    }
    return html;
  }

  _attachPermListeners(container) {
    container.querySelectorAll('[data-perm-id]').forEach(row => {
      row.querySelector('.task-main').addEventListener('click', () => {
        row.classList.toggle('open');
        if (row.classList.contains('open')) {
          const pt = this._state.permanentTasks.find(x => x.id === row.dataset.permId);
          if (pt) { row.querySelector('.task-detail').innerHTML = this._permDetailHTML(pt); this._attachPermDetail(row, pt); }
        }
      });
      const pt = this._state.permanentTasks.find(x => x.id === row.dataset.permId);
      if (pt) this._attachPermDetail(row, pt);
    });
  }

  _attachPermDetail(row, pt) {
    const taskKey = 'perm_' + pt.id;
    row.querySelectorAll('[data-who-perm]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const pid = btn.dataset.pid;
        if (!this._whoSel[taskKey]) this._whoSel[taskKey] = new Set();
        const sel = this._whoSel[taskKey];
        if (sel.has(pid)) sel.delete(pid); else sel.add(pid);
        btn.classList.toggle('sel', sel.has(pid));
        const cb = row.querySelector('[data-confirm-perm]');
        if (cb) {
          const pts=pt.points||0; const cnt=sel.size;
          const hint = pts>0&&cnt>0 ? ' (+'+Math.round(pts/cnt*10)/10+'b/os.)' : '';
          cb.disabled=cnt===0; cb.textContent='✓ Potvrdiť urobené'+hint;
        }
      });
    });
    row.querySelectorAll('[data-confirm-perm]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const doneBy = [...(this._whoSel[taskKey]||new Set())];
        pt.done=true; pt.doneBy=doneBy;
        if (doneBy.length) this._addPoints(doneBy, pt.points||0, pt.name);
        delete this._whoSel[taskKey];
        this._save(); this._renderPermSection();
      });
    });
    row.querySelectorAll('[data-revert-perm]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (pt.doneBy?.length) this._removePoints(pt.doneBy, pt.points||0, pt.name);
        pt.done=false; pt.doneBy=[];
        this._save(); this._renderPermSection();
      });
    });
    row.querySelectorAll('[data-edit-perm]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this._openPermModal(pt); });
    });
    row.querySelectorAll('[data-del-perm]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Zmazať stálu úlohu?')) return;
        this._state.permanentTasks = this._state.permanentTasks.filter(x => x.id !== pt.id);
        this._save(); this._renderPermSection();
      });
    });
  }

  // ── Spend modal ───────────────────────────────────────────────────────────
  _openSpendModal(person) {
    document.body.querySelector('#ulohy-spend-ov')?.remove();
    const ov = document.createElement('div');
    ov.id = 'ulohy-spend-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10000;font-family:system-ui,sans-serif;';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:min(300px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.22);">
        <div style="font-size:15px;font-weight:600;margin-bottom:4px;color:#212121;">Ahoj, ${person.name}!</div>
        <div style="font-size:12px;color:#757575;margin-bottom:16px;">Máš <strong>${person.points||0} bodov</strong>. Koľko bodov chceš využiť?</div>
        <input id="_sa" type="number" min="1" step="1" placeholder="Počet bodov"
          style="width:100%;padding:10px;font-size:20px;font-weight:700;text-align:center;border:2px solid #1976d2;border-radius:8px;outline:none;color:#212121;box-sizing:border-box;margin-bottom:16px;">
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="_sc" style="padding:8px 16px;border:1px solid #ccc;border-radius:8px;background:none;cursor:pointer;font-size:13px;font-family:inherit;">Zrušiť</button>
          <button id="_so" style="padding:8px 16px;border:none;border-radius:8px;background:#1976d2;color:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">Využiť</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('#_sa'); inp.focus();
    ov.querySelector('#_sc').addEventListener('click', () => ov.remove());
    ov.addEventListener('click', e => { if (e.target===ov) ov.remove(); });
    ov.querySelector('#_so').addEventListener('click', () => {
      const amount = parseFloat(inp.value);
      if (!amount || amount <= 0) { inp.style.borderColor='#E24B4A'; return; }
      this._spendPoints(person, amount);
      this._save(); ov.remove(); this._renderPersonsGrid();
    });
    inp.addEventListener('keydown', e => {
      if (e.key==='Enter') ov.querySelector('#_so').click();
      if (e.key==='Escape') ov.remove();
    });
  }

  // ── Modal: Úloha ──────────────────────────────────────────────────────────
  _openTaskModal(task, defaultPersonId) {
    const isEdit  = !!task;
    const persons = this._state.persons;
    this._weekSel = task?.repeatDays ? [...task.repeatDays] : [];
    const selPid  = task?.personId || defaultPersonId || persons[0]?.id || '';
    const selRep  = task?.repeat || 'none';

    const modal = this.shadowRoot.querySelector('#modal');
    modal.innerHTML = `
      <div class="modal-title">${isEdit ? 'Upraviť úlohu' : 'Nová úloha'}</div>
      <div class="fg"><label class="fl">Názov</label>
        <input class="fi" id="t-name" value="${task?.name||''}" placeholder="Názov úlohy"></div>
      <div class="fg"><label class="fl">Poznámka</label>
        <textarea class="fta" id="t-note">${task?.note||''}</textarea></div>
      <div class="fg"><label class="fl">Bodová hodnota (0 = bez bodov)</label>
        <input class="fi" type="number" min="0" step="1" id="t-points" value="${task?.points||0}" style="width:100px"></div>
      <div class="fg"><label class="fl">Osoba</label>
        <select class="fsel" id="t-person">
          ${persons.map(p=>`<option value="${p.id}"${p.id===selPid?' selected':''}>${p.name}</option>`).join('')}
          ${persons.length===0?'<option value="">— žiadna —</option>':''}
        </select></div>
      <div class="fg"><label class="fl">Dátum začiatku</label>
        <input class="fi" type="date" id="t-date" value="${task?.date||this._viewDate}"></div>
      <div class="fg"><label class="fl">Opakovanie</label>
        <select class="fsel" id="t-repeat">
          ${Object.entries(REPEAT_LABEL).map(([v,l])=>`<option value="${v}"${v===selRep?' selected':''}>${l}</option>`).join('')}
        </select></div>
      <div class="fg" id="wd-wrap" style="${selRep==='weekly'?'':'display:none'}">
        <label class="fl">Dni v týždni</label>
        <div class="wdgrid">${DOW_LABEL.map((n,i)=>
          `<button type="button" class="wdbtn${this._weekSel.includes(i)?' sel':''}" data-dow="${i}">${n}</button>`
        ).join('')}</div>
      </div>
      <div class="mfooter">
        ${isEdit?`<button class="btn-del" id="t-del">Zmazať</button>`:''}
        <button class="btn-cancel" id="t-cancel">Zrušiť</button>
        <button class="btn-save" id="t-save">Uložiť</button>
      </div>`;

    modal.querySelector('#t-repeat').addEventListener('change', e => {
      modal.querySelector('#wd-wrap').style.display = e.target.value==='weekly' ? '' : 'none';
    });
    modal.querySelectorAll('.wdbtn').forEach(b => b.addEventListener('click', () => {
      const d = +b.dataset.dow;
      if (this._weekSel.includes(d)) { this._weekSel=this._weekSel.filter(x=>x!==d); b.classList.remove('sel'); }
      else { this._weekSel.push(d); b.classList.add('sel'); }
    }));
    modal.querySelector('#t-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelector('#t-save').addEventListener('click', () => {
      const name = modal.querySelector('#t-name').value.trim();
      if (!name) return;
      const obj = {
        id: task?.id || uid(), name,
        note:       modal.querySelector('#t-note').value.trim(),
        points:     parseInt(modal.querySelector('#t-points').value)||0,
        personId:   modal.querySelector('#t-person').value,
        date:       modal.querySelector('#t-date').value,
        repeat:     modal.querySelector('#t-repeat').value,
        repeatDays: this._weekSel.slice().sort(),
        occurrences: task?.occurrences || {},
        doneBy:     task?.doneBy || {}
      };
      if (isEdit) { const i=this._state.tasks.findIndex(t=>t.id===obj.id); if(i>=0) this._state.tasks[i]=obj; }
      else this._state.tasks.push(obj);
      this._save(); this._closeModal(); this._renderPersonsGrid();
    });
    if (isEdit) modal.querySelector('#t-del').addEventListener('click', () => {
      if (!confirm('Naozaj zmazať?')) return;
      this._state.tasks=this._state.tasks.filter(t=>t.id!==task.id);
      this._save(); this._closeModal(); this._renderPersonsGrid();
    });
    this._openOverlay();
  }

  // ── Modal: Stála úloha ────────────────────────────────────────────────────
  _openPermModal(pt) {
    const isEdit = !!pt;
    const modal  = this.shadowRoot.querySelector('#modal');
    modal.innerHTML = `
      <div class="modal-title">${isEdit?'Upraviť stálu úlohu':'Nová stála úloha'}</div>
      <div class="fg"><label class="fl">Názov</label>
        <input class="fi" id="pt-name" value="${pt?.name||''}" placeholder="Napr. Umyť auto"></div>
      <div class="fg"><label class="fl">Poznámka</label>
        <textarea class="fta" id="pt-note">${pt?.note||''}</textarea></div>
      <div class="fg"><label class="fl">Bodová hodnota (0 = bez bodov)</label>
        <input class="fi" type="number" min="0" step="1" id="pt-points" value="${pt?.points||0}" style="width:100px"></div>
      <div class="mfooter">
        ${isEdit?`<button class="btn-del" id="pt-del">Zmazať</button>`:''}
        <button class="btn-cancel" id="pt-cancel">Zrušiť</button>
        <button class="btn-save" id="pt-save">Uložiť</button>
      </div>`;
    modal.querySelector('#pt-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelector('#pt-save').addEventListener('click', () => {
      const name = modal.querySelector('#pt-name').value.trim();
      if (!name) return;
      const obj = { id:pt?.id||uid(), name, note:modal.querySelector('#pt-note').value.trim(), points:parseInt(modal.querySelector('#pt-points').value)||0, done:pt?.done||false, doneBy:pt?.doneBy||[] };
      if (isEdit) { const i=this._state.permanentTasks.findIndex(x=>x.id===obj.id); if(i>=0) this._state.permanentTasks[i]=obj; }
      else this._state.permanentTasks.push(obj);
      this._save(); this._closeModal(); this._renderPermSection();
    });
    if (isEdit) modal.querySelector('#pt-del').addEventListener('click', () => {
      if (!confirm('Zmazať?')) return;
      this._state.permanentTasks=this._state.permanentTasks.filter(x=>x.id!==pt.id);
      this._save(); this._closeModal(); this._renderPermSection();
    });
    this._openOverlay();
  }

  // ── Modal: Admin ──────────────────────────────────────────────────────────
  _openAdminModal() {
    const modal = this.shadowRoot.querySelector('#modal');
    if (!this._adminOn) this._renderPin(modal);
    else this._renderAdminContent(modal);
    this._openOverlay();
  }

  _renderPin(modal) {
    this._pinMode = this._state.adminPin ? 'unlock' : 'setup1';
    this._pinInput = '';
    modal.innerHTML = `
      <div class="modal-title">Admin prístup</div>
      <div class="pin-wrap">
        <div class="pin-sub" id="pin-sub">${this._pinMode==='unlock'?'Zadajte PIN':'Nastavte 4-ciferný PIN'}</div>
        <div class="pin-dots">${[0,1,2,3].map(i=>`<div class="pin-dot" id="pd${i}"></div>`).join('')}</div>
        <div class="pin-err" id="pin-err"></div>
        <div class="pin-grid">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k=>`<button class="pin-key" data-k="${k}">${k}</button>`).join('')}
        </div>
      </div>
      <div class="mfooter"><button class="btn-cancel" id="pin-cancel">Zrušiť</button></div>`;
    modal.querySelector('#pin-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelectorAll('.pin-key').forEach(b => b.addEventListener('click', () => this._pinKey(b.dataset.k, modal)));
  }

  _pinDots(modal) {
    for (let i=0;i<4;i++) {
      const d=modal.querySelector('#pd'+i);
      if(d) d.classList.toggle('f', i<this._pinInput.length);
    }
  }

  _pinKey(k, modal) {
    if (k==='⌫') { this._pinInput=this._pinInput.slice(0,-1); this._pinDots(modal); return; }
    if (k===''||this._pinInput.length>=4) return;
    this._pinInput+=k; this._pinDots(modal);
    if (this._pinInput.length===4) setTimeout(()=>this._processPin(modal),150);
  }

  _processPin(modal) {
    const err=modal.querySelector('#pin-err'), sub=modal.querySelector('#pin-sub');
    if (this._pinMode==='unlock') {
      if (this._pinInput===this._state.adminPin) {
        this._adminOn=true; this._pinInput=''; this._closeModal();
        this.shadowRoot.querySelector('#btn-admin').classList.add('on');
        this._renderPersonsGrid();
      } else { if(err) err.textContent='Nesprávny PIN'; this._pinInput=''; this._pinDots(modal); }
    } else if (this._pinMode==='setup1') {
      this._pinFirst=this._pinInput; this._pinInput=''; this._pinMode='setup2';
      if(sub) sub.textContent='Zopakujte PIN'; if(err) err.textContent=''; this._pinDots(modal);
    } else if (this._pinMode==='setup2') {
      if (this._pinInput===this._pinFirst) {
        this._state.adminPin=this._pinInput; this._adminOn=true; this._pinInput='';
        this._save(); this._closeModal();
        this.shadowRoot.querySelector('#btn-admin').classList.add('on');
        this._renderPersonsGrid();
      } else {
        if(err) err.textContent='PINy sa nezhodujú';
        this._pinInput=''; this._pinFirst=''; this._pinMode='setup1';
        if(sub) sub.textContent='Nastavte 4-ciferný PIN'; this._pinDots(modal);
      }
    }
  }

  _renderAdminContent(modal) {
    modal.innerHTML = `
      <div class="modal-title">⚙ Admin</div>
      <div class="adm-wrap">
        <div class="adm-section-lbl">Osoby a body</div>
        ${this._state.persons.map((p,pi) => {
          const pal = PALETTE[(p.colorIdx||pi) % PALETTE.length];
          const av  = p.avatar ? `<img src="${p.avatar}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover">` : this._initials(p.name);
          const pts = p.points || 0;
          return `<div class="person-chip">
            <div class="pcard-avatar" style="width:26px;height:26px;font-size:11px;background:${pal.border};color:#fff">${av}</div>
            <span class="person-chip-name">${p.name}</span>
            <span class="person-chip-pts">⭐ ${pts} b</span>
            <button class="edit-ic" data-adj-person="${p.id}" title="Upraviť body">🪙</button>
            <button class="edit-ic" data-edit-person="${p.id}" title="Upraviť osobu">✎</button>
            <button class="del-ic" data-del-person="${p.id}" title="Zmazať">✕</button>
          </div>`;
        }).join('')}
        <button class="add-btn" id="adm-add-person">＋ Pridať osobu</button>
        <div class="adm-section-lbl" style="margin-top:16px">Nastavenia</div>
        <div class="adm-row">
          <div><div class="adm-row-lbl">Zmeniť PIN</div></div>
          <button class="btn-cancel" id="adm-change-pin">Zmeniť</button>
        </div>
        <div class="adm-row">
          <div><div class="adm-row-lbl">Zamknúť admin</div></div>
          <button class="btn-cancel" id="adm-lock">Zamknúť</button>
        </div>
      </div>
      <div class="mfooter"><button class="btn-cancel" id="adm-close">Zavrieť</button></div>`;

    modal.querySelector('#adm-close').addEventListener('click', () => this._closeModal());
    modal.querySelector('#adm-add-person').addEventListener('click', () => this._openPersonModal(null, modal));
    modal.querySelector('#adm-change-pin').addEventListener('click', () => {
      this._state.adminPin=null; this._adminOn=false; this._renderPin(modal);
    });
    modal.querySelector('#adm-lock').addEventListener('click', () => {
      this._adminOn=false;
      this.shadowRoot.querySelector('#btn-admin').classList.remove('on');
      this._closeModal(); this._renderPersonsGrid();
    });
    modal.querySelectorAll('[data-adj-person]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = this._state.persons.find(x => x.id === btn.dataset.adjPerson);
        if (p) this._openAdjPointsModal(p, modal);
      });
    });
    modal.querySelectorAll('[data-edit-person]').forEach(b => b.addEventListener('click', () => {
      const p=this._state.persons.find(x=>x.id===b.dataset.editPerson);
      if(p) this._openPersonModal(p, modal);
    }));
    modal.querySelectorAll('[data-del-person]').forEach(b => b.addEventListener('click', () => {
      if(!confirm('Zmazať osobu a jej úlohy?')) return;
      const pid=b.dataset.delPerson;
      this._state.persons=this._state.persons.filter(p=>p.id!==pid);
      this._state.tasks=this._state.tasks.filter(t=>t.personId!==pid);
      this._save(); this._renderAdminContent(modal); this._renderPersonsGrid();
    }));
  }

  _openAdjPointsModal(person, parentModal) {
    const modal = this.shadowRoot.querySelector('#modal');
    const pts   = person.points || 0;

    modal.innerHTML = `
      <div class="modal-title">🪙 Úprava bodov – ${person.name}</div>
      <div style="font-size:13px;color:var(--mu);margin-bottom:16px">Aktuálny zostatok: <strong>${pts} b</strong></div>
      <div class="fg">
        <label class="fl">Počet bodov</label>
        <input class="fi" type="number" id="adj-val" value="0" step="1" style="font-size:20px;font-weight:700;text-align:center">
      </div>
      <div style="font-size:12px;color:var(--mu);margin-top:-6px;margin-bottom:12px">
        Kladné číslo = pridať body &nbsp;·&nbsp; záporné číslo = odobrať body
      </div>
      <div class="mfooter">
        <button class="btn-cancel" id="adj-back">Späť</button>
        <button class="btn-save" id="adj-save">Potvrdiť</button>
      </div>`;

    const inp = modal.querySelector('#adj-val');
    inp.focus(); inp.select();

    modal.querySelector('#adj-back').addEventListener('click', () => {
      if (parentModal) this._renderAdminContent(modal); else this._closeModal();
    });
    modal.querySelector('#adj-save').addEventListener('click', () => {
      const delta = parseFloat(inp.value);
      if (!delta || isNaN(delta)) { inp.style.borderColor = '#E24B4A'; return; }
      this._adminAdjust(person, delta);
      this._save(); this._renderPersonsGrid();
      if (parentModal) this._renderAdminContent(modal); else this._closeModal();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') modal.querySelector('#adj-save').click();
      if (e.key === 'Escape') modal.querySelector('#adj-back').click();
    });
  }

  _openPersonModal(person, parentModal) {
    const isEdit   = !!person;
    const modal    = this.shadowRoot.querySelector('#modal');
    const colorIdx = person?.colorIdx ?? this._state.persons.length;

    modal.innerHTML = `
      <div class="modal-title">${isEdit?'Upraviť osobu':'Nová osoba'}</div>
      <div class="fg"><label class="fl">Meno</label>
        <input class="fi" id="p-name" value="${person?.name||''}" placeholder="Meno osoby"></div>
      <div class="fg"><label class="fl">Rola</label>
        <select class="fsel" id="p-role">
          ${ROLES.map(r=>`<option${(person?.role||'Dieťa')===r?' selected':''}>${r}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="fl">Farba karty</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          ${PALETTE.map((pal,i)=>`<div data-ci="${i}" style="width:28px;height:28px;border-radius:50%;background:${pal.border};cursor:pointer;outline:${colorIdx===i?'3px solid var(--tx)':'none'};outline-offset:2px"></div>`).join('')}
        </div></div>
      <div class="fg"><label class="fl">Avatar (URL obrázka, nepovinné)</label>
        <input class="fi" id="p-avatar" value="${person?.avatar||''}" placeholder="https://..."></div>
      <div class="mfooter">
        ${isEdit?`<button class="btn-del" id="p-del">Zmazať</button>`:''}
        <button class="btn-cancel" id="p-back">Späť</button>
        <button class="btn-save" id="p-save">Uložiť</button>
      </div>`;

    let selColor = colorIdx;
    modal.querySelectorAll('[data-ci]').forEach(dot => {
      dot.addEventListener('click', () => {
        selColor=+dot.dataset.ci;
        modal.querySelectorAll('[data-ci]').forEach(d=>d.style.outline='none');
        dot.style.outline='3px solid var(--tx)';
      });
    });
    modal.querySelector('#p-back').addEventListener('click', () => {
      if(parentModal) this._renderAdminContent(modal); else this._closeModal();
    });
    modal.querySelector('#p-save').addEventListener('click', () => {
      const name=modal.querySelector('#p-name').value.trim();
      if(!name) return;
      const obj={ id:person?.id||uid(), name, role:modal.querySelector('#p-role').value, colorIdx:selColor, avatar:modal.querySelector('#p-avatar').value.trim(), points:person?.points||0 };
      if(isEdit){ const i=this._state.persons.findIndex(p=>p.id===obj.id); if(i>=0) this._state.persons[i]=obj; }
      else this._state.persons.push(obj);
      this._save(); this._renderAdminContent(modal); this._renderPersonsGrid();
    });
    if(isEdit) modal.querySelector('#p-del').addEventListener('click', ()=>{
      if(!confirm('Zmazať osobu a jej úlohy?')) return;
      this._state.persons=this._state.persons.filter(p=>p.id!==person.id);
      this._state.tasks=this._state.tasks.filter(t=>t.personId!==person.id);
      this._save(); this._renderAdminContent(modal); this._renderPersonsGrid();
    });
  }

  _openOverlay() { this.shadowRoot.querySelector('#overlay').classList.add('open'); }
  _closeModal()  { this.shadowRoot.querySelector('#overlay').classList.remove('open'); }
}

customElements.define('ulohy-card', UlohyCard);
