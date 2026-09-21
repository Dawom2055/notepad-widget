const widget = document.getElementById('widget');
const tab = document.getElementById('tab');
const tabLabel = document.getElementById('tabLabel');
const closeBtn = document.getElementById('closeBtn');
const noteArea = document.getElementById('noteArea');
const status = document.getElementById('status');
const copyNoteBtn = document.getElementById('copyNoteBtn');
const transcribeNoteBtn = document.getElementById('transcribeNoteBtn');

const todayNewNoteBtn = document.getElementById('todayNewNoteBtn');
const sidebar = document.getElementById('sidebar');
const navItems = Array.from(sidebar.querySelectorAll('.nav-item'));
const views = Array.from(document.querySelectorAll('.view'));
const sidebarAvatar = document.getElementById('sidebarAvatar');
const sidebarUserName = document.getElementById('sidebarUserName');

const todayDate = document.getElementById('todayDate');
const greeting = document.getElementById('greeting');
const outstandingDot = document.getElementById('outstandingDot');
const outstandingList = document.getElementById('outstandingList');
const outstandingEmpty = document.getElementById('outstandingEmpty');
const notesCreatedList = document.getElementById('notesCreatedList');
const notesCreatedEmpty = document.getElementById('notesCreatedEmpty');
const notesCreatedSeeAllBtn = document.getElementById('notesCreatedSeeAllBtn');

const todoList = document.getElementById('todoList');
const todoEmpty = document.getElementById('todoEmpty');
const todoAddForm = document.getElementById('todoAddForm');
const todoInput = document.getElementById('todoInput');
const todoDueDateInput = document.getElementById('todoDueDate');
const todoDueTimeInput = document.getElementById('todoDueTime');

const todoViewToggleBtns = Array.from(document.querySelectorAll('.view-toggle-btn'));
const todoListView = document.getElementById('todoListView');
const todoCalendarView = document.getElementById('todoCalendarView');
const calendarPrevBtn = document.getElementById('calendarPrevBtn');
const calendarNextBtn = document.getElementById('calendarNextBtn');
const calendarTodayBtn = document.getElementById('calendarTodayBtn');
const granularityBtns = Array.from(document.querySelectorAll('.granularity-btn'));
const calendarLabel = document.getElementById('calendarLabel');
const calendarBody = document.getElementById('calendarBody');

const todoMainView = document.getElementById('todoMainView');
const viewCompletedBtn = document.getElementById('viewCompletedBtn');
const completedTasksView = document.getElementById('completedTasksView');
const completedBackBtn = document.getElementById('completedBackBtn');
const completedList = document.getElementById('completedList');
const completedEmpty = document.getElementById('completedEmpty');

const projectBreadcrumbs = document.getElementById('projectBreadcrumbs');
const projectBrowser = document.getElementById('projectBrowser');
const projectList = document.getElementById('projectList');
const projectEmpty = document.getElementById('projectEmpty');
const addFolderBtn = document.getElementById('addFolderBtn');
const addNoteBtn = document.getElementById('addNoteBtn');
const projectNoteEditor = document.getElementById('projectNoteEditor');
const noteBackBtn = document.getElementById('noteBackBtn');
const noteEditorTitle = document.getElementById('noteEditorTitle');
const projectNoteArea = document.getElementById('projectNoteArea');
const copyProjectNoteBtn = document.getElementById('copyProjectNoteBtn');
const transcribeProjectNoteBtn = document.getElementById('transcribeProjectNoteBtn');

const saveToFolderBtn = document.getElementById('saveToFolderBtn');
const saveToFolderModal = document.getElementById('saveToFolderModal');
const saveModalCloseBtn = document.getElementById('saveModalCloseBtn');
const saveModalBreadcrumbs = document.getElementById('saveModalBreadcrumbs');
const saveModalFolderList = document.getElementById('saveModalFolderList');
const saveModalEmpty = document.getElementById('saveModalEmpty');
const saveModalNewFolderInput = document.getElementById('saveModalNewFolderInput');
const saveModalNewFolderBtn = document.getElementById('saveModalNewFolderBtn');
const saveModalNoteName = document.getElementById('saveModalNoteName');
const saveModalConfirmBtn = document.getElementById('saveModalConfirmBtn');

let saveIndicatorTimer = null;
let isCollapsed = true;
let todos = [];
let projects = []; // tree: [{ id, name, type: 'folder', children: [...] } | { id, name, type: 'note', content }]
let projectPath = []; // folder ids from root down to the folder currently being browsed
let openNoteId = null; // id of the note currently open for editing, within projectPath
let editingNodeId = null; // id of the folder/note whose row is mid-rename in the Projects list
let saveModalPath = []; // folder ids for wherever the "Save to Folder" picker is currently browsing

const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8.5L6.2 11.5L13 4.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---- Sidebar navigation -------------------------------------------------
function showView(name) {
  // Leaving a view mid-transcription would otherwise keep the microphone
  // listening silently with no visible way to stop it.
  if (name !== 'notes') quickNoteTranscribe.stopIfListening();
  if (name !== 'projects') projectNoteTranscribe.stopIfListening();
  // Refresh in case the widget has been open across midnight, or a note
  // was created while some other tab was active.
  if (name === 'today') renderNotesCreated();
  // Today and To-Do both render checklist items (and share editingTodoId),
  // so only close a stray open edit form when leaving to a view that shows
  // neither.
  if (name !== 'today' && name !== 'todos' && editingTodoId !== null) {
    editingTodoId = null;
    renderTodos();
  }
  navItems.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  views.forEach((section) => section.classList.toggle('hidden', section.dataset.view !== name));
}

navItems.forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ---- Today header --------------------------------------------------------
let currentUsername = '';

function renderDateAndGreeting(username) {
  const now = new Date();
  todayDate.textContent = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const hour = now.getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  greeting.textContent = username ? `${timeGreeting}, ${username}` : timeGreeting;

  // Same username, just echoed into the sidebar footer and the collapsed
  // tab's label too -- purely cosmetic, no new data or behavior.
  if (tabLabel) tabLabel.textContent = username ? `${username}'s Notebook` : 'NOTES';
  if (sidebarUserName) sidebarUserName.textContent = username || 'Notes';
  if (sidebarAvatar) sidebarAvatar.textContent = username ? username.charAt(0).toUpperCase() : 'N';
}

// "Notes Created Today" (and the date/greeting above it) are computed at
// render time from "now", so they naturally go stale/empty for a new day --
// but only once something re-renders them. If the widget is just left open
// sitting on the Today tab overnight, nothing would trigger that on its
// own, so schedule one explicitly for the next local midnight and have it
// reschedule itself for the day after that.
function msUntilNextMidnight() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  return nextMidnight.getTime() - now.getTime();
}

