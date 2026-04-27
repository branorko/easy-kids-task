/**
 * ulohy-card.js  –  Úlohy pre domácnosť  v2.0
 * Každá osoba má vlastnú farebnú kartu.
 * Dáta ukladané cez /api/ulohy/data (Python backend, .storage)
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
const uid  = () => Math.random().toString(36).slice(2, 10);
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
  const t = todayISO();
  const prefix = iso === t ? 'Dnes, ' : iso === addDays(t,-1) ? 'Včera, ' : iso === addDays(t,1) ? 'Zajtra, ' : '';
  return `${prefix}${DAY[d.getDay()]} ${d.getDate()}. ${MON[d.getMonth()]}`;
}

function occurrencesOnDate(task, iso) {
  if (!task.repeat || task.repeat === 'none') {
    return task.date === iso;
  }
  // task.date je štart; iso musí byť >= štart
  if (iso < task.date) return false;
  if (task.repeat === 'daily') return true;
  if (task.repeat === 'weekly') {
    const dow = new Date(iso + 'T12:00:00').getDay();
    return (task.repeatDays || []).includes(dow);
  }
  if (task.repeat === 'monthly') {
    return new Date(iso + 'T12:00:00').getDate() === new Date(task.date + 'T12:00:00').getDate();
  }
  if (task.repeat === 'yearly') {
    const a = new Date(iso + 'T12:00:00'), b = new Date(task.date + 'T12:00:00');
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  }
  return false;
}

function getOcc(task, iso)      { return (task.occurrences || {})[`${task.id}_${iso}`] || 'todo'; }
function setOcc(task, iso, st)  { if (!task.occurrences) task.occurrences = {}; task.occurrences[`${task.id}_${iso}`] = st; }

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

/* ── Zoznam úloh v karte (sklad štýl) ── */
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
.task-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.dot-todo    { background: #EF9F27; }
.dot-done    { background: #639922; }
.dot-checked { background: #1D9E75; }
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
.task-badge {
  font-size: 11px; font-weight: 600; padding: 3px 8px;
  border-radius: 10px; white-space: nowrap; flex-shrink: 0;
}
.badge-todo    { background: #FAEEDA; color: #633806; }
.badge-done    { background: #EAF3DE; color: #27500A; }
.badge-checked { background: #E1F5EE; color: #085041; }
.badge-overdue { background: #FCEBEB; color: #791F1F; }

.task-chev { font-size: 11px; color: var(--mu); transition: transform .2s; flex-shrink: 0; }
.task-row.open .task-chev { transform: rotate(90deg); }

/* ── Detail úlohy ── */
.task-detail {
  display: none; padding: 8px 12px 10px;
  background: var(--sf); border-top: 1px solid var(--bd);
  flex-wrap: wrap; gap: 6px; align-items: center;
}
.task-row.open .task-detail { display: flex; }
.task-note { font-size: 12px; color: var(--mu); flex-basis: 100%; margin-bottom: 2px; }

.act-btn {
  font-size: 12px; font-weight: 600; padding: 6px 11px;
  border-radius: var(--rs); border: none; cursor: pointer;
  font-family: inherit; transition: opacity .15s;
}
.act-btn:hover { opacity: .85; }
.btn-done    { background: #EAF3DE; color: #27500A; }
.btn-checked { background: #E1F5EE; color: #085041; }
.btn-revert  { background: var(--sf); color: var(--mu); border: 1px solid var(--bd); }
.admin-acts  { margin-left: auto; display: flex; gap: 4px; }
.edit-ic, .del-ic {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: var(--mu); padding: 4px 6px;
  border-radius: 6px; transition: background .15s, color .15s;
}
.edit-ic:hover { background: #FAEEDA; color: #633806; }
.del-ic:hover  { background: #FCEBEB; color: #791F1F; }

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
.person-chip-role { font-size: 11px; color: var(--mu); }
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
    this._hass        = null;
    this._state       = null;
    this._loaded      = false;
    this._viewDate    = todayISO();
    this._adminOn     = false;
    this._pinInput    = '';
    this._pinMode     = '';
    this._pinFirst    = '';
    this._weekSel     = [];
    this._pollTimer   = null;
    this._saving      = '';
    this._showChecked = false;
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

  // ── Storage ─────────────────────────────────────────────────────────────────
  async _load() {
    try {
      const r = await this._hass.callApi('GET', 'ulohy/data');
      if (r && typeof r === 'object') this._state = r;
    } catch(e) { console.warn('[ulohy] load error', e); }
    if (!this._state) this._state = this._empty();
    this._render();
    // Auto-sync
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => this._poll(), POLL_MS);
  }

  async _poll() {
    try {
      const r = await this._hass.callApi('GET', 'ulohy/data');
      if (r && typeof r === 'object') {
        this._state = r;
        this._renderPersonsGrid();
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
    return { persons: [], tasks: [], adminPin: null, settings: { showChecked: false } };
  }

  // ── Render – shell ───────────────────────────────────────────────────────────
  _render() {
    const s = this.shadowRoot;
    if (!s.querySelector('.wrap')) {
      s.innerHTML = `<style>${CSS}</style>
        <ha-card class="wrap">
          <div class="hdr">
            <span class="hdr-title">📋 Úlohy</span>
            <div class="hdr-acts">
              <button class="icon-btn" id="btn-add-task" title="Nová úloha">＋</button>
              <button class="icon-btn${this._showChecked?' on':''}" id="btn-toggle-done" title="Zobraziť skontrolované">✔</button>
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
      });
      s.querySelector('#btn-admin').addEventListener('click', () => this._openAdminModal());
      s.querySelector('#overlay').addEventListener('click', e => {
        if (e.target === s.querySelector('#overlay')) this._closeModal();
      });
    }

    this._renderPersonsGrid();
  }

  // ── Osobné karty ────────────────────────────────────────────────────────────
  _renderPersonsGrid() {
    const grid  = this.shadowRoot.querySelector('#pgrid');
    const dlbl  = this.shadowRoot.querySelector('#date-lbl');
    const gotoday = this.shadowRoot.querySelector('#go-today');
    if (!grid) return;

    const iso   = this._viewDate;
    const isToday = iso === todayISO();
    if (dlbl)   dlbl.textContent  = fmtDay(iso);
    if (gotoday) gotoday.style.display = isToday ? 'none' : '';

    if (!this._state || this._state.persons.length === 0) {
      grid.innerHTML = `<div class="empty"><div class="empty-ico">👥</div>Zatiaľ žiadne osoby.<br>Pridaj ich cez ⚙ Admin.</div>`;
      return;
    }

    grid.innerHTML = this._state.persons.map((p, pi) => {
      const pal   = PALETTE[p.colorIdx !== undefined ? p.colorIdx % PALETTE.length : pi % PALETTE.length];
      const tasks = this._state.tasks.filter(t => t.personId === p.id && occurrencesOnDate(t, iso));
      const visible = tasks.filter(t => this._showChecked || getOcc(t, iso) !== 'checked');
      const done  = tasks.filter(t => getOcc(t, iso) !== 'todo').length;

      const avatarHTML = p.avatar
        ? `<img src="${p.avatar}" alt="">`
        : this._initials(p.name);

      const progStyle = done === tasks.length && tasks.length > 0
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
              <div class="pcard-meta">${p.role || 'Člen'} · ${done}/${tasks.length} dnes</div>
            </div>
            <span class="pcard-prog" style="${progStyle}">${done}/${tasks.length}</span>
          </div>
          <div class="task-list">${taskRows}</div>
          ${this._adminOn ? `<div style="padding:6px 10px;border-top:1px solid var(--bd)">
            <button class="add-btn" data-add-person="${p.id}">＋ Pridať úlohu pre ${p.name}</button>
          </div>` : ''}
        </div>`;
    }).join('');

    // Event listenery
    grid.querySelectorAll('.task-main').forEach(el => {
      el.addEventListener('click', () => {
        el.closest('.task-row').classList.toggle('open');
      });
    });
    grid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { taskId, date, action } = btn.dataset;
        const task = this._state.tasks.find(t => t.id === taskId);
        if (!task) return;
        setOcc(task, date, action);
        this._save();
        this._renderPersonsGrid();
      });
    });
    grid.querySelectorAll('[data-edit-task]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const task = this._state.tasks.find(t => t.id === btn.dataset.editTask);
        if (task) this._openTaskModal(task);
      });
    });
    grid.querySelectorAll('[data-del-task]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Naozaj zmazať úlohu?')) return;
        this._state.tasks = this._state.tasks.filter(t => t.id !== btn.dataset.delTask);
        this._save(); this._renderPersonsGrid();
      });
    });
    grid.querySelectorAll('[data-add-person]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.addPerson;
        this._openTaskModal(null, pid);
      });
    });
  }

  _taskRowHTML(task, iso, isToday) {
    const raw = getOcc(task, iso);
    const isOverdue = isToday && iso < todayISO();
    const st  = (raw === 'todo' && iso < todayISO() && isToday) ? 'overdue' : raw;
    const stDisplay = st === 'overdue' ? 'overdue' : raw;

    const badges = { todo:'Treba spraviť', done:'Urobená', checked:'Skontrolovaná', overdue:'Nesplnená' };
    const dotCls = { todo:'dot-todo', done:'dot-done', checked:'dot-checked', overdue:'dot-overdue' };
    const badgeCls = { todo:'badge-todo', done:'badge-done', checked:'badge-checked', overdue:'badge-overdue' };

    const rtag = task.repeat && task.repeat !== 'none'
      ? `<span class="task-rtag">${REPEAT_LABEL[task.repeat] || task.repeat}</span>` : '';

    let detail = '';
    if (task.note) detail += `<span class="task-note">${task.note}</span>`;
    if (raw === 'todo')    detail += `<button class="act-btn btn-done" data-action="done" data-task-id="${task.id}" data-date="${iso}">✓ Označiť ako urobená</button>`;
    if (raw === 'done')    detail += `<button class="act-btn btn-checked" data-action="checked" data-task-id="${task.id}" data-date="${iso}">✓✓ Označiť ako skontrolovaná</button>`;
    if (raw !== 'todo')    detail += `<button class="act-btn btn-revert" data-action="todo" data-task-id="${task.id}" data-date="${iso}">Vrátiť</button>`;
    if (this._adminOn) {
      detail += `<div class="admin-acts">
        <button class="edit-ic" data-edit-task="${task.id}" title="Upraviť">✎</button>
        <button class="del-ic" data-del-task="${task.id}" title="Zmazať">✕</button>
      </div>`;
    }

    return `
      <div class="task-row" data-tid="${task.id}">
        <div class="task-main">
          <span class="task-dot ${dotCls[stDisplay] || 'dot-todo'}"></span>
          <span class="task-name">${task.name}</span>
          ${rtag}
          <span class="task-badge ${badgeCls[stDisplay] || 'badge-todo'}">${badges[stDisplay] || stDisplay}</span>
          <span class="task-chev">›</span>
        </div>
        <div class="task-detail">${detail}</div>
      </div>`;
  }

  _initials(name) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  // ── Modal: Úloha ─────────────────────────────────────────────────────────────
  _openTaskModal(task, defaultPersonId) {
    const isEdit = !!task;
    const persons = this._state.persons;
    this._weekSel = task?.repeatDays ? [...task.repeatDays] : [];
    const selPid  = task?.personId || defaultPersonId || persons[0]?.id || '';
    const selRep  = task?.repeat || 'none';

    const modal = this.shadowRoot.querySelector('#modal');
    modal.innerHTML = `
      <div class="modal-title">${isEdit ? 'Upraviť úlohu' : 'Nová úloha'}</div>
      <div class="fg"><label class="fl">Názov</label>
        <input class="fi" id="t-name" value="${task?.name || ''}" placeholder="Názov úlohy"></div>
      <div class="fg"><label class="fl">Poznámka</label>
        <textarea class="fta" id="t-note">${task?.note || ''}</textarea></div>
      <div class="fg"><label class="fl">Osoba</label>
        <select class="fsel" id="t-person">
          ${persons.map(p => `<option value="${p.id}"${p.id===selPid?' selected':''}>${p.name}</option>`).join('')}
          ${persons.length===0?'<option value="">— žiadna —</option>':''}
        </select></div>
      <div class="fg"><label class="fl">Dátum začiatku</label>
        <input class="fi" type="date" id="t-date" value="${task?.date || this._viewDate}"></div>
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
      modal.querySelector('#wd-wrap').style.display = e.target.value === 'weekly' ? '' : 'none';
    });
    modal.querySelectorAll('.wdbtn').forEach(b => b.addEventListener('click', () => {
      const d = +b.dataset.dow;
      if (this._weekSel.includes(d)) { this._weekSel = this._weekSel.filter(x=>x!==d); b.classList.remove('sel'); }
      else { this._weekSel.push(d); b.classList.add('sel'); }
    }));
    modal.querySelector('#t-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelector('#t-save').addEventListener('click', () => {
      const name = modal.querySelector('#t-name').value.trim();
      if (!name) return;
      const obj = {
        id: task?.id || uid(), name,
        note:       modal.querySelector('#t-note').value.trim(),
        personId:   modal.querySelector('#t-person').value,
        date:       modal.querySelector('#t-date').value,
        repeat:     modal.querySelector('#t-repeat').value,
        repeatDays: this._weekSel.slice().sort(),
        occurrences: task?.occurrences || {}
      };
      if (isEdit) {
        const i = this._state.tasks.findIndex(t => t.id === obj.id);
        if (i >= 0) this._state.tasks[i] = obj;
      } else {
        this._state.tasks.push(obj);
      }
      this._save(); this._closeModal(); this._renderPersonsGrid();
    });
    if (isEdit) modal.querySelector('#t-del').addEventListener('click', () => {
      if (!confirm('Naozaj zmazať?')) return;
      this._state.tasks = this._state.tasks.filter(t => t.id !== task.id);
      this._save(); this._closeModal(); this._renderPersonsGrid();
    });

    this._openOverlay();
  }

  // ── Modal: Admin ─────────────────────────────────────────────────────────────
  _openAdminModal() {
    const modal = this.shadowRoot.querySelector('#modal');
    if (!this._adminOn) {
      this._renderPin(modal);
    } else {
      this._renderAdminContent(modal);
    }
    this._openOverlay();
  }

  _renderPin(modal) {
    this._pinMode  = this._state.adminPin ? 'unlock' : 'setup1';
    this._pinInput = '';
    modal.innerHTML = `
      <div class="modal-title">Admin prístup</div>
      <div class="pin-wrap">
        <div class="pin-sub" id="pin-sub">${this._pinMode==='unlock'?'Zadajte PIN':'Nastavte 4-ciferný PIN'}</div>
        <div class="pin-dots">${[0,1,2,3].map(i=>`<div class="pin-dot" id="pd${i}"></div>`).join('')}</div>
        <div class="pin-err" id="pin-err"></div>
        <div class="pin-grid">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k=>
            `<button class="pin-key" data-k="${k}">${k}</button>`
          ).join('')}
        </div>
      </div>
      <div class="mfooter"><button class="btn-cancel" id="pin-cancel">Zrušiť</button></div>`;
    modal.querySelector('#pin-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelectorAll('.pin-key').forEach(b => b.addEventListener('click', () => this._pinKey(b.dataset.k, modal)));
  }

  _pinDots(modal) {
    for (let i=0;i<4;i++) {
      const d = modal.querySelector(`#pd${i}`);
      if (d) d.classList.toggle('f', i < this._pinInput.length);
    }
  }

  _pinKey(k, modal) {
    if (k==='⌫') { this._pinInput = this._pinInput.slice(0,-1); this._pinDots(modal); return; }
    if (k==='' || this._pinInput.length>=4) return;
    this._pinInput += k; this._pinDots(modal);
    if (this._pinInput.length===4) setTimeout(()=>this._processPin(modal),150);
  }

  _processPin(modal) {
    const err = modal.querySelector('#pin-err');
    const sub = modal.querySelector('#pin-sub');
    if (this._pinMode==='unlock') {
      if (this._pinInput===this._state.adminPin) {
        this._adminOn=true; this._pinInput=''; this._closeModal();
        this.shadowRoot.querySelector('#btn-admin').classList.add('on');
        this._renderPersonsGrid();
      } else {
        if(err) err.textContent='Nesprávny PIN';
        this._pinInput=''; this._pinDots(modal);
      }
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
        <div class="adm-section-lbl">Osoby</div>
        ${this._state.persons.map((p,pi) => {
          const pal = PALETTE[(p.colorIdx||pi) % PALETTE.length];
          const av  = p.avatar ? `<img src="${p.avatar}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover">` : this._initials(p.name);
          return `<div class="person-chip">
            <div class="pcard-avatar" style="width:26px;height:26px;font-size:11px;background:${pal.border};color:#fff">${av}</div>
            <span class="person-chip-name">${p.name}</span>
            <span class="person-chip-role">${p.role||'Člen'}</span>
            <button class="edit-ic" data-edit-person="${p.id}" title="Upraviť">✎</button>
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
    modal.querySelectorAll('[data-edit-person]').forEach(b => b.addEventListener('click', () => {
      const p = this._state.persons.find(x=>x.id===b.dataset.editPerson);
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

  _openPersonModal(person, parentModal) {
    const isEdit = !!person;
    const modal  = this.shadowRoot.querySelector('#modal');
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
        selColor = +dot.dataset.ci;
        modal.querySelectorAll('[data-ci]').forEach(d => d.style.outline = 'none');
        dot.style.outline = '3px solid var(--tx)';
      });
    });
    modal.querySelector('#p-back').addEventListener('click', () => {
      if (parentModal) this._renderAdminContent(modal);
      else this._closeModal();
    });
    modal.querySelector('#p-save').addEventListener('click', () => {
      const name = modal.querySelector('#p-name').value.trim();
      if (!name) return;
      const obj = {
        id:       person?.id || uid(), name,
        role:     modal.querySelector('#p-role').value,
        colorIdx: selColor,
        avatar:   modal.querySelector('#p-avatar').value.trim()
      };
      if (isEdit) {
        const i = this._state.persons.findIndex(p=>p.id===obj.id);
        if(i>=0) this._state.persons[i]=obj;
      } else {
        this._state.persons.push(obj);
      }
      this._save(); this._renderAdminContent(modal); this._renderPersonsGrid();
    });
    if (isEdit) modal.querySelector('#p-del').addEventListener('click', () => {
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
