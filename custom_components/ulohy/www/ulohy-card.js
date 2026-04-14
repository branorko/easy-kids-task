/**
 * ulohy-card.js  –  Úlohy pre domácnosť
 * Lovelace custom card pre Home Assistant
 *
 * Dáta ukladané cez /api/ulohy/data (Python backend)
 * → prežije reštart, záloha HA ho zahŕňa, zdieľané pre všetkých používateľov
 *
 * Inštalácia cez HACS – všetko sa nastaví automaticky.
 */

// ─── Pomocné funkcie ────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
  const months = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún',
                  'júl', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${days[d.getDay()]} ${d.getDate()}. ${months[d.getMonth()]}`;
}

function isOverdue(dateStr) {
  return dateStr < today();
}

// Vráti zoznam dátumov pre opakujúcu sa úlohu v rozsahu [from, to]
function occurrencesInRange(task, from, to) {
  const dates = [];
  if (!task.repeat || task.repeat === 'none') {
    if (task.date >= from && task.date <= to) dates.push(task.date);
    return dates;
  }
  let cur = task.date;
  while (cur <= to) {
    if (cur >= from) dates.push(cur);
    if (task.repeat === 'daily') { cur = addDays(cur, 1); }
    else if (task.repeat === 'weekly') {
      // opakuje sa v konkrétne dni
      const daysOfWeek = task.repeatDays || [];
      if (daysOfWeek.length === 0) { cur = addDays(cur, 7); }
      else {
        // nájdi nasledujúci výskyt
        let next = addDays(cur, 1);
        let safety = 0;
        while (safety++ < 14) {
          const dow = new Date(next + 'T12:00:00').getDay();
          // HA štandard: 0=Ne,1=Po,...,6=So
          if (daysOfWeek.includes(dow)) break;
          next = addDays(next, 1);
        }
        cur = next;
      }
    }
    else if (task.repeat === 'monthly') {
      const d = new Date(cur + 'T12:00:00');
      d.setMonth(d.getMonth() + 1);
      cur = d.toISOString().slice(0, 10);
    }
    else if (task.repeat === 'yearly') {
      const d = new Date(cur + 'T12:00:00');
      d.setFullYear(d.getFullYear() + 1);
      cur = d.toISOString().slice(0, 10);
    }
    else break;
  }
  return dates;
}

// Vráti stav konkrétnej inštancie úlohy k danému dátumu
function getOccState(task, dateStr) {
  const key = `${task.id}_${dateStr}`;
  return (task.occurrences || {})[key] || 'todo';
}

function setOccState(task, dateStr, state) {
  if (!task.occurrences) task.occurrences = {};
  const key = `${task.id}_${dateStr}`;
  task.occurrences[key] = state;
}

// ─── CSS ────────────────────────────────────────────────────────────────────

const STYLES = `
  :host {
    display: block;
    font-family: var(--primary-font-family, system-ui, sans-serif);
    --u-radius: 12px;
    --u-radius-sm: 8px;
    --u-bg: var(--card-background-color, #fff);
    --u-surface: var(--secondary-background-color, #f5f5f5);
    --u-border: var(--divider-color, rgba(0,0,0,0.12));
    --u-text: var(--primary-text-color, #212121);
    --u-muted: var(--secondary-text-color, #757575);
    --u-accent: var(--primary-color, #1976d2);
    /* stavové farby rovnaké ako sklad */
    --u-todo-bg: #FAEEDA;    --u-todo-text: #633806;
    --u-done-bg: #EAF3DE;    --u-done-text: #27500A;
    --u-checked-bg: #E1F5EE; --u-checked-text: #085041;
    --u-overdue-bg: #FCEBEB; --u-overdue-text: #791F1F;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .card {
    background: var(--u-bg);
    border-radius: var(--u-radius);
    overflow: hidden;
  }

  /* ── Hlavička ── */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 0;
  }
  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--u-text);
    letter-spacing: -0.01em;
  }
  .header-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--u-muted);
    padding: 6px;
    border-radius: var(--u-radius-sm);
    font-size: 16px;
    line-height: 1;
    transition: background 0.15s, color 0.15s;
  }
  .icon-btn:hover { background: var(--u-surface); color: var(--u-text); }
  .icon-btn.active { color: var(--u-accent); }

  /* ── Tabs ── */
  .tabs {
    display: flex;
    gap: 0;
    padding: 12px 16px 0;
    border-bottom: 1px solid var(--u-border);
  }
  .tab {
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background: none;
    color: var(--u-muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font-family: inherit;
    border-radius: var(--u-radius-sm) var(--u-radius-sm) 0 0;
    transition: color 0.15s;
  }
  .tab:hover { color: var(--u-text); }
  .tab.active { color: var(--u-text); border-bottom-color: var(--u-accent); }

  /* ── Obsah ── */
  .section { display: none; padding: 12px 16px 16px; }
  .section.active { display: block; }

  /* ── Navigácia dátumom ── */
  .date-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .nav-btn {
    background: none;
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm);
    width: 30px; height: 30px;
    cursor: pointer;
    font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    color: var(--u-text);
    transition: background 0.15s;
  }
  .nav-btn:hover { background: var(--u-surface); }
  .date-label {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--u-text);
  }
  .today-chip {
    font-size: 11px;
    padding: 3px 8px;
    border: 1px solid var(--u-border);
    border-radius: 20px;
    background: none;
    cursor: pointer;
    color: var(--u-muted);
    font-family: inherit;
    transition: background 0.15s;
  }
  .today-chip:hover { background: var(--u-surface); }

  /* ── Skupina úloh ── */
  .task-group-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--u-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 12px 0 6px;
  }
  .task-group-label:first-child { margin-top: 0; }

  /* ── Úloha (sklad štýl) ── */
  .task-row {
    border-radius: var(--u-radius-sm);
    margin-bottom: 4px;
    overflow: hidden;
    border: 1px solid var(--u-border);
    transition: box-shadow 0.15s;
  }
  .task-row:hover { box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

  .task-main {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    cursor: pointer;
    user-select: none;
  }

  .task-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .task-dot.todo    { background: #EF9F27; }
  .task-dot.done    { background: #639922; }
  .task-dot.checked { background: #1D9E75; }
  .task-dot.overdue { background: #E24B4A; }

  .task-avatar {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--u-surface);
    border: 1px solid var(--u-border);
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--u-muted);
    overflow: hidden;
  }
  .task-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .task-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: var(--u-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .task-repeat-tag {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    background: var(--u-surface);
    color: var(--u-muted);
    border: 1px solid var(--u-border);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .task-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .task-badge.todo    { background: var(--u-todo-bg);    color: var(--u-todo-text); }
  .task-badge.done    { background: var(--u-done-bg);    color: var(--u-done-text); }
  .task-badge.checked { background: var(--u-checked-bg); color: var(--u-checked-text); }
  .task-badge.overdue { background: var(--u-overdue-bg); color: var(--u-overdue-text); }

  .task-chevron {
    font-size: 12px;
    color: var(--u-muted);
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .task-row.open .task-chevron { transform: rotate(90deg); }

  /* ── Detail úlohy ── */
  .task-detail {
    display: none;
    padding: 8px 10px 10px;
    border-top: 1px solid var(--u-border);
    background: var(--u-surface);
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .task-row.open .task-detail { display: flex; }

  .action-btn {
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: var(--u-radius-sm);
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }
  .action-btn:hover { opacity: 0.85; }
  .action-btn.done-btn    { background: var(--u-done-bg);    color: var(--u-done-text); }
  .action-btn.checked-btn { background: var(--u-checked-bg); color: var(--u-checked-text); }
  .action-btn.revert-btn  { background: var(--u-surface); color: var(--u-muted);
                             border: 1px solid var(--u-border); }

  .admin-acts { margin-left: auto; display: flex; gap: 6px; }
  .edit-icon, .del-icon {
    background: none; border: none; cursor: pointer;
    font-size: 14px; color: var(--u-muted); padding: 4px 6px;
    border-radius: 6px; font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }
  .edit-icon:hover { background: var(--u-todo-bg); color: var(--u-todo-text); }
  .del-icon:hover  { background: var(--u-overdue-bg); color: var(--u-overdue-text); }

  /* ── Osobné karty ── */
  .persons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }
  .person-card {
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm);
    overflow: hidden;
  }
  .person-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--u-surface);
    border-bottom: 1px solid var(--u-border);
  }
  .person-avatar-lg {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: var(--u-border);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700;
    color: var(--u-muted);
    overflow: hidden;
    flex-shrink: 0;
  }
  .person-avatar-lg img { width: 100%; height: 100%; object-fit: cover; }
  .person-name-lg { font-size: 14px; font-weight: 600; color: var(--u-text); }
  .person-stats { font-size: 11px; color: var(--u-muted); }
  .person-tasks { padding: 6px 0; }
  .person-task-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--u-border);
    cursor: pointer;
    transition: background 0.1s;
  }
  .person-task-row:last-child { border-bottom: none; }
  .person-task-row:hover { background: var(--u-surface); }
  .person-task-name { flex: 1; font-size: 13px; color: var(--u-text); }
  .person-task-date { font-size: 11px; color: var(--u-muted); }

  /* ── Empty state ── */
  .empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--u-muted);
    font-size: 13px;
  }
  .empty-icon { font-size: 28px; margin-bottom: 8px; }

  /* ── Saving indikátor ── */
  .saving-bar {
    font-size: 11px;
    color: var(--u-muted);
    padding: 4px 16px;
    min-height: 20px;
    transition: opacity 0.3s;
  }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    opacity: 0; pointer-events: none;
    transition: opacity 0.2s;
  }
  .modal-overlay.open { opacity: 1; pointer-events: all; }
  .modal {
    background: var(--u-bg);
    border-radius: var(--u-radius);
    padding: 20px;
    width: min(420px, 92vw);
    max-height: 88vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    transform: translateY(12px);
    transition: transform 0.2s;
  }
  .modal-overlay.open .modal { transform: translateY(0); }
  .modal-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--u-text); }
  .form-group { margin-bottom: 12px; }
  .form-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--u-muted);
    margin-bottom: 5px;
  }
  .form-input, .form-select, .form-textarea {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm);
    background: var(--u-bg);
    color: var(--u-text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus {
    border-color: var(--u-accent);
  }
  .form-textarea { min-height: 60px; resize: vertical; }
  .weekday-grid {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .weekday-btn {
    width: 36px; height: 36px;
    border: 1px solid var(--u-border);
    border-radius: 50%;
    background: none;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    color: var(--u-muted);
    font-family: inherit;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .weekday-btn.sel {
    background: var(--u-accent);
    color: #fff;
    border-color: var(--u-accent);
  }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--u-border);
  }
  .btn-cancel {
    padding: 8px 16px;
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm);
    background: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--u-muted);
    font-family: inherit;
  }
  .btn-save {
    padding: 8px 16px;
    border: none;
    border-radius: var(--u-radius-sm);
    background: var(--u-accent);
    color: #fff;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
  }
  .btn-save:hover { opacity: 0.9; }
  .btn-danger {
    padding: 8px 16px;
    border: none;
    border-radius: var(--u-radius-sm);
    background: var(--u-overdue-bg);
    color: var(--u-overdue-text);
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    margin-right: auto;
  }

  /* ── PIN ── */
  .pin-wrap { text-align: center; padding: 8px 0; }
  .pin-dots { display: flex; gap: 12px; justify-content: center; margin: 12px 0; }
  .pin-dot {
    width: 14px; height: 14px;
    border-radius: 50%;
    border: 2px solid var(--u-border);
    background: none;
    transition: background 0.15s;
  }
  .pin-dot.filled { background: var(--u-accent); border-color: var(--u-accent); }
  .pin-grid {
    display: grid;
    grid-template-columns: repeat(3, 64px);
    gap: 8px;
    justify-content: center;
    margin-top: 8px;
  }
  .pin-key {
    height: 48px;
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm);
    background: var(--u-surface);
    cursor: pointer;
    font-size: 18px;
    font-weight: 500;
    color: var(--u-text);
    font-family: inherit;
    transition: background 0.15s;
  }
  .pin-key:hover { background: var(--u-border); }
  .pin-key.del { font-size: 14px; }
  .pin-err { font-size: 12px; color: var(--u-overdue-text); min-height: 18px; margin-top: 4px; }

  /* ── Admin sekcia ── */
  .admin-section { padding: 0; }
  .admin-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--u-border);
  }
  .admin-row:last-child { border-bottom: none; }
  .admin-row-label { font-size: 13px; color: var(--u-text); }
  .admin-row-sub { font-size: 11px; color: var(--u-muted); }
  .add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border: 1px dashed var(--u-border);
    border-radius: var(--u-radius-sm);
    background: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--u-muted);
    font-family: inherit;
    width: 100%;
    margin-top: 8px;
    transition: border-color 0.15s, color 0.15s;
  }
  .add-btn:hover { border-color: var(--u-accent); color: var(--u-accent); }
  .person-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm);
    margin-bottom: 6px;
  }
  .person-chip-name { flex: 1; font-size: 13px; color: var(--u-text); }