function scheduleMidnightRefresh() {
  setTimeout(() => {
    renderDateAndGreeting(currentUsername);
    notesCreatedExpanded = false; // fresh day, back to the collapsed 3-item preview
    renderNotesCreated();
    scheduleMidnightRefresh();
  }, msUntilNextMidnight());
}

// ---- Checklist rendering --------------------------------------------------
function formatDueBadge(date) {
  const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

// Drag-to-reorder state, shared across every draggable checklist row.
let draggedTodoId = null;

// Which task (if any) currently has its inline edit form open. Only one at
// a time, shared across every list that renders checklist items (To-Do
// List, Today's Outstanding Items, Completed Tasks, Calendar Day view).
let editingTodoId = null;

// Splits an ISO due-date back into the separate date/time input values
// needed to pre-fill the edit form -- the inverse of combineDateTimeToISO.
function dueAtToInputs(dueAt) {
  if (!dueAt) return { date: '', time: '' };
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// After a drag finishes, the DOM's current child order (updated live during
// dragover, below) is the source of truth -- read it back into `todos` and
// persist. Reflects on both the To-Do List and Today's Outstanding Items,
// since the latter is just a filtered view over the same `todos` array.
function commitTodoOrderFromDom() {
  const orderedIds = [...todoList.querySelectorAll('.checklist-item')].map((el) => el.dataset.id);
  if (orderedIds.length === 0) return;
  // The list only shows active tasks, so re-slot just those into the array
  // positions they already occupy; completed tasks stay exactly where they are.
  const active = todos.filter((t) => !t.done);
  active.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
  let next = 0;
  todos = todos.map((t) => (t.done ? t : active[next++]));
  persistTodos();
  renderTodos();
}

function editTodo(id, text, dueAt) {
  const trimmed = text.trim();
  if (!trimmed) return; // don't save an empty title -- just leave edit mode open
  todos = todos.map((t) => (t.id === id ? { ...t, text: trimmed, dueAt: dueAt || null, dueBy: null } : t));
  editingTodoId = null;
  persistTodos();
  renderTodos();
}

function makeChecklistItem(item, { onToggle, onRemove, removeLabel = 'Delete', draggable = false }) {
  const li = document.createElement('li');
  li.className = 'checklist-item' + (item.done ? ' done' : '');
  li.dataset.id = item.id;

  if (editingTodoId === item.id) {
    li.classList.add('editing');

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'todo-edit-text';
    textInput.value = item.text;

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    const prefill = dueAtToInputs(item.dueAt);
    dateInput.value = prefill.date;
    timeInput.value = prefill.time;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'todo-edit-save';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'todo-edit-cancel';
    cancelBtn.textContent = '✕';
    cancelBtn.title = 'Cancel';

    const commit = () => editTodo(item.id, textInput.value, combineDateTimeToISO(dateInput.value, timeInput.value));
    const cancel = () => {
      editingTodoId = null;
      renderTodos();
    };

    saveBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', cancel);
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
    [dateInput, timeInput].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
    });

    const row2 = document.createElement('div');
    row2.className = 'todo-edit-row2';
    row2.appendChild(dateInput);
    row2.appendChild(timeInput);
    row2.appendChild(saveBtn);
    row2.appendChild(cancelBtn);

    const form = document.createElement('div');
    form.className = 'todo-edit-form';
    form.appendChild(textInput);
    form.appendChild(row2);
    li.appendChild(form);

    requestAnimationFrame(() => {
      textInput.focus();
      textInput.select();
    });

    return li;
  }

  if (draggable) {
    li.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';
    li.appendChild(handle);

    li.addEventListener('dragstart', (e) => {
      draggedTodoId = item.id;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      draggedTodoId = null;
      commitTodoOrderFromDom();
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedTodoId || draggedTodoId === item.id) return;
      const draggingEl = todoList.querySelector(`[data-id="${draggedTodoId}"]`);
      if (!draggingEl) return;
      const rect = li.getBoundingClientRect();
      const before = e.clientY - rect.top < rect.height / 2;
      todoList.insertBefore(draggingEl, before ? li : li.nextSibling);
    });
  }

  const box = document.createElement('span');
  box.className = 'box';
  box.innerHTML = CHECK_SVG;
  box.addEventListener('click', () => onToggle(item.id));

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = item.text;
  label.addEventListener('click', () => onToggle(item.id));

  const edit = document.createElement('button');
  edit.className = 'edit';
  edit.textContent = '✏️';
  edit.title = 'Edit';
  edit.addEventListener('click', (e) => {
    e.stopPropagation();
    editingTodoId = item.id;
    renderTodos();
  });

  const remove = document.createElement('button');
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.title = removeLabel;
  remove.addEventListener('click', (e) => {
    e.stopPropagation();
    onRemove(item.id);
  });

  li.appendChild(box);
  li.appendChild(label);
  if (item.dueAt) {
    const due = new Date(item.dueAt);
    const badge = document.createElement('span');
    badge.className = 'due-badge ' + (due.getTime() < Date.now() ? 'due-passed' : 'due-upcoming');
    badge.textContent = formatDueBadge(due);
    li.appendChild(badge);
  } else if (item.dueBy) {
    // Legacy tasks created before the calendar picker replaced the preset
    // dropdown -- no real timestamp to compare against, so keep the old
    // neutral (non-green/red) styling instead of guessing.
    const badge = document.createElement('span');
    badge.className = 'due-badge';
    badge.textContent = item.dueBy;
    li.appendChild(badge);
  }
  li.appendChild(edit);
  li.appendChild(remove);
  return li;
}

function toggleTodo(id) {
  todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  persistTodos();
  renderTodos();
}

function removeTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  persistTodos();
  renderTodos();
}

// The ✕ on an *active* task doesn't delete it -- it archives it into
// Completed Tasks (same as checking it off), so nothing is lost and it can
// still be restored from there. A true, permanent delete only happens via
// the ✕ inside the Completed Tasks view itself (still wired to removeTodo).
function completeTodo(id) {
  todos = todos.map((t) => (t.id === id ? { ...t, done: true } : t));
  persistTodos();
  renderTodos();
}

function persistTodos() {
  window.notepad.saveTodos(todos);
}

