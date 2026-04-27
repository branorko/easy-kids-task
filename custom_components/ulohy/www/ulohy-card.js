/**
 * ulohy-card.js  –  Úlohy pre domácnosť  v2.1.0
 * Lovelace custom card pre Home Assistant
 *
 * Novinky v2.1:
 *  - Body môžu ísť do mínusu
 *  - Dieťa môže kliknúť na svoj bodový badge → pop-up „Využiť body"
 *  - Log transakcií pre každé dieťa (dátum, čas, popis, zmena, zostatok)
 *  - Admin úprava bodov zaznamenáva + alebo − do logu
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

function fmtDateTime(isoStr) {
  const d = new Date(isoStr);
  const days = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
  const months = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún',
                  'júl', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const pad = n => String(n).padStart(2, '0');
  return `${days[d.getDay()]} ${d.getDate()}. ${months[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isOverdue(dateStr) {
  return dateStr < today();
}

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
      const daysOfWeek = task.repeatDays || [];
      if (daysOfWeek.length === 0) { cur = addDays(cur, 7); }
      else {
        let next = addDays(cur, 1);
        let safety = 0;
        while (safety++ < 14) {
          const dow = new Date(next + 'T12:00:00').getDay();
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

function getOccState(task, dateStr) {
  const key = `${task.id}_${dateStr}`;
  return (task.occurrences || {})[key] || 'todo';
}

function getOccDoneBy(task, dateStr) {
  const key = `${task.id}_${dateStr}`;
  return (task.doneBy || {})[key] || [];   // pole person IDs
}

function setOccState(task, dateStr, state, doneBy) {
  if (!task.occurrences) task.occurrences = {};
  if (!task.doneBy) task.doneBy = {};
  const key = `${task.id}_${dateStr}`;
  task.occurrences[key] = state;
  if (doneBy !== undefined) task.doneBy[key] = doneBy;
}

// Pre permanentné úlohy – jednoducho boolean stav + kto urobil
function getPermanentState(ptask) {
  return ptask.done || false;
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
    --u-todo-bg: #FAEEDA;    --u-todo-text: #633806;
    --u-done-bg: #EAF3DE;    --u-done-text: #27500A;
    --u-overdue-bg: #FCEBEB; --u-overdue-text: #791F1F;
    --u-points-bg: #E8F0FE;  --u-points-text: #1565C0;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .card { background: var(--u-bg); border-radius: var(--u-radius); overflow: hidden; }

  /* ── Hlavička ── */
  .card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 16px 0;
  }
  .card-title { font-size: 16px; font-weight: 600; color: var(--u-text); letter-spacing: -0.01em; }
  .header-actions { display: flex; gap: 6px; align-items: center; }
  .icon-btn {
    background: none; border: none; cursor: pointer; color: var(--u-muted);
    padding: 6px; border-radius: var(--u-radius-sm); font-size: 16px; line-height: 1;
    transition: background 0.15s, color 0.15s;
  }
  .icon-btn:hover { background: var(--u-surface); color: var(--u-text); }
  .icon-btn.active { color: var(--u-accent); }

  /* ── Tabs ── */
  .tabs {
    display: flex; padding: 12px 16px 0;
    border-bottom: 1px solid var(--u-border);
  }
  .tab {
    padding: 8px 14px; font-size: 13px; font-weight: 500; cursor: pointer;
    border: none; background: none; color: var(--u-muted);
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    font-family: inherit; border-radius: var(--u-radius-sm) var(--u-radius-sm) 0 0;
    transition: color 0.15s;
  }
  .tab:hover { color: var(--u-text); }
  .tab.active { color: var(--u-text); border-bottom-color: var(--u-accent); }

  /* ── Obsah ── */
  .section { display: none; padding: 12px 16px 16px; }
  .section.active { display: block; }

  /* ── Navigácia dátumom ── */
  .date-nav { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .nav-btn {
    background: none; border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm); width: 30px; height: 30px;
    cursor: pointer; font-size: 14px; display: flex; align-items: center;
    justify-content: center; color: var(--u-text); transition: background 0.15s;
  }
  .nav-btn:hover { background: var(--u-surface); }
  .date-label { flex: 1; font-size: 14px; font-weight: 500; color: var(--u-text); }
  .today-chip {
    font-size: 11px; padding: 3px 8px; border: 1px solid var(--u-border);
    border-radius: 20px; background: none; cursor: pointer; color: var(--u-muted);
    font-family: inherit; transition: background 0.15s;
  }
  .today-chip:hover { background: var(--u-surface); }

  /* ── Skupina ── */
  .task-group-label {
    font-size: 11px; font-weight: 600; color: var(--u-muted);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin: 12px 0 6px;
  }
  .task-group-label:first-child { margin-top: 0; }

  /* ── Úloha ── */
  .task-row {
    border-radius: var(--u-radius-sm); margin-bottom: 4px;
    overflow: hidden; border: 1px solid var(--u-border);
    transition: box-shadow 0.15s;
  }
  .task-row:hover { box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .task-main {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; cursor: pointer; user-select: none;
  }
  .task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .task-dot.todo    { background: #EF9F27; }
  .task-dot.done    { background: #639922; }
  .task-dot.overdue { background: #E24B4A; }
  .task-dot.permanent-done { background: #639922; }
  .task-dot.permanent-todo { background: #aaa; }

  .task-avatar {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--u-surface); border: 1px solid var(--u-border);
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600; color: var(--u-muted); overflow: hidden;
  }
  .task-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .task-name {
    flex: 1; font-size: 13px; font-weight: 500; color: var(--u-text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .task-repeat-tag {
    font-size: 10px; padding: 2px 6px; border-radius: 10px;
    background: var(--u-surface); color: var(--u-muted);
    border: 1px solid var(--u-border); white-space: nowrap; flex-shrink: 0;
  }
  .task-points-tag {
    font-size: 10px; padding: 2px 6px; border-radius: 10px;
    background: var(--u-points-bg); color: var(--u-points-text);
    border: 1px solid rgba(21,101,192,0.2); white-space: nowrap; flex-shrink: 0;
    font-weight: 600;
  }
  .task-badge {
    font-size: 11px; font-weight: 600; padding: 3px 8px;
    border-radius: 10px; white-space: nowrap; flex-shrink: 0;
  }
  .task-badge.todo    { background: var(--u-todo-bg);    color: var(--u-todo-text); }
  .task-badge.done    { background: var(--u-done-bg);    color: var(--u-done-text); }
  .task-badge.overdue { background: var(--u-overdue-bg); color: var(--u-overdue-text); }
  .task-badge.permanent-done { background: var(--u-done-bg); color: var(--u-done-text); }
  .task-badge.permanent-todo { background: var(--u-surface); color: var(--u-muted); }

  .task-chevron { font-size: 12px; color: var(--u-muted); transition: transform 0.2s; flex-shrink: 0; }
  .task-row.open .task-chevron { transform: rotate(90deg); }

  /* ── Detail úlohy ── */
  .task-detail {
    display: none; padding: 8px 10px 10px;
    border-top: 1px solid var(--u-border);
    background: var(--u-surface); gap: 8px;
    flex-wrap: wrap; align-items: flex-start;
  }
  .task-row.open .task-detail { display: flex; }

  /* ── Výber kto urobil ── */
  .who-did-label {
    font-size: 11px; font-weight: 600; color: var(--u-muted);
    text-transform: uppercase; letter-spacing: 0.05em;
    flex-basis: 100%; margin-bottom: 2px;
  }
  .who-did-grid { display: flex; gap: 6px; flex-wrap: wrap; flex-basis: 100%; }
  .who-btn {
    display: flex; align-items: center; gap: 5px;
    padding: 5px 10px; border: 1.5px solid var(--u-border);
    border-radius: 20px; background: var(--u-bg);
    cursor: pointer; font-size: 12px; font-weight: 500;
    color: var(--u-text); font-family: inherit;
    transition: border-color 0.15s, background 0.15s;
  }
  .who-btn.sel {
    border-color: var(--u-accent); background: var(--u-points-bg);
    color: var(--u-points-text);
  }
  .who-avatar {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--u-border); display: flex; align-items: center;
    justify-content: center; font-size: 10px; font-weight: 700;
    overflow: hidden; flex-shrink: 0;
  }
  .who-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .confirm-done-btn {
    padding: 6px 14px; border: none; border-radius: var(--u-radius-sm);
    background: var(--u-done-bg); color: var(--u-done-text);
    cursor: pointer; font-size: 12px; font-weight: 600;
    font-family: inherit; transition: opacity 0.15s;
    margin-top: 4px;
  }
  .confirm-done-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .confirm-done-btn:not(:disabled):hover { opacity: 0.85; }

  .action-btn {
    font-size: 12px; font-weight: 600; padding: 6px 12px;
    border-radius: var(--u-radius-sm); border: none; cursor: pointer;
    font-family: inherit; transition: opacity 0.15s;
  }
  .action-btn:hover { opacity: 0.85; }
  .action-btn.revert-btn {
    background: var(--u-surface); color: var(--u-muted);
    border: 1px solid var(--u-border);
  }

  .done-info {
    font-size: 11px; color: var(--u-done-text);
    background: var(--u-done-bg); padding: 4px 10px;
    border-radius: var(--u-radius-sm); flex-basis: 100%;
  }

  .admin-acts { margin-left: auto; display: flex; gap: 6px; }
  .edit-icon, .del-icon {
    background: none; border: none; cursor: pointer;
    font-size: 14px; color: var(--u-muted); padding: 4px 6px;
    border-radius: 6px; font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }
  .edit-icon:hover { background: var(--u-todo-bg); color: var(--u-todo-text); }
  .del-icon:hover  { background: var(--u-overdue-bg); color: var(--u-overdue-text); }

  /* ── Permanentný zoznam banner ── */
  .permanent-banner {
    background: linear-gradient(135deg, #F0F4FF 0%, #E8F0FE 100%);
    border: 1px solid rgba(21,101,192,0.15);
    border-radius: var(--u-radius-sm);
    padding: 8px 12px 6px;
    margin-bottom: 12px;
  }
  .permanent-banner-title {
    font-size: 11px; font-weight: 700; color: var(--u-points-text);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 6px; display: flex; align-items: center; gap: 5px;
  }

  /* ── Osobné karty ── */
  .persons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }
  .person-card { border: 1px solid var(--u-border); border-radius: var(--u-radius-sm); overflow: hidden; }
  .person-card-header {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: var(--u-surface); border-bottom: 1px solid var(--u-border);
  }
  .person-avatar-lg {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--u-border); display: flex; align-items: center;
    justify-content: center; font-size: 16px; font-weight: 700;
    color: var(--u-muted); overflow: hidden; flex-shrink: 0;
  }
  .person-avatar-lg img { width: 100%; height: 100%; object-fit: cover; }
  .person-name-lg { font-size: 14px; font-weight: 600; color: var(--u-text); }
  .person-stats { font-size: 11px; color: var(--u-muted); }
  .person-points-badge {
    margin-left: auto; background: var(--u-points-bg);
    color: var(--u-points-text); font-size: 13px; font-weight: 700;
    padding: 4px 10px; border-radius: 20px;
    border: 1px solid rgba(21,101,192,0.2);
    white-space: nowrap;
  }
  .person-tasks { padding: 6px 0; }
  .person-task-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; border-bottom: 1px solid var(--u-border);
    transition: background 0.1s;
  }
  .person-task-row:last-child { border-bottom: none; }
  .person-task-name { flex: 1; font-size: 13px; color: var(--u-text); }
  .person-task-date { font-size: 11px; color: var(--u-muted); }

  /* ── Empty state ── */
  .empty { text-align: center; padding: 32px 16px; color: var(--u-muted); font-size: 13px; }
  .empty-icon { font-size: 28px; margin-bottom: 8px; }

  /* ── Saving ── */
  .saving-bar { font-size: 11px; color: var(--u-muted); padding: 4px 16px; min-height: 20px; }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; opacity: 0; pointer-events: none; transition: opacity 0.2s;
  }
  .modal-overlay.open { opacity: 1; pointer-events: all; }
  .modal {
    background: var(--u-bg); border-radius: var(--u-radius); padding: 20px;
    width: min(440px, 92vw); max-height: 88vh; overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    transform: translateY(12px); transition: transform 0.2s;
  }
  .modal-overlay.open .modal { transform: translateY(0); }
  .modal-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--u-text); }
  .form-group { margin-bottom: 12px; }
  .form-label { display: block; font-size: 12px; font-weight: 500; color: var(--u-muted); margin-bottom: 5px; }
  .form-input, .form-select, .form-textarea {
    width: 100%; padding: 8px 10px; border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm); background: var(--u-bg); color: var(--u-text);
    font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.15s;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--u-accent); }
  .form-textarea { min-height: 60px; resize: vertical; }

  .points-row { display: flex; align-items: center; gap: 8px; }
  .points-row .form-input { width: 80px; text-align: center; }

  .weekday-grid { display: flex; gap: 6px; flex-wrap: wrap; }
  .weekday-btn {
    width: 36px; height: 36px; border: 1px solid var(--u-border);
    border-radius: 50%; background: none; cursor: pointer;
    font-size: 12px; font-weight: 500; color: var(--u-muted);
    font-family: inherit; transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .weekday-btn.sel { background: var(--u-accent); color: #fff; border-color: var(--u-accent); }

  .modal-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--u-border);
  }
  .btn-cancel {
    padding: 8px 16px; border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm); background: none; cursor: pointer;
    font-size: 13px; color: var(--u-muted); font-family: inherit;
  }
  .btn-save {
    padding: 8px 16px; border: none; border-radius: var(--u-radius-sm);
    background: var(--u-accent); color: #fff; cursor: pointer;
    font-size: 13px; font-weight: 500; font-family: inherit;
  }
  .btn-save:hover { opacity: 0.9; }
  .btn-danger {
    padding: 8px 16px; border: none; border-radius: var(--u-radius-sm);
    background: var(--u-overdue-bg); color: var(--u-overdue-text);
    cursor: pointer; font-size: 13px; font-family: inherit; margin-right: auto;
  }

  /* ── PIN ── */
  .pin-wrap { text-align: center; padding: 8px 0; }
  .pin-dots { display: flex; gap: 12px; justify-content: center; margin: 12px 0; }
  .pin-dot {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid var(--u-border); background: none; transition: background 0.15s;
  }
  .pin-dot.filled { background: var(--u-accent); border-color: var(--u-accent); }
  .pin-grid {
    display: grid; grid-template-columns: repeat(3, 64px);
    gap: 8px; justify-content: center; margin-top: 8px;
  }
  .pin-key {
    height: 48px; border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm); background: var(--u-surface);
    cursor: pointer; font-size: 18px; font-weight: 500;
    color: var(--u-text); font-family: inherit; transition: background 0.15s;
  }
  .pin-key:hover { background: var(--u-border); }
  .pin-key.del { font-size: 14px; }
  .pin-err { font-size: 12px; color: var(--u-overdue-text); min-height: 18px; margin-top: 4px; }

  /* ── Admin sekcia ── */
  .admin-section { padding: 0; }
  .admin-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 0; border-bottom: 1px solid var(--u-border);
  }
  .admin-row:last-child { border-bottom: none; }
  .admin-row-label { font-size: 13px; color: var(--u-text); }
  .admin-row-sub { font-size: 11px; color: var(--u-muted); }

  .add-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 12px; border: 1px dashed var(--u-border);
    border-radius: var(--u-radius-sm); background: none; cursor: pointer;
    font-size: 13px; color: var(--u-muted); font-family: inherit;
    width: 100%; margin-top: 8px;
    transition: border-color 0.15s, color 0.15s;
  }
  .add-btn:hover { border-color: var(--u-accent); color: var(--u-accent); }

  .person-chip {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm); margin-bottom: 6px;
  }
  .person-chip-name { flex: 1; font-size: 13px; color: var(--u-text); }
  .person-chip-points {
    font-size: 12px; font-weight: 700; color: var(--u-points-text);
    background: var(--u-points-bg); padding: 2px 8px; border-radius: 10px;
  }

  /* ── Admin body adjust ── */
  .points-adjust {
    display: flex; align-items: center; gap: 6px;
  }
  .pts-btn {
    width: 28px; height: 28px; border: 1px solid var(--u-border);
    border-radius: var(--u-radius-sm); background: var(--u-surface);
    cursor: pointer; font-size: 14px; font-weight: 700;
    color: var(--u-text); font-family: inherit;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
  }
  .pts-btn:hover { background: var(--u-border); }
  .pts-input {
    width: 52px; text-align: center; padding: 4px 6px;
    border: 1px solid var(--u-border); border-radius: var(--u-radius-sm);
    background: var(--u-bg); color: var(--u-text);
    font-size: 13px; font-family: inherit;
  }

  /* ── Log transakcií ── */
  .log-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  .log-table th {
    text-align: left; padding: 5px 8px; font-size: 11px; font-weight: 600;
    color: var(--u-muted); border-bottom: 2px solid var(--u-border); white-space: nowrap;
  }
  .log-table td { padding: 5px 8px; border-bottom: 1px solid var(--u-border); vertical-align: top; }
  .log-table tr:last-child td { border-bottom: none; }
  .log-pos { color: var(--u-done-text); font-weight: 700; }
  .log-neg { color: var(--u-overdue-text); font-weight: 700; }
  .log-bal { font-weight: 600; }