`;

// ─── Hlavná trieda karty ─────────────────────────────────────────────────────

class UlohyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._state = null;
    this._hass = null;
    this._activeTab = 0;  // 0=Dnes, 1=Osoby, 2=Admin
    this._viewDate = today();
    this._adminUnlocked = false;
    this._pinInput = '';
    this._pinMode = '';       // 'unlock' | 'setup1' | 'setup2'
    this._pinSetupFirst = '';
    this._saving = '';
    this._loaded = false;
    this._modalOpen = false;
    this._editTask = null;    // task objekt pri editácii
    this._editPerson = null;  // person objekt pri editácii
    this._weekdaysSel = [];   // vybrané dni pri editácii
  }

  set hass(h) {
    this._hass = h;
    if (!this._loaded) {
      this._loaded = true;
      this._loadData();
    }
  }

  setConfig(config) {
    this._config = config || {};
  }

  static getConfigElement() { return null; }
  static getStubConfig() { return {}; }

  // ── Storage ──────────────────────────────────────────────────────────────

  async _loadData() {
    try {
      const resp = await this._hass.callApi('GET', 'ulohy/data');
      if (resp && typeof resp === 'object') {
        this._state = resp;
      }
    } catch (e) {
      console.warn('[ulohy-card] Chyba načítania, používam prázdny stav', e);
    }
    if (!this._state) this._state = this._defaultState();
    this._render();
  }

  async _saveData() {
    this._setSaving('Ukladám…');
    try {
      await this._hass.callApi('POST', 'ulohy/data', this._state);
      this._setSaving('Uložené ✓');
    } catch (e) {
      console.error('[ulohy-card] Chyba ukladania', e);
      this._setSaving('Chyba ukladania!');
    }
    setTimeout(() => this._setSaving(''), 2000);
  }

  _setSaving(msg) {
    this._saving = msg;
    const bar = this.shadowRoot.querySelector('.saving-bar');
    if (bar) bar.textContent = msg;
  }

  _defaultState() {
    return {
      persons: [],
      tasks: [],
      adminPin: null,
      settings: { showChecked: false }
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────

  _render() {
    const s = this.shadowRoot;
    const t = this._activeTab;

    if (!s.querySelector('.card')) {
      // Prvý render – vybudujem celú štruktúru
      s.innerHTML = `
        <style>${STYLES}</style>
        <ha-card class="card">
          <div class="card-header">
            <span class="card-title">📋 Úlohy</span>
            <div class="header-actions">
              <button class="icon-btn" id="add-task-btn" title="Pridať úlohu">＋</button>
              <button class="icon-btn ${this._state.settings.showChecked ? 'active' : ''}"
                      id="toggle-checked-btn" title="Zobraziť skontrolované">✔</button>
            </div>
          </div>
          <div class="saving-bar">${this._saving}</div>
          <div class="tabs">
            <button class="tab ${t === 0 ? 'active' : ''}" data-tab="0">Dnes</button>
            <button class="tab ${t === 1 ? 'active' : ''}" data-tab="1">Osoby</button>
            <button class="tab ${t === 2 ? 'active' : ''}" data-tab="2">⚙</button>
          </div>
          <div class="section ${t === 0 ? 'active' : ''}" id="sec-0"></div>
          <div class="section ${t === 1 ? 'active' : ''}" id="sec-1"></div>
          <div class="section ${t === 2 ? 'active' : ''}" id="sec-2"></div>
        </ha-card>
        <div class="modal-overlay" id="modal-overlay">
          <div class="modal" id="modal"></div>
        </div>
      `;

      // Event listenery
      s.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
          this._activeTab = +btn.dataset.tab;
          this._render();
        });
      });
      s.querySelector('#add-task-btn').addEventListener('click', () => {
        this._openTaskModal(null, null);
      });
      s.querySelector('#toggle-checked-btn').addEventListener('click', () => {
        this._state.settings.showChecked = !this._state.settings.showChecked;
        this._saveData();
        this._render();
      });
      s.querySelector('#modal-overlay').addEventListener('click', (e) => {
        if (e.target === s.querySelector('#modal-overlay')) this._closeModal();
      });
    } else {
      // Aktualizácia tabov
      s.querySelectorAll('.tab').forEach((btn, i) => {
        btn.classList.toggle('active', i === t);
      });
      s.querySelectorAll('.section').forEach((sec, i) => {
        sec.classList.toggle('active', i === t);
      });
      const toggleBtn = s.querySelector('#toggle-checked-btn');
      if (toggleBtn) toggleBtn.classList.toggle('active', this._state.settings.showChecked);
    }

    // Vyplniť aktívnu sekciu
    this._renderSection(t);
  }

  _renderSection(idx) {
    const sec = this.shadowRoot.querySelector(`#sec-${idx}`);
    if (!sec) return;
    if (idx === 0) this._renderToday(sec);
    else if (idx === 1) this._renderPersons(sec);
    else this._renderAdmin(sec);
  }

  // ── Sekcia: Dnes ─────────────────────────────────────────────────────────

  _renderToday(sec) {
    const todayStr = today();
    const isToday = this._viewDate === todayStr;

    // Predom-a-pozadu okno: overdue = všetko pred dnes čo nie je hotové
    const overdueDate = addDays(todayStr, -30);
    const futureCap = addDays(todayStr, 365);

    // Všetky výskyty v zobrazovanom dni
    const dayTasks = this._getTasksForDate(this._viewDate);

    // Overdue – len ak zobrazujeme dnes
    let overdueTasks = [];
    if (isToday) {
      // Hľadám nedokončené výskyty z posledných 30 dní (okrem dnes)
      for (let i = 29; i >= 1; i--) {
        const d = addDays(todayStr, -i);
        const dt = this._getTasksForDate(d);
        overdueTasks.push(...dt.filter(x => x.st === 'todo').map(x => ({ ...x, overdueDate: d })));
      }
    }

    let html = `
      <div class="date-nav">
        <button class="nav-btn" id="prev-day">‹</button>
        <span class="date-label">${isToday ? 'Dnes' : ''} ${fmtDate(this._viewDate)}</span>
        ${!isToday ? `<button class="today-chip" id="go-today">Dnes</button>` : ''}
        <button class="nav-btn" id="next-day">›</button>
      </div>
    `;

    if (overdueTasks.length > 0) {
      html += `<div class="task-group-label" style="color:var(--u-overdue-text)">⚠ Nesplnené z predchádzajúcich dní</div>`;
      overdueTasks.forEach(t => { html += this._taskRowHtml(t, t.overdueDate, 'overdue'); });
    }

    if (dayTasks.length === 0 && overdueTasks.length === 0) {
      html += `<div class="empty"><div class="empty-icon">🎉</div>Na tento deň nie sú žiadne úlohy</div>`;
    } else if (dayTasks.length > 0) {
      if (overdueTasks.length > 0) html += `<div class="task-group-label">Dnešné úlohy</div>`;
      const showChecked = this._state.settings.showChecked;
      dayTasks
        .filter(t => showChecked || t.st !== 'checked')
        .forEach(t => { html += this._taskRowHtml(t, this._viewDate, isOverdue(this._viewDate) ? 'overdue' : t.st); });
    }

    html += `<button class="add-btn" id="add-task-day">＋ Pridať úlohu</button>`;
    sec.innerHTML = html;

    sec.querySelector('#prev-day').addEventListener('click', () => {
      this._viewDate = addDays(this._viewDate, -1);
      this._renderSection(0);
    });
    sec.querySelector('#next-day').addEventListener('click', () => {
      this._viewDate = addDays(this._viewDate, 1);
      this._renderSection(0);
    });
    const goToday = sec.querySelector('#go-today');
    if (goToday) goToday.addEventListener('click', () => {
      this._viewDate = today();
      this._renderSection(0);
    });
    sec.querySelector('#add-task-day').addEventListener('click', () => {
      this._openTaskModal(null, this._viewDate);
    });

    this._attachTaskRowListeners(sec);
  }

  _getTasksForDate(dateStr) {
    const result = [];
    for (const task of this._state.tasks) {
      const occs = occurrencesInRange(task, dateStr, dateStr);
      if (occs.length > 0) {
        const st = getOccState(task, dateStr);
        const person = this._state.persons.find(p => p.id === task.personId);
        result.push({ task, st, person });
      }
    }
    return result;
  }

  _taskRowHtml(item, dateStr, stateOverride) {
    const { task, st, person } = item;
    const displaySt = stateOverride || st;
    const badges = {
      todo: 'Treba spraviť',
      done: 'Urobená',
      checked: 'Skontrolovaná',
      overdue: 'Nesplnená'
    };
    const repeatLabels = {
      none: '', daily: 'denne', weekly: 'týždenne', monthly: 'mesačne', yearly: 'ročne'
    };
    const avatarContent = person?.avatar
      ? `<img src="${person.avatar}" alt="">`
      : `<span>${(person?.name || '?')[0].toUpperCase()}</span>`;

    const repeatTag = task.repeat && task.repeat !== 'none'
      ? `<span class="task-repeat-tag">${repeatLabels[task.repeat] || task.repeat}</span>` : '';

    return `
      <div class="task-row" data-task-id="${task.id}" data-date="${dateStr}">
        <div class="task-main">
          <span class="task-dot ${displaySt}"></span>
          <span class="task-avatar">${avatarContent}</span>
          <span class="task-name">${task.name}</span>
          ${repeatTag}
          <span class="task-badge ${displaySt}">${badges[displaySt] || displaySt}</span>
          <span class="task-chevron">›</span>
        </div>
        <div class="task-detail">
          ${this._taskDetailHtml(task, dateStr, st)}
        </div>
      </div>
    `;
  }

  _taskDetailHtml(task, dateStr, st) {
    let btns = '';
    if (st === 'todo') {
      btns += `<button class="action-btn done-btn" data-action="done" data-task-id="${task.id}" data-date="${dateStr}">✓ Urobená</button>`;
    } else if (st === 'done') {
      btns += `<button class="action-btn checked-btn" data-action="checked" data-task-id="${task.id}" data-date="${dateStr}">✓✓ Skontrolovaná</button>`;
      btns += `<button class="action-btn revert-btn" data-action="todo" data-task-id="${task.id}" data-date="${dateStr}">Vrátiť</button>`;
    } else if (st === 'checked') {
      btns += `<button class="action-btn revert-btn" data-action="todo" data-task-id="${task.id}" data-date="${dateStr}">Vrátiť</button>`;
    }
    if (task.note) {
      btns = `<span style="font-size:12px;color:var(--u-muted);flex-basis:100%;margin-bottom:4px">${task.note}</span>` + btns;
    }
    const adminPart = this._adminUnlocked
      ? `<div class="admin-acts">
           <button class="edit-icon" data-edit-task="${task.id}" data-date="${dateStr}" title="Upraviť">✎</button>
           <button class="del-icon" data-del-task="${task.id}" title="Zmazať">✕</button>
         </div>` : '';
    return btns + adminPart;
  }

  _attachTaskRowListeners(container) {
    // Toggle otvoriť/zatvoriť
    container.querySelectorAll('.task-main').forEach(main => {
      main.addEventListener('click', () => {
        const row = main.closest('.task-row');
        row.classList.toggle('open');
      });
    });
    // Akčné tlačidlá
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.dataset.taskId;
        const dateStr = btn.dataset.date;
        const action = btn.dataset.action;
        const task = this._state.tasks.find(t => t.id === taskId);
        if (!task) return;
        setOccState(task, dateStr, action);
        this._saveData();
        this._renderSection(this._activeTab);
      });
    });
    // Edit
    container.querySelectorAll('[data-edit-task]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const task = this._state.tasks.find(t => t.id === btn.dataset.editTask);
        if (task) this._openTaskModal(task, btn.dataset.date || null);
      });
    });
    // Delete
    container.querySelectorAll('[data-del-task]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Naozaj zmazať úlohu?')) return;
        this._state.tasks = this._state.tasks.filter(t => t.id !== btn.dataset.delTask);
        this._saveData();
        this._renderSection(this._activeTab);
      });
    });
  }

  // ── Sekcia: Osoby ─────────────────────────────────────────────────────────

  _renderPersons(sec) {
    const todayStr = today();
    if (this._state.persons.length === 0) {
      sec.innerHTML = `<div class="empty"><div class="empty-icon">👥</div>Zatiaľ žiadne osoby.<br>Pridaj ich v sekcii ⚙</div>`;
      return;
    }

    let html = `<div class="persons-grid">`;
    for (const person of this._state.persons) {
      const personTasks = this._state.tasks.filter(t => t.personId === person.id);
      const todayTasks = personTasks.filter(t => occurrencesInRange(t, todayStr, todayStr).length > 0);
      const doneCnt = todayTasks.filter(t => getOccState(t, todayStr) !== 'todo').length;
      const avatarContent = person.avatar
        ? `<img src="${person.avatar}" alt="">`
        : person.name[0].toUpperCase();

      html += `
        <div class="person-card">
          <div class="person-card-header">
            <div class="person-avatar-lg">${typeof avatarContent === 'string' && avatarContent.startsWith('<img') ? avatarContent : avatarContent}</div>
            <div>
              <div class="person-name-lg">${person.name}</div>
              <div class="person-stats">${doneCnt}/${todayTasks.length} dnes hotovo</div>
            </div>
          </div>
          <div class="person-tasks">
      `;

      const showChecked = this._state.settings.showChecked;
      const filtered = todayTasks.filter(t => showChecked || getOccState(t, todayStr) !== 'checked');
      if (filtered.length === 0) {
        html += `<div class="empty" style="padding:16px 12px">Žiadne úlohy dnes</div>`;
      } else {
        for (const task of filtered) {
          const st = getOccState(task, todayStr);
          const badges = { todo: '○', done: '◑', checked: '●' };
          html += `
            <div class="person-task-row" data-task-id="${task.id}" data-date="${todayStr}">
              <span style="font-size:16px;color:${st === 'todo' ? '#EF9F27' : st === 'done' ? '#639922' : '#1D9E75'}">${badges[st] || '○'}</span>
              <span class="person-task-name">${task.name}</span>
              <span class="person-task-date">${task.repeat && task.repeat !== 'none' ? '↻' : fmtDate(task.date)}</span>
            </div>
          `;
        }
      }

      html += `</div></div>`;
    }
    html += `</div>`;
    sec.innerHTML = html;

    // Klik na úlohu osoby → prepnúť stav
    sec.querySelectorAll('.person-task-row').forEach(row => {
      row.addEventListener('click', () => {
        const taskId = row.dataset.taskId;
        const dateStr = row.dataset.date;
        const task = this._state.tasks.find(t => t.id === taskId);
        if (!task) return;
        const st = getOccState(task, dateStr);
        const next = st === 'todo' ? 'done' : st === 'done' ? 'checked' : 'todo';
        setOccState(task, dateStr, next);
        this._saveData();
        this._renderSection(1);
      });
    });
  }

  // ── Sekcia: Admin ─────────────────────────────────────────────────────────

  _renderAdmin(sec) {
    if (!this._adminUnlocked) {
      this._renderPin(sec);
      return;
    }
    this._renderAdminContent(sec);
  }

  _renderPin(sec) {
    if (!this._state.adminPin) {
      this._pinMode = 'setup1';
    } else {
      this._pinMode = 'unlock';
    }
    sec.innerHTML = `
      <div class="pin-wrap">
        <div style="font-size:13px;color:var(--u-muted);margin-bottom:4px" id="pin-sub">
          ${this._pinMode === 'setup1' ? 'Nastavte 4-ciferný PIN' : 'Zadajte PIN'}
        </div>
        <div class="pin-dots">
          <div class="pin-dot" id="d0"></div>
          <div class="pin-dot" id="d1"></div>
          <div class="pin-dot" id="d2"></div>
          <div class="pin-dot" id="d3"></div>
        </div>
        <div class="pin-err" id="pin-err"></div>
        <div class="pin-grid">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k =>
            `<button class="pin-key${k === '⌫' ? ' del' : ''}" data-key="${k}">${k}</button>`
          ).join('')}
        </div>
      </div>
    `;
    sec.querySelectorAll('.pin-key').forEach(btn => {
      btn.addEventListener('click', () => this._pinKey(btn.dataset.key, sec));
    });
  }

  _updateDots(sec) {
    for (let i = 0; i < 4; i++) {
      const d = sec.querySelector(`#d${i}`);
      if (d) d.classList.toggle('filled', i < this._pinInput.length);
    }
  }

  _pinKey(k, sec) {
    if (k === '⌫') {
      this._pinInput = this._pinInput.slice(0, -1);
      this._updateDots(sec);
      return;
    }
    if (k === '' || this._pinInput.length >= 4) return;
    this._pinInput += k;
    this._updateDots(sec);
    if (this._pinInput.length === 4) setTimeout(() => this._processPin(sec), 150);
  }

  _processPin(sec) {
    const errEl = sec.querySelector('#pin-err');
    const subEl = sec.querySelector('#pin-sub');
    if (this._pinMode === 'unlock') {
      if (this._pinInput === this._state.adminPin) {
        this._adminUnlocked = true;
        this._pinInput = '';
        this._renderAdminContent(sec);
      } else {
        if (errEl) errEl.textContent = 'Nesprávny PIN';
        this._pinInput = '';
        this._updateDots(sec);
      }
    } else if (this._pinMode === 'setup1') {
      this._pinSetupFirst = this._pinInput;
      this._pinInput = '';
      this._pinMode = 'setup2';
      if (subEl) subEl.textContent = 'Zopakujte PIN';
      if (errEl) errEl.textContent = '';
      this._updateDots(sec);
    } else if (this._pinMode === 'setup2') {
      if (this._pinInput === this._pinSetupFirst) {
        this._state.adminPin = this._pinInput;
        this._adminUnlocked = true;
        this._pinInput = '';
        this._saveData();
        this._renderAdminContent(sec);
      } else {
        if (errEl) errEl.textContent = 'PINy sa nezhodujú';
        this._pinInput = '';
        this._pinSetupFirst = '';
        this._pinMode = 'setup1';
        if (subEl) subEl.textContent = 'Nastavte 4-ciferný PIN';
        this._updateDots(sec);
      }
    }
  }

  _renderAdminContent(sec) {
    let html = `<div class="admin-section">`;
    // Osoby
    html += `<div class="task-group-label">Osoby</div>`;
    for (const person of this._state.persons) {
      html += `
        <div class="person-chip">
          <div class="task-avatar">${person.avatar ? `<img src="${person.avatar}">` : person.name[0]}</div>
          <span class="person-chip-name">${person.name}</span>
          <button class="edit-icon" data-edit-person="${person.id}" title="Upraviť">✎</button>
          <button class="del-icon" data-del-person="${person.id}" title="Zmazať">✕</button>
        </div>
      `;
    }
    html += `<button class="add-btn" id="add-person-btn">＋ Pridať osobu</button>`;

    // Nastavenia
    html += `<div class="task-group-label" style="margin-top:16px">Nastavenia</div>`;
    html += `
      <div class="admin-row">
        <div>
          <div class="admin-row-label">Zmeniť PIN</div>
          <div class="admin-row-sub">Aktuálne je nastavený PIN</div>
        </div>
        <button class="btn-cancel" id="change-pin-btn">Zmeniť</button>
      </div>
      <div class="admin-row">
        <div>
          <div class="admin-row-label">Zamknúť admin</div>
          <div class="admin-row-sub">Vyžadovať PIN znova</div>
        </div>
        <button class="btn-cancel" id="lock-btn">Zamknúť</button>
      </div>
    `;
    html += `</div>`;
    sec.innerHTML = html;

    sec.querySelector('#add-person-btn').addEventListener('click', () => this._openPersonModal(null));
    sec.querySelector('#change-pin-btn').addEventListener('click', () => {
      this._state.adminPin = null;
      this._adminUnlocked = false;
      this._renderAdmin(sec);
    });
    sec.querySelector('#lock-btn').addEventListener('click', () => {
      this._adminUnlocked = false;
      this._renderAdmin(sec);
    });
    sec.querySelectorAll('[data-edit-person]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = this._state.persons.find(x => x.id === btn.dataset.editPerson);
        if (p) this._openPersonModal(p);
      });
    });
    sec.querySelectorAll('[data-del-person]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Zmazať osobu a všetky jej úlohy?')) return;
        const pid = btn.dataset.delPerson;
        this._state.persons = this._state.persons.filter(p => p.id !== pid);
        this._state.tasks = this._state.tasks.filter(t => t.personId !== pid);
        this._saveData();
        this._renderSection(2);
      });
    });
  }

  // ── Modály ───────────────────────────────────────────────────────────────

  _openTaskModal(task, defaultDate) {
    const overlay = this.shadowRoot.querySelector('#modal-overlay');
    const modal = this.shadowRoot.querySelector('#modal');
    const isEdit = !!task;
    const persons = this._state.persons;

    const selPersonId = task?.personId || persons[0]?.id || '';
    const selDate = task?.date || defaultDate || today();
    const selRepeat = task?.repeat || 'none';
    this._weekdaysSel = task?.repeatDays ? [...task.repeatDays] : [];

    const dayNames = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
    const repeatOpts = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
    const repeatLabels = ['Jednorazová', 'Denne', 'Týždenne', 'Mesačne', 'Ročne'];

    modal.innerHTML = `
      <div class="modal-title">${isEdit ? 'Upraviť úlohu' : 'Nová úloha'}</div>
      <div class="form-group">
        <label class="form-label">Názov</label>
        <input class="form-input" id="t-name" value="${task?.name || ''}" placeholder="Názov úlohy">
      </div>
      <div class="form-group">
        <label class="form-label">Poznámka</label>
        <textarea class="form-textarea" id="t-note">${task?.note || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Osoba</label>
        <select class="form-select" id="t-person">
          ${persons.map(p => `<option value="${p.id}" ${p.id === selPersonId ? 'selected' : ''}>${p.name}</option>`).join('')}
          ${persons.length === 0 ? '<option value="">— žiadna osoba —</option>' : ''}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Dátum začiatku</label>
        <input class="form-input" type="date" id="t-date" value="${selDate}">
      </div>
      <div class="form-group">
        <label class="form-label">Opakovanie</label>
        <select class="form-select" id="t-repeat">
          ${repeatOpts.map((v, i) => `<option value="${v}" ${v === selRepeat ? 'selected' : ''}>${repeatLabels[i]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="weekdays-wrap" style="${selRepeat === 'weekly' ? '' : 'display:none'}">
        <label class="form-label">Dni v týždni</label>
        <div class="weekday-grid">
          ${dayNames.map((n, i) =>
            `<button type="button" class="weekday-btn${this._weekdaysSel.includes(i) ? ' sel' : ''}" data-dow="${i}">${n}</button>`
          ).join('')}
        </div>
      </div>
      <div class="modal-footer">
        ${isEdit ? `<button class="btn-danger" id="t-del">Zmazať</button>` : ''}
        <button class="btn-cancel" id="t-cancel">Zrušiť</button>
        <button class="btn-save" id="t-save">Uložiť</button>
      </div>
    `;

    modal.querySelector('#t-repeat').addEventListener('change', (e) => {
      modal.querySelector('#weekdays-wrap').style.display = e.target.value === 'weekly' ? '' : 'none';
    });
    modal.querySelectorAll('.weekday-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dow = +btn.dataset.dow;
        if (this._weekdaysSel.includes(dow)) {
          this._weekdaysSel = this._weekdaysSel.filter(d => d !== dow);
          btn.classList.remove('sel');
        } else {
          this._weekdaysSel.push(dow);
          btn.classList.add('sel');
        }
      });
    });
    modal.querySelector('#t-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelector('#t-save').addEventListener('click', () => {
      const name = modal.querySelector('#t-name').value.trim();
      if (!name) return;
      const data = {
        id: task?.id || uid(),
        name,
        note: modal.querySelector('#t-note').value.trim(),
        personId: modal.querySelector('#t-person').value,
        date: modal.querySelector('#t-date').value,
        repeat: modal.querySelector('#t-repeat').value,
        repeatDays: this._weekdaysSel.slice().sort(),
        occurrences: task?.occurrences || {}
      };
      if (isEdit) {
        const idx = this._state.tasks.findIndex(t => t.id === data.id);
        if (idx >= 0) this._state.tasks[idx] = data;
      } else {
        this._state.tasks.push(data);
      }
      this._saveData();
      this._closeModal();
      this._renderSection(this._activeTab);
    });
    if (isEdit) {
      modal.querySelector('#t-del').addEventListener('click', () => {
        if (!confirm('Naozaj zmazať úlohu?')) return;
        this._state.tasks = this._state.tasks.filter(t => t.id !== task.id);
        this._saveData();
        this._closeModal();
        this._renderSection(this._activeTab);
      });
    }

    overlay.classList.add('open');
  }

  _openPersonModal(person) {
    const overlay = this.shadowRoot.querySelector('#modal-overlay');
    const modal = this.shadowRoot.querySelector('#modal');
    const isEdit = !!person;

    modal.innerHTML = `
      <div class="modal-title">${isEdit ? 'Upraviť osobu' : 'Nová osoba'}</div>
      <div class="form-group">
        <label class="form-label">Meno</label>
        <input class="form-input" id="p-name" value="${person?.name || ''}" placeholder="Meno osoby">
      </div>
      <div class="form-group">
        <label class="form-label">Avatar (URL obrázka, nepovinné)</label>
        <input class="form-input" id="p-avatar" value="${person?.avatar || ''}" placeholder="https://...">
      </div>
      <div class="modal-footer">
        ${isEdit ? `<button class="btn-danger" id="p-del">Zmazať</button>` : ''}
        <button class="btn-cancel" id="p-cancel">Zrušiť</button>
        <button class="btn-save" id="p-save">Uložiť</button>
      </div>
    `;

    modal.querySelector('#p-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelector('#p-save').addEventListener('click', () => {
      const name = modal.querySelector('#p-name').value.trim();
      if (!name) return;
      const data = {
        id: person?.id || uid(),
        name,
        avatar: modal.querySelector('#p-avatar').value.trim()
      };
      if (isEdit) {
        const idx = this._state.persons.findIndex(p => p.id === data.id);
        if (idx >= 0) this._state.persons[idx] = data;
      } else {
        this._state.persons.push(data);
      }
      this._saveData();
      this._closeModal();
      this._renderSection(this._activeTab);
    });
    if (isEdit) {
      modal.querySelector('#p-del').addEventListener('click', () => {
        if (!confirm('Zmazať osobu a všetky jej úlohy?')) return;
        this._state.persons = this._state.persons.filter(p => p.id !== person.id);
        this._state.tasks = this._state.tasks.filter(t => t.personId !== person.id);
        this._saveData();
        this._closeModal();
        this._renderSection(this._activeTab);
      });
    }

    overlay.classList.add('open');
  }

  _closeModal() {
    this.shadowRoot.querySelector('#modal-overlay').classList.remove('open');
    this._weekdaysSel = [];
  }
}

customElements.define('ulohy-card', UlohyCard);