function renderTodos() {
  // Outstanding items (Today view) = not-done tasks
  const outstanding = todos.filter((t) => !t.done);
  outstandingList.innerHTML = '';
  outstanding.forEach((item) => {
    outstandingList.appendChild(
      makeChecklistItem(item, { onToggle: toggleTodo, onRemove: completeTodo, removeLabel: 'Mark complete' })
    );
  });
  outstandingEmpty.classList.toggle('hidden', outstanding.length > 0);
  outstandingDot.classList.toggle('hidden', outstanding.length === 0);

  // Full list (To-Do List view) -- draggable to reorder; the Outstanding
  // Items list above just reflects whatever order this one ends up in.
  // Completed tasks leave this list and live under "View Completed Tasks".
  todoList.innerHTML = '';
  outstanding.forEach((item) => {
    todoList.appendChild(
      makeChecklistItem(item, {
        onToggle: toggleTodo,
        onRemove: completeTodo,
        removeLabel: 'Mark complete',
        draggable: true,
      })
    );
  });
  todoEmpty.classList.toggle('hidden', outstanding.length > 0);

  // Keep the Calendar view in sync too, if it's the one currently showing.
  if (todoViewMode === 'calendar') renderCalendar();
  if (showingCompletedTasks) renderCompletedTasks();
}

// ---- Completed Tasks view ---------------------------------------------------
// Every task marked done anywhere -- the To-Do List, the Calendar (any
// granularity), or Today's Outstanding Items -- lives in the same `todos`
// array, so filtering it here always reflects completions made from any of
// those places without needing separate tracking.
let showingCompletedTasks = false;

function renderCompletedTasks() {
  const completed = todos.filter((t) => t.done);
  completedList.innerHTML = '';
  completed.forEach((item) => {
    // Unlike everywhere else, ✕ here really does delete -- this is the one
    // place a permanent removal makes sense, since active views now archive
    // instead of deleting.
    completedList.appendChild(
      makeChecklistItem(item, { onToggle: toggleTodo, onRemove: removeTodo, removeLabel: 'Delete permanently' })
    );
  });
  completedEmpty.classList.toggle('hidden', completed.length > 0);
}

function showCompletedTasksView() {
  showingCompletedTasks = true;
  todoMainView.classList.add('hidden');
  completedTasksView.classList.remove('hidden');
  renderCompletedTasks();
}

function hideCompletedTasksView() {
  showingCompletedTasks = false;
  completedTasksView.classList.add('hidden');
  todoMainView.classList.remove('hidden');
}

viewCompletedBtn.addEventListener('click', showCompletedTasksView);
completedBackBtn.addEventListener('click', hideCompletedTasksView);

// Dragging into empty space below the last row (not over any row itself)
// still needs to move the dragged item to the end of the list.
todoList.addEventListener('dragover', (e) => {
  if (!draggedTodoId || e.target !== todoList) return;
  e.preventDefault();
  const draggingEl = todoList.querySelector(`[data-id="${draggedTodoId}"]`);
  if (draggingEl) todoList.appendChild(draggingEl);
});

// ---- To-Do: List / Calendar view toggle ------------------------------------
let todoViewMode = 'list';

function setTodoViewMode(mode) {
  todoViewMode = mode;
  todoViewToggleBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.todoView === mode));
  todoListView.classList.toggle('hidden', mode !== 'list');
  todoCalendarView.classList.toggle('hidden', mode !== 'calendar');
  if (mode === 'calendar') renderCalendar();
}

todoViewToggleBtns.forEach((btn) => {
  btn.addEventListener('click', () => setTodoViewMode(btn.dataset.todoView));
});

// ---- Calendar view: Month / Week / Day -------------------------------------
let calendarGranularity = 'month';
let calendarAnchorDate = startOfDay(new Date());

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay()); // back up to Sunday
  return d;
}

// Every task with a due date, grouped by calendar day (as a toDateString()
// key) and sorted by time within each day -- shared by all three granularities.
function groupTodosByDueDate() {
  const map = new Map();
  todos.forEach((item) => {
    if (!item.dueAt) return;
    const key = new Date(item.dueAt).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  map.forEach((list) => list.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)));
  return map;
}

function dueClass(item) {
  if (item.done) return 'done';
  return new Date(item.dueAt).getTime() < Date.now() ? 'due-passed' : 'due-upcoming';
}

function setCalendarGranularity(granularity) {
  calendarGranularity = granularity;
  granularityBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.granularity === granularity));
  renderCalendar();
}

granularityBtns.forEach((btn) => {
  btn.addEventListener('click', () => setCalendarGranularity(btn.dataset.granularity));
});

calendarPrevBtn.addEventListener('click', () => {
  shiftCalendarAnchor(-1);
  renderCalendar();
});
calendarNextBtn.addEventListener('click', () => {
  shiftCalendarAnchor(1);
  renderCalendar();
});
calendarTodayBtn.addEventListener('click', () => {
  calendarAnchorDate = startOfDay(new Date());
  renderCalendar();
});

function shiftCalendarAnchor(direction) {
  const d = new Date(calendarAnchorDate);
  if (calendarGranularity === 'month') d.setMonth(d.getMonth() + direction);
  else if (calendarGranularity === 'week') d.setDate(d.getDate() + direction * 7);
  else d.setDate(d.getDate() + direction);
  calendarAnchorDate = startOfDay(d);
}

function renderCalendar() {
  const byDate = groupTodosByDueDate();
  calendarBody.innerHTML = '';
  if (calendarGranularity === 'month') renderCalendarMonth(byDate);
  else if (calendarGranularity === 'week') renderCalendarWeek(byDate);
  else renderCalendarDay(byDate);
}