`;

// ─── Hlavná trieda ───────────────────────────────────────────────────────────

class UlohyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._state = null;
    this._hass = null;
    this._activeTab = 0;
    this._viewDate = today();
    this._adminUnlocked = false;
    this._pinInput = '';
    this._pinMode = '';
    this._pinSetupFirst = '';
    this._saving = '';
    this._loaded = false;
    this._weekdaysSel = [];
    // dočasný výber "kto urobil" pre otvorenú úlohu
    this._whoSel = {};  // taskKey → Set of personIds
  }

  set hass(h) {
    this._hass = h;
    if (!this._loaded) {
      this._loaded = true;
      this._loadData();
    }
  }

  setConfig(config) { this._config = config || {}; }
  static getConfigElement() { return null; }
  static getStubConfig() { return {}; }

  // ── Storage ──────────────────────────────────────────────────────────────

  async _loadData() {
    try {
      const resp = await this._hass.callApi('GET', 'ulohy/data');
      if (resp && typeof resp === 'object') this._state = resp;
    } catch (e) {
      console.warn('[ulohy-card] Chyba načítania', e);
    }
    if (!this._state) this._state = this._defaultState();
    // Migrácia
    if (!this._state.permanentTasks) this._state.permanentTasks = [];
    if (!this._state.pointsLog) this._state.pointsLog = {};
    for (const p of (this._state.persons || [])) {
      if (p.points === undefined) p.points = 0;
    }
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
    return { persons: [], tasks: [], permanentTasks: [], pointsLog: {}, adminPin: null, settings: { showChecked: false } };
  }

  // ── Points & log helpers ──────────────────────────────────────────────────

  _logEntry(personId, description, delta, newBalance) {
    if (!this._state.pointsLog) this._state.pointsLog = {};
    if (!this._state.pointsLog[personId]) this._state.pointsLog[personId] = [];
    this._state.pointsLog[personId].unshift({
      ts: new Date().toISOString(),
      desc: description,
      delta: Math.round(delta * 10) / 10,
      bal: Math.round(newBalance * 10) / 10
    });
    // Max 200 záznamov na osobu
    if (this._state.pointsLog[personId].length > 200) {
      this._state.pointsLog[personId] = this._state.pointsLog[personId].slice(0, 200);
    }
  }

  _addPoints(personIds, taskPoints, taskName) {
    if (!personIds || personIds.length === 0 || !taskPoints) return;
    const share = taskPoints / personIds.length;
    for (const pid of personIds) {
      const p = this._state.persons.find(x => x.id === pid);
      if (p) {
        p.points = Math.round(((p.points || 0) + share) * 10) / 10;
        this._logEntry(pid, taskName || 'Úloha', +share, p.points);
      }
    }
  }

  _removePoints(personIds, taskPoints, taskName) {
    if (!personIds || personIds.length === 0 || !taskPoints) return;
    const share = taskPoints / personIds.length;
    for (const pid of personIds) {
      const p = this._state.persons.find(x => x.id === pid);
      if (p) {
        p.points = Math.round(((p.points || 0) - share) * 10) / 10;
        this._logEntry(pid, `Vrátené: ${taskName || 'Úloha'}`, -share, p.points);
      }
    }
  }

  _spendPoints(person, amount) {
    person.points = Math.round(((person.points || 0) - amount) * 10) / 10;
    this._logEntry(person.id, `Využité body`, -amount, person.points);
  }

  _adminAdjustPoints(person, delta, label) {
    person.points = Math.round(((person.points || 0) + delta) * 10) / 10;
    this._logEntry(person.id, label || (delta > 0 ? 'Admin: úprava +' : 'Admin: úprava −'), delta, person.points);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  _render() {
    const s = this.shadowRoot;
    const t = this._activeTab;

    if (!s.querySelector('.card')) {
      s.innerHTML = `
        <style>${STYLES}</style>
        <ha-card class="card">
          <div class="card-header">
            <span class="card-title">📋 Úlohy</span>
            <div class="header-actions">
              <button class="icon-btn" id="add-task-btn" title="Pridať úlohu">＋</button>
              <button class="icon-btn ${this._state.settings.showChecked ? 'active' : ''}"
                      id="toggle-checked-btn" title="Zobraziť dokončené">✔</button>
            </div>
          </div>
          <div class="saving-bar">${this._saving}</div>
          <div class="tabs">
            <button class="tab ${t===0?'active':''}" data-tab="0">Dnes</button>
            <button class="tab ${t===1?'active':''}" data-tab="1">Osoby</button>
            <button class="tab ${t===2?'active':''}" data-tab="2">Stály zoznam</button>
            <button class="tab ${t===3?'active':''}" data-tab="3">⚙</button>
          </div>
          <div class="section ${t===0?'active':''}" id="sec-0"></div>
          <div class="section ${t===1?'active':''}" id="sec-1"></div>
          <div class="section ${t===2?'active':''}" id="sec-2"></div>
          <div class="section ${t===3?'active':''}" id="sec-3"></div>
        </ha-card>
        <div class="modal-overlay" id="modal-overlay">
          <div class="modal" id="modal"></div>
        </div>
      `;

      s.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => { this._activeTab = +btn.dataset.tab; this._render(); });
      });
      s.querySelector('#add-task-btn').addEventListener('click', () => this._openTaskModal(null, null));
      s.querySelector('#toggle-checked-btn').addEventListener('click', () => {
        this._state.settings.showChecked = !this._state.settings.showChecked;
        this._saveData(); this._render();
      });
      s.querySelector('#modal-overlay').addEventListener('click', (e) => {
        if (e.target === s.querySelector('#modal-overlay')) this._closeModal();
      });
    } else {
      s.querySelectorAll('.tab').forEach((btn, i) => btn.classList.toggle('active', i === t));
      s.querySelectorAll('.section').forEach((sec, i) => sec.classList.toggle('active', i === t));
      const tb = s.querySelector('#toggle-checked-btn');
      if (tb) tb.classList.toggle('active', this._state.settings.showChecked);
    }

    this._renderSection(t);
  }

  _renderSection(idx) {
    const sec = this.shadowRoot.querySelector(`#sec-${idx}`);
    if (!sec) return;
    if (idx === 0) this._renderToday(sec);
    else if (idx === 1) this._renderPersons(sec);
    else if (idx === 2) this._renderPermanent(sec);
    else this._renderAdmin(sec);
  }

  // ── Sekcia: Dnes ─────────────────────────────────────────────────────────

  _renderToday(sec) {
    const todayStr = today();
    const isToday = this._viewDate === todayStr;
    const dayTasks = this._getTasksForDate(this._viewDate);

    let overdueTasks = [];
    if (isToday) {
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

    // Permanentné úlohy – malý banner v Dnes sekcii
    const permVisible = this._state.permanentTasks.filter(pt => !pt.done || this._state.settings.showChecked);
    if (permVisible.length > 0) {
      html += `<div class="permanent-banner">
        <div class="permanent-banner-title">📌 Stály zoznam</div>`;
      permVisible.forEach(pt => { html += this._permanentRowHtml(pt, true); });
      html += `</div>`;
    }

    if (overdueTasks.length > 0) {
      html += `<div class="task-group-label" style="color:var(--u-overdue-text)">⚠ Nesplnené z predchádzajúcich dní</div>`;
      overdueTasks.forEach(t => { html += this._taskRowHtml(t, t.overdueDate, 'overdue'); });
    }

    if (dayTasks.length === 0 && overdueTasks.length === 0 && permVisible.length === 0) {
      html += `<div class="empty"><div class="empty-icon">🎉</div>Na tento deň nie sú žiadne úlohy</div>`;
    } else if (dayTasks.length > 0) {
      if (overdueTasks.length > 0) html += `<div class="task-group-label">Dnešné úlohy</div>`;
      const show = this._state.settings.showChecked;
      dayTasks
        .filter(t => show || t.st !== 'done')
        .forEach(t => { html += this._taskRowHtml(t, this._viewDate, isOverdue(this._viewDate) ? 'overdue' : t.st); });
    }

    html += `<button class="add-btn" id="add-task-day">＋ Pridať úlohu na tento deň</button>`;
    sec.innerHTML = html;

    sec.querySelector('#prev-day').addEventListener('click', () => { this._viewDate = addDays(this._viewDate, -1); this._renderSection(0); });
    sec.querySelector('#next-day').addEventListener('click', () => { this._viewDate = addDays(this._viewDate, 1); this._renderSection(0); });
    const gt = sec.querySelector('#go-today');
    if (gt) gt.addEventListener('click', () => { this._viewDate = today(); this._renderSection(0); });
    sec.querySelector('#add-task-day').addEventListener('click', () => this._openTaskModal(null, this._viewDate));

    this._attachTaskRowListeners(sec);
    this._attachPermanentListeners(sec);
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

  // ── Task row HTML ─────────────────────────────────────────────────────────

  _taskRowHtml(item, dateStr, stateOverride) {
    const { task, st, person } = item;
    const displaySt = stateOverride || st;
    const badges = { todo: 'Treba spraviť', done: 'Urobená', overdue: 'Nesplnená' };
    const repeatLabels = { none: '', daily: 'denne', weekly: 'týždenne', monthly: 'mesačne', yearly: 'ročne' };
    const avatarContent = person?.avatar
      ? `<img src="${person.avatar}" alt="">`
      : `<span>${(person?.name || '?')[0].toUpperCase()}</span>`;
    const repeatTag = task.repeat && task.repeat !== 'none'
      ? `<span class="task-repeat-tag">${repeatLabels[task.repeat] || task.repeat}</span>` : '';
    const pointsTag = task.points
      ? `<span class="task-points-tag">⭐ ${task.points}b</span>` : '';

    return `
      <div class="task-row" data-task-id="${task.id}" data-date="${dateStr}">
        <div class="task-main">
          <span class="task-dot ${displaySt}"></span>
          <span class="task-avatar">${avatarContent}</span>
          <span class="task-name">${task.name}</span>
          ${repeatTag}${pointsTag}
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
    const taskKey = `${task.id}_${dateStr}`;
    const selSet = this._whoSel[taskKey] || new Set();
    const persons = this._state.persons;
    const doneBy = getOccDoneBy(task, dateStr);

    let html = '';
    if (task.note) {
      html += `<span style="font-size:12px;color:var(--u-muted);flex-basis:100%;margin-bottom:4px">${task.note}</span>`;
    }

    if (st === 'todo') {
      // Výber kto urobil
      html += `<div class="who-did-label">Kto úlohu urobil?</div>`;
      html += `<div class="who-did-grid" id="who-grid-${taskKey}">`;
      for (const p of persons) {
        const isSel = selSet.has(p.id);
        const av = p.avatar ? `<img src="${p.avatar}">` : p.name[0].toUpperCase();
        html += `<button class="who-btn${isSel?' sel':''}" data-who-task="${taskKey}" data-person-id="${p.id}">
          <span class="who-avatar">${av}</span>${p.name}
        </button>`;
      }
      html += `</div>`;
      const canConfirm = selSet.size > 0;
      const pts = task.points || 0;
      const ptsLabel = pts > 0 && selSet.size > 0 ? ` (+${Math.round(pts/selSet.size*10)/10}b/os.)` : '';
      html += `<button class="confirm-done-btn" data-confirm-task="${task.id}" data-date="${dateStr}" ${canConfirm?'':'disabled'}>
        ✓ Potvrdiť urobené${ptsLabel}
      </button>`;
    } else if (st === 'done') {
      // Kto urobil info
      const names = doneBy.map(id => persons.find(p=>p.id===id)?.name || '?').join(', ');
      if (names) html += `<div class="done-info">✓ Urobili: ${names}</div>`;
      html += `<button class="action-btn revert-btn" data-action="todo" data-task-id="${task.id}" data-date="${dateStr}">Vrátiť do Treba spraviť</button>`;
    }

    const adminPart = this._adminUnlocked
      ? `<div class="admin-acts">
           <button class="edit-icon" data-edit-task="${task.id}" data-date="${dateStr}" title="Upraviť">✎</button>
           <button class="del-icon" data-del-task="${task.id}" title="Zmazať">✕</button>
         </div>` : '';
    return html + adminPart;
  }

  _attachTaskRowListeners(container) {
    container.querySelectorAll('.task-main').forEach(main => {
      main.addEventListener('click', () => {
        const row = main.closest('.task-row');
        row.classList.toggle('open');
        // Re-render detail aby som mal aktuálny stav who-sel
        const taskId = row.dataset.taskId;
        const dateStr = row.dataset.date;
        const task = this._state.tasks.find(t => t.id === taskId);
        if (task && row.classList.contains('open')) {
          const st = getOccState(task, dateStr);
          row.querySelector('.task-detail').innerHTML = this._taskDetailHtml(task, dateStr, st);
          this._attachDetailListeners(row, task, dateStr);
        }
      });
    });
    // Revert
    container.querySelectorAll('[data-action="todo"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.dataset.taskId;
        const dateStr = btn.dataset.date;
        const task = this._state.tasks.find(t => t.id === taskId);
        if (!task) return;
        // Odobrať body
        const prevDoneBy = getOccDoneBy(task, dateStr);
        if (prevDoneBy.length > 0) this._removePoints(prevDoneBy, task.points || 0, task.name);
        setOccState(task, dateStr, 'todo', []);
        this._saveData();
        this._renderSection(this._activeTab);
      });
    });
    // Edit/Del
    container.querySelectorAll('[data-edit-task]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const task = this._state.tasks.find(t => t.id === btn.dataset.editTask);
        if (task) this._openTaskModal(task, btn.dataset.date || null);
      });
    });
    container.querySelectorAll('[data-del-task]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Naozaj zmazať úlohu?')) return;
        this._state.tasks = this._state.tasks.filter(t => t.id !== btn.dataset.delTask);
        this._saveData();
        this._renderSection(this._activeTab);
      });
    });
    // Who-btn & confirm (existujúce riadky)
    this._attachDetailListenersAll(container);
  }

  _attachDetailListenersAll(container) {
    container.querySelectorAll('.task-row.open').forEach(row => {
      const taskId = row.dataset.taskId;
      const dateStr = row.dataset.date;
      const task = this._state.tasks.find(t => t.id === taskId);
      if (task) this._attachDetailListeners(row, task, dateStr);
    });
    // Aj pre zatvorené – who-btn môžu byť viditeľné po re-renderi
    container.querySelectorAll('[data-who-task]').forEach(btn => {
      this._attachWhoBtn(btn);
    });
    container.querySelectorAll('[data-confirm-task]').forEach(btn => {
      this._attachConfirmBtn(btn);
    });
  }

  _attachDetailListeners(row, task, dateStr) {
    row.querySelectorAll('[data-who-task]').forEach(btn => this._attachWhoBtn(btn));
    row.querySelectorAll('[data-confirm-task]').forEach(btn => this._attachConfirmBtn(btn));
    row.querySelectorAll('[data-action="todo"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prevDoneBy = getOccDoneBy(task, dateStr);
        if (prevDoneBy.length > 0) this._removePoints(prevDoneBy, task.points || 0, task.name);
        setOccState(task, dateStr, 'todo', []);
        this._saveData();
        this._renderSection(this._activeTab);
      });
    });
  }

  _attachWhoBtn(btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskKey = btn.dataset.whoTask;
      const pid = btn.dataset.personId;
      if (!this._whoSel[taskKey]) this._whoSel[taskKey] = new Set();
      const sel = this._whoSel[taskKey];
      if (sel.has(pid)) sel.delete(pid); else sel.add(pid);
      btn.classList.toggle('sel', sel.has(pid));
      // Aktualizovať confirm button
      const row = btn.closest('.task-row');
      if (!row) return;
      const taskId = row.dataset.taskId;
      const dateStr = row.dataset.date;
      const task = this._state.tasks.find(t => t.id === taskId);
      const confirmBtn = row.querySelector('[data-confirm-task]');
      if (confirmBtn) {
        const pts = task?.points || 0;
        const cnt = sel.size;
        const ptsLabel = pts > 0 && cnt > 0 ? ` (+${Math.round(pts/cnt*10)/10}b/os.)` : '';
        confirmBtn.disabled = cnt === 0;
        confirmBtn.textContent = `✓ Potvrdiť urobené${ptsLabel}`;
      }
    });
  }

  _attachConfirmBtn(btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.task-row');
      if (!row) return;
      const taskId = btn.dataset.confirmTask || row.dataset.taskId;
      const dateStr = btn.dataset.date || row.dataset.date;
      const task = this._state.tasks.find(t => t.id === taskId);
      if (!task) return;
      const taskKey = `${taskId}_${dateStr}`;
      const sel = this._whoSel[taskKey] || new Set();
      const doneBy = [...sel];
      setOccState(task, dateStr, 'done', doneBy);
      if (doneBy.length > 0) this._addPoints(doneBy, task.points || 0, task.name);
      delete this._whoSel[taskKey];
      this._saveData();
      this._renderSection(this._activeTab);
    });
  }

  // ── Permanentný zoznam ───────────────────────────────────────────────────

  _permanentRowHtml(pt, compact = false) {
    const isDone = pt.done || false;
    return `
      <div class="task-row${compact?' permanent-compact':''}" data-perm-id="${pt.id}">
        <div class="task-main">
          <span class="task-dot ${isDone?'permanent-done':'permanent-todo'}"></span>
          <span class="task-name">${pt.name}</span>
          ${pt.points ? `<span class="task-points-tag">⭐ ${pt.points}b</span>` : ''}
          <span class="task-badge ${isDone?'permanent-done':'permanent-todo'}">${isDone?'Hotovo':'Čaká'}</span>
          <span class="task-chevron">›</span>
        </div>
        <div class="task-detail">
          ${this._permanentDetailHtml(pt)}
        </div>
      </div>
    `;
  }

  _permanentDetailHtml(pt) {
    const isDone = pt.done || false;
    const persons = this._state.persons;
    const taskKey = `perm_${pt.id}`;
    const selSet = this._whoSel[taskKey] || new Set();

    let html = '';
    if (pt.note) html += `<span style="font-size:12px;color:var(--u-muted);flex-basis:100%;margin-bottom:4px">${pt.note}</span>`;

    if (!isDone) {
      html += `<div class="who-did-label">Kto úlohu urobil?</div>`;
      html += `<div class="who-did-grid">`;
      for (const p of persons) {
        const isSel = selSet.has(p.id);
        const av = p.avatar ? `<img src="${p.avatar}">` : p.name[0].toUpperCase();
        html += `<button class="who-btn${isSel?' sel':''}" data-who-perm="${taskKey}" data-person-id="${p.id}">
          <span class="who-avatar">${av}</span>${p.name}
        </button>`;
      }
      html += `</div>`;
      const pts = pt.points || 0;
      const cnt = selSet.size;
      const ptsLabel = pts > 0 && cnt > 0 ? ` (+${Math.round(pts/cnt*10)/10}b/os.)` : '';
      html += `<button class="confirm-done-btn" data-confirm-perm="${pt.id}" ${selSet.size>0?'':'disabled'}>✓ Potvrdiť urobené${ptsLabel}</button>`;
    } else {
      const names = (pt.doneBy || []).map(id => persons.find(p=>p.id===id)?.name || '?').join(', ');
      if (names) html += `<div class="done-info">✓ Urobili: ${names}</div>`;
      html += `<button class="action-btn revert-btn" data-revert-perm="${pt.id}">Vrátiť do Čaká</button>`;
    }

    if (this._adminUnlocked) {
      html += `<div class="admin-acts">
        <button class="edit-icon" data-edit-perm="${pt.id}" title="Upraviť">✎</button>
        <button class="del-icon" data-del-perm="${pt.id}" title="Zmazať">✕</button>
      </div>`;
    }
    return html;
  }

  _renderPermanent(sec) {
    const tasks = this._state.permanentTasks || [];
    let html = '';
    if (tasks.length === 0) {
      html = `<div class="empty"><div class="empty-icon">📌</div>Žiadne stále úlohy.<br>Pridaj úlohy ktoré platia dlhodobo.</div>`;
    } else {
      const show = this._state.settings.showChecked;
      tasks.filter(pt => show || !pt.done).forEach(pt => { html += this._permanentRowHtml(pt); });
    }
    html += `<button class="add-btn" id="add-perm-btn">＋ Pridať stálu úlohu</button>`;
    sec.innerHTML = html;
    sec.querySelector('#add-perm-btn').addEventListener('click', () => this._openPermanentModal(null));
    this._attachPermanentListeners(sec);
  }

  _attachPermanentListeners(container) {
    // Toggle open
    container.querySelectorAll('[data-perm-id]').forEach(row => {
      const main = row.querySelector('.task-main');
      if (!main) return;
      main.addEventListener('click', () => {
        row.classList.toggle('open');
        if (row.classList.contains('open')) {
          const pt = this._state.permanentTasks.find(x => x.id === row.dataset.permId);
          if (pt) {
            row.querySelector('.task-detail').innerHTML = this._permanentDetailHtml(pt);
            this._attachPermDetailListeners(row, pt);
          }
        }
      });
    });
    // Who-btn
    container.querySelectorAll('[data-who-perm]').forEach(btn => this._attachWhoPermBtn(btn));
    // Confirm perm
    container.querySelectorAll('[data-confirm-perm]').forEach(btn => this._attachConfirmPermBtn(btn));
    // Revert
    container.querySelectorAll('[data-revert-perm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pt = this._state.permanentTasks.find(x => x.id === btn.dataset.revertPerm);
        if (!pt) return;
        if (pt.doneBy?.length) this._removePoints(pt.doneBy, pt.points || 0, pt.name);
        pt.done = false; pt.doneBy = [];
        this._saveData(); this._renderSection(this._activeTab);
      });
    });
    // Edit/del perm
    container.querySelectorAll('[data-edit-perm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pt = this._state.permanentTasks.find(x => x.id === btn.dataset.editPerm);
        if (pt) this._openPermanentModal(pt);
      });
    });
    container.querySelectorAll('[data-del-perm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Zmazať stálu úlohu?')) return;
        this._state.permanentTasks = this._state.permanentTasks.filter(x => x.id !== btn.dataset.delPerm);
        this._saveData(); this._renderSection(this._activeTab);
      });
    });
  }

  _attachPermDetailListeners(row, pt) {
    row.querySelectorAll('[data-who-perm]').forEach(btn => this._attachWhoPermBtn(btn));
    row.querySelectorAll('[data-confirm-perm]').forEach(btn => this._attachConfirmPermBtn(btn));
    row.querySelectorAll('[data-revert-perm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pt.doneBy?.length) this._removePoints(pt.doneBy, pt.points || 0, pt.name);
        pt.done = false; pt.doneBy = [];
        this._saveData(); this._renderSection(this._activeTab);
      });
    });
    row.querySelectorAll('[data-edit-perm]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._openPermanentModal(pt); });
    });
    row.querySelectorAll('[data-del-perm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Zmazať stálu úlohu?')) return;
        this._state.permanentTasks = this._state.permanentTasks.filter(x => x.id !== pt.id);
        this._saveData(); this._renderSection(this._activeTab);
      });
    });
  }

  _attachWhoPermBtn(btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskKey = btn.dataset.whoPerm;
      const pid = btn.dataset.personId;
      if (!this._whoSel[taskKey]) this._whoSel[taskKey] = new Set();
      const sel = this._whoSel[taskKey];
      if (sel.has(pid)) sel.delete(pid); else sel.add(pid);
      btn.classList.toggle('sel', sel.has(pid));
      const row = btn.closest('[data-perm-id]');
      if (!row) return;
      const pt = this._state.permanentTasks.find(x => x.id === row.dataset.permId);
      const confirmBtn = row.querySelector('[data-confirm-perm]');
      if (confirmBtn) {
        const pts = pt?.points || 0;
        const cnt = sel.size;
        const ptsLabel = pts > 0 && cnt > 0 ? ` (+${Math.round(pts/cnt*10)/10}b/os.)` : '';
        confirmBtn.disabled = cnt === 0;
        confirmBtn.textContent = `✓ Potvrdiť urobené${ptsLabel}`;
      }
    });
  }

  _attachConfirmPermBtn(btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const permId = btn.dataset.confirmPerm;
      const pt = this._state.permanentTasks.find(x => x.id === permId);
      if (!pt) return;
      const taskKey = `perm_${permId}`;
      const sel = this._whoSel[taskKey] || new Set();
      const doneBy = [...sel];
      pt.done = true;
      pt.doneBy = doneBy;
      if (doneBy.length > 0) this._addPoints(doneBy, pt.points || 0, pt.name);
      delete this._whoSel[taskKey];
      this._saveData(); this._renderSection(this._activeTab);
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
      const pts = person.points || 0;
      const ptsColor = pts < 0 ? 'background:#FCEBEB;color:#791F1F;border-color:rgba(121,31,31,0.2)' : '';

      html += `
        <div class="person-card">
          <div class="person-card-header">
            <div class="person-avatar-lg">${avatarContent}</div>
            <div>
              <div class="person-name-lg">${person.name}</div>
              <div class="person-stats">${doneCnt}/${todayTasks.length} dnes hotovo</div>
            </div>
            <div class="person-points-badge" style="cursor:pointer;${ptsColor}" data-spend-person="${person.id}" title="Klikni pre využitie bodov">
              ⭐ ${pts} b
            </div>
          </div>
          <div class="person-tasks">
      `;

      const show = this._state.settings.showChecked;
      const filtered = todayTasks.filter(t => show || getOccState(t, todayStr) !== 'done');
      if (filtered.length === 0) {
        html += `<div class="empty" style="padding:16px 12px">Žiadne úlohy dnes</div>`;
      } else {
        for (const task of filtered) {
          const st = getOccState(task, todayStr);
          const badges = { todo: '○', done: '●' };
          html += `
            <div class="person-task-row">
              <span style="font-size:16px;color:${st==='todo'?'#EF9F27':'#639922'}">${badges[st]||'○'}</span>
              <span class="person-task-name">${task.name}</span>
              <span class="person-task-date">${task.repeat&&task.repeat!=='none'?'↻':fmtDate(task.date)}</span>
              ${task.points?`<span class="task-points-tag">⭐${task.points}</span>`:''}
            </div>
          `;
        }
      }

      // Log transakcií
      const log = (this._state.pointsLog || {})[person.id] || [];
      html += `</div>`;
      if (log.length > 0) {
        html += `<div style="padding:0 0 6px">
          <div style="font-size:11px;font-weight:600;color:var(--u-muted);text-transform:uppercase;letter-spacing:0.05em;padding:8px 12px 4px">História bodov</div>
          <table class="log-table">
            <thead><tr>
              <th>Čas</th><th>Popis</th><th>Zmena</th><th>Zostatok</th>
            </tr></thead>
            <tbody>`;
        for (const e of log.slice(0, 20)) {
          const cls = e.delta >= 0 ? 'log-pos' : 'log-neg';
          const sign = e.delta >= 0 ? '+' : '';
          html += `<tr>
            <td style="white-space:nowrap;color:var(--u-muted)">${fmtDateTime(e.ts)}</td>
            <td>${e.desc}</td>
            <td class="${cls}">${sign}${e.delta}</td>
            <td class="log-bal">${e.bal}</td>
          </tr>`;
        }
        if (log.length > 20) {
          html += `<tr><td colspan="4" style="color:var(--u-muted);text-align:center;padding:6px">... a ${log.length-20} ďalších</td></tr>`;
        }
        html += `</tbody></table></div>`;
      }

      html += `</div>`;  // person-card
    }
    html += `</div>`;
    sec.innerHTML = html;

    // Klik na badge → spend points popup
    sec.querySelectorAll('[data-spend-person]').forEach(badge => {
      badge.addEventListener('click', () => {
        const pid = badge.dataset.spendPerson;
        const person = this._state.persons.find(p => p.id === pid);
        if (person) this._openSpendModal(person);
      });
    });
  }

  _openSpendModal(person) {
    // Odstráni predchádzajúci spend modal ak existuje
    document.body.querySelector('#ulohy-spend-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ulohy-spend-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;font-family:system-ui,sans-serif;';

    const pts = person.points || 0;
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:min(320px,90vw);box-shadow:0 8px 32px rgba(0,0,0,0.22);">
        <div style="font-size:15px;font-weight:600;margin-bottom:4px;color:#212121;">Ahoj, ${person.name}!</div>
        <div style="font-size:12px;color:#757575;margin-bottom:16px;">Máš <strong>${pts} bodov</strong>. Koľko bodov chceš využiť?</div>
        <input id="spend-amt" type="number" min="1" step="1" placeholder="Počet bodov"
          style="width:100%;padding:10px 12px;font-size:20px;font-weight:700;text-align:center;border:2px solid #1976d2;border-radius:8px;outline:none;color:#212121;box-sizing:border-box;margin-bottom:16px;">
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="spend-cancel" style="padding:8px 16px;border:1px solid #ccc;border-radius:8px;background:none;cursor:pointer;font-size:13px;font-family:inherit;">Zrušiť</button>
          <button id="spend-ok" style="padding:8px 16px;border:none;border-radius:8px;background:#1976d2;color:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">Využiť</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#spend-amt');
    inp.focus();

    overlay.querySelector('#spend-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#spend-ok').addEventListener('click', () => {
      const amount = parseFloat(inp.value);
      if (!amount || amount <= 0) { inp.style.borderColor='#E24B4A'; return; }
      this._spendPoints(person, amount);
      this._saveData();
      overlay.remove();
      this._renderSection(1);  // refresh osoby
    });

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') overlay.querySelector('#spend-ok').click();
      if (e.key === 'Escape') overlay.remove();
    });
  }

  // ── Sekcia: Admin ─────────────────────────────────────────────────────────

  _renderAdmin(sec) {
    if (!this._adminUnlocked) { this._renderPin(sec); return; }
    this._renderAdminContent(sec);
  }

  _renderPin(sec) {
    this._pinMode = this._state.adminPin ? 'unlock' : 'setup1';
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
            `<button class="pin-key${k==='⌫'?' del':''}" data-key="${k}">${k}</button>`
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
    if (k === '⌫') { this._pinInput = this._pinInput.slice(0, -1); this._updateDots(sec); return; }
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
        this._adminUnlocked = true; this._pinInput = '';
        this._renderAdminContent(sec);
      } else {
        if (errEl) errEl.textContent = 'Nesprávny PIN';
        this._pinInput = ''; this._updateDots(sec);
      }
    } else if (this._pinMode === 'setup1') {
      this._pinSetupFirst = this._pinInput; this._pinInput = '';
      this._pinMode = 'setup2';
      if (subEl) subEl.textContent = 'Zopakujte PIN';
      if (errEl) errEl.textContent = '';
      this._updateDots(sec);
    } else if (this._pinMode === 'setup2') {
      if (this._pinInput === this._pinSetupFirst) {
        this._state.adminPin = this._pinInput; this._adminUnlocked = true;
        this._pinInput = ''; this._saveData(); this._renderAdminContent(sec);
      } else {
        if (errEl) errEl.textContent = 'PINy sa nezhodujú';
        this._pinInput = ''; this._pinSetupFirst = ''; this._pinMode = 'setup1';
        if (subEl) subEl.textContent = 'Nastavte 4-ciferný PIN';
        this._updateDots(sec);
      }
    }
  }

  _renderAdminContent(sec) {
    let html = `<div class="admin-section">`;
    html += `<div class="task-group-label">Osoby a body</div>`;
    for (const person of this._state.persons) {
      const pts = person.points || 0;
      html += `
        <div class="person-chip" data-admin-person="${person.id}">
          <div class="task-avatar">${person.avatar ? `<img src="${person.avatar}">` : person.name[0]}</div>
          <span class="person-chip-name">${person.name}</span>
          <span class="person-chip-points">⭐ ${pts} b</span>
          <div class="points-adjust">
            <button class="pts-btn" data-pts-minus="${person.id}">−</button>
            <input class="pts-input" type="number" min="1" value="1" id="pts-val-${person.id}">
            <button class="pts-btn" data-pts-plus="${person.id}">+</button>
          </div>
          <button class="edit-icon" data-edit-person="${person.id}" title="Upraviť">✎</button>
          <button class="del-icon" data-del-person="${person.id}" title="Zmazať">✕</button>
        </div>
      `;
    }
    html += `<button class="add-btn" id="add-person-btn">＋ Pridať osobu</button>`;

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
      this._state.adminPin = null; this._adminUnlocked = false; this._renderAdmin(sec);
    });
    sec.querySelector('#lock-btn').addEventListener('click', () => {
      this._adminUnlocked = false; this._renderAdmin(sec);
    });

    // Body adjust
    sec.querySelectorAll('[data-pts-plus]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.ptsPlus;
        const inp = sec.querySelector(`#pts-val-${pid}`);
        const val = Math.abs(parseFloat(inp?.value) || 1);
        const p = this._state.persons.find(x => x.id === pid);
        if (p) this._adminAdjustPoints(p, +val, `Admin: +${val} b`);
        this._saveData(); this._renderAdminContent(sec);
      });
    });
    sec.querySelectorAll('[data-pts-minus]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.ptsMinus;
        const inp = sec.querySelector(`#pts-val-${pid}`);
        const val = Math.abs(parseFloat(inp?.value) || 1);
        const p = this._state.persons.find(x => x.id === pid);
        if (p) this._adminAdjustPoints(p, -val, `Admin: −${val} b`);
        this._saveData(); this._renderAdminContent(sec);
      });
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
        this._saveData(); this._renderSection(3);
      });
    });
  }

  // ── Modály ───────────────────────────────────────────────────────────────

  _openTaskModal(task, defaultDate) {
    const overlay = document.body.querySelector('#ulohy-modal-overlay') || this._createBodyModal();
    const modal = overlay.querySelector('#ulohy-modal');
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
        <label class="form-label">Bodová hodnota úlohy</label>
        <div class="points-row">
          <input class="form-input" type="number" min="0" step="1" id="t-points" value="${task?.points || 0}">
          <span style="font-size:12px;color:var(--u-muted)">bodov (0 = bez bodov)</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Osoba</label>
        <select class="form-select" id="t-person">
          ${persons.map(p => `<option value="${p.id}" ${p.id===selPersonId?'selected':''}>${p.name}</option>`).join('')}
          ${persons.length===0?'<option value="">— žiadna osoba —</option>':''}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Dátum začiatku</label>
        <input class="form-input" type="date" id="t-date" value="${selDate}">
      </div>
      <div class="form-group">
        <label class="form-label">Opakovanie</label>
        <select class="form-select" id="t-repeat">
          ${repeatOpts.map((v,i)=>`<option value="${v}" ${v===selRepeat?'selected':''}>${repeatLabels[i]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="weekdays-wrap" style="${selRepeat==='weekly'?'':'display:none'}">
        <label class="form-label">Dni v týždni</label>
        <div class="weekday-grid">
          ${dayNames.map((n,i)=>`<button type="button" class="weekday-btn${this._weekdaysSel.includes(i)?' sel':''}" data-dow="${i}">${n}</button>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        ${isEdit?`<button class="btn-danger" id="t-del">Zmazať</button>`:''}
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
        if (this._weekdaysSel.includes(dow)) { this._weekdaysSel = this._weekdaysSel.filter(d=>d!==dow); btn.classList.remove('sel'); }
        else { this._weekdaysSel.push(dow); btn.classList.add('sel'); }
      });
    });
    modal.querySelector('#t-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelector('#t-save').addEventListener('click', () => {
      const name = modal.querySelector('#t-name').value.trim();
      if (!name) return;
      const points = parseInt(modal.querySelector('#t-points').value) || 0;
      const data = {
        id: task?.id || uid(), name,
        note: modal.querySelector('#t-note').value.trim(),
        points,
        personId: modal.querySelector('#t-person').value,
        date: modal.querySelector('#t-date').value,
        repeat: modal.querySelector('#t-repeat').value,
        repeatDays: this._weekdaysSel.slice().sort(),
        occurrences: task?.occurrences || {},
        doneBy: task?.doneBy || {}
      };
      if (isEdit) {
        const idx = this._state.tasks.findIndex(t => t.id === data.id);
        if (idx >= 0) this._state.tasks[idx] = data;
      } else {
        this._state.tasks.push(data);
      }
      this._saveData(); this._closeModal(); this._renderSection(this._activeTab);
    });
    if (isEdit) {
      modal.querySelector('#t-del').addEventListener('click', () => {
        if (!confirm('Naozaj zmazať úlohu?')) return;
        this._state.tasks = this._state.tasks.filter(t => t.id !== task.id);
        this._saveData(); this._closeModal(); this._renderSection(this._activeTab);
      });
    }
    overlay.classList.add('open');
  }

  _openPermanentModal(pt) {
    const overlay = document.body.querySelector('#ulohy-modal-overlay') || this._createBodyModal();
    const modal = overlay.querySelector('#ulohy-modal');
    const isEdit = !!pt;

    modal.innerHTML = `
      <div class="modal-title">${isEdit ? 'Upraviť stálu úlohu' : 'Nová stála úloha'}</div>
      <div class="form-group">
        <label class="form-label">Názov</label>
        <input class="form-input" id="pt-name" value="${pt?.name || ''}" placeholder="Napr. Umyť auto">
      </div>
      <div class="form-group">
        <label class="form-label">Poznámka</label>
        <textarea class="form-textarea" id="pt-note">${pt?.note || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Bodová hodnota</label>
        <div class="points-row">
          <input class="form-input" type="number" min="0" step="1" id="pt-points" value="${pt?.points || 0}">
          <span style="font-size:12px;color:var(--u-muted)">bodov</span>
        </div>
      </div>
      <div class="modal-footer">
        ${isEdit?`<button class="btn-danger" id="pt-del">Zmazať</button>`:''}
        <button class="btn-cancel" id="pt-cancel">Zrušiť</button>
        <button class="btn-save" id="pt-save">Uložiť</button>
      </div>
    `;

    modal.querySelector('#pt-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelector('#pt-save').addEventListener('click', () => {
      const name = modal.querySelector('#pt-name').value.trim();
      if (!name) return;
      const points = parseInt(modal.querySelector('#pt-points').value) || 0;
      const data = { id: pt?.id || uid(), name, note: modal.querySelector('#pt-note').value.trim(), points, done: pt?.done || false, doneBy: pt?.doneBy || [] };
      if (isEdit) {
        const idx = this._state.permanentTasks.findIndex(x => x.id === data.id);
        if (idx >= 0) this._state.permanentTasks[idx] = data;
      } else {
        this._state.permanentTasks.push(data);
      }
      this._saveData(); this._closeModal(); this._renderSection(this._activeTab);
    });
    if (isEdit) {
      modal.querySelector('#pt-del').addEventListener('click', () => {
        if (!confirm('Zmazať stálu úlohu?')) return;
        this._state.permanentTasks = this._state.permanentTasks.filter(x => x.id !== pt.id);
        this._saveData(); this._closeModal(); this._renderSection(this._activeTab);
      });
    }
    overlay.classList.add('open');
  }

  _openPersonModal(person) {
    const overlay = document.body.querySelector('#ulohy-modal-overlay') || this._createBodyModal();
    const modal = overlay.querySelector('#ulohy-modal');
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
        ${isEdit?`<button class="btn-danger" id="p-del">Zmazať</button>`:''}
        <button class="btn-cancel" id="p-cancel">Zrušiť</button>
        <button class="btn-save" id="p-save">Uložiť</button>
      </div>
    `;

    modal.querySelector('#p-cancel').addEventListener('click', () => this._closeModal());
    modal.querySelector('#p-save').addEventListener('click', () => {
      const name = modal.querySelector('#p-name').value.trim();
      if (!name) return;
      const data = { id: person?.id || uid(), name, avatar: modal.querySelector('#p-avatar').value.trim(), points: person?.points || 0 };
      if (isEdit) {
        const idx = this._state.persons.findIndex(p => p.id === data.id);
        if (idx >= 0) this._state.persons[idx] = data;
      } else {
        this._state.persons.push(data);
      }
      this._saveData(); this._closeModal(); this._renderSection(this._activeTab);
    });
    if (isEdit) {
      modal.querySelector('#p-del').addEventListener('click', () => {
        if (!confirm('Zmazať osobu a všetky jej úlohy?')) return;
        const pid = person.id;
        this._state.persons = this._state.persons.filter(p => p.id !== pid);
        this._state.tasks = this._state.tasks.filter(t => t.personId !== pid);
        this._saveData(); this._closeModal(); this._renderSection(this._activeTab);
      });
    }
    overlay.classList.add('open');
  }

  _createBodyModal() {
    const overlay = document.createElement('div');
    overlay.id = 'ulohy-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;pointer-events:none;transition:opacity 0.2s;';
    overlay.innerHTML = `<div id="ulohy-modal" style="background:#fff;border-radius:12px;padding:20px;width:min(440px,92vw);max-height:88vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.18);transform:translateY(12px);transition:transform 0.2s;font-family:system-ui,sans-serif;color:#212121;"></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeModal(); });

    // Potrebujeme CSS premenné – vložíme mini style
    const st = document.createElement('style');
    st.textContent = `
      #ulohy-modal { --u-border:rgba(0,0,0,0.12); --u-surface:#f5f5f5; --u-bg:#fff; --u-text:#212121; --u-muted:#757575; --u-accent:#1976d2; --u-radius-sm:8px; --u-done-bg:#EAF3DE; --u-done-text:#27500A; --u-overdue-bg:#FCEBEB; --u-overdue-text:#791F1F; --u-points-bg:#E8F0FE; --u-points-text:#1565C0; }
      #ulohy-modal-overlay.open { opacity:1!important; pointer-events:all!important; }
      #ulohy-modal-overlay.open #ulohy-modal { transform:translateY(0)!important; }
      #ulohy-modal .modal-title { font-size:15px;font-weight:600;margin-bottom:16px; }
      #ulohy-modal .form-group { margin-bottom:12px; }
      #ulohy-modal .form-label { display:block;font-size:12px;font-weight:500;color:var(--u-muted);margin-bottom:5px; }
      #ulohy-modal .form-input,#ulohy-modal .form-select,#ulohy-modal .form-textarea { width:100%;padding:8px 10px;border:1px solid var(--u-border);border-radius:var(--u-radius-sm);background:var(--u-bg);color:var(--u-text);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box; }
      #ulohy-modal .form-textarea { min-height:60px;resize:vertical; }
      #ulohy-modal .points-row { display:flex;align-items:center;gap:8px; }
      #ulohy-modal .points-row .form-input { width:80px;text-align:center; }
      #ulohy-modal .weekday-grid { display:flex;gap:6px;flex-wrap:wrap; }
      #ulohy-modal .weekday-btn { width:36px;height:36px;border:1px solid var(--u-border);border-radius:50%;background:none;cursor:pointer;font-size:12px;font-weight:500;color:var(--u-muted);font-family:inherit; }
      #ulohy-modal .weekday-btn.sel { background:var(--u-accent);color:#fff;border-color:var(--u-accent); }
      #ulohy-modal .modal-footer { display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--u-border); }
      #ulohy-modal .btn-cancel { padding:8px 16px;border:1px solid var(--u-border);border-radius:var(--u-radius-sm);background:none;cursor:pointer;font-size:13px;color:var(--u-muted);font-family:inherit; }
      #ulohy-modal .btn-save { padding:8px 16px;border:none;border-radius:var(--u-radius-sm);background:var(--u-accent);color:#fff;cursor:pointer;font-size:13px;font-weight:500;font-family:inherit; }
      #ulohy-modal .btn-danger { padding:8px 16px;border:none;border-radius:var(--u-radius-sm);background:var(--u-overdue-bg);color:var(--u-overdue-text);cursor:pointer;font-size:13px;font-family:inherit;margin-right:auto; }
    `;
    document.head.appendChild(st);
    document.body.appendChild(overlay);
    return overlay;
  }

  _closeModal() {
    const overlay = document.body.querySelector('#ulohy-modal-overlay');
    if (overlay) overlay.classList.remove('open');
    // Aj shadow DOM overlay (ak existuje)
    const sOverlay = this.shadowRoot.querySelector('#modal-overlay');
    if (sOverlay) sOverlay.classList.remove('open');
    this._weekdaysSel = [];
  }
}

customElements.define('ulohy-card', UlohyCard);
