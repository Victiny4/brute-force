const TEAMS = ['Build', 'Software', 'Drive team', 'CAD', 'Design', 'Business'];
const MINUTE = 60000, HOUR = 3600000, DAY = 86400000;
const REMOTE_ON = isRemoteConfigured();

/* ── storage (local fallback when Supabase isn't configured) ─── */
function loadTasks() {
    try {
        const raw = JSON.parse(localStorage.getItem('robotics-dashboard:tasks') || '[]');
        return raw.map(t => ({ ...t, deadline: new Date(t.deadline), source: 'local' }));
    } catch { return []; }
}
function saveTasks() {
    const raw = tasks.filter(t => t.source === 'local').map(t => ({
        id: t.id, title: t.title, team: t.team, hours: t.hours,
        deadline: t.deadline.toISOString(), needsRobot: t.needsRobot, completed: t.completed,
    }));
    try { localStorage.setItem('robotics-dashboard:tasks', JSON.stringify(raw)); } catch { /* storage unavailable */ }
}
function loadEvents() {
    try {
        const raw = JSON.parse(localStorage.getItem('robotics-dashboard:events') || '[]');
        return raw.map(e => ({ ...e, datetime: new Date(e.datetime), source: 'local' }));
    } catch { return []; }
}
function saveEvents() {
    const raw = events.filter(e => e.source === 'local').map(e => ({
        id: e.id, title: e.title, datetime: e.datetime.toISOString(),
    }));
    try { localStorage.setItem('robotics-dashboard:events', JSON.stringify(raw)); } catch { /* storage unavailable */ }
}

let tasks = REMOTE_ON ? [] : loadTasks();
let events = REMOTE_ON ? [] : loadEvents();

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ── countdown formatting ──────────────────────────────────── */
function diffParts(target) {
    const ms = target.getTime() - Date.now();
    const overdue = ms < 0;
    const abs = Math.abs(ms);
    return {
        overdue,
        d: Math.floor(abs / DAY),
        h: Math.floor((abs % DAY) / HOUR),
        m: Math.floor((abs % HOUR) / MINUTE),
        s: Math.floor((abs % MINUTE) / 1000),
    };
}
// Short form for the big "next event" countdown, e.g. "1d 1h".
function formatShort(target) {
    const p = diffParts(target);
    if (p.overdue) return 'Happening now';
    if (p.d > 0) return `${p.d}d ${p.h}h`;
    if (p.h > 0) return `${p.h}h ${p.m}m`;
    return `${p.m}m ${p.s}s`;
}
// Long form for task/queue rows, e.g. "1d 4h 23m left".
function formatLong(target) {
    const p = diffParts(target);
    const label = p.overdue ? 'overdue' : 'left';
    if (p.d > 0) return { text: `${p.d}d ${p.h}h ${label}`, overdue: p.overdue };
    if (p.h > 0) return { text: `${p.h}h ${p.m}m ${label}`, overdue: p.overdue };
    return { text: `${p.m}m ${p.s}s ${label}`, overdue: p.overdue };
}
function formatDate(d) {
    return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ── next event ────────────────────────────────────────────── */
function renderNextEvent() {
    const upcoming = events.filter(e => e.datetime.getTime() >= Date.now()).sort((a, b) => a.datetime - b.datetime);
    const next = upcoming[0];
    const titleEl = document.getElementById('nextEventTitle');
    const countdownEl = document.getElementById('nextEventCountdown');
    const dateEl = document.getElementById('nextEventDate');
    if (!next) {
        titleEl.textContent = 'No events yet';
        countdownEl.textContent = '—';
        dateEl.textContent = '';
        return;
    }
    titleEl.textContent = next.title;
    countdownEl.textContent = formatShort(next.datetime);
    dateEl.textContent = formatDate(next.datetime);
}

/* ── who gets the robot next ──────────────────────────────── */
function renderRobotQueue() {
    const wrap = document.getElementById('robotQueue');
    const emptyEl = document.getElementById('robotQueueEmpty');
    wrap.innerHTML = '';

    // Soonest-deadline task per team that still needs the robot.
    const byTeam = new Map();
    for (const t of tasks) {
        if (t.completed || !t.needsRobot) continue;
        const existing = byTeam.get(t.team);
        if (!existing || t.deadline < existing.deadline) byTeam.set(t.team, t);
    }
    const queue = [...byTeam.values()].sort((a, b) => a.deadline - b.deadline);
    emptyEl.hidden = queue.length > 0;

    queue.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'queue-row' + (i === 0 ? ' current' : '');

        const main = document.createElement('div');
        main.className = 'queue-main';
        const team = document.createElement('div');
        team.className = 'team';
        team.textContent = t.team;
        const detail = document.createElement('div');
        detail.className = 'detail';
        detail.textContent = `${t.title} · ${t.hours != null ? `${t.hours}h of work` : ''}`;
        main.appendChild(team);
        main.appendChild(detail);

        const side = document.createElement('div');
        side.className = 'queue-side';
        side.textContent = i === 0 ? 'Has it now' : formatLong(t.deadline).text;

        row.appendChild(main);
        row.appendChild(side);
        wrap.appendChild(row);
    });
}