function renderCalendarMonth(byDate) {
  const year = calendarAnchorDate.getFullYear();
  const month = calendarAnchorDate.getMonth();
  calendarLabel.textContent = calendarAnchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const grid = document.createElement('div');
  grid.className = 'calendar-month-grid';

  // A locale-aware weekday header row: use a known Sunday as a reference so
  // Intl gives short names in Sun..Sat order regardless of locale wording.
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  for (let i = 0; i < 7; i++) {
    const head = document.createElement('div');
    head.className = 'calendar-weekday-head';
    head.textContent = weekdayFormatter.format(new Date(2023, 0, 1 + i)); // Jan 1 2023 = Sunday
    grid.appendChild(head);
  }

  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const todayKey = new Date().toDateString();

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const dateKey = cellDate.toDateString();
    const dayTasks = byDate.get(dateKey) || [];

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar-day-cell';
    if (cellDate.getMonth() !== month) cell.classList.add('other-month');
    if (dateKey === todayKey) cell.classList.add('today');
    if (dayTasks.length > 0) cell.classList.add('has-tasks');

    const num = document.createElement('span');
    num.className = 'calendar-day-number';
    num.textContent = cellDate.getDate();
    cell.appendChild(num);

    if (dayTasks.length > 0) {
      const dots = document.createElement('div');
      dots.className = 'calendar-day-dots';
      dayTasks.slice(0, 4).forEach((task) => {
        const dot = document.createElement('span');
        dot.className = 'calendar-day-dot ' + dueClass(task);
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
      if (dayTasks.length > 4) {
        const more = document.createElement('span');
        more.className = 'calendar-day-more';
        more.textContent = `+${dayTasks.length - 4}`;
        cell.appendChild(more);
      }
    }

    cell.title = dayTasks.length
      ? `${dayTasks.length} task${dayTasks.length > 1 ? 's' : ''} due — click to view`
      : cellDate.toLocaleDateString();
    cell.addEventListener('click', () => {
      calendarAnchorDate = startOfDay(cellDate);
      setCalendarGranularity('day');
    });

    grid.appendChild(cell);
  }

  calendarBody.appendChild(grid);
}

function renderCalendarWeek(byDate) {
  const weekStart = startOfWeek(calendarAnchorDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const labelOpts = { month: 'short', day: 'numeric' };
  calendarLabel.textContent = sameMonth
    ? `${weekStart.toLocaleDateString(undefined, { month: 'long' })} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
    : `${weekStart.toLocaleDateString(undefined, labelOpts)} – ${weekEnd.toLocaleDateString(undefined, labelOpts)}, ${weekEnd.getFullYear()}`;

  const grid = document.createElement('div');
  grid.className = 'calendar-week-grid';
  const todayKey = new Date().toDateString();

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + i);
    const dateKey = dayDate.toDateString();
    const dayTasks = byDate.get(dateKey) || [];

    const col = document.createElement('div');
    col.className = 'calendar-week-day' + (dateKey === todayKey ? ' today' : '');

    const head = document.createElement('div');
    head.className = 'calendar-week-day-head';
    head.textContent = dayDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    head.style.cursor = 'pointer';
    head.addEventListener('click', () => {
      calendarAnchorDate = startOfDay(dayDate);
      setCalendarGranularity('day');
    });
    col.appendChild(head);

    dayTasks.forEach((task) => {
      const pill = document.createElement('span');
      pill.className = 'calendar-task-pill ' + dueClass(task);
      pill.textContent = task.text;
      pill.title = `${task.text} — ${formatDueBadge(new Date(task.dueAt))}`;
      pill.addEventListener('click', () => toggleTodo(task.id));
      col.appendChild(pill);
    });

    grid.appendChild(col);
  }

  calendarBody.appendChild(grid);
}

function renderCalendarDay(byDate) {
  calendarLabel.textContent = calendarAnchorDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const dayTasks = byDate.get(calendarAnchorDate.toDateString()) || [];
  const wrap = document.createElement('div');
  wrap.className = 'calendar-day-agenda';

  if (dayTasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'calendar-agenda-empty';
    empty.textContent = 'Nothing due this day.';
    wrap.appendChild(empty);
  } else {
    dayTasks.forEach((task) => {
      wrap.appendChild(
        makeChecklistItem(task, { onToggle: toggleTodo, onRemove: completeTodo, removeLabel: 'Mark complete' })
      );
    });
  }

  calendarBody.appendChild(wrap);
}

// ---- "Notes Created" (Today view) ------------------------------------------
// Walks the whole Projects tree (any depth) for notes made today, whether
// added directly in Projects or filed away from Quick Notes via "Save to
// Folder" -- both paths tag the note with the same createdAt field.
function collectNotesCreatedToday() {
  const todayKey = new Date().toDateString();
  const found = [];

  function walk(nodes, path) {
    nodes.forEach((node) => {
      if (node.type === 'note') {
        if (node.createdAt && new Date(node.createdAt).toDateString() === todayKey) {
          found.push({ note: node, path });
        }
      } else if (node.type === 'folder') {
        walk(node.children, [...path, node.id]);
      }
    });
  }

  walk(projects, []);
  // Newest first -- the most recently created notes are the most relevant
  // for a "what did I just make" glance, and are what stays visible once
  // the list is capped below.
  found.sort((a, b) => new Date(b.note.createdAt) - new Date(a.note.createdAt));
  return found;
}

function jumpToNote(path, noteId) {
  showView('projects');
  projectPath = [...path];
  openNote(noteId);
}

const NOTES_CREATED_PREVIEW_LIMIT = 3;
let notesCreatedExpanded = false;

function renderNotesCreated() {
  const entries = collectNotesCreatedToday();
  const visibleEntries = notesCreatedExpanded ? entries : entries.slice(0, NOTES_CREATED_PREVIEW_LIMIT);
  notesCreatedList.innerHTML = '';

  visibleEntries.forEach(({ note, path }) => {
    const li = document.createElement('li');
    li.className = 'notes-created-item';

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = '📝';

    const info = document.createElement('span');
    info.className = 'info';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = note.name;

    const pathLine = document.createElement('span');
    pathLine.className = 'path';
    pathLine.textContent = pathLabel(path);

    info.appendChild(name);
    info.appendChild(pathLine);

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date(note.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    li.appendChild(icon);
    li.appendChild(info);
    li.appendChild(time);
    li.addEventListener('click', () => jumpToNote(path, note.id));

    notesCreatedList.appendChild(li);
  });

  notesCreatedEmpty.classList.toggle('hidden', entries.length > 0);

  const hasMore = entries.length > NOTES_CREATED_PREVIEW_LIMIT;
  notesCreatedSeeAllBtn.classList.toggle('hidden', !hasMore);
  notesCreatedSeeAllBtn.textContent = notesCreatedExpanded ? 'Show less' : `See all (${entries.length})`;
}

notesCreatedSeeAllBtn.addEventListener('click', () => {
  notesCreatedExpanded = !notesCreatedExpanded;
  renderNotesCreated();
});

function addTodo(text, dueAt) {
  const trimmed = text.trim();
  if (!trimmed) return;
  todos.push({
    id: `t${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
    text: trimmed,
    done: false,
    dueAt: dueAt || null,
  });
  persistTodos();
  renderTodos();
}

// Combines a date-picker value with a time-picker value into one ISO
// timestamp. A date with no time defaults to end of day (23:59), matching
// "due by" semantics; no date at all means no due date was set. Shared by
// the add-task row and every task's inline edit form.
function combineDateTimeToISO(dateValue, timeValue) {
  if (!dateValue) return null; // "" or "YYYY-MM-DD"
  const combined = new Date(`${dateValue}T${timeValue || '23:59'}`); // timeValue: "" or "HH:MM"
  return Number.isNaN(combined.getTime()) ? null : combined.toISOString();
}

function readDueAtFromInputs() {
  return combineDateTimeToISO(todoDueDateInput.value, todoDueTimeInput.value);
}

todoAddForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addTodo(todoInput.value, readDueAtFromInputs());
  todoInput.value = '';
  todoDueDateInput.value = '';
  todoDueTimeInput.value = '';
  todoInput.focus();
});

