/* Firebase-backed compatibility layer for the app's former Supabase calls. */
(function () {
    const firebaseConfig = {
        apiKey: "AIzaSyC0YwXx3ZU7WeP90foUaGo5fhl7hx6h2YQ",
        authDomain: "checklist-e7644.firebaseapp.com",
        databaseURL: "https://checklist-e7644-default-rtdb.firebaseio.com",
        projectId: "checklist-e7644",
        storageBucket: "checklist-e7644.firebasestorage.app",
        messagingSenderId: "598591459289",
        appId: "1:598591459289:web:38714ccf32fd433127d3c8",
        measurementId: "G-M54S5XCLJB"
    };

    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore(app);
    const auth = firebase.auth(app);
    try { if (firebase.analytics) firebase.analytics(app); } catch (_) {}
    window.firebaseApp = app;
    window.firebaseDb = db;

    function userShape(user) {
        if (!user) return null;
        const profile = user.providerData && user.providerData[0] || {};
        const parts = (user.displayName || '').split(' ');
        return {
            uid: user.uid,
            id: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            emailVerified: user.emailVerified,
            providerData: user.providerData || [],
            metadata: user.metadata || {},
            user_metadata: { name: user.displayName || '', full_name: user.displayName || '', first_name: parts[0] || '', last_name: parts.slice(1).join(' ') },
            email_confirmed_at: user.emailVerified ? new Date().toISOString() : null,
            confirmed_at: user.emailVerified ? new Date().toISOString() : null,
            created_at: user.metadata && user.metadata.creationTime || null
        };
    }
    function errorResult(error) { return { data: null, error: error || null }; }

    let authReady = false;
    const authReadyPromise = new Promise(resolve => {
        const unsubscribe = auth.onAuthStateChanged(() => {
            if (!authReady) { authReady = true; unsubscribe(); resolve(); }
        });
    });
    const authFacade = {
        async getSession() {
            if (!authReady) await authReadyPromise;
            const user = auth.currentUser;
            return { data: { session: user ? { user: userShape(user), access_token: await user.getIdToken() } : null }, error: null };
        },
        async signUp({ email, password, options }) {
            try {
                const credential = await auth.createUserWithEmailAndPassword(email, password);
                const metadata = options && options.data || {};
                const displayName = [metadata.first_name, metadata.last_name].filter(Boolean).join(' ');
                if (displayName) await credential.user.updateProfile({ displayName });
                return { data: { user: userShape(credential.user), session: { user: userShape(credential.user) } }, error: null };
            } catch (error) { return errorResult(error); }
        },
        async signInWithPassword({ email, password }) {
            try {
                const credential = await auth.signInWithEmailAndPassword(email, password);
                return { data: { user: userShape(credential.user), session: { user: userShape(credential.user) } }, error: null };
            } catch (error) { return errorResult(error); }
        },
        async signOut() { try { await auth.signOut(); return { error: null }; } catch (error) { return { error }; } },
        async updateUser({ data }) {
            try {
                const current = auth.currentUser;
                if (!current) throw new Error('Nenhum usuário autenticado.');
                const profile = data || {};
                const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
                if (name) await current.updateProfile({ displayName: name });
                return { data: { user: userShape(current) }, error: null };
            } catch (error) { return errorResult(error); }
        },
        async resetPasswordForEmail(email, options) {
            try {
                await auth.sendPasswordResetEmail(email);
                return { error: null };
            } catch (error) { return { error }; }
        }
    };

    class Query {
        constructor(table) { this.table = table; this.filters = []; this.sort = null; this.max = null; this.action = 'select'; this.payload = null; this.returnRows = false; this.upsertOptions = {}; }
        select() { this.returnRows = true; return this; }
        eq(field, value) { this.filters.push({ field, operator: '==', value }); return this; }
        gte(field, value) { this.filters.push({ field, operator: '>=', value }); return this; }
        gt(field, value) { this.filters.push({ field, operator: '>', value }); return this; }
        in(field, values) { this.filters.push({ field, operator: 'client-in', value: values || [] }); return this; }
        order(field, options) { this.sort = { field, ascending: !options || options.ascending !== false }; return this; }
        limit(count) { this.max = Number(count); return this; }
        serverFilters() {
            const filters = this.filters.filter(filter => filter.operator !== 'client-in');
            if (filters.length <= 1) return filters;
            const range = filters.find(filter => filter.operator === '>=' || filter.operator === '>');
            return range ? [range] : [filters[0]];
        }
        matches(row) {
            return this.filters.every(filter => filter.operator === 'client-in'
                ? filter.value.includes(row[filter.field])
                : filter.operator === '>=' ? row[filter.field] >= filter.value
                : filter.operator === '>' ? row[filter.field] > filter.value
                : row[filter.field] === filter.value);
        }
        maybeSingle() { return this.then(result => ({ data: result.data && result.data[0] || null, error: result.error })); }
        insert(rows) { this.action = 'insert'; this.payload = rows; return this; }
        upsert(rows, options) { this.action = 'upsert'; this.payload = rows; this.upsertOptions = options || {}; return this; }
        update(row) { this.action = 'update'; this.payload = row; return this; }
        delete() { this.action = 'delete'; return this; }
        async execute() {
            try {
                const ref = db.collection(this.table);
                const documentIdFilter = this.filters.find(filter => filter.field === 'id' && filter.operator === '==');
                if (this.action === 'delete' && documentIdFilter && this.filters.length === 1) {
                    const target = ref.doc(String(documentIdFilter.value));
                    const snapshot = await target.get();
                    if (snapshot.exists) {
                        const row = Object.assign({ id: snapshot.id }, snapshot.data() || {});
                        if (this.matches(row)) {
                            await target.delete();
                            return { data: this.returnRows ? [row] : null, error: null };
                        }
                    }
                }
                const idFilter = this.table === 'users' && this.filters.find(filter => filter.field === 'id' && filter.operator === '==');
                if (idFilter && this.action !== 'upsert' && this.action !== 'insert') {
                    const target = ref.doc(String(idFilter.value));
                    const snapshot = await target.get();
                    const row = snapshot.exists ? Object.assign({ id: snapshot.id }, snapshot.data()) : null;
                    if (this.action === 'select') return { data: row ? [row] : [], error: null };
                    if (!row) return { data: this.returnRows ? [] : null, error: null };
                    if (this.action === 'update') { await target.set(this.payload, { merge: true }); return { data: this.returnRows ? [Object.assign({}, row, this.payload)] : null, error: null }; }
                    if (this.action === 'delete') { await target.delete(); return { data: this.returnRows ? [row] : null, error: null }; }
                }
                if (this.action === 'select') {
                    let query = ref;
                    this.serverFilters().forEach(filter => { query = query.where(filter.field, filter.operator, filter.value); });
                    if (this.sort) query = query.orderBy(this.sort.field, this.sort.ascending ? 'asc' : 'desc');
                    if (this.max != null && this.serverFilters().length === this.filters.length) query = query.limit(this.max);
                    const snap = await query.get();
                    let rows = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
                    rows = rows.filter(row => this.matches(row));
                    if (this.max != null) rows = rows.slice(0, this.max);
                    return { data: rows, error: null };
                }
                let input = Array.isArray(this.payload) ? this.payload : [this.payload || {}];
                if (this.action === 'insert') {
                    const out = [];
                    for (const row of input) {
                        const id = String(row.id || row.local_id || ref.doc().id);
                        const doc = ref.doc(id);
                        if ((await doc.get()).exists) throw new Error('Registro duplicado: ' + id);
                        const clean = Object.assign({}, row, { id });
                        await doc.set(clean); out.push(clean);
                    }
                    return { data: this.returnRows ? out : null, error: null };
                }
                let query = ref;
                this.serverFilters().forEach(filter => { query = query.where(filter.field, filter.operator, filter.value); });
                const snap = await query.get();
                const matches = snap.docs.filter(doc => this.matches(Object.assign({ id: doc.id }, doc.data() || {})));
                if (this.action === 'upsert') {
                    const out = [];
                    for (const row of input) {
                        let id = this.upsertOptions.onConflict && row[this.upsertOptions.onConflict];
                        if (!id) id = row.id || row.local_id || row.email;
                        if (!id) id = ref.doc().id;
                        id = String(id);
                        const clean = Object.assign({}, row, { id });
                        const target = ref.doc(id);
                        if (this.upsertOptions.ignoreDuplicates && (await target.get()).exists) continue;
                        await target.set(clean, { merge: true });
                        out.push(clean);
                    }
                    return { data: this.returnRows ? out : null, error: null };
                }
                const out = [];
                for (const doc of matches) {
                    if (this.action === 'update') { await doc.ref.set(this.payload, { merge: true }); out.push(Object.assign({ id: doc.id }, doc.data(), this.payload)); }
                    else if (this.action === 'delete') { out.push(Object.assign({ id: doc.id }, doc.data())); await doc.ref.delete(); }
                }
                return { data: this.returnRows ? out : null, error: null };
            } catch (error) { return { data: null, error }; }
        }
        then(resolve, reject) { return this.execute().then(resolve, reject); }
    }

    class Channel {
        constructor(name, options) { this.name = name; this.options = options || {}; this.handlers = []; this.unsubs = []; this.key = this.options.config && this.options.config.presence && this.options.config.presence.key || 'anon'; }
        on(kind, filter, callback) { this.handlers.push({ kind, filter: filter || {}, callback }); return this; }
        async subscribe(callback) {
            for (const h of this.handlers) {
                if (h.kind === 'postgres_changes') {
                    const table = h.filter.table;
                    if (!table) continue;
                    if (table === 'users' && (!auth.currentUser || auth.currentUser.email !== 'gutemberggg10@gmail.com')) continue;
                    let first = true;
                    this.unsubs.push(db.collection(table).onSnapshot(snap => {
                        if (first) { first = false; return; }
                        snap.docChanges().forEach(change => {
                            const event = change.type === 'added' ? 'INSERT' : change.type === 'modified' ? 'UPDATE' : 'DELETE';
                            if (h.filter.event !== '*' && h.filter.event !== event) return;
                            const record = Object.assign({ id: change.doc.id }, change.doc.data() || {});
                            h.callback({ eventType: event, new: event === 'DELETE' ? {} : record, old: event === 'DELETE' ? record : {} });
                        });
                    }));
                } else if (h.kind === 'broadcast' && this.name === 'system-broadcast') {
                    this.unsubs.push(db.collection('_broadcasts').onSnapshot(snap => snap.docChanges().forEach(change => {
                        if (change.type !== 'added') return;
                        const message = change.doc.data();
                        if (Date.now() - (message.created_at || 0) < 60000 && message.event === h.filter.event) h.callback({ payload: message.payload || {} });
                    })));
                } else if (h.kind === 'presence' && h.filter.event === 'sync') {
                    this.unsubs.push(db.collection('_presence').onSnapshot(snap => {
                        const state = {};
                        snap.docs.forEach(doc => { const item = doc.data(); if (Date.now() - (item.updated_at || 0) < 120000) state[doc.id] = [item.payload || {}]; });
                        this._presence = state; h.callback();
                    }));
                }
            }
            if (callback) callback('SUBSCRIBED');
            return this;
        }
        presenceState() { return this._presence || {}; }
        async track(payload) { await db.collection('_presence').doc(this.key).set({ payload, updated_at: Date.now() }); }
        async send(message) { await db.collection('_broadcasts').add({ event: message.event, payload: message.payload || {}, created_at: Date.now() }); }
        unsubscribe() { this.unsubs.forEach(fn => fn()); this.unsubs = []; }
    }

    window.checklistBackend = {
        auth: authFacade,
        from(table) { return new Query(table); },
        channel(name, options) { return new Channel(name, options); },
        removeChannel(channel) { channel && channel.unsubscribe(); }
    };
    window.firebaseAuth = auth;
    window.firebaseDb = db;
}());