/* ── tasks list ────────────────────────────────────────────── */
function renderTasks() {
    const wrap = document.getElementById('taskRows');
    const emptyEl = document.getElementById('taskEmpty');
    wrap.innerHTML = '';

    const sorted = [...tasks].sort((a, b) => a.deadline - b.deadline);
    emptyEl.hidden = sorted.length > 0;

    for (const t of sorted) {
        const row = document.createElement('div');
        row.className = 'task-row' + (t.completed ? ' done' : '');

        const check = document.createElement('button');
        check.className = 'task-check' + (t.completed ? ' done' : '');
        check.title = t.completed ? 'Mark as not done' : 'Mark as done';
        check.addEventListener('click', async () => {
            if (t.source === 'remote') {
                try {
                    await updateRemoteTask(t.remoteId, { completed: !t.completed });
                    await refreshRemote();
                } catch (err) { console.error(err); alert(`Could not update: ${err.message}`); }
            } else {
                t.completed = !t.completed;
                saveTasks();
                renderAll();
            }
        });

        const main = document.createElement('div');
        main.className = 'task-main';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = t.title;
        const detail = document.createElement('div');
        detail.className = 'detail';
        detail.textContent = `${t.team} · takes ${t.hours != null ? t.hours : '?'}h${t.needsRobot ? ' · needs robot' : ''}`;
        main.appendChild(title);
        main.appendChild(detail);
        if (t.addedBy) {
            const by = document.createElement('div');
            by.className = 'added-by';
            by.textContent = `added by ${t.addedBy}`;
            main.appendChild(by);
        }

        const side = document.createElement('div');
        side.className = 'task-side';
        const long = formatLong(t.deadline);
        const countdown = document.createElement('div');
        countdown.className = 'countdown' + (long.overdue ? ' overdue' : '');
        countdown.textContent = long.text;
        const due = document.createElement('div');
        due.className = 'due';
        due.textContent = formatDate(t.deadline);
        side.appendChild(countdown);
        side.appendChild(due);

        const del = document.createElement('button');
        del.className = 'rm-btn';
        del.title = 'Delete';
        del.textContent = '✕';
        del.addEventListener('click', async () => {
            if (t.source === 'remote') {
                try {
                    await deleteRemoteTask(t.remoteId);
                    await refreshRemote();
                } catch (err) { console.error(err); alert(`Could not delete: ${err.message}`); }
            } else {
                tasks = tasks.filter(x => x.id !== t.id);
                saveTasks();
                renderAll();
            }
        });

        row.appendChild(check);
        row.appendChild(main);
        row.appendChild(side);
        row.appendChild(del);
        wrap.appendChild(row);
    }
}

/* ── events list ───────────────────────────────────────────── */
function renderEvents() {
    const wrap = document.getElementById('eventRows');
    const emptyEl = document.getElementById('eventEmpty');
    wrap.innerHTML = '';

    const upcoming = [...events].filter(e => e.datetime.getTime() >= Date.now()).sort((a, b) => a.datetime - b.datetime);
    emptyEl.hidden = upcoming.length > 0;

    for (const e of upcoming) {
        const row = document.createElement('div');
        row.className = 'event-row';

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = e.title;

        const countdown = document.createElement('div');
        countdown.className = 'countdown';
        countdown.textContent = formatShort(e.datetime);

        const del = document.createElement('button');
        del.className = 'rm-btn';
        del.title = 'Delete';
        del.textContent = '✕';
        del.addEventListener('click', async () => {
            if (e.source === 'remote') {
                try {
                    await deleteRemoteEvent(e.remoteId);
                    await refreshRemote();
                } catch (err) { console.error(err); alert(`Could not delete: ${err.message}`); }
            } else {
                events = events.filter(x => x.id !== e.id);
                saveEvents();
                renderAll();
            }
        });

        row.appendChild(title);
        row.appendChild(countdown);
        row.appendChild(del);
        wrap.appendChild(row);
    }
}