// ---- Projects: an arbitrarily-deep tree of folders and notes ---------------
// `projects` is the array of root nodes. `projectPath` is the chain of folder
// ids from the root down to whichever folder is currently being browsed
// (empty = looking at the root Projects list). Folders and notes can be
// created inside any folder, recursively, with no depth limit.
function genId(prefix) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

function persistProjects() {
  window.notepad.saveProjects(projects);
}

// The children array of the folder at `path` (or the root list if path is empty).
function childrenAt(path) {
  let nodes = projects;
  for (const id of path) {
    const folder = nodes.find((n) => n.id === id && n.type === 'folder');
    if (!folder) return []; // path no longer exists (e.g. an ancestor got deleted)
    nodes = folder.children;
  }
  return nodes;
}

function nodeNameAt(path, id) {
  const node = childrenAt(path).find((n) => n.id === id);
  return node ? node.name : null;
}

// "+ New Note" skips naming entirely: it creates the note right away (named
// with a timestamp, same default "Save to Folder" uses) and jumps straight
// into the note editor so you can start typing immediately, same as every
// other note-taking flow in this app.
function createNoteAndOpen() {
  const note = {
    id: genId('n'),
    name: formatSavedAtLabel(new Date()),
    type: 'note',
    content: '',
    createdAt: new Date().toISOString(),
  };
  childrenAt(projectPath).push(note);
  persistProjects();
  renderNotesCreated();
  openNote(note.id);
}

// "+ New Folder" creates the folder immediately (named "New folder") and
// puts it straight into the same inline-rename mode the pencil icon uses --
// pre-selected text, ready to type over, saved on Enter or on click-away.
function createFolderInline() {
  const folder = {
    id: genId('f'),
    name: 'New folder',
    type: 'folder',
    children: [],
    createdAt: new Date().toISOString(),
  };
  childrenAt(projectPath).push(folder);
  persistProjects();
  editingNodeId = folder.id;
  renderProjects();
}

function removeProjectNode(id) {
  const siblings = childrenAt(projectPath);
  const idx = siblings.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const node = siblings[idx];
  if (node.type === 'folder' && node.children.length > 0) {
    const ok = window.confirm(`Delete "${node.name}" and everything inside it?`);
    if (!ok) return;
  }
  siblings.splice(idx, 1);
  persistProjects();
  renderProjects();
}

function commitRenameNode(id, newName) {
  editingNodeId = null;
  const trimmed = newName.trim();
  if (trimmed) {
    const node = childrenAt(projectPath).find((n) => n.id === id);
    if (node && node.name !== trimmed) {
      node.name = trimmed;
      persistProjects();
    }
  }
  renderProjects();
}

function enterFolder(id) {
  projectNoteTranscribe.stopIfListening();
  projectPath = [...projectPath, id];
  openNoteId = null;
  editingNodeId = null;
  renderProjects();
}

function goToBreadcrumb(index) {
  projectNoteTranscribe.stopIfListening();
  // index -1 = root Projects list; otherwise keep the path up through that crumb.
  projectPath = index < 0 ? [] : projectPath.slice(0, index + 1);
  openNoteId = null;
  editingNodeId = null;
  renderProjects();
}

function openNote(id) {
  openNoteId = id;
  editingNodeId = null;
  renderProjects();
}

function closeNoteEditor() {
  projectNoteTranscribe.stopIfListening();
  openNoteId = null;
  renderProjects();
}

function updateOpenNoteContent(text) {
  if (!openNoteId) return;
  const note = childrenAt(projectPath).find((n) => n.id === openNoteId);
  if (note) note.content = text;
  persistProjects();
}

// Title updates while typing: save on every keystroke (like the body does)
// but avoid a full renderProjects() re-render, which would steal focus from
// the input mid-edit. Instead, just patch the matching breadcrumb in place.
function updateOpenNoteTitleLive(text) {
  if (!openNoteId) return;
  const note = childrenAt(projectPath).find((n) => n.id === openNoteId);
  if (!note) return;
  note.name = text;
  persistProjects();
  const crumbs = projectBreadcrumbs.querySelectorAll('.crumb.current');
  const lastCrumb = crumbs[crumbs.length - 1];
  if (lastCrumb) lastCrumb.textContent = text || 'Untitled';
}

// On blur/Enter, settle on a final trimmed name (falling back to a
// timestamp, same convention as "Save to Folder", if the title is cleared).
function commitOpenNoteTitle(text) {
  if (!openNoteId) return;
  const note = childrenAt(projectPath).find((n) => n.id === openNoteId);
  if (!note) return;
  note.name = text.trim() || formatSavedAtLabel(new Date());
  persistProjects();
  renderProjects();
}

function renderBreadcrumbs() {
  projectBreadcrumbs.innerHTML = '';

  const addCrumb = (label, isCurrent, onClick) => {
    const crumb = document.createElement(isCurrent ? 'span' : 'button');
    crumb.className = 'crumb' + (isCurrent ? ' current' : '');
    crumb.textContent = label;
    if (!isCurrent) crumb.addEventListener('click', onClick);
    projectBreadcrumbs.appendChild(crumb);
  };

  const addSep = () => {
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '›';
    projectBreadcrumbs.appendChild(sep);
  };

  addCrumb('Projects', projectPath.length === 0 && !openNoteId, () => goToBreadcrumb(-1));

  let pathSoFar = [];
  projectPath.forEach((id, idx) => {
    const name = nodeNameAt(pathSoFar, id) || '…';
    pathSoFar = [...pathSoFar, id];
    addSep();
    addCrumb(name, idx === projectPath.length - 1 && !openNoteId, () => goToBreadcrumb(idx));
  });

  if (openNoteId) {
    const name = nodeNameAt(projectPath, openNoteId) || 'Note';
    addSep();
    addCrumb(name, true, null);
  }
}

// Drag-to-reorder for the rows of whichever folder (or the root) is being
// browsed. Same approach as the To-Do list: rows are moved live in the DOM
// during dragover, then on dragend the DOM order is read back into the
// underlying children array (in place -- childrenAt() returns the real
// array, not a copy) and persisted.
let draggedProjectId = null;

