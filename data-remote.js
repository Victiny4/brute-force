let client = null;

function isRemoteConfigured() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// Wraps a promise so a stalled network request (e.g. blocked/filtered wifi that
// drops packets instead of refusing the connection) fails loudly instead of
// hanging forever with no feedback.
function withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
        );
    });
}

function ensureSupabaseLoaded() {
    if (window.supabase) return Promise.resolve();
    return withTimeout(new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Could not load the Supabase client (check your internet connection)'));
        document.head.appendChild(s);
    }), 10000, 'Timed out loading the Supabase client — your network may be blocking cdn.jsdelivr.net');
}

async function getClient() {
    if (!isRemoteConfigured()) throw new Error('Add your Supabase URL + anon key to config.js first.');
    if (!client) {
        await ensureSupabaseLoaded();
        client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return client;
}

const REQUEST_TIMEOUT_MS = 12000;
const TIMEOUT_MESSAGE = 'Request timed out — check your internet connection';

/* ── row <-> object mapping ───────────────────────────────────── */
function rowToTask(row) {
    return {
        id: `remote-${row.id}`,
        remoteId: row.id,
        title: row.title,
        team: row.team,
        hours: row.hours,
        deadline: new Date(row.deadline),
        needsRobot: row.needs_robot,
        completed: row.completed,
        addedBy: row.added_by || null,
        source: 'remote',
    };
}
function rowToEvent(row) {
    return {
        id: `remote-${row.id}`,
        remoteId: row.id,
        title: row.title,
        datetime: new Date(row.datetime),
        addedBy: row.added_by || null,
        source: 'remote',
    };
}

/* ── tasks ─────────────────────────────────────────────────────── */
async function fetchRemoteTasks() {
    const c = await getClient();
    const { data, error } = await withTimeout(
        c.from('tasks').select('*').order('deadline', { ascending: true }),
        REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE,
    );
    if (error) throw new Error(error.message);
    return data.map(rowToTask);
}

async function insertRemoteTask(t) {
    const c = await getClient();
    const { error } = await withTimeout(
        c.from('tasks').insert({
            title: t.title,
            team: t.team,
            hours: t.hours,
            deadline: t.deadline.toISOString(),
            needs_robot: !!t.needsRobot,
            completed: !!t.completed,
            added_by: t.addedBy || null,
        }),
        REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE,
    );
    if (error) throw new Error(error.message);
}

async function updateRemoteTask(remoteId, patch) {
    const c = await getClient();
    const { error } = await withTimeout(
        c.from('tasks').update(patch).eq('id', remoteId),
        REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE,
    );
    if (error) throw new Error(error.message);
}

async function deleteRemoteTask(remoteId) {
    const c = await getClient();
    const { error } = await withTimeout(
        c.from('tasks').delete().eq('id', remoteId),
        REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE,
    );
    if (error) throw new Error(error.message);
}

/* ── events ────────────────────────────────────────────────────── */
async function fetchRemoteEvents() {
    const c = await getClient();
    const { data, error } = await withTimeout(
        c.from('events').select('*').order('datetime', { ascending: true }),
        REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE,
    );
    if (error) throw new Error(error.message);
    return data.map(rowToEvent);
}

async function insertRemoteEvent(e) {
    const c = await getClient();
    const { error } = await withTimeout(
        c.from('events').insert({
            title: e.title,
            datetime: e.datetime.toISOString(),
            added_by: e.addedBy || null,
        }),
        REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE,
    );
    if (error) throw new Error(error.message);
}

async function deleteRemoteEvent(remoteId) {
    const c = await getClient();
    const { error } = await withTimeout(
        c.from('events').delete().eq('id', remoteId),
        REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE,
    );
    if (error) throw new Error(error.message);
}

// Calls onChange whenever anyone (including this tab) adds/edits/removes a
// row in either table.
async function subscribeRemote(onChange) {
    const c = await getClient();
    return c
        .channel('board-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onChange)
        .subscribe();
}