function renderAll() {
    renderNextEvent();
    renderRobotQueue();
    renderTasks();
    renderEvents();
}

/* ── remote sync ───────────────────────────────────────────── */
function showRemoteError(message) {
    const el = document.getElementById('remoteError');
    el.textContent = message;
    el.hidden = !message;
}

async function refreshRemote() {
    try {
        [tasks, events] = await Promise.all([fetchRemoteTasks(), fetchRemoteEvents()]);
        showRemoteError(null);
    } catch (err) {
        console.error('Could not load shared board:', err.message);
        showRemoteError(`Couldn't load the shared board: ${err.message}`);
    }
    renderAll();
}

/* ── add-task / add-event tabs ────────────────────────────── */
const taskTeamSelect = document.getElementById('taskTeam');
for (const team of TEAMS) {
    const opt = document.createElement('option');
    opt.value = team;
    opt.textContent = team;
    taskTeamSelect.appendChild(opt);
}

const taskForm = document.getElementById('taskForm');
const eventForm = document.getElementById('eventForm');
document.querySelectorAll('#addTabs button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#addTabs button').forEach(b => b.classList.toggle('active', b === btn));
        taskForm.hidden = btn.dataset.tab !== 'task';
        eventForm.hidden = btn.dataset.tab !== 'event';
    });
});

const addNameInput = document.getElementById('addName');
if (REMOTE_ON) {
    addNameInput.hidden = false;
    try { addNameInput.value = localStorage.getItem('robotics-dashboard:username') || ''; } catch { /* ignore */ }
}

const taskSubmitBtn = taskForm.querySelector('button[type="submit"]');
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = addNameInput.value.trim();
    const title = document.getElementById('taskTitle').value.trim();
    const team = taskTeamSelect.value;
    const hoursStr = document.getElementById('taskHours').value;
    const deadlineStr = document.getElementById('taskDeadline').value;
    const needsRobot = document.getElementById('taskNeedsRobot').checked;
    if (!title || !team || !deadlineStr) return;

    const newTask = {
        title, team, needsRobot,
        hours: hoursStr ? parseFloat(hoursStr) : null,
        deadline: new Date(deadlineStr),
        completed: false,
    };

    if (REMOTE_ON) {
        try { localStorage.setItem('robotics-dashboard:username', name); } catch { /* ignore */ }
        taskSubmitBtn.disabled = true;
        taskSubmitBtn.textContent = 'Adding…';
        try {
            await insertRemoteTask({ ...newTask, addedBy: name || null });
            await refreshRemote();
        } catch (err) {
            console.error(err);
            alert(`Could not add task: ${err.message}`);
            return;
        } finally {
            taskSubmitBtn.disabled = false;
            taskSubmitBtn.textContent = 'Add task';
        }
    } else {
        tasks.push({ id: uid('task'), source: 'local', ...newTask });
        saveTasks();
        renderAll();
    }
    taskForm.reset();
});

const eventSubmitBtn = eventForm.querySelector('button[type="submit"]');
eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = addNameInput.value.trim();
    const title = document.getElementById('eventTitle').value.trim();
    const datetimeStr = document.getElementById('eventDatetime').value;
    if (!title || !datetimeStr) return;

    const newEvent = { title, datetime: new Date(datetimeStr) };

    if (REMOTE_ON) {
        try { localStorage.setItem('robotics-dashboard:username', name); } catch { /* ignore */ }
        eventSubmitBtn.disabled = true;
        eventSubmitBtn.textContent = 'Adding…';
        try {
            await insertRemoteEvent({ ...newEvent, addedBy: name || null });
            await refreshRemote();
        } catch (err) {
            console.error(err);
            alert(`Could not add event: ${err.message}`);
            return;
        } finally {
            eventSubmitBtn.disabled = false;
            eventSubmitBtn.textContent = 'Add event';
        }
    } else {
        events.push({ id: uid('event'), source: 'local', ...newEvent });
        saveEvents();
        renderAll();
    }
    eventForm.reset();
});

if (REMOTE_ON) {
    refreshRemote();
    subscribeRemote(() => refreshRemote());
} else {
    renderAll();
}
setInterval(renderAll, 1000);