function commitProjectOrderFromDom() {
  const orderedIds = [...projectList.querySelectorAll('.project-item')].map((el) => el.dataset.id);
  const siblings = childrenAt(projectPath);
  if (orderedIds.length !== siblings.length) return;
  siblings.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
  persistProjects();
}

function makeProjectItem(node) {
  const li = document.createElement('li');
  li.className = 'project-item';
  li.dataset.id = node.id;

  if (editingNodeId !== node.id) {
    li.draggable = true;

    li.addEventListener('dragstart', (e) => {
      draggedProjectId = node.id;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.id);
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      if (draggedProjectId) commitProjectOrderFromDom();
      draggedProjectId = null;
    });

    li.addEventListener('dragover', (e) => {
      if (!draggedProjectId) return;
      e.preventDefault();
      if (draggedProjectId === node.id) return;
      const draggingEl = projectList.querySelector(`[data-id="${draggedProjectId}"]`);
      if (!draggingEl) return;
      const rect = li.getBoundingClientRect();
      const before = e.clientY - rect.top < rect.height / 2;
      projectList.insertBefore(draggingEl, before ? li : li.nextSibling);
    });
  }

  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.textContent = node.type === 'folder' ? '🗂️' : '📝';
  li.appendChild(icon);

  if (editingNodeId === node.id) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = node.name;
    input.addEventListener('click', (e) => e.stopPropagation());

    let cancelled = false;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur(); // commit happens in the blur handler below
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelled = true;
        editingNodeId = null;
        renderProjects();
      }
    });
    input.addEventListener('blur', () => {
      if (cancelled) return;
      commitRenameNode(node.id, input.value);
    });

    li.appendChild(input);
    // Focus once it's actually in the DOM.
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  } else {
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = node.name;
    li.appendChild(label);

    const rename = document.createElement('button');
    rename.className = 'rename';
    rename.textContent = '✏️';
    rename.title = 'Rename';
    rename.addEventListener('click', (e) => {
      e.stopPropagation();
      editingNodeId = node.id;
      renderProjects();
    });
    li.appendChild(rename);
  }

  const remove = document.createElement('button');
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.title = 'Delete';
  remove.addEventListener('click', (e) => {
    e.stopPropagation();
    removeProjectNode(node.id);
  });
  li.appendChild(remove);

  li.addEventListener('click', () => {
    if (editingNodeId === node.id) return; // don't navigate while the row is mid-rename
    if (node.type === 'folder') enterFolder(node.id);
    else openNote(node.id);
  });

  return li;
}

function renderProjects() {
  renderBreadcrumbs();

  const browsing = !openNoteId;
  projectBrowser.classList.toggle('hidden', !browsing);
  projectNoteEditor.classList.toggle('hidden', browsing);
  noteBackBtn.classList.toggle('hidden', browsing); // the back arrow next to the "Projects" title only applies while a note is open

  if (browsing) {
    const children = childrenAt(projectPath);
    projectList.innerHTML = '';
    children.forEach((node) => projectList.appendChild(makeProjectItem(node)));
    projectEmpty.classList.toggle('hidden', children.length > 0);
  } else {
    const note = childrenAt(projectPath).find((n) => n.id === openNoteId);
    const title = note ? note.name : '';
    if (noteEditorTitle.value !== title) noteEditorTitle.value = title;
    const content = note ? note.content : '';
    if (projectNoteArea.value !== content) projectNoteArea.value = content;
  }
}

// Dropping into the gaps between rows (or below the last one) should still
// count as a valid drop target, so the cursor doesn't flip to "not allowed".
projectList.addEventListener('dragover', (e) => {
  if (draggedProjectId) e.preventDefault();
});

addFolderBtn.addEventListener('click', createFolderInline);
addNoteBtn.addEventListener('click', createNoteAndOpen);

// The Today tab's "+ New note" button is a second entry point to this same
// note-creation flow -- switches to Projects first so the newly-opened note
// editor is actually visible, then reuses createNoteAndOpen() unchanged.
todayNewNoteBtn.addEventListener('click', () => {
  showView('projects');
  createNoteAndOpen();
});

noteBackBtn.addEventListener('click', closeNoteEditor);
projectNoteArea.addEventListener('input', () => updateOpenNoteContent(projectNoteArea.value));

noteEditorTitle.addEventListener('input', () => updateOpenNoteTitleLive(noteEditorTitle.value));
noteEditorTitle.addEventListener('blur', () => commitOpenNoteTitle(noteEditorTitle.value));
noteEditorTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    noteEditorTitle.blur(); // commit happens in the blur handler above; also moves focus into the body
    projectNoteArea.focus();
  }
});

// ---- Quick Notes: "Save to Folder" picker ----------------------------------
// Lets a quick note be filed away as a proper note inside ANY folder in the
// Projects tree, at any depth — including brand-new folders created on the
// fly from inside the picker. It reuses the same tree (`projects`) and the
// same childrenAt/genId/nodeNameAt helpers as the Projects view above; only
// the navigation cursor (saveModalPath) is separate, so browsing around in
// here never disturbs where the user was in the Projects tab.
function pathLabel(path) {
  const labels = ['Projects'];
  let soFar = [];
  path.forEach((id) => {
    labels.push(nodeNameAt(soFar, id) || '…');
    soFar = [...soFar, id];
  });
  return labels.join(' › ');
}

