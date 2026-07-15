// Capa de autenticación: Firebase (login con Google) + Supabase (perfil).
// Expone window.HydraAuth para que renderer.js maneje la UI de cuenta.
(function () {
  if (typeof firebase === 'undefined' || typeof supabase === 'undefined') {
    console.error('[auth] Firebase o Supabase no cargaron.');
    window.HydraAuth = { onChange() { return () => {}; }, getUser() { return null; }, getProfile() { return null; },
      signInWithGoogle() { return Promise.reject(new Error('SDK no disponible')); }, signOut() {}, saveProfile() {}, isUsernameAvailable() { return Promise.resolve(true); } };
    return;
  }

  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {}); // sesión persistente
  // CUENTAS (servidor #1) con la NUEVA seguridad (RLS por JWT):
  // En cada request reenviamos el ID token de Firebase a Supabase. Así el RLS del
  // nuevo esquema —que lee `request.jwt.claims->>'email'` y `->>'sub'` en
  // get_current_user_email()/get_current_user_id()— identifica al usuario y deja
  // crear/leer/guardar SU propio perfil. Sin sesión el callback devuelve null y se
  // usa la anon key (las lecturas públicas, USING(TRUE), siguen funcionando).
  // ⚠️ REQUISITO en el proyecto de Supabase: habilitar Firebase como
  //    "Third-Party Auth" (Authentication → Sign In / Providers → Add provider →
  //     Firebase, project ID: hydra-software-b3408). Sin eso, Supabase rechaza el
  //     token de Firebase (401) y el perfil no se puede guardar.
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => {
      try { const u = auth.currentUser; return u ? await u.getIdToken() : null; }
      catch (e) { return null; }
    },
  });
  // Servidor #2: SOLO extensiones (marketplace de la comunidad).
  const sbExt = (typeof SUPABASE_EXT_URL !== 'undefined')
    ? supabase.createClient(SUPABASE_EXT_URL, SUPABASE_EXT_ANON_KEY, { auth: { persistSession: false } })
    : null;

  let currentUser = null;
  let currentProfile = null;
  const listeners = new Set();
  const emit = () => { for (const cb of listeners) { try { cb(currentUser, currentProfile); } catch (e) {} } };

  function sanitizeUsername(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  // Carga el perfil de Supabase; si no existe, hace un upsert mínimo (primer login).
  async function loadProfile(email, user) {
    try {
      const { data } = await sb.from('user_profiles').select('*').eq('email', email).maybeSingle();
      if (data) { currentProfile = data; return data; }
      const base = {
        email,
        user_id: user ? user.uid : email,
        display_name: (user && user.displayName) || email.split('@')[0],
        username: (sanitizeUsername((user && user.displayName) || email.split('@')[0]) || 'user') + '-' + Math.random().toString(36).slice(2, 6),
        photo_url: (user && user.photoURL) || null,
      };
      const { data: ins } = await sb.from('user_profiles').upsert(base, { onConflict: 'email' }).select().maybeSingle();
      currentProfile = ins || base;
      return currentProfile;
    } catch (e) {
      console.warn('[auth] loadProfile error:', e && e.message);
      currentProfile = null;
      return null;
    }
  }

  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    if (user) await loadProfile(user.email, user);
    else currentProfile = null;
    emit();
  });

  // El navegador del sistema nos devuelve el credencial de Google → iniciamos
  // sesión con él (intercambio de token, sin UI → Google no lo bloquea).
  let pendingResolve = null, pendingReject = null;
  if (window.api && window.api.onAuthCredential) {
    window.api.onAuthCredential(async (data) => {
      try {
        if (!data || !data.idToken) throw new Error('Credencial incompleta.');
        const cred = firebase.auth.GoogleAuthProvider.credential(data.idToken, data.accessToken || null);
        const res = await auth.signInWithCredential(cred);
        if (pendingResolve) pendingResolve(res.user);
      } catch (e) {
        if (pendingReject) pendingReject(e);
      }
      pendingResolve = pendingReject = null;
    });
  }

  window.HydraAuth = {
    onChange(cb) { listeners.add(cb); cb(currentUser, currentProfile); return () => listeners.delete(cb); },
    getUser() { return currentUser; },
    getProfile() { return currentProfile; },
    sanitizeUsername,

    // Abre Google en el navegador del sistema y espera el credencial de vuelta.
    signInWithGoogle() {
      return new Promise((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
        Promise.resolve(window.api.externalGoogleLogin()).catch(reject);
        // Respaldo: si en 3 min no llega nada, liberar.
        setTimeout(() => { if (pendingReject === reject) { pendingReject = pendingResolve = null; reject(new Error('Tiempo de espera agotado.')); } }, 180000);
      });
    },

    async signOut() { await auth.signOut(); },

    async saveProfile(patch) {
      if (!currentUser) throw new Error('No hay sesión iniciada.');
      const row = Object.assign({}, patch, { email: currentUser.email, updated_at: new Date().toISOString() });
      const { data, error } = await sb.from('user_profiles').upsert(row, { onConflict: 'email' }).select().maybeSingle();
      if (error) throw error;
      currentProfile = data || Object.assign({}, currentProfile, patch);
      emit();
      return currentProfile;
    },

    async isUsernameAvailable(username) {
      try {
        const { data, error } = await sb.rpc('is_username_available', {
          check_username: username,
          exclude_email: currentUser ? currentUser.email : null,
        });
        if (error) return true;
        return !!data;
      } catch (e) { return true; }
    },

    // ----- EXTENSIONES (servidor #2) ------------------------------------
    ext: {
      ready() { return !!sbExt; },

      // Lista las extensiones publicadas por la comunidad.
      async list() {
        if (!sbExt) return [];
        const { data, error } = await sbExt.from('extensions')
          .select('*').eq('is_published', true)
          .order('installs', { ascending: false }).limit(200);
        if (error) { console.warn('[ext] list:', error.message); return []; }
        return data || [];
      },

      // Sube un ícono al storage y devuelve su URL pública.
      async uploadIcon(file) {
        if (!sbExt || !file) return null;
        try {
          const ext = (file.name || 'png').split('.').pop().toLowerCase();
          const path = 'icons/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
          const { error } = await sbExt.storage.from('extension-icons').upload(path, file, {
            cacheControl: '3600', upsert: false, contentType: file.type || 'image/png',
          });
          if (error) throw error;
          const { data } = sbExt.storage.from('extension-icons').getPublicUrl(path);
          return data ? data.publicUrl : null;
        } catch (e) { console.warn('[ext] uploadIcon:', e && e.message); return null; }
      },

      // Publica (crea o actualiza) una extensión del usuario actual.
      async publish(payload) {
        if (!sbExt) throw new Error('Servidor de extensiones no disponible.');
        if (!currentUser) throw new Error('Inicia sesión para publicar.');
        // Al EDITAR llega ext_id (se conserva → actualiza). Al CREAR, generamos un
        // slug ÚNICO (nombre + sufijo aleatorio) para no pisar la extensión de otro.
        const slug = payload.ext_id
          ? sanitizeUsername(payload.ext_id)
          : ((sanitizeUsername(payload.name) || 'ext') + '-' + Math.random().toString(36).slice(2, 7));
        const row = {
          ext_id: slug,
          name: payload.name || 'Sin nombre',
          description: payload.description || '',
          readme: payload.readme || '',
          category: payload.category || 'Otros',
          version: payload.version || '1.0.0',
          icon_url: payload.icon_url || null,
          code: payload.code || '',
          author_user_id: currentUser.uid,
          author_email: currentUser.email,
          author_username: (currentProfile && currentProfile.username) || currentUser.displayName || currentUser.email.split('@')[0],
          is_published: true,
        };
        const { data, error } = await sbExt.from('extensions').upsert(row, { onConflict: 'ext_id' }).select().maybeSingle();
        if (error) throw error;
        return data;
      },

      // Borra una extensión (solo del propio autor, por convención).
      async remove(extId) {
        if (!sbExt || !currentUser) return;
        await sbExt.from('extensions').delete().eq('ext_id', extId).eq('author_email', currentUser.email);
      },

      // Suma 1 a las instalaciones.
      async countInstall(extId) {
        if (!sbExt) return;
        try { await sbExt.rpc('increment_installs', { p_ext_id: extId }); } catch (e) {}
      },
    },

    // ----- HYDRA TEAM: programación en equipo (servidor #2) --------------
    // Colaboración en vivo. Todo se guarda en el servidor #2 (sin RLS).
    collab: {
      ready() { return !!sbExt; },
      _me() { return currentUser ? currentUser.email : null; },
      _username() { return (currentProfile && currentProfile.username) || (currentUser && (currentUser.displayName || currentUser.email.split('@')[0])) || 'usuario'; },
      _photo() { return (currentProfile && currentProfile.photo_url) || (currentUser && currentUser.photoURL) || null; },

      // Avisar que estoy en línea con la extensión (heartbeat).
      async heartbeat() {
        if (!sbExt || !currentUser) return;
        try {
          await sbExt.from('collab_presence').upsert({
            user_email: currentUser.email, username: this._username(), photo_url: this._photo(),
            status: 'online', last_seen: new Date().toISOString(),
          }, { onConflict: 'user_email' });
        } catch (e) {}
      },

      // Usuarios que tienen la extensión y están en línea (para invitar).
      async onlineUsers() {
        if (!sbExt) return [];
        const since = new Date(Date.now() - 60000).toISOString();
        const { data } = await sbExt.from('collab_presence').select('*')
          .gt('last_seen', since).order('last_seen', { ascending: false }).limit(100);
        return (data || []).filter((u) => u.user_email !== this._me());
      },

      // Crea un grupo nuevo (yo como dueño) para la carpeta indicada.
      async createGroup(name, folderName) {
        if (!sbExt || !currentUser) throw new Error('Iniciá sesión.');
        const code = Math.random().toString(36).slice(2, 8).toUpperCase();
        const { data, error } = await sbExt.from('collab_groups').insert({
          code, name: name || 'Proyecto en equipo', owner_email: currentUser.email,
          owner_username: this._username(), folder_name: folderName || name || 'proyecto', active: true,
        }).select().single();
        if (error) throw error;
        await sbExt.from('collab_members').upsert({
          group_id: data.id, user_email: currentUser.email, username: this._username(),
          role: 'owner', status: 'joined', last_seen: new Date().toISOString(),
        }, { onConflict: 'group_id,user_email' });
        return data;
      },

      // Invitar a un usuario al grupo.
      async invite(groupId, email, username) {
        if (!sbExt) return;
        await sbExt.from('collab_members').upsert({
          group_id: groupId, user_email: email, username: username || email.split('@')[0],
          role: 'member', status: 'invited',
        }, { onConflict: 'group_id,user_email' });
      },

      // Mis invitaciones pendientes (con datos del grupo).
      async myInvites() {
        if (!sbExt || !currentUser) return [];
        const { data: mem } = await sbExt.from('collab_members').select('*')
          .eq('user_email', currentUser.email).eq('status', 'invited');
        if (!mem || !mem.length) return [];
        const ids = mem.map((m) => m.group_id);
        const { data: groups } = await sbExt.from('collab_groups').select('*').in('id', ids).eq('active', true);
        const byId = {}; for (const g of (groups || [])) byId[g.id] = g;
        return mem.map((m) => ({ member: m, group: byId[m.group_id] })).filter((x) => x.group);
      },

      // Grupos donde ya soy miembro (unido).
      async myGroups() {
        if (!sbExt || !currentUser) return [];
        const { data: mem } = await sbExt.from('collab_members').select('*')
          .eq('user_email', currentUser.email).eq('status', 'joined');
        if (!mem || !mem.length) return [];
        const ids = mem.map((m) => m.group_id);
        const { data: groups } = await sbExt.from('collab_groups').select('*').in('id', ids).eq('active', true);
        const byId = {}; for (const m of mem) byId[m.group_id] = m;
        return (groups || []).map((g) => ({ group: g, role: byId[g.id] ? byId[g.id].role : 'member' }));
      },

      // Unirse a un grupo (por invitación o por código).
      async join(groupId) {
        if (!sbExt || !currentUser) return;
        await sbExt.from('collab_members').upsert({
          group_id: groupId, user_email: currentUser.email, username: this._username(),
          role: 'member', status: 'joined', last_seen: new Date().toISOString(),
        }, { onConflict: 'group_id,user_email' });
      },
      async groupByCode(code) {
        if (!sbExt) return null;
        const { data } = await sbExt.from('collab_groups').select('*')
          .eq('code', String(code || '').toUpperCase()).eq('active', true).maybeSingle();
        return data || null;
      },
      async decline(groupId) {
        if (!sbExt || !currentUser) return;
        await sbExt.from('collab_members').update({ status: 'declined' })
          .eq('group_id', groupId).eq('user_email', currentUser.email);
      },
      async leave(groupId) {
        if (!sbExt || !currentUser) return;
        await sbExt.from('collab_members').delete().eq('group_id', groupId).eq('user_email', currentUser.email);
        // Si el grupo se quedó SIN usuarios unidos, borrarlo (cascade borra archivos/miembros).
        try {
          const { count } = await sbExt.from('collab_members')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId).eq('status', 'joined');
          if (!count) await sbExt.from('collab_groups').delete().eq('id', groupId);
        } catch (e) {}
      },

      // Borra los grupos propios que hayan quedado vacíos (limpieza de huérfanos).
      async cleanupEmptyOwnedGroups() {
        if (!sbExt || !currentUser) return;
        try {
          const { data: groups } = await sbExt.from('collab_groups').select('id')
            .eq('owner_email', currentUser.email).eq('active', true);
          for (const g of (groups || [])) {
            const { count } = await sbExt.from('collab_members')
              .select('id', { count: 'exact', head: true })
              .eq('group_id', g.id).eq('status', 'joined');
            if (!count) await sbExt.from('collab_groups').delete().eq('id', g.id);
          }
        } catch (e) {}
      },

      // Miembros del grupo.
      async members(groupId) {
        if (!sbExt) return [];
        const { data } = await sbExt.from('collab_members').select('*')
          .eq('group_id', groupId).neq('status', 'declined').order('created_at', { ascending: true });
        return data || [];
      },

      // ----- Archivos compartidos -----
      // Sube/actualiza varios archivos de una (carga inicial del dueño).
      async uploadFiles(groupId, files) {
        if (!sbExt || !files.length) return;
        const rows = files.map((f) => ({
          group_id: groupId, path: f.path, is_dir: !!f.isDir,
          content: f.content || '', deleted: false,
          updated_by: this._me(), updated_at: new Date().toISOString(),
        }));
        // En lotes para no exceder límites de tamaño.
        for (let i = 0; i < rows.length; i += 40) {
          await sbExt.from('collab_files').upsert(rows.slice(i, i + 40), { onConflict: 'group_id,path' });
        }
      },
      // Lista los archivos vigentes (no borrados) del grupo.
      async listFiles(groupId) {
        if (!sbExt) return [];
        const { data } = await sbExt.from('collab_files').select('*')
          .eq('group_id', groupId).eq('deleted', false).limit(5000);
        return data || [];
      },
      // Inserta/actualiza un archivo (o lo marca borrado).
      async pushFile(groupId, path, content, isDir, deleted) {
        if (!sbExt) return;
        await sbExt.from('collab_files').upsert({
          group_id: groupId, path, is_dir: !!isDir,
          content: content || '', deleted: !!deleted,
          updated_by: this._me(), updated_at: new Date().toISOString(),
        }, { onConflict: 'group_id,path' });
      },

      // Suscripción en vivo: cambios de archivos/miembros (persistencia) + canales
      // EFÍMEROS broadcast (cursor/edit) y presence (quién tiene qué abierto).
      // h = { onFile, onMember, onCursor, onEdit, onPresence, initial }
      subscribe(groupId, h) {
        if (!sbExt) return null;
        h = h || {};
        const ch = sbExt.channel('collab:' + groupId, {
          config: { presence: { key: this._me() || 'anon' }, broadcast: { self: false } },
        })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'collab_files', filter: 'group_id=eq.' + groupId },
            (payload) => { try { h.onFile && h.onFile(payload.new || payload.old, payload); } catch (e) {} })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'collab_members', filter: 'group_id=eq.' + groupId },
            (payload) => { try { h.onMember && h.onMember(payload); } catch (e) {} })
          .on('broadcast', { event: 'cursor' }, (m) => { try { h.onCursor && h.onCursor(m.payload); } catch (e) {} })
          .on('broadcast', { event: 'edit' }, (m) => { try { h.onEdit && h.onEdit(m.payload); } catch (e) {} })
          .on('presence', { event: 'sync' }, () => { try { h.onPresence && h.onPresence(ch.presenceState()); } catch (e) {} })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED' && h.initial) { try { await ch.track(h.initial); } catch (e) {} }
          });
        return ch;
      },
      // Mandar un evento efímero (cursor/edit) por broadcast.
      send(ch, event, payload) { if (ch) { try { ch.send({ type: 'broadcast', event, payload }); } catch (e) {} } },
      // Actualizar mi estado de presencia (archivo abierto, color, etc.).
      track(ch, state) { if (ch) { try { ch.track(state); } catch (e) {} } },
      unsubscribe(ch) { if (sbExt && ch) { try { sbExt.removeChannel(ch); } catch (e) {} } },
    },
  };
})();