// The note's title is the date/time it was saved, not anything pulled from
// its text — that way opening it later shows you when you jotted it down,
// not a re-statement of the content itself.
function formatSavedAtLabel(date) {
  const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function openSaveModal() {
  saveModalPath = [];
  saveModalNoteName.value = formatSavedAtLabel(new Date());
  saveModalNewFolderInput.value = '';
  renderSaveModal();
  saveToFolderModal.classList.remove('hidden');
}

function closeSaveModal() {
  saveToFolderModal.classList.add('hidden');
}

function renderSaveModal() {
  // Breadcrumbs, mirroring the Projects view's but scoped to saveModalPath.
  saveModalBreadcrumbs.innerHTML = '';
  const addCrumb = (label, isCurrent, onClick) => {
    const crumb = document.createElement(isCurrent ? 'span' : 'button');
    crumb.className = 'crumb' + (isCurrent ? ' current' : '');
    crumb.textContent = label;
    if (!isCurrent) crumb.addEventListener('click', onClick);
    saveModalBreadcrumbs.appendChild(crumb);
  };
  const addSep = () => {
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '›';
    saveModalBreadcrumbs.appendChild(sep);
  };

  addCrumb('Projects', saveModalPath.length === 0, () => {
    saveModalPath = [];
    renderSaveModal();
  });

  let soFar = [];
  saveModalPath.forEach((id, idx) => {
    const name = nodeNameAt(soFar, id) || '…';
    soFar = [...soFar, id];
    addSep();
    addCrumb(name, idx === saveModalPath.length - 1, () => {
      saveModalPath = saveModalPath.slice(0, idx + 1);
      renderSaveModal();
    });
  });

  // Only folders are navigable/selectable here — you can't save a note "into" a note.
  const folders = childrenAt(saveModalPath).filter((n) => n.type === 'folder');
  saveModalFolderList.innerHTML = '';
  folders.forEach((folder) => {
    const li = document.createElement('li');
    li.className = 'project-item';

    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.textContent = '🗂️';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = folder.name;

    li.appendChild(icon);
    li.appendChild(label);
    li.addEventListener('click', () => {
      saveModalPath = [...saveModalPath, folder.id];
      renderSaveModal();
    });
    saveModalFolderList.appendChild(li);
  });
  saveModalEmpty.classList.toggle('hidden', folders.length > 0);
}

saveToFolderBtn.addEventListener('click', openSaveModal);
saveModalCloseBtn.addEventListener('click', closeSaveModal);

saveModalNewFolderBtn.addEventListener('click', () => {
  const trimmed = saveModalNewFolderInput.value.trim();
  if (!trimmed) {
    saveModalNewFolderInput.focus();
    return;
  }
  const folder = { id: genId('f'), name: trimmed, type: 'folder', children: [] };
  childrenAt(saveModalPath).push(folder);
  persistProjects();
  // Jump straight into the folder just created, ready to save into it.
  saveModalPath = [...saveModalPath, folder.id];
  saveModalNewFolderInput.value = '';
  renderSaveModal();
});
saveModalNewFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveModalNewFolderBtn.click();
  }
});

saveModalConfirmBtn.addEventListener('click', () => {
  const name = saveModalNoteName.value.trim() || formatSavedAtLabel(new Date());
  const note = { id: genId('n'), name, type: 'note', content: noteArea.value, createdAt: new Date().toISOString() };
  childrenAt(saveModalPath).push(note);
  persistProjects();
  renderNotesCreated();
  const destination = pathLabel(saveModalPath);
  closeSaveModal();
  clearTimeout(saveIndicatorTimer);
  status.textContent = `saved to ${destination}`;
  status.classList.remove('unsaved');
  saveIndicatorTimer = setTimeout(() => {
    status.textContent = 'saved';
  }, 2500);
});

// ---- Collapse / expand / peek / drag-to-redock ------------------------------
// The tab is both "click to toggle" and "drag to move to another edge".
// This is handled by hand (mousedown/mousemove/mouseup) rather than CSS
// -webkit-app-region: drag, because that property swallows the plain click
// on release -- Chromium hands the press off to native window-drag
// handling before its normal click event fires, so a click-without-moving
// never reached the toggle handler. Deciding click-vs-drag ourselves here
// keeps both working: a press that never moves past a small threshold is a
// click (toggle); a press that does is a drag (relayed to main.js, which
// moves the real window and snaps it to the nearest edge on release).
const DRAG_THRESHOLD_PX = 4;
let tabDrag = null; // { startScreenX, startScreenY, moved }

tab.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left button only
  e.preventDefault();
  tabDrag = { startScreenX: e.screenX, startScreenY: e.screenY, moved: false };
  window.notepad.dragStart({ screenX: e.screenX, screenY: e.screenY });
  document.addEventListener('mousemove', onTabDragMove);
  document.addEventListener('mouseup', onTabDragUp);
});

function onTabDragMove(e) {
  if (!tabDrag) return;
  if (!tabDrag.moved) {
    const dx = e.screenX - tabDrag.startScreenX;
    const dy = e.screenY - tabDrag.startScreenY;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) tabDrag.moved = true;
  }
  if (tabDrag.moved) {
    window.notepad.dragMove({ screenX: e.screenX, screenY: e.screenY });
  }
}

function onTabDragUp() {
  document.removeEventListener('mousemove', onTabDragMove);
  document.removeEventListener('mouseup', onTabDragUp);
  if (!tabDrag) return;
  const wasDrag = tabDrag.moved;
  tabDrag = null;
  // Always clears main.js's drag-start bookkeeping (it's set unconditionally
  // on every mousedown, click or drag) -- and only triggers the edge-snap
  // when an actual drag happened.
  window.notepad.dragEnd(wasDrag);
  if (!wasDrag) {
    window.notepad.toggleCollapse();
  }
}

// Hover is bound to the whole widget (tab + panel), not just the tab.
// Peeking slides the OS window itself, which moves the tab out from under a
// stationary cursor — if the listener were on #tab alone, that would fire a
// spurious mouseleave, close the peek, slide the tab back under the cursor,
// re-fire mouseenter, and loop forever (the "glitching"). Since the tab and
// panel are visually contiguous with no gap, the cursor stays logically
// inside #widget for the whole slide, so this doesn't retrigger.
let peekLeaveTimer = null;

widget.addEventListener('mouseenter', () => {
  clearTimeout(peekLeaveTimer);
  if (isCollapsed) window.notepad.peekStart();
});

widget.addEventListener('mouseleave', () => {
  clearTimeout(peekLeaveTimer);
  // Small debounce so a pixel of jitter right at the window's edge doesn't
  // cause a flicker between peek and resting states.
  peekLeaveTimer = setTimeout(() => {
    if (isCollapsed) window.notepad.peekEnd();
  }, 80);
});

closeBtn.addEventListener('click', () => {
  window.notepad.collapseNow();
});

// ---- Sidebar collapse (icon-only menu) --------------------------------------
// Toggles `.collapsed` on the sidebar: labels hide, the four nav icons stay
// visible and clickable (the active one keeps its highlight), and the content
// area (flex: 1 1 auto) grows horizontally to fill the freed width.
const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');

sidebarCollapseBtn.addEventListener('click', () => {
  const nowCollapsed = sidebar.classList.toggle('collapsed');
  sidebarCollapseBtn.title = nowCollapsed ? 'Expand menu' : 'Collapse menu';
  navItems.forEach((item) => {
    const label = item.querySelector('.nav-label');
    // Labels are hidden while collapsed, so surface them as hover tooltips.
    if (nowCollapsed && label) item.title = label.textContent.trim();
    else item.removeAttribute('title');
  });
});

// ---- Quick notes -----------------------------------------------------------
noteArea.addEventListener('input', () => {
  window.notepad.saveNote(noteArea.value);
  status.textContent = 'saving…';
  status.classList.add('unsaved');
  clearTimeout(saveIndicatorTimer);
  saveIndicatorTimer = setTimeout(() => {
    status.textContent = 'saved';
    status.classList.remove('unsaved');
  }, 500);
});

// ---- Copy-all-text buttons (Quick Notes + a Projects note's body) ----------
// Shared by both textareas: copies everything in the box and flashes a
// "Copied" confirmation on the button itself for a second or two.
function wireCopyButton(button, getText) {
  let flashTimer = null;
  button.addEventListener('click', () => {
    window.notepad.copyText(getText());
    button.textContent = '✓ Copied';
    button.classList.add('copied');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      button.textContent = '📋 Copy';
      button.classList.remove('copied');
    }, 1400);
  });
}

wireCopyButton(copyNoteBtn, () => noteArea.value);
wireCopyButton(copyProjectNoteBtn, () => projectNoteArea.value);

// ---- Transcribe buttons (Quick Notes + a Projects note's body) ------------
// Uses the browser's free built-in speech recognition (no account, no API
// key, nothing leaves this machine for transcription itself). Click once to
// start listening, click again to stop -- everything heard gets dropped
// into the note verbatim (no AI summarization step, by design: that would
// require sending text to a cloud service).
//
// Caveat: in most Electron builds, SpeechRecognition can't actually reach
// the speech-recognition backend it depends on, and fails immediately with
// a "network" error. This is a known Electron limitation, not a bug in this
// app -- the button surfaces that clearly instead of hanging silently.
function wireTranscribeButton(button, textarea) {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const idleLabel = '🎙️ Transcribe';
  const listeningLabel = '⏹ Stop Transcribing';

  if (!SpeechRecognitionCtor) {
    button.title = 'Speech recognition is not available in this build';
    button.addEventListener('click', () => {
      const original = button.textContent;
      button.textContent = '⚠ Not supported here';
      setTimeout(() => {
        button.textContent = original;
      }, 2800);
    });
    return { stopIfListening() {} };
  }

  let recognition = null;
  let listening = false;
  let transcriptBuffer = '';
  let messageTimer = null;

  function flashMessage(text, duration = 2800) {
    clearTimeout(messageTimer);
    button.textContent = text;
    messageTimer = setTimeout(() => {
      button.textContent = listening ? listeningLabel : idleLabel;
    }, duration);
  }

  function appendTranscriptToTextarea(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const needsSeparator = textarea.value.length > 0 && !textarea.value.endsWith('\n');
    textarea.value += (needsSeparator ? '\n' : '') + trimmed;
    // Reuse the textarea's own 'input' listener (already wired to save/persist)
    // instead of duplicating that logic here.
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function stopListening({ silent = false } = {}) {
    listening = false;
    if (recognition) {
      const finished = recognition;
      recognition = null;
      try {
        finished.stop();
      } catch (err) {
        // already stopped/aborted -- nothing to do
      }
    }
    button.classList.remove('recording');
    if (!silent) button.textContent = idleLabel;
    if (transcriptBuffer.trim()) {
      appendTranscriptToTextarea(transcriptBuffer);
    }
    transcriptBuffer = '';
  }

  function startListening() {
    transcriptBuffer = '';
    const instance = new SpeechRecognitionCtor();
    recognition = instance;
    instance.continuous = true;
    instance.interimResults = false;
    instance.lang = navigator.language || 'en-US';

    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal && result[0]) {
          transcriptBuffer += (transcriptBuffer ? ' ' : '') + result[0].transcript.trim();
        }
      }
    };

    instance.onerror = (event) => {
      const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'];
      if (!fatal.includes(event.error)) return; // e.g. "no-speech" -- onend decides whether to keep going
      const messages = {
        'not-allowed': '⚠ Mic permission denied',
        'service-not-allowed': '⚠ Mic permission denied',
        'audio-capture': '⚠ No microphone found',
        network: '⚠ Speech service unreachable',
      };
      stopListening({ silent: true });
      flashMessage(messages[event.error] || '⚠ Transcription error');
    };

    instance.onend = () => {
      // The engine stops itself after a pause even in "continuous" mode on
      // some platforms; if the user hasn't clicked Stop, pick it back up.
      if (listening && recognition === instance) {
        try {
          instance.start();
        } catch (err) {
          // ignore -- e.g. it was already restarted
        }
      }
    };

    try {
      instance.start();
      listening = true;
      button.textContent = listeningLabel;
      button.classList.add('recording');
    } catch (err) {
      recognition = null;
      flashMessage('⚠ Could not start microphone');
    }
  }

  button.addEventListener('click', () => {
    clearTimeout(messageTimer);
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  });

  return {
    stopIfListening() {
      if (listening) stopListening();
    },
  };
}

const quickNoteTranscribe = wireTranscribeButton(transcribeNoteBtn, noteArea);
const projectNoteTranscribe = wireTranscribeButton(transcribeProjectNoteBtn, projectNoteArea);

// Let Escape collapse the widget while a text field is focused.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.notepad.collapseNow();
  }
});

// ---- IPC wiring --------------------------------------------------------
window.notepad.onLoadNote((text) => {
  noteArea.value = text;
});

window.notepad.onInitData(({ username, todos: initialTodos, projects: initialProjects, dockEdge }) => {
  currentUsername = username;
  if (dockEdge) widget.dataset.edge = dockEdge;
  renderDateAndGreeting(username);
  todos = Array.isArray(initialTodos) ? initialTodos : [];
  projects = Array.isArray(initialProjects) ? initialProjects : [];
  renderTodos();
  renderProjects();
  renderNotesCreated();
  scheduleMidnightRefresh();
  // Keeps due-date badges honest (green -> red) as deadlines pass while the
  // widget just sits open, without needing a click to trigger a re-render.
  setInterval(renderTodos, 60 * 1000);
});

window.notepad.onDockChanged(({ edge }) => {
  if (edge) widget.dataset.edge = edge;
});

window.notepad.onCollapsedChanged((collapsed) => {
  isCollapsed = collapsed;
  if (!collapsed) {
    // give the window a moment to finish moving into place, then focus
    setTimeout(() => noteArea.focus(), 120);
  } else {
    noteArea.blur();
    // Don't leave the microphone listening in the background once the
    // widget is tucked away with no visible "Stop Transcribing" button.
    quickNoteTranscribe.stopIfListening();
    projectNoteTranscribe.stopIfListening();
  }
});
