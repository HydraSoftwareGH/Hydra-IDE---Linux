// =============================================================================
// web-api.js — Puente `window.api` para Hydra IDE en el NAVEGADOR.
//
// En la app de escritorio, `window.api` lo expone el preload de Electron
// (src/preload.js) y habla con el proceso main por IPC. En el navegador no hay
// proceso main, así que aquí reimplementamos ese mismo contrato con APIs web:
//
//   • Sistema de archivos  → File System Access API (lectura/escritura REAL al
//     disco, en tiempo real: cada guardado usa createWritable()+close()).
//   • Estado persistente   → localStorage
//   • Portapapeles         → navigator.clipboard
//   • Abrir externo        → window.open
//   • Login con Google     → Firebase signInWithPopup (mismo proyecto que la web)
//
// La TERMINAL sí funciona en el navegador: es una shell propia que opera sobre
// los archivos REALES abiertos con la File System Access API (ls/cd/cat/mkdir/
// touch/rm/mv/cp/echo>archivo/tree/grep/find…). No corre binarios (node/python/
// git) porque el sandbox del navegador no lo permite.
// El resto de funciones exclusivas de escritorio (git/python/Live Server/IA/
// actualizaciones) quedan como stubs seguros; su UI se oculta con web.css.
// La IA (Groq/Claude) se DESACTIVA a propósito en el navegador: sus claves
// viven en el proceso main y no deben viajar al cliente.
//
// IMPORTANTE: este archivo debe cargarse ANTES que renderer.js/auth.js,
// porque esos scripts asumen que `window.api` ya existe (y suscriben eventos
// como onAiChunk/onClaudeEvent en el nivel superior del módulo).
// =============================================================================
(function () {
  'use strict';

  // La versión la inyecta scripts/build-web-ide.js desde package.json.
  var VERSION = '__HYDRA_VERSION__';
  if (VERSION.indexOf('__HYDRA') === 0) VERSION = '0.0.0-web';

  // Bandera para que renderer.js sepa que corre en el navegador (y oculte lo
  // que no aplica: extensiones de IA, etc.). En Electron queda undefined.
  window.__HYDRA_WEB__ = true;

  var hasFS = typeof window.showDirectoryPicker === 'function';

  // Callbacks de eventos que DEBEN existir al cargar (renderer.js los engancha
  // en el nivel superior del módulo: onAiChunk/onAiStatus/onClaudeEvent/…).
  var aiChunkCb = null, aiStatusCb = null, luminChunkCb = null;
  var claudeEventCb = null, claudePermCb = null;
  var termDataCb = null, termExitCb = null; // salida y "exit" de la terminal web

  // --- marca del <body> para que web.css oculte lo exclusivo de escritorio ---
  function markBody() {
    try {
      document.body.classList.add('web-mode');
      if (!hasFS) document.body.classList.add('no-fsaccess');
    } catch (e) {}
  }
  if (document.body) markBody();
  else document.addEventListener('DOMContentLoaded', markBody);

  // ==========================================================================
  // Registro de rutas sintéticas <-> FileSystemHandle
  //
  // El renderer trata `path` como un identificador opaco y une segmentos con
  // '/' (decide el separador con `.includes('\\')`; como NUNCA emitimos
  // backslashes, todo queda en estilo POSIX y consistente). La raíz es
  // '/'+nombreCarpeta, p.ej. '/mi-proyecto', y los hijos '/mi-proyecto/src/a.js'.
  // ==========================================================================
  var rootHandle = null;   // FileSystemDirectoryHandle de la carpeta abierta
  var rootPath = null;     // ruta sintética de la raíz ('/nombre')
  var handles = new Map(); // rutaSintética -> FileSystemHandle (file|directory)
  var parents = new Map(); // rutaSintética -> { parent: DirHandle, name: string }

  var IGNORE = new Set(['node_modules', '.git', 'build', 'dist', '.cache']);
  var TEXT_MAX = 4 * 1024 * 1024; // no leemos como texto archivos > 4MB en la búsqueda

  function normalize(p) {
    return String(p == null ? '' : p).replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  }
  function basename(p) { return normalize(p).split('/').pop(); }
  function dirname(p) { return normalize(p).split('/').slice(0, -1).join('/') || '/'; }

  function reg(path, handle, parentHandle, name) {
    handles.set(path, handle);
    if (parentHandle) parents.set(path, { parent: parentHandle, name: name });
  }

  // Construye el árbol { name, path, type, children? } igual que readTree() del main.
  async function buildTree(dirHandle, dirPath) {
    var nodes = [];
    for await (var entry of dirHandle.entries()) {
      var name = entry[0], handle = entry[1];
      if (IGNORE.has(name)) continue;
      var childPath = (dirPath === '/' ? '' : dirPath) + '/' + name;
      reg(childPath, handle, dirHandle, name);
      if (handle.kind === 'directory') {
        nodes.push({ name: name, path: childPath, type: 'dir', children: await buildTree(handle, childPath) });
      } else {
        nodes.push({ name: name, path: childPath, type: 'file' });
      }
    }
    // Carpetas primero, luego alfabético (misma regla que el main).
    nodes.sort(function (a, b) {
      return a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1);
    });
    return nodes;
  }

  // Navega desde la raíz hasta `p` cuando no está (o dejó de estar) en el mapa.
  async function walkTo(p, opts) {
    p = normalize(p);
    opts = opts || {};
    if (handles.has(p)) return handles.get(p);
    if (!rootHandle || !rootPath) return null;
    if (p === rootPath) return rootHandle;
    if (p.indexOf(rootPath + '/') !== 0) return null;
    var rel = p.slice(rootPath.length).replace(/^\//, '');
    if (!rel) return rootHandle;
    var parts = rel.split('/');
    var cur = rootHandle, parent = null, accum = rootPath;
    for (var i = 0; i < parts.length; i++) {
      var name = parts[i];
      var last = i === parts.length - 1;
      parent = cur;
      accum += '/' + name;
      try {
        if (last && opts.kind === 'file') cur = await cur.getFileHandle(name, { create: !!opts.create });
        else if (last && opts.kind === 'dir') cur = await cur.getDirectoryHandle(name, { create: !!opts.create });
        else cur = await cur.getDirectoryHandle(name, { create: false });
      } catch (e) { return null; }
      reg(accum, cur, parent, name);
    }
    return cur;
  }

  async function getFileHandleFor(p, create) {
    p = normalize(p);
    var h = handles.get(p);
    if (h && h.kind === 'file') return h;
    return await walkTo(p, { kind: 'file', create: !!create });
  }
  async function getDirHandleFor(p, create) {
    p = normalize(p);
    var h = handles.get(p);
    if (h && h.kind === 'directory') return h;
    return await walkTo(p, { kind: 'dir', create: !!create });
  }
  async function getParentHandle(p) {
    var info = parents.get(normalize(p));
    if (info && info.parent) return info.parent;
    return await getDirHandleFor(dirname(p), false);
  }

  async function writeToHandle(fileHandle, data) {
    var w = await fileHandle.createWritable();
    await w.write(data);
    await w.close(); // <-- vuelca al archivo real del disco de inmediato
  }
  async function copyDir(src, dst) {
    for await (var entry of src.entries()) {
      var name = entry[0], handle = entry[1];
      if (handle.kind === 'file') {
        var f = await handle.getFile();
        var nh = await dst.getFileHandle(name, { create: true });
        await writeToHandle(nh, await f.arrayBuffer());
      } else {
        var nd = await dst.getDirectoryHandle(name, { create: true });
        await copyDir(handle, nd);
      }
    }
  }

  var MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
    ico: 'image/x-icon', avif: 'image/avif',
  };

  // ==========================================================================
  // Operaciones de archivos (contrato idéntico al preload de Electron)
  // ==========================================================================
  async function openFolder() {
    if (!hasFS) { showUnsupported(); return null; }
    var dir;
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (e) { return null; } // el usuario canceló el diálogo
    // Pedimos permiso de escritura de una para que los guardados sean directos.
    try { if (dir.requestPermission) await dir.requestPermission({ mode: 'readwrite' }); } catch (e) {}
    rootHandle = dir;
    rootPath = '/' + dir.name;
    handles.clear(); parents.clear();
    reg(rootPath, dir, null, dir.name);
    var tree = await buildTree(dir, rootPath);
    return { root: rootPath, tree: tree };
  }

  async function tree(rootDir) {
    var dh = await getDirHandleFor(rootDir, false) || rootHandle;
    if (!dh) return [];
    return await buildTree(dh, normalize(rootDir));
  }

  async function readFile(filePath) {
    var h = await getFileHandleFor(filePath, false);
    if (!h) throw new Error('No existe el archivo: ' + filePath);
    var f = await h.getFile();
    return await f.text();
  }

  async function readImage(filePath) {
    var h = await getFileHandleFor(filePath, false);
    if (!h) throw new Error('No existe la imagen: ' + filePath);
    var f = await h.getFile();
    var ext = basename(filePath).split('.').pop().toLowerCase();
    var mime = MIME[ext] || f.type || 'application/octet-stream';
    var buf = await f.arrayBuffer();
    var bytes = new Uint8Array(buf), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:' + mime + ';base64,' + btoa(bin);
  }

  async function saveFile(filePath, content) {
    var h = await getFileHandleFor(filePath, true);
    if (!h) throw new Error('No se pudo guardar: ' + filePath);
    await writeToHandle(h, content);
    try { liveScheduleReload(); } catch (e) {} // recarga la vista previa "Go Live" si está activa
    return true;
  }

  async function createFile(dirPath, name) {
    var d = await getDirHandleFor(dirPath, false);
    if (!d) throw new Error('No existe la carpeta: ' + dirPath);
    var fh = await d.getFileHandle(name, { create: true });
    var p = normalize(dirPath) + '/' + name;
    reg(p, fh, d, name);
    return p;
  }

  async function createFolder(dirPath, name) {
    var d = await getDirHandleFor(dirPath, false);
    if (!d) throw new Error('No existe la carpeta: ' + dirPath);
    var dh = await d.getDirectoryHandle(name, { create: true });
    var p = normalize(dirPath) + '/' + name;
    reg(p, dh, d, name);
    return p;
  }

  // La File System Access API no tiene "rename": copiamos y borramos el original.
  async function rename(oldPath, newName) {
    oldPath = normalize(oldPath);
    var h = handles.get(oldPath) || await walkTo(oldPath, {});
    var parent = await getParentHandle(oldPath);
    var oldName = basename(oldPath);
    if (!h || !parent) throw new Error('No se pudo renombrar: ' + oldPath);
    var newPath = dirname(oldPath) + '/' + newName;
    if (h.kind === 'file') {
      var f = await h.getFile();
      var nh = await parent.getFileHandle(newName, { create: true });
      await writeToHandle(nh, await f.arrayBuffer());
      await parent.removeEntry(oldName);
      reg(newPath, nh, parent, newName);
    } else {
      var nd = await parent.getDirectoryHandle(newName, { create: true });
      await copyDir(h, nd);
      await parent.removeEntry(oldName, { recursive: true });
      reg(newPath, nd, parent, newName);
    }
    handles.delete(oldPath); parents.delete(oldPath);
    return newPath;
  }

  async function del(targetPath) {
    targetPath = normalize(targetPath);
    var parent = await getParentHandle(targetPath);
    if (!parent) throw new Error('No se pudo borrar: ' + targetPath);
    await parent.removeEntry(basename(targetPath), { recursive: true });
    handles.delete(targetPath); parents.delete(targetPath);
    return true;
  }

  async function exists(p) {
    p = normalize(p);
    if (handles.has(p)) return true;
    return !!(await walkTo(p, {}));
  }

  // Búsqueda de texto: recorre la carpeta y devuelve { file, line, text }
  // (mismo shape que searchFallbackJS del main).
  async function search(rootDir, query) {
    var q = String(query || '').toLowerCase();
    if (!q) return [];
    var dh = await getDirHandleFor(rootDir, false) || rootHandle;
    if (!dh) return [];
    var out = [];
    async function walk(dir, dirPath) {
      for await (var entry of dir.entries()) {
        if (out.length >= 1000) return;
        var name = entry[0], handle = entry[1];
        if (IGNORE.has(name)) continue;
        var childPath = (dirPath === '/' ? '' : dirPath) + '/' + name;
        if (handle.kind === 'directory') { await walk(handle, childPath); continue; }
        var text = '';
        try {
          var f = await handle.getFile();
          if (f.size > TEXT_MAX) continue;
          text = await f.text();
        } catch (e) { continue; }
        var lines = text.split('\n');
        for (var i = 0; i < lines.length && out.length < 1000; i++) {
          if (lines[i].toLowerCase().indexOf(q) !== -1) {
            out.push({ file: childPath, line: i + 1, text: lines[i].slice(0, 300) });
          }
        }
      }
    }
    await walk(dh, normalize(rootDir));
    return out;
  }

  // ==========================================================================
  // Estado persistente (localStorage). Quitamos lastFolder/terminalOpen porque
  // en el navegador no podemos reabrir la carpeta ni la terminal sin un gesto.
  // ==========================================================================
  var STATE_KEY = 'hydra-ide-web-state';
  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function getState() {
    var st = readState();
    delete st.lastFolder;
    delete st.terminalOpen;
    return st;
  }
  function setState(patch) {
    try {
      var st = readState();
      Object.assign(st, patch || {});
      localStorage.setItem(STATE_KEY, JSON.stringify(st));
    } catch (e) {}
    return true;
  }

  // ==========================================================================
  // Login con Google (Firebase popup). El renderer/auth.js llama a
  // externalGoogleLogin() y luego espera la credencial vía onAuthCredential.
  // Reproducimos ese contrato: hacemos el popup y devolvemos la credencial.
  // ==========================================================================
  var authCredCb = null;
  function onAuthCredential(cb) { authCredCb = cb; }
  async function externalGoogleLogin() {
    if (!(window.firebase && window.firebase.auth)) throw new Error('Firebase no está disponible.');
    var provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    var result = await window.firebase.auth().signInWithPopup(provider);
    // Alimentamos el callback tal como lo haría el callback local del escritorio,
    // para que auth.js resuelva su signInWithGoogle() pendiente.
    try {
      var cred = result && result.credential;
      if (cred && authCredCb) authCredCb({ idToken: cred.idToken || null, accessToken: cred.accessToken || null });
    } catch (e) {}
    return true;
  }

  // ==========================================================================
  // Portapapeles / ventana / externo / versión
  // ==========================================================================
  function clipboardWrite(text) {
    try { if (navigator.clipboard) navigator.clipboard.writeText(String(text)); } catch (e) {}
    return true;
  }
  function clipboardRead() { return ''; } // firma síncrona; la usa el "pegar" de la terminal

  function noop() { return true; }
  function openExternal(url) { try { window.open(url, '_blank', 'noopener'); } catch (e) {} return true; }
  function openPath() { return false; } // no se puede abrir una ruta del SO desde el navegador

  // Overlay para navegadores sin File System Access API.
  var unsupportedShown = false;
  function showUnsupported() {
    if (unsupportedShown) return;
    unsupportedShown = true;
    try {
      var host = document.createElement('div');
      host.id = 'web-unsupported';
      host.innerHTML =
        '<div class="wu-box">' +
        '<img src="hydra-logo.svg" class="wu-logo" alt="Hydra IDE" />' +
        '<h2>Tu navegador no soporta acceso a carpetas</h2>' +
        '<p>Hydra IDE en el navegador necesita la <b>File System Access API</b> ' +
        'para abrir y guardar archivos en tu disco. Está disponible en ' +
        '<b>Google Chrome</b>, <b>Microsoft Edge</b> u <b>Opera</b>.</p>' +
        '<p>También podés usar la app de escritorio para la experiencia completa.</p>' +
        '<div class="wu-actions">' +
        '<a class="wu-btn" href="/" target="_blank" rel="noopener">Descargar la app</a>' +
        '<button class="wu-btn ghost" id="wu-dismiss">Explorar igual</button>' +
        '</div></div>';
      document.body.appendChild(host);
      var b = document.getElementById('wu-dismiss');
      if (b) b.addEventListener('click', function () { host.remove(); });
    } catch (e) {}
  }
  // Si no hay soporte, avisamos apenas cargue el DOM.
  if (!hasFS) {
    if (document.readyState !== 'loading') showUnsupported();
    else document.addEventListener('DOMContentLoaded', showUnsupported);
  }

  // ==========================================================================
  // Terminal del navegador — una shell propia sobre la File System Access API.
  //
  // En Electron la terminal es un PTY real (node-pty). En el navegador no hay
  // proceso ni shell del SO, así que la emulamos: leemos cada tecla cruda que
  // manda xterm (termInput), hacemos el eco / la edición de línea / el historial
  // nosotros, y ejecutamos comandos que operan sobre los archivos REALES abiertos
  // (reutilizando los helpers de arriba: getDirHandleFor, buildTree, readFile…).
  //   Comandos: help, clear, pwd, ls/dir, cd, cat/type, echo (con > y >>),
  //   mkdir, touch, rm/del, mv, cp, tree, find, grep, head, tail, wc, date,
  //   whoami, history.
  // ==========================================================================
  var termOn = false;      // la shell arrancó
  var termCwd = null;      // ruta sintética del directorio actual ('/proyecto/src')
  var tLine = '';          // línea que se está editando
  var tCur = 0;            // posición del cursor dentro de tLine
  var tHist = [];          // historial de comandos
  var tHistIx = -1;        // índice de navegación (-1 = línea nueva en curso)
  var tSaved = '';         // línea en curso, guardada al empezar a navegar el historial
  var tQueue = '';         // entrada cruda pendiente (mientras corre un comando)
  var tBusy = false;       // hay un comando ejecutándose

  function tw(s) { if (termDataCb) { try { termDataCb(s); } catch (e) {} } }

  // Etiqueta del prompt: nombre de la carpeta raíz + subruta, en verde.
  function tPromptStr() {
    var label;
    if (rootPath && termCwd && termCwd.indexOf(rootPath) === 0) {
      label = rootPath.slice(1) + termCwd.slice(rootPath.length);
    } else {
      label = String(termCwd || '/').replace(/^\//, '') || '/';
    }
    return '\x1b[38;5;79m' + label + '\x1b[0m\x1b[38;5;245m $\x1b[0m ';
  }
  // Redibuja la línea actual (prompt + texto) y recoloca el cursor.
  function tRender() {
    tw('\r\x1b[2K' + tPromptStr() + tLine);
    var back = tLine.length - tCur;
    if (back > 0) tw('\x1b[' + back + 'D');
  }

  // Resuelve un argumento de ruta contra el cwd (soporta /abs, rel, ~, . y ..).
  function tResolve(arg) {
    if (!arg || arg === '.') return termCwd;
    arg = String(arg).replace(/\\/g, '/');
    if (arg === '~') return rootPath || '/';
    if (arg.charAt(0) === '~') arg = (rootPath || '') + arg.slice(1);
    var base = arg.charAt(0) === '/' ? arg : (termCwd + '/' + arg);
    var parts = base.split('/'), st = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === '' || p === '.') continue;
      if (p === '..') { st.pop(); continue; }
      st.push(p);
    }
    return '/' + st.join('/');
  }

  // Divide una línea en argumentos respetando comillas simples/dobles.
  function tArgv(s) {
    var out = [], cur = '', q = null, had = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { if (c === q) q = null; else cur += c; had = true; }
      else if (c === '"' || c === "'") { q = c; had = true; }
      else if (c === ' ' || c === '\t') { if (had) { out.push(cur); cur = ''; had = false; } }
      else { cur += c; had = true; }
    }
    if (had) out.push(cur);
    return out;
  }

  // Lista un nivel de un directorio: { dirs:[], files:[] } ordenados.
  async function tList(path) {
    var dh = await getDirHandleFor(path, false);
    if (!dh) return null;
    var dirs = [], files = [];
    for await (var entry of dh.entries()) {
      if (entry[1].kind === 'directory') dirs.push(entry[0]);
      else files.push(entry[0]);
    }
    var byName = function (a, b) { return a.localeCompare(b); };
    dirs.sort(byName); files.sort(byName);
    return { dirs: dirs, files: files };
  }

  // Construye el árbol ASCII de un directorio.
  async function tTree(path, prefix, out) {
    var l = await tList(path);
    if (!l) return;
    var all = l.dirs.map(function (n) { return { n: n, d: true }; })
      .concat(l.files.map(function (n) { return { n: n, d: false }; }));
    for (var i = 0; i < all.length; i++) {
      var last = i === all.length - 1;
      var name = all[i].d ? '\x1b[38;5;75m' + all[i].n + '\x1b[0m' : all[i].n;
      out.push(prefix + (last ? '└─ ' : '├─ ') + name);
      if (all[i].d) await tTree(path + '/' + all[i].n, prefix + (last ? '   ' : '│  '), out);
    }
  }

  // Mueve (move=true) o copia (move=false) un archivo o carpeta.
  async function tMove(src, dst, move) {
    var srcDir = await getDirHandleFor(src, false);
    var srcFile = srcDir ? null : await getFileHandleFor(src, false);
    // Si el destino es una carpeta existente, metemos el origen dentro con su nombre.
    var dstIsDir = await getDirHandleFor(dst, false);
    var target = dstIsDir ? (dst + '/' + basename(src)) : dst;
    if (srcFile) {
      var buf = await (await srcFile.getFile()).arrayBuffer();
      var nh = await getFileHandleFor(target, true);
      if (!nh) throw new Error('No se pudo escribir el destino: ' + target);
      await writeToHandle(nh, buf);
      if (move) await del(src);
    } else if (srcDir) {
      var nd = await getDirHandleFor(target, true);
      if (!nd) throw new Error('No se pudo crear el destino: ' + target);
      await copyDir(srcDir, nd);
      if (move) await del(src);
    } else {
      throw new Error('No existe: ' + src);
    }
  }

  var C = { h: '\x1b[38;5;222m', d: '\x1b[38;5;245m', z: '\x1b[0m' }; // colores de la ayuda
  var TERM_HELP =
    C.h + 'Archivos\x1b[0m\r\n' +
    '  ls|dir [ruta]   cd [ruta]   pwd   tree [ruta]\r\n' +
    '  cat|type <a>    head|tail [-n N] <a>   nl <a>   wc [-l|-w|-c] <a>\r\n' +
    '  sort [-r] <a>   uniq <a>    rev <a>   tac <a>   stat <a>   du [ruta]\r\n' +
    '  mkdir [-p] <n>  touch <n>   rm [-r] <ruta>   mv <o> <d>   cp [-r] <o> <d>\r\n' +
    '  echo <txt> [> archivo | >> archivo]        basename <r>   dirname <r>\r\n' +
    C.h + 'Buscar\x1b[0m\r\n' +
    '  find <texto>    grep <texto>\r\n' +
    C.h + 'Editor / red\x1b[0m\r\n' +
    '  code|open|edit <archivo>   abre el archivo en el editor\r\n' +
    '  curl [-I] <url>            hace una petición HTTP (según CORS)\r\n' +
    C.h + 'Ejecutar código\x1b[0m\r\n' +
    '  run <archivo> [args]       ejecuta y muestra la salida (autodetecta lenguaje)\r\n' +
    C.d + '  Python y JavaScript corren EN EL NAVEGADOR (sin instalar nada).\x1b[0m\r\n' +
    '  python <a.py>   node <a.js>   ejecutan directo (Python = Pyodide/WASM)\r\n' +
    '  pip install <pkg>          instala paquetes de Python (numpy, requests…)\r\n' +
    C.d + '  Paquetes JS: hacé  import x from "pkg"  y se carga solo desde esm.sh.\x1b[0m\r\n' +
    '  go|java|c++|rust|… <a>     otros lenguajes vía Piston (piston url/token)\r\n' +
    '  piston list | url | token  lista lenguajes / configura Piston\r\n' +
    C.h + 'npm (gestiona package.json — no descarga en el navegador)\x1b[0m\r\n' +
    '  npm init [-y]   npm install [pkg]   npm uninstall <pkg>   npm run [script]   npm list\r\n' +
    C.h + 'Sistema\x1b[0m\r\n' +
    '  clear|cls   date   whoami   hostname   uname [-a]   env   which <cmd>   history [-c]\r\n' +
    C.d + '  git/pip no corren (Piston ejecuta archivos, no maneja repos/paquetes).\x1b[0m\r\n';

  // Lista de comandos conocidos (para `which` y referencia).
  var TERM_CMDS = ('help clear cls pwd ls dir cd cat type echo mkdir md touch new rm del rmdir ' +
    'mv move ren cp copy tree find grep head tail nl wc sort uniq rev tac stat du basename dirname ' +
    'date whoami hostname uname env which history code open edit curl npm run piston ' +
    'node python python3 py ruby php bash sh go java rustc deno bun perl lua rscript julia scala ' +
    'kotlin swift dart groovy git pip').split(' ');

  // Tamaño legible (B/KB/MB/GB).
  function tHuman(n) {
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + u[i];
  }
  // Devuelve los argumentos que no son flags (no empiezan con '-').
  function tNonFlags(argv) { return argv.filter(function (x) { return x.charAt(0) !== '-'; }); }

  // Resuelve la última versión de un paquete desde el registro de npm (tiene CORS).
  async function tNpmVersion(name) {
    try {
      var r = await fetch('https://registry.npmjs.org/' + encodeURIComponent(name).replace('%40', '@') + '/latest');
      if (r.ok) { var j = await r.json(); if (j && j.version) return j.version; }
    } catch (e) {}
    return 'latest';
  }

  // npm "web": administra package.json (init/install/uninstall/run/list). No baja archivos.
  async function tNpm(argv) {
    var sub = (argv[0] || '').toLowerCase();
    // Sin carpeta abierta no hay dónde leer/crear package.json.
    if (!rootHandle && sub !== '-v' && sub !== '--version' && sub !== 'version' && sub !== 'help' && sub !== '-h' && sub !== '') {
      tw('\x1b[33mAbrí una carpeta primero (Archivo → Abrir carpeta) para usar npm.\x1b[0m\r\n'); return;
    }
    var pkgPath = termCwd + '/package.json';
    async function readPkg() { try { return JSON.parse(await readFile(pkgPath)); } catch (e) { return null; } }
    async function writePkg(o) { await saveFile(pkgPath, JSON.stringify(o, null, 2) + '\n'); }

    if (sub === '-v' || sub === '--version' || sub === 'version') { tw('npm-web 10.0.0 (Hydra IDE)\r\n'); return; }
    if (!sub || sub === 'help' || sub === '-h') {
      tw('npm (versión web · administra package.json, no descarga node_modules):\r\n' +
         '  npm init [-y]            crea package.json\r\n' +
         '  npm install [pkg…] [-D]  agrega dependencias (resuelve la versión del registro)\r\n' +
         '  npm uninstall <pkg…>     quita dependencias\r\n' +
         '  npm run [script]         lista o muestra los scripts\r\n' +
         '  npm list                 muestra las dependencias\r\n');
      return;
    }
    if (sub === 'init') {
      var ex = await readPkg();
      if (ex && argv.indexOf('-y') === -1 && argv.indexOf('--yes') === -1) {
        tw('\x1b[33mYa existe package.json. Usá "npm init -y" para sobrescribirlo.\x1b[0m\r\n'); return;
      }
      var nm = (basename(termCwd) || 'app').toLowerCase().replace(/[^a-z0-9._-]/g, '-') || 'app';
      await writePkg({ name: nm, version: '1.0.0', description: '', main: 'index.js',
        scripts: { test: 'echo "Error: no test specified" && exit 1' }, keywords: [], author: '', license: 'ISC' });
      tw('\x1b[32m✓\x1b[0m package.json creado en ' + pkgPath + '\r\n');
      return;
    }
    if (sub === 'install' || sub === 'i' || sub === 'in' || sub === 'add') {
      var pkg = await readPkg();
      if (!pkg) { tw('\x1b[31mNo hay package.json. Corré "npm init -y" primero.\x1b[0m\r\n'); return; }
      var names = tNonFlags(argv.slice(1));
      var dev = argv.indexOf('-D') !== -1 || argv.indexOf('--save-dev') !== -1;
      if (!names.length) {
        var all = Object.assign({}, pkg.dependencies, pkg.devDependencies), ks = Object.keys(all);
        tw(ks.length ? ks.map(function (k) { return '  ' + k + '@' + all[k]; }).join('\r\n') + '\r\n' : 'No hay dependencias.\r\n');
        tw('\x1b[38;5;245m(el navegador no puede bajar node_modules — usá la app para instalar de verdad)\x1b[0m\r\n');
        return;
      }
      var field = dev ? 'devDependencies' : 'dependencies';
      pkg[field] = pkg[field] || {};
      for (var i = 0; i < names.length; i++) {
        var spec = names[i], nm2 = spec, ver = null, at = spec.lastIndexOf('@');
        if (at > 0) { nm2 = spec.slice(0, at); ver = spec.slice(at + 1); }
        if (!ver) ver = await tNpmVersion(nm2);
        pkg[field][nm2] = (/^\d/.test(ver) ? '^' : '') + ver;
        tw('\x1b[32m+\x1b[0m ' + nm2 + '@' + ver + (dev ? ' \x1b[38;5;245m(dev)\x1b[0m' : '') + '\r\n');
      }
      await writePkg(pkg);
      tw('\x1b[38;5;245mpackage.json actualizado. En el navegador NO hay node_modules: al ejecutar JS, los import se cargan al vuelo desde esm.sh.\x1b[0m\r\n' +
         '\x1b[38;5;245mEj: escribí  import _ from "lodash"  y corré el archivo con  run.  (vite u otros dev servers necesitan la app de escritorio.)\x1b[0m\r\n');
      return;
    }
    if (sub === 'uninstall' || sub === 'remove' || sub === 'rm' || sub === 'un') {
      var pkg2 = await readPkg();
      if (!pkg2) { tw('\x1b[31mNo hay package.json.\x1b[0m\r\n'); return; }
      var rn = tNonFlags(argv.slice(1)), removed = 0;
      rn.forEach(function (nm) {
        ['dependencies', 'devDependencies'].forEach(function (f) {
          if (pkg2[f] && pkg2[f][nm] != null) { delete pkg2[f][nm]; removed++; tw('\x1b[31m-\x1b[0m ' + nm + '\r\n'); }
        });
      });
      await writePkg(pkg2);
      if (!removed) tw('Nada que quitar.\r\n');
      return;
    }
    if (sub === 'run' || sub === 'run-script' || sub === 'start' || sub === 'test') {
      var pkg3 = await readPkg();
      if (!pkg3) { tw('\x1b[31mNo hay package.json.\x1b[0m\r\n'); return; }
      var scripts = pkg3.scripts || {};
      var sn = (sub === 'run' || sub === 'run-script') ? argv[1] : sub;
      if (!sn) {
        var sk = Object.keys(scripts);
        tw(sk.length ? ('Scripts disponibles:\r\n' + sk.map(function (k) { return '  \x1b[38;5;222m' + k + '\x1b[0m — ' + scripts[k]; }).join('\r\n') + '\r\n') : 'No hay scripts.\r\n');
        return;
      }
      if (!scripts[sn]) { tw('\x1b[31mNo existe el script "' + sn + '".\x1b[0m\r\n'); return; }
      tw('> ' + scripts[sn] + '\r\n');
      await tRunScript(scripts[sn]);
      return;
    }
    if (sub === 'list' || sub === 'ls' || sub === 'll') {
      var pkg4 = await readPkg();
      if (!pkg4) { tw('\x1b[31mNo hay package.json.\x1b[0m\r\n'); return; }
      var deps = Object.assign({}, pkg4.dependencies, pkg4.devDependencies), dk = Object.keys(deps);
      tw((pkg4.name || 'proyecto') + '@' + (pkg4.version || '0.0.0') + '\r\n');
      tw(dk.length ? dk.map(function (k, i) { return (i === dk.length - 1 ? '└── ' : '├── ') + k + '@' + deps[k]; }).join('\r\n') + '\r\n' : '(sin dependencias)\r\n');
      return;
    }
    tw('\x1b[31mnpm: "' + sub + '" no está en la versión web.\x1b[0m Probá: init, install, uninstall, run, list.\r\n');
  }

  // curl: petición HTTP real (limitada por CORS del navegador).
  async function tCurl(argv) {
    var head = false, url = null;
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      if (a === '-I' || a === '--head') head = true;
      else if (a.charAt(0) === '-') { /* ignorar otros flags comunes (-s, -L…) */ }
      else if (!url) url = a;
    }
    if (!url) { tw('uso: curl [-I] <url>\r\n'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      var res = await fetch(url, { method: head ? 'HEAD' : 'GET' });
      tw('\x1b[38;5;245mHTTP ' + res.status + ' ' + res.statusText + '\x1b[0m\r\n');
      if (head) { res.headers.forEach(function (v, k) { tw(k + ': ' + v + '\r\n'); }); return; }
      var text = await res.text();
      if (text.length > 20000) text = text.slice(0, 20000) + '\r\n\x1b[38;5;245m…(truncado)\x1b[0m';
      tw(text.replace(/\r?\n/g, '\r\n') + '\r\n');
    } catch (e) {
      tw('\x1b[31mcurl: falló (' + (e && e.message ? e.message : e) + ').\x1b[0m ' +
         'El navegador bloquea peticiones sin CORS a otros dominios.\r\n');
    }
  }

  // ==========================================================================
  // Ejecución de código con la API de Piston (engineer-man/piston).
  //
  // Piston ejecuta archivos sueltos en ~80 lenguajes vía un endpoint /execute.
  // La instancia pública emkc.org quedó WHITELIST-ONLY (15/02/2026): /runtimes
  // sigue abierto, pero /execute exige token o self-host. Por eso la URL y el
  // token son configurables (comando `piston url` / `piston token`); por defecto
  // apuntamos a emkc.org. Doc de la API: https://github.com/engineer-man/piston
  // ==========================================================================
  var PISTON_DEFAULT_URL = 'https://emkc.org/api/v2/piston';
  // Extensión → lenguaje de Piston (nombres exactos según /runtimes).
  var PISTON_EXT = {
    py: 'python', pyw: 'python', py3: 'python', js: 'javascript', mjs: 'javascript',
    cjs: 'javascript', ts: 'typescript', c: 'c', h: 'c', cpp: 'c++', cc: 'c++',
    cxx: 'c++', hpp: 'c++', cs: 'csharp', java: 'java', go: 'go', rs: 'rust',
    rb: 'ruby', php: 'php', sh: 'bash', bash: 'bash', ps1: 'powershell',
    swift: 'swift', kt: 'kotlin', kts: 'kotlin', dart: 'dart', lua: 'lua',
    pl: 'perl', pm: 'perl', r: 'rscript', jl: 'julia', ex: 'elixir', exs: 'elixir',
    erl: 'erlang', clj: 'clojure', cljs: 'clojure', scala: 'scala', sc: 'scala',
    hs: 'haskell', cr: 'crystal', nim: 'nim', zig: 'zig', cob: 'cobol',
    f90: 'fortran', f95: 'fortran', pas: 'pascal', groovy: 'groovy', d: 'd',
    lisp: 'lisp', rkt: 'racket', ml: 'ocaml', cbl: 'cobol', bas: 'basic',
    coffee: 'coffeescript', ex2: 'elixir',
  };
  // Comando (node/python/…) → lenguaje de Piston.
  var PISTON_CMD = {
    python: 'python', python3: 'python', py: 'python', python2: 'python2',
    node: 'javascript', nodejs: 'javascript', js: 'javascript', deno: 'typescript',
    bun: 'javascript', 'ts-node': 'typescript', tsc: 'typescript', ruby: 'ruby',
    php: 'php', bash: 'bash', sh: 'bash', perl: 'perl', lua: 'lua',
    rscript: 'rscript', julia: 'julia', scala: 'scala', groovy: 'groovy',
    swift: 'swift', kotlin: 'kotlin', dart: 'dart', java: 'java', go: 'go',
    rustc: 'rust',
  };

  function pistonState() { try { return JSON.parse(localStorage.getItem('hydra-piston') || '{}') || {}; } catch (e) { return {}; } }
  function pistonSave(patch) { try { var s = pistonState(); Object.assign(s, patch); localStorage.setItem('hydra-piston', JSON.stringify(s)); } catch (e) {} }
  function pistonBase() { return String(pistonState().url || PISTON_DEFAULT_URL).replace(/\/+$/, ''); }
  function pistonAuthHeader() { var t = pistonState().token || ''; return t ? (/^bearer\s/i.test(t) ? t : 'Bearer ' + t) : ''; }

  var pistonRuntimesCache = null;
  async function pistonRuntimes() {
    if (pistonRuntimesCache) return pistonRuntimesCache;
    var headers = {}, tok = pistonAuthHeader(); if (tok) headers.Authorization = tok;
    try { var res = await fetch(pistonBase() + '/runtimes', { headers: headers }); if (res.ok) pistonRuntimesCache = await res.json(); } catch (e) {}
    return pistonRuntimesCache || [];
  }
  // Versión exacta del lenguaje (desde /runtimes), o '*' si no se pudo resolver.
  async function pistonVersion(lang) {
    var rs = await pistonRuntimes();
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].language === lang || (rs[i].aliases && rs[i].aliases.indexOf(lang) !== -1)) return rs[i].version;
    }
    return '*';
  }

  var PISTON_HINT = '\x1b[38;5;245mLa API pública emkc.org es whitelist-only desde 15/02/2026. Self-hosteá Piston (Docker) y usá "piston url <tu-url>", o definí "piston token <token>".\x1b[0m\r\n';

  // Ejecuta files en Piston e imprime stdout/stderr (y compilación si aplica).
  async function pistonRun(lang, files, args, stdin) {
    if (!lang) { tw('\x1b[31mNo sé con qué lenguaje ejecutar.\x1b[0m Probá: piston run <lenguaje> <archivo>\r\n'); return; }
    var ver = await pistonVersion(lang);
    tw('\x1b[38;5;245m▶ Piston · ' + lang + (ver && ver !== '*' ? ' ' + ver : '') + '\x1b[0m\r\n');
    var headers = { 'Content-Type': 'application/json' }, tok = pistonAuthHeader(); if (tok) headers.Authorization = tok;
    var body = { language: lang, version: ver || '*', files: files, args: args || [], stdin: stdin || '' };
    var res;
    try { res = await fetch(pistonBase() + '/execute', { method: 'POST', headers: headers, body: JSON.stringify(body) }); }
    catch (e) { tw('\x1b[31mNo se pudo contactar a Piston (' + (e && e.message ? e.message : e) + ').\x1b[0m\r\n' + PISTON_HINT); return; }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (res.status === 401 || res.status === 403) {
      tw('\x1b[31mPiston rechazó la petición (' + res.status + ')' + (j && j.message ? ': ' + j.message : '') + '\x1b[0m\r\n' + PISTON_HINT); return;
    }
    if (!res.ok) { tw('\x1b[31mPiston ' + res.status + (j && j.message ? ': ' + j.message : '') + '\x1b[0m\r\n'); return; }
    if (!j) { tw('\x1b[31mRespuesta inválida de Piston.\x1b[0m\r\n'); return; }
    if (j.compile && j.compile.stderr) tw('\x1b[38;5;245m[compilación]\x1b[0m\r\n' + j.compile.stderr.replace(/\r?\n/g, '\r\n'));
    var run = j.run || {};
    if (run.stdout) tw(run.stdout.replace(/\r?\n/g, '\r\n'));
    if (run.stderr) tw('\x1b[31m' + run.stderr.replace(/\r?\n/g, '\r\n') + '\x1b[0m');
    if (!run.stdout && !run.stderr) tw('\x1b[38;5;245m(sin salida)\x1b[0m\r\n');
    else if (!/\n$/.test(run.stdout || run.stderr || '')) tw('\r\n');
    if (run.code != null && run.code !== 0) tw('\x1b[38;5;245m[código ' + run.code + (run.signal ? ', señal ' + run.signal : '') + ']\x1b[0m\r\n');
  }

  // ==========================================================================
  // Runtimes que corren 100% EN EL NAVEGADOR (sin servidor, ideal para tablets):
  //   · Python  → Pyodide (CPython real en WebAssembly, con input()/stdlib).
  //   · JavaScript → Web Worker aislado (console.*, process.argv, timeout).
  // Los demás lenguajes usan Piston (si está configurado). Ver tRun().
  // ==========================================================================
  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var ex = document.querySelector('script[data-hydra-src="' + src + '"]');
      if (ex) {
        if (ex.getAttribute('data-loaded')) return resolve();
        ex.addEventListener('load', function () { resolve(); });
        ex.addEventListener('error', function () { reject(new Error('No se pudo cargar ' + src)); });
        return;
      }
      var s = document.createElement('script');
      s.src = src; s.async = true; s.setAttribute('data-hydra-src', src);
      s.onload = function () { s.setAttribute('data-loaded', '1'); resolve(); };
      s.onerror = function () { reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  // --- Python (Pyodide) ------------------------------------------------------
  var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
  var pyodideReady = null, pyBooted = false;
  function getPyodide() {
    if (!pyodideReady) {
      pyodideReady = (async function () {
        await loadScriptOnce(PYODIDE_URL + 'pyodide.js');
        return await window.loadPyodide({ indexURL: PYODIDE_URL });
      })();
    }
    return pyodideReady;
  }
  // Módulo importado → paquete real de PyPI (cuando el nombre difiere).
  var PY_PKG_ALIAS = {
    cv2: 'opencv-python', PIL: 'pillow', bs4: 'beautifulsoup4', yaml: 'pyyaml',
    sklearn: 'scikit-learn', dotenv: 'python-dotenv', discord: 'discord.py',
    serial: 'pyserial', OpenGL: 'pyopengl', Crypto: 'pycryptodome', git: 'gitpython',
  };
  // Módulos que necesitan red/sockets reales, hardware o el SO: NO corren en el navegador.
  var PY_INCOMPATIBLE = {
    discord: 'un bot de Discord necesita conexión de red real (websockets al gateway)',
    socket: 'los sockets TCP crudos no existen en el navegador',
    selenium: 'controla un navegador externo (no disponible acá)',
    pyautogui: 'automatiza el escritorio', tkinter: 'usa ventanas nativas del SO',
    subprocess: 'lanza procesos del sistema', pygame: 'necesita acceso gráfico/SDL nativo',
  };

  var micropipLoaded = false;
  async function pyEnsureMicropip(py) {
    if (!micropipLoaded) { await py.loadPackage('micropip'); micropipLoaded = true; }
    return py.pyimport('micropip');
  }
  async function pyInstall(py, spec) { var mp = await pyEnsureMicropip(py); await mp.install(spec); }

  // Comando `pip install <paquete…>` — instala de PyPI en Pyodide (paquetes compatibles).
  async function tPip(argv) {
    var sub = (argv[0] || '').toLowerCase();
    if (sub === 'list' || sub === 'freeze') {
      var pyl; try { pyl = await getPyodide(); pyBooted = true; } catch (e) { tw('\x1b[31mNo se pudo cargar Python.\x1b[0m\r\n'); return; }
      try { var out = pyl.runPython('import sys; ", ".join(sorted(m for m in sys.modules))'); tw(String(out) + '\r\n'); } catch (e) {}
      return;
    }
    if (sub !== 'install' && sub !== 'i' && sub !== 'add') {
      tw('uso: pip install <paquete> [otro…]\r\n' +
         '\x1b[38;5;245mInstala paquetes de PyPI compatibles con Pyodide (numpy, pandas, requests, rich…) en tu navegador.\x1b[0m\r\n');
      return;
    }
    var pkgs = tNonFlags(argv.slice(1));
    if (!pkgs.length) { tw('uso: pip install <paquete>\r\n'); return; }
    var py; try { tw('\x1b[38;5;245m▶ preparando Python…\x1b[0m\r\n'); py = await getPyodide(); pyBooted = true; }
    catch (e) { tw('\x1b[31mNo se pudo cargar Python.\x1b[0m\r\n'); return; }
    for (var i = 0; i < pkgs.length; i++) {
      var base = pkgs[i].replace(/[<>=!~\[].*/, '');
      if (PY_INCOMPATIBLE[base]) { tw('\x1b[33m' + base + ': ' + PY_INCOMPATIBLE[base] + ' — no corre en el navegador.\x1b[0m Usá la app de escritorio.\r\n'); continue; }
      var spec = PY_PKG_ALIAS[base] || pkgs[i];
      tw('\x1b[38;5;245minstalando ' + spec + '…\x1b[0m\r\n');
      try { await pyInstall(py, spec); tw('\x1b[32m✓\x1b[0m ' + spec + '\r\n'); }
      catch (e) { tw('\x1b[31m✗ ' + spec + ': ' + String((e && e.message) || e).split('\n').pop() + '\x1b[0m\r\n' +
        '\x1b[38;5;245m(ese paquete no es compatible con Pyodide/WASM — típico de paquetes con binarios nativos o red)\x1b[0m\r\n'); }
    }
  }

  async function runPythonBrowser(code, args, isRetry) {
    var py;
    try {
      if (!isRetry) tw(pyBooted ? '\x1b[38;5;245m▶ Python (Pyodide · navegador)\x1b[0m\r\n'
                                : '\x1b[38;5;245m▶ Python (Pyodide) — descargando el runtime la primera vez, aguantá unos segundos…\x1b[0m\r\n');
      py = await getPyodide(); pyBooted = true;
    } catch (e) {
      pyodideReady = null;
      tw('\x1b[31mNo se pudo cargar Python: ' + (e && e.message ? e.message : e) + '\x1b[0m\r\n' +
         '\x1b[38;5;245m(hace falta internet la primera vez; después queda en caché)\x1b[0m\r\n');
      return;
    }
    py.setStdout({ batched: function (s) { tw(s.replace(/\n$/, '').replace(/\n/g, '\r\n') + '\r\n'); } });
    py.setStderr({ batched: function (s) { tw('\x1b[31m' + s.replace(/\n$/, '').replace(/\n/g, '\r\n') + '\x1b[0m\r\n'); } });
    py.setStdin({ stdin: function () { var v = window.prompt('input():'); return v === null ? '' : v + '\n'; } });
    try {
      py.globals.set('__hydra_argv', py.toPy(['main.py'].concat(args || [])));
      await py.runPythonAsync('import sys as _sys; _sys.argv = list(__hydra_argv)');
    } catch (e) {}
    try {
      await py.runPythonAsync(code);
    } catch (e) {
      var errStr = String((e && e.message) || e);
      var mm = errStr.match(/No module named '([^']+)'/);
      // Auto-instalar el módulo faltante (una sola vez) y reintentar.
      if (mm && !isRetry) {
        var mod = mm[1].split('.')[0];
        if (PY_INCOMPATIBLE[mod]) {
          tw('\x1b[33m"' + mod + '": ' + PY_INCOMPATIBLE[mod] + ' — no corre en el navegador.\x1b[0m Usá la app de escritorio para eso.\r\n');
          return;
        }
        var pkg = PY_PKG_ALIAS[mod] || mod;
        tw('\x1b[38;5;245mFalta el módulo "' + mod + '" — instalando ' + pkg + ' con pip…\x1b[0m\r\n');
        try {
          await pyInstall(py, pkg);
          tw('\x1b[32m✓ instalado, reintentando…\x1b[0m\r\n');
          await runPythonBrowser(code, args, true);
          return;
        } catch (e2) {
          tw('\x1b[31mNo se pudo instalar "' + pkg + '": ' + String((e2 && e2.message) || e2).split('\n').pop() + '\x1b[0m\r\n' +
             '\x1b[38;5;245m(no todos los paquetes son compatibles con el navegador: los que usan red/sockets o binarios nativos no funcionan)\x1b[0m\r\n');
          return;
        }
      }
      var msg = errStr.split('\n').filter(function (l) { return l.trim(); }).slice(-8).join('\r\n');
      tw('\x1b[31m' + msg + '\x1b[0m\r\n');
    }
  }

  // Reescribe import/require de PAQUETES (bare specifiers) a imports dinámicos
  // desde el CDN esm.sh, para que funcionen en el navegador SIN node_modules.
  // Las rutas relativas (./x) y URLs quedan igual.
  function transformJsImports(code) {
    var ESM = 'https://esm.sh/';
    function u(spec) { return /^(\.|\/|https?:)/.test(spec) ? spec : ESM + spec; }
    var n = 0;
    code = code.replace(/(^|[\n;])[ \t]*import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"][ \t]*;?/g, function (m, pre, binds, spec) {
      var U = u(spec); binds = binds.trim();
      var ns = binds.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (ns) return pre + 'const ' + ns[1] + ' = await __load("' + U + '");';
      var mix = binds.match(/^([A-Za-z_$][\w$]*)\s*,\s*(\{[\s\S]*\})$/);
      if (mix) { var t = '__m' + (n++); return pre + 'const ' + t + ' = await __load("' + U + '"); const ' + mix[1] + ' = ' + t + '.default; const ' + mix[2] + ' = ' + t + ';'; }
      if (/^\{[\s\S]*\}$/.test(binds)) return pre + 'const ' + binds + ' = await __load("' + U + '");';
      if (/^[A-Za-z_$][\w$]*$/.test(binds)) return pre + 'const ' + binds + ' = (await __load("' + U + '")).default;';
      return m;
    });
    code = code.replace(/(^|[\n;])[ \t]*import\s*['"]([^'"]+)['"][ \t]*;?/g, function (m, pre, spec) { return pre + 'await __load("' + u(spec) + '");'; });
    code = code.replace(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, function (m, spec) { return '(await __req("' + u(spec) + '"))'; });
    return code;
  }

  // --- JavaScript (Web Worker aislado) ---------------------------------------
  function runJsBrowser(code, args) {
    return new Promise(function (resolve) {
      tw('\x1b[38;5;245m▶ JavaScript (navegador · aislado)\x1b[0m\r\n');
      var src =
        'var enc=function(a){return Array.prototype.map.call(a,function(x){try{return (x&&typeof x==="object")?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ")};' +
        'var post=function(t,a){self.postMessage({t:t,s:enc(a)})};' +
        'console.log=function(){post("o",arguments)};console.info=console.log;console.debug=console.log;' +
        'console.warn=function(){post("e",arguments)};console.error=console.warn;' +
        'async function __load(u){return await import(u);}' +
        'async function __req(u){var m=await import(u);return (m&&m.default!==undefined)?m.default:m;}' +
        'self.onmessage=async function(e){' +
        '  var A=e.data.args||[];' +
        '  var process={argv:["node","main.js"].concat(A),env:{},platform:"browser",exit:function(){},' +
        '    stdout:{write:function(s){self.postMessage({t:"o",s:String(s)})}},stderr:{write:function(s){self.postMessage({t:"e",s:String(s)})}}};' +
        '  try{var f=new Function("process","args","__load","__req","return (async()=>{\\n"+e.data.code+"\\n})()");await f(process,A,__load,__req);}' +
        '  catch(err){self.postMessage({t:"e",s:(err&&err.stack)?String(err.stack):String(err)});}' +
        '  self.postMessage({t:"d"});' +
        '};';
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      var w;
      try { w = new Worker(url); }
      catch (e) { tw('\x1b[31mNo se pudo iniciar el sandbox de JS: ' + (e && e.message ? e.message : e) + '\x1b[0m\r\n'); URL.revokeObjectURL(url); return resolve(); }
      var done = false;
      var finish = function () { if (done) return; done = true; clearTimeout(to); try { w.terminate(); } catch (e) {} URL.revokeObjectURL(url); resolve(); };
      var to = setTimeout(function () { tw('\x1b[31m[terminado: excedió 10 s]\x1b[0m\r\n'); finish(); }, 10000);
      w.onmessage = function (ev) {
        var m = ev.data;
        if (m.t === 'o') tw(String(m.s).replace(/\n$/, '').replace(/\n/g, '\r\n') + '\r\n');
        else if (m.t === 'e') tw('\x1b[31m' + String(m.s).replace(/\n$/, '').replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
        else if (m.t === 'd') finish();
      };
      w.onerror = function (ev) { tw('\x1b[31m' + (ev && ev.message ? ev.message : 'error en el sandbox de JS') + '\x1b[0m\r\n'); finish(); };
      // Reescribir import/require de paquetes → esm.sh (sin node_modules).
      var jsCode; try { jsCode = transformJsImports(code); } catch (e) { jsCode = code; }
      w.postMessage({ code: jsCode, args: args || [] });
    });
  }

  // Lenguajes de Piston que en realidad corren en el navegador (sin servidor).
  var BROWSER_LANGS = { python: 1, python2: 1, javascript: 1 };

  // Ejecuta un archivo del disco: primero runtimes del navegador (Python/JS),
  // y para el resto de lenguajes, Piston (si está configurado).
  async function tRun(fileArg, langHint, args) {
    if (!fileArg) { tw('uso: run <archivo> [args…]\r\n'); return; }
    var path = tResolve(fileArg), content;
    try { content = await readFile(path); }
    catch (e) { tw('\x1b[31mNo existe el archivo: ' + path + '\x1b[0m\r\n'); return; }
    var name = basename(path), ext = name.split('.').pop().toLowerCase();
    var lang = langHint || PISTON_EXT[ext];
    if (!lang) { tw('\x1b[31mNo sé con qué lenguaje ejecutar .' + ext + '.\x1b[0m Usá: piston run <lenguaje> ' + name + '\r\n'); return; }
    if (lang === 'python' || lang === 'python2') { await runPythonBrowser(content, args || []); return; }
    if (lang === 'javascript') { await runJsBrowser(content, args || []); return; }
    await pistonRun(lang, [{ name: name, content: content }], args || [], '');
  }

  // Ejecuta el COMANDO de un script de npm vía Piston, cuando es posible.
  //   · "node app.js" / "python app.py" / "ts-node x.ts" → ejecuta ese archivo.
  //   · vite/tsc/next/webpack/jest/nodemon/… → viven en node_modules o son dev
  //     servers: no corren en el navegador (lo decimos claro, sin fingir).
  var SCRIPT_PROG_LANG = {
    node: 'javascript', nodejs: 'javascript', 'ts-node': 'typescript', tsx: 'typescript',
    python: 'python', python3: 'python', py: 'python', ruby: 'ruby', php: 'php',
    bash: 'bash', sh: 'bash', deno: 'typescript', bun: 'javascript', lua: 'lua',
    perl: 'perl', go: 'go', java: 'java',
  };
  async function tRunScript(scriptCmd) {
    // Tomamos solo el primer comando (antes de && / ; / |) para intentar ejecutarlo.
    var first = String(scriptCmd).split(/&&|;|\|/)[0].trim();
    var parts = first.split(/\s+/);
    var prog = (parts[0] || '').replace(/^.*[\\/]/, ''); // quita node_modules/.bin/ etc.
    if ((prog === 'go' || prog === 'deno' || prog === 'bun') && parts[1] === 'run') parts.splice(1, 1);
    var lang = SCRIPT_PROG_LANG[prog];
    var file = parts.slice(1).filter(function (p) { return p.charAt(0) !== '-'; }).find(function (p) { return /\.[a-z0-9]+$/i.test(p); });
    if (lang && file) {
      await tRun(file, lang, []);
      return;
    }
    tw('\x1b[33m"' + (prog || scriptCmd) + '" necesita node_modules o es un servidor de desarrollo — no corre en el navegador.\x1b[0m\r\n' +
       '\x1b[38;5;245mPiston ejecuta archivos sueltos: probá \x1b[38;5;222mrun <archivo>\x1b[38;5;245m. Para dev servers (vite…) o instalar dependencias, usá la app de escritorio.\x1b[0m\r\n');
  }

  // Comando `piston`: config y utilidades.
  async function tPiston(argv) {
    var sub = (argv[0] || '').toLowerCase();
    if (!sub || sub === 'help' || sub === '-h') {
      tw('piston — ejecutar código real con la API de Piston:\r\n' +
         '  run <archivo> [args…]      ejecuta un archivo (autodetecta lenguaje)\r\n' +
         '  piston run <lang> <arch>   ejecuta forzando el lenguaje\r\n' +
         '  piston list                lista los lenguajes disponibles\r\n' +
         '  piston url [<url>]          ver/definir la URL de la API (self-host)\r\n' +
         '  piston token [<token>]      ver/definir el token de autorización\r\n' +
         '  piston reset                vuelve a la config por defecto\r\n' + PISTON_HINT);
      return;
    }
    if (sub === 'url') {
      if (argv[1]) { pistonSave({ url: argv[1] }); pistonRuntimesCache = null; tw('URL de Piston: ' + pistonBase() + '\r\n'); }
      else tw('URL actual: ' + pistonBase() + '\r\n');
      return;
    }
    if (sub === 'token') {
      if (argv[1]) { pistonSave({ token: argv[1] }); pistonRuntimesCache = null; tw('\x1b[32m✓\x1b[0m token guardado.\r\n'); }
      else tw(pistonState().token ? 'Hay un token configurado.\r\n' : 'Sin token configurado.\r\n');
      return;
    }
    if (sub === 'reset') { pistonSave({ url: '', token: '' }); pistonRuntimesCache = null; tw('Config de Piston reiniciada (emkc.org, sin token).\r\n'); return; }
    if (sub === 'list' || sub === 'runtimes' || sub === 'ls') {
      var rs = await pistonRuntimes();
      if (!rs.length) { tw('\x1b[31mNo pude obtener los lenguajes.\x1b[0m Revisá "piston url".\r\n'); return; }
      var names = Object.keys(rs.reduce(function (a, x) { a[x.language] = 1; return a; }, {})).sort();
      tw(names.join('  ') + '\r\n\x1b[38;5;245m' + names.length + ' lenguajes en ' + pistonBase() + '\x1b[0m\r\n');
      return;
    }
    if (sub === 'run') {
      if (!argv[1] || !argv[2]) { tw('uso: piston run <lenguaje> <archivo> [args…]\r\n'); return; }
      await tRun(argv[2], argv[1].toLowerCase(), argv.slice(3));
      return;
    }
    tw('\x1b[31mpiston: "' + sub + '" desconocido.\x1b[0m Probá: piston help\r\n');
  }

  // Ejecuta una línea de comando (async). Escribe la salida vía tw().
  async function tExec(raw) {
    var line = String(raw).trim();
    if (!line) return;
    if (tHist[tHist.length - 1] !== line) tHist.push(line);
    var argv = tArgv(line);
    var cmd = (argv.shift() || '').toLowerCase();
    try {
      switch (cmd) {
        case 'help': case '?': tw(TERM_HELP); break;
        case 'clear': case 'cls': tw('\x1b[2J\x1b[3J\x1b[H'); break;
        case 'pwd': tw(termCwd + '\r\n'); break;

        case 'ls': case 'dir': {
          var lp = argv[0] ? tResolve(argv[0]) : termCwd;
          var l = await tList(lp);
          if (!l) { tw('\x1b[31mNo existe la carpeta: ' + lp + '\x1b[0m\r\n'); break; }
          var listed = l.dirs.map(function (n) { return '\x1b[38;5;75m' + n + '/\x1b[0m'; })
            .concat(l.files).join('   ');
          tw((listed || '\x1b[38;5;245m(vacío)\x1b[0m') + '\r\n');
          break;
        }
        case 'cd': {
          // Soporta la forma de Windows "cd /d ruta" que manda el IDE al abrir carpeta.
          var a = argv.slice();
          if (a[0] && a[0].toLowerCase() === '/d') a.shift();
          var target = a[0] ? tResolve(a[0]) : (rootPath || '/');
          var dh = await getDirHandleFor(target, false);
          if (!dh) { tw('\x1b[31mNo existe la carpeta: ' + target + '\x1b[0m\r\n'); break; }
          termCwd = target;
          break;
        }
        case 'cat': case 'type': {
          if (!argv[0]) { tw('uso: cat <archivo>\r\n'); break; }
          var txt = await readFile(tResolve(argv[0]));
          tw(txt.replace(/\r?\n/g, '\r\n'));
          if (txt.length && !/\n$/.test(txt)) tw('\r\n');
          break;
        }
        case 'echo': {
          var gg = argv.indexOf('>>'), gt = argv.indexOf('>');
          var toFile = null, append = false;
          if (gg !== -1) { toFile = argv[gg + 1]; append = true; argv = argv.slice(0, gg); }
          else if (gt !== -1) { toFile = argv[gt + 1]; argv = argv.slice(0, gt); }
          var text = argv.join(' ');
          if (toFile) {
            var fp = tResolve(toFile);
            var prev = '';
            if (append) { try { prev = await readFile(fp); } catch (e) {} }
            await saveFile(fp, prev + text + '\n');
          } else {
            tw(text + '\r\n');
          }
          break;
        }
        case 'mkdir': case 'md': {
          var mkArgs = tNonFlags(argv);
          if (!mkArgs[0]) { tw('uso: mkdir [-p] <nombre>\r\n'); break; }
          var recursive = argv.indexOf('-p') !== -1;
          for (var mi = 0; mi < mkArgs.length; mi++) {
            var full = tResolve(mkArgs[mi]);
            if (recursive) {
              // crea cada segmento desde la raíz (mkdir -p a/b/c)
              var rel = full.indexOf(rootPath) === 0 ? full.slice(rootPath.length).replace(/^\/+/, '') : '';
              var segs = rel ? rel.split('/') : [], cur = rootHandle;
              for (var si = 0; si < segs.length && cur; si++) { if (segs[si]) cur = await cur.getDirectoryHandle(segs[si], { create: true }); }
            } else {
              await createFolder(dirname(full), basename(full));
            }
          }
          break;
        }
        case 'touch': case 'new': {
          if (!argv[0]) { tw('uso: touch <nombre>\r\n'); break; }
          var tf = tResolve(argv[0]);
          await createFile(dirname(tf), basename(tf));
          break;
        }
        case 'rm': case 'del': case 'rmdir': {
          var rmArgs = argv.filter(function (x) { return x.charAt(0) !== '-'; });
          if (!rmArgs[0]) { tw('uso: rm <ruta>\r\n'); break; }
          await del(tResolve(rmArgs[0]));
          break;
        }
        case 'mv': case 'move': case 'ren': {
          if (!argv[0] || !argv[1]) { tw('uso: mv <origen> <destino>\r\n'); break; }
          await tMove(tResolve(argv[0]), tResolve(argv[1]), true);
          break;
        }
        case 'cp': case 'copy': {
          if (!argv[0] || !argv[1]) { tw('uso: cp <origen> <destino>\r\n'); break; }
          await tMove(tResolve(argv[0]), tResolve(argv[1]), false);
          break;
        }
        case 'tree': {
          var tp = argv[0] ? tResolve(argv[0]) : termCwd;
          var lines = []; await tTree(tp, '', lines);
          tw(tp + '\r\n' + lines.join('\r\n') + (lines.length ? '\r\n' : ''));
          break;
        }
        case 'find': {
          if (!argv[0]) { tw('uso: find <texto>\r\n'); break; }
          var q = argv[0].toLowerCase();
          var fdh = await getDirHandleFor(termCwd, false) || rootHandle;
          var nodes = fdh ? await buildTree(fdh, termCwd) : [];
          var hits = [];
          (function flat(ns) {
            for (var i = 0; i < ns.length; i++) {
              if (ns[i].name.toLowerCase().indexOf(q) !== -1) hits.push(ns[i].path);
              if (ns[i].children) flat(ns[i].children);
            }
          })(nodes);
          tw((hits.length ? hits.join('\r\n') : '\x1b[38;5;245m(sin resultados)\x1b[0m') + '\r\n');
          break;
        }
        case 'grep': {
          if (!argv[0]) { tw('uso: grep <texto>\r\n'); break; }
          var res = await search(termCwd, argv[0]);
          if (!res.length) { tw('\x1b[38;5;245m(sin coincidencias)\x1b[0m\r\n'); break; }
          tw(res.slice(0, 200).map(function (r) {
            return '\x1b[38;5;75m' + r.file + '\x1b[0m:\x1b[38;5;222m' + r.line + '\x1b[0m: ' + r.text.trim();
          }).join('\r\n') + '\r\n');
          break;
        }
        case 'head': case 'tail': {
          var nIdx = argv.indexOf('-n');
          var count = (nIdx !== -1 && argv[nIdx + 1]) ? (parseInt(argv[nIdx + 1], 10) || 10) : 10;
          var htFile = tNonFlags(argv).filter(function (x) { return !/^\d+$/.test(x); })[0];
          if (!htFile) { tw('uso: ' + cmd + ' [-n N] <archivo>\r\n'); break; }
          var rows = (await readFile(tResolve(htFile))).split(/\r?\n/);
          tw((cmd === 'head' ? rows.slice(0, count) : rows.slice(-count)).join('\r\n') + '\r\n');
          break;
        }
        case 'wc': {
          var wcFile = tNonFlags(argv)[0];
          if (!wcFile) { tw('uso: wc [-l|-w|-c] <archivo>\r\n'); break; }
          var c = await readFile(tResolve(wcFile));
          var nl = (c.match(/\n/g) || []).length, words = (c.trim().match(/\S+/g) || []).length;
          if (argv.indexOf('-l') !== -1) tw(nl + '\r\n');
          else if (argv.indexOf('-w') !== -1) tw(words + '\r\n');
          else if (argv.indexOf('-c') !== -1) tw(c.length + '\r\n');
          else tw(nl + ' líneas  ' + words + ' palabras  ' + c.length + ' caracteres\r\n');
          break;
        }
        case 'nl': {
          var nlFile = tNonFlags(argv)[0];
          if (!nlFile) { tw('uso: nl <archivo>\r\n'); break; }
          var nlRows = (await readFile(tResolve(nlFile))).split(/\r?\n/);
          tw(nlRows.map(function (r, i) { return '\x1b[38;5;245m' + String(i + 1).padStart(6) + '\x1b[0m  ' + r; }).join('\r\n') + '\r\n');
          break;
        }
        case 'sort': {
          var soFile = tNonFlags(argv)[0];
          if (!soFile) { tw('uso: sort [-r] <archivo>\r\n'); break; }
          var soRows = (await readFile(tResolve(soFile))).split(/\r?\n/);
          soRows.sort(function (a, b) { return a.localeCompare(b); });
          if (argv.indexOf('-r') !== -1) soRows.reverse();
          tw(soRows.join('\r\n') + '\r\n');
          break;
        }
        case 'uniq': {
          var uqFile = tNonFlags(argv)[0];
          if (!uqFile) { tw('uso: uniq <archivo>\r\n'); break; }
          var uqRows = (await readFile(tResolve(uqFile))).split(/\r?\n/), out = [], prev = null;
          for (var ui = 0; ui < uqRows.length; ui++) { if (uqRows[ui] !== prev) out.push(uqRows[ui]); prev = uqRows[ui]; }
          tw(out.join('\r\n') + '\r\n');
          break;
        }
        case 'rev': {
          var rvFile = tNonFlags(argv)[0];
          if (!rvFile) { tw('uso: rev <archivo>\r\n'); break; }
          tw((await readFile(tResolve(rvFile))).split(/\r?\n/).map(function (r) { return r.split('').reverse().join(''); }).join('\r\n') + '\r\n');
          break;
        }
        case 'tac': {
          var tcFile = tNonFlags(argv)[0];
          if (!tcFile) { tw('uso: tac <archivo>\r\n'); break; }
          tw((await readFile(tResolve(tcFile))).split(/\r?\n/).reverse().join('\r\n') + '\r\n');
          break;
        }
        case 'stat': {
          if (!argv[0]) { tw('uso: stat <ruta>\r\n'); break; }
          var stp = tResolve(argv[0]);
          if (await getDirHandleFor(stp, false)) { tw('  ' + stp + '\r\n  Tipo: carpeta\r\n'); break; }
          var stfh = await getFileHandleFor(stp, false);
          if (!stfh) { tw('\x1b[31mNo existe: ' + stp + '\x1b[0m\r\n'); break; }
          var stf = await stfh.getFile();
          tw('  ' + stp + '\r\n  Tipo: archivo\r\n  Tamaño: ' + tHuman(stf.size) + ' (' + stf.size + ' bytes)\r\n' +
             '  Modificado: ' + new Date(stf.lastModified).toLocaleString() + '\r\n');
          break;
        }
        case 'du': {
          var duArg = tNonFlags(argv)[0];
          var dup = duArg ? tResolve(duArg) : termCwd;
          var dudh = await getDirHandleFor(dup, false);
          if (!dudh) { tw('\x1b[31mNo existe la carpeta: ' + dup + '\x1b[0m\r\n'); break; }
          var total = 0;
          await (async function walk(h) {
            for await (var e of h.entries()) {
              if (e[1].kind === 'file') { try { total += (await e[1].getFile()).size; } catch (er) {} }
              else await walk(e[1]);
            }
          })(dudh);
          tw(tHuman(total) + '  ' + dup + '\r\n');
          break;
        }
        case 'basename': tw((argv[0] ? basename(tResolve(argv[0])) : '') + '\r\n'); break;
        case 'dirname': tw((argv[0] ? dirname(tResolve(argv[0])) : '') + '\r\n'); break;

        case 'code': case 'open': case 'edit': {
          if (!argv[0]) { tw('uso: code <archivo>\r\n'); break; }
          var cop = tResolve(argv[0]);
          if (!(await getFileHandleFor(cop, false))) { tw('\x1b[31mNo existe el archivo: ' + cop + '\x1b[0m\r\n'); break; }
          try { window.dispatchEvent(new CustomEvent('hydra-web-open', { detail: { path: cop } })); } catch (e) {}
          tw('\x1b[38;5;245mAbriendo ' + basename(cop) + ' en el editor…\x1b[0m\r\n');
          break;
        }
        case 'curl': case 'wget': await tCurl(argv); break;
        case 'npm': await tNpm(argv); break;

        case 'date': tw(new Date().toString() + '\r\n'); break;
        case 'whoami': tw('hydra\r\n'); break;
        case 'hostname': tw((location.hostname || 'localhost') + '\r\n'); break;
        case 'uname': tw((argv.indexOf('-a') !== -1 ? 'HydraOS web 1.0 ' + (navigator.platform || '') + ' (' + (navigator.userAgent || '') + ')' : 'HydraOS') + '\r\n'); break;
        case 'env': tw('HYDRA_WEB=1\r\nSHELL=hydra-web\r\nPWD=' + termCwd + '\r\nHOME=' + (rootPath || '/') + '\r\n'); break;
        case 'which': case 'command': {
          var wq = tNonFlags(argv).filter(function (x) { return x !== 'command' && x !== '-v'; })[0];
          if (!wq) { tw('uso: which <comando>\r\n'); break; }
          tw(TERM_CMDS.indexOf(wq.toLowerCase()) !== -1
            ? (wq + ': comando interno de Hydra\r\n')
            : ('\x1b[31m' + wq + ' no encontrado\x1b[0m\r\n'));
          break;
        }
        case 'history':
          if (argv.indexOf('-c') !== -1) { tHist.length = 0; break; }
          tw(tHist.map(function (h, i) { return '  ' + (i + 1) + '  ' + h; }).join('\r\n') + '\r\n');
          break;

        // --- Ejecución de código REAL vía la API de Piston ---
        case 'run': {
          var runArgs = tNonFlags(argv);
          await tRun(runArgs[0], null, runArgs.slice(1));
          break;
        }
        case 'piston': await tPiston(argv); break;
        // Comandos de lenguaje: ejecutan el archivo dado con Piston.
        case 'python': case 'python3': case 'py': case 'python2':
        case 'node': case 'nodejs': case 'deno': case 'bun': case 'ts-node': case 'tsc':
        case 'ruby': case 'php': case 'bash': case 'sh': case 'perl': case 'lua':
        case 'rscript': case 'julia': case 'scala': case 'groovy': case 'swift':
        case 'kotlin': case 'dart': case 'java': case 'go': case 'rustc': {
          var la = argv.slice();
          // saltar subcomando "run" (go run x.go, deno run x.ts, bun run x.js)
          if ((cmd === 'go' || cmd === 'deno' || cmd === 'bun') && (la[0] || '').toLowerCase() === 'run') la.shift();
          var lfiles = tNonFlags(la);
          if (!lfiles[0]) { tw('uso: ' + cmd + ' <archivo>\r\n'); break; }
          await tRun(lfiles[0], PISTON_CMD[cmd] || null, lfiles.slice(1));
          break;
        }
        // Gestores de paquetes / VCS: Piston ejecuta archivos, no maneja repos ni instala.
        // pip: instala paquetes de Python (PyPI) en el navegador vía micropip.
        case 'pip': case 'pip3': await tPip(argv); break;
        case 'git': case 'yarn': case 'pnpm': case 'cargo': {
          tw('\x1b[33m' + cmd + ' no está disponible en el navegador.\x1b[0m ' +
             (cmd === 'git' ? 'No hay control de versiones local acá.' : 'Los paquetes JS se cargan al vuelo al hacer import (desde esm.sh); no hay node_modules.') +
             ' Para lo demás, la app de escritorio.\r\n');
          break;
        }

        default:
          tw('\x1b[31m' + cmd + ': comando no reconocido.\x1b[0m Escribí \x1b[38;5;222mhelp\x1b[0m para ver la lista.\r\n');
      }
    } catch (e) {
      tw('\x1b[31mError: ' + (e && e.message ? e.message : e) + '\x1b[0m\r\n');
    }
  }

  // ---- Edición de línea / historial / despacho de la entrada cruda de xterm ----
  function tFeed(data) { tQueue += data; tPump(); }
  function tPump() {
    if (tBusy) return;
    while (tQueue.length) {
      var c = tQueue.charAt(0);
      if (c === '\x1b') { // secuencia de escape (flechas, inicio/fin, supr)
        var m = tQueue.match(/^\x1b\[[0-9;]*[A-Za-z~]/);
        if (!m) { if (tQueue.length < 8) return; tQueue = tQueue.slice(1); continue; }
        tEsc(m[0]); tQueue = tQueue.slice(m[0].length); continue;
      }
      tQueue = tQueue.slice(1);
      if (c === '\r' || c === '\n') {
        tw('\r\n');
        var toRun = tLine;
        tLine = ''; tCur = 0; tHistIx = -1;
        tBusy = true;
        Promise.resolve(tExec(toRun)).then(function () {
          tBusy = false; tRender(); tPump();
        });
        return; // el resto de la cola se procesa cuando termine el comando
      } else if (c === '\x7f' || c === '\x08') { // backspace
        if (tCur > 0) { tLine = tLine.slice(0, tCur - 1) + tLine.slice(tCur); tCur--; tRender(); }
      } else if (c === '\x03') { // Ctrl+C
        tw('^C\r\n'); tLine = ''; tCur = 0; tHistIx = -1; tRender();
      } else if (c === '\x0c') { // Ctrl+L → limpiar
        tw('\x1b[2J\x1b[3J\x1b[H'); tRender();
      } else if (c === '\x01') { tCur = 0; tRender(); }              // Ctrl+A
      else if (c === '\x05') { tCur = tLine.length; tRender(); }     // Ctrl+E
      else if (c === '\x15') { tLine = tLine.slice(tCur); tCur = 0; tRender(); } // Ctrl+U
      else if (c >= ' ') { tLine = tLine.slice(0, tCur) + c + tLine.slice(tCur); tCur++; tRender(); }
    }
  }
  function tEsc(seq) {
    switch (seq) {
      case '\x1b[A': tHistPrev(); break;                                  // ↑
      case '\x1b[B': tHistNext(); break;                                  // ↓
      case '\x1b[C': if (tCur < tLine.length) { tCur++; tRender(); } break; // →
      case '\x1b[D': if (tCur > 0) { tCur--; tRender(); } break;           // ←
      case '\x1b[H': case '\x1b[1~': tCur = 0; tRender(); break;
      case '\x1b[F': case '\x1b[4~': tCur = tLine.length; tRender(); break;
      case '\x1b[3~': if (tCur < tLine.length) { tLine = tLine.slice(0, tCur) + tLine.slice(tCur + 1); tRender(); } break;
    }
  }
  function tHistPrev() {
    if (!tHist.length) return;
    if (tHistIx === -1) { tSaved = tLine; tHistIx = tHist.length; }
    if (tHistIx > 0) { tHistIx--; tLine = tHist[tHistIx]; tCur = tLine.length; tRender(); }
  }
  function tHistNext() {
    if (tHistIx === -1) return;
    tHistIx++;
    if (tHistIx >= tHist.length) { tHistIx = -1; tLine = tSaved; } else { tLine = tHist[tHistIx]; }
    tCur = tLine.length; tRender();
  }

  // Arranca la shell: fija el cwd, imprime la bienvenida y el primer prompt.
  function termStart(cwd) {
    termCwd = (cwd && normalize(cwd)) || rootPath || '/';
    tLine = ''; tCur = 0; tHistIx = -1; tQueue = ''; tBusy = false;
    termOn = true;
    tw('\x1b[38;5;79mHydra Terminal\x1b[0m \x1b[38;5;245m· shell del navegador sobre tus archivos reales\x1b[0m\r\n');
    tw('\x1b[38;5;245mEscribí \x1b[38;5;222mhelp\x1b[38;5;245m para ver los comandos · ejecutá código con \x1b[38;5;222mrun <archivo>\x1b[38;5;245m (Python y JS corren en el navegador).\x1b[0m\r\n');
    if (!rootHandle) tw('\x1b[33mAbrí una carpeta para operar sobre archivos (Archivo → Abrir carpeta).\x1b[0m\r\n');
    tw('\r\n');
    tRender();
    return true;
  }

  // ==========================================================================
  // Hydra Live (vista previa en el navegador) — "Go Live" sin servidor local.
  //
  // En Electron, Live Server levanta un HTTP real en localhost y recarga al
  // guardar. En el navegador no hay puerto, así que generamos una vista previa
  // AUTOCONTENIDA: leemos el HTML y resolvemos sus recursos relativos (CSS/JS/
  // imágenes, @import y url() de CSS) a blob URLs desde la File System Access
  // API, y la abrimos en una pestaña nueva. Al GUARDAR desde el IDE, regeneramos
  // y recargamos esa pestaña (recarga en vivo).
  //   Limitación: recursos pedidos por fetch()/import dinámico en runtime no se
  //   resuelven (sus rutas ya no existen dentro del blob). Para eso, la app.
  // ==========================================================================
  var LIVE_MIME = {
    css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
    html: 'text/html', htm: 'text/html', svg: 'image/svg+xml', png: 'image/png',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp', woff: 'font/woff',
    woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4',
    webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  };
  function liveMime(path) {
    var ext = basename(path).split('.').pop().toLowerCase();
    return LIVE_MIME[ext] || 'application/octet-stream';
  }

  var live = { active: false, win: null, htmlPath: null, urls: [], reloadT: null };

  // ¿URL externa/absoluta (no hay que resolverla contra el disco)?
  function liveIsExternal(u) { return !u || /^(?:[a-z]+:|\/\/|#|data:|blob:|mailto:|tel:)/i.test(u); }

  // Resuelve un href/src relativo (contra el dir del documento) a ruta sintética.
  function liveResolve(baseDir, u) {
    u = String(u).split('#')[0].split('?')[0].replace(/\\/g, '/');
    if (!u) return null;
    var base = u.charAt(0) === '/' ? (rootPath + u) : (baseDir + '/' + u);
    var parts = base.split('/'), st = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === '' || p === '.') continue;
      if (p === '..') { st.pop(); continue; }
      st.push(p);
    }
    return '/' + st.join('/');
  }

  // Lee un archivo y devuelve un blob URL (registrado para revocar luego).
  async function liveBlobURL(path) {
    var h = await getFileHandleFor(path, false);
    if (!h) return null;
    var buf = await (await h.getFile()).arrayBuffer();
    var url = URL.createObjectURL(new Blob([buf], { type: liveMime(path) }));
    live.urls.push(url);
    return url;
  }

  // Procesa un CSS: resuelve @import (recursivo) y url(...) a blob URLs.
  async function liveInlineCss(cssText, cssDir) {
    var importRe = /@import\s+(?:url\()?\s*['"]?([^'")]+)['"]?\s*\)?\s*;/gi;
    var imports = [], im;
    while ((im = importRe.exec(cssText))) imports.push({ m: im[0], u: im[1] });
    for (var i = 0; i < imports.length; i++) {
      if (liveIsExternal(imports[i].u)) continue;
      var p = liveResolve(cssDir, imports[i].u), sub = '';
      try { sub = await liveInlineCss(await readFile(p), dirname(p)); } catch (e) {}
      cssText = cssText.split(imports[i].m).join(sub);
    }
    var urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, urls = [], mm;
    while ((mm = urlRe.exec(cssText))) urls.push(mm[1]);
    for (var j = 0; j < urls.length; j++) {
      if (liveIsExternal(urls[j])) continue;
      var b = await liveBlobURL(liveResolve(cssDir, urls[j]));
      if (b) cssText = cssText.split(urls[j]).join(b);
    }
    return cssText;
  }

  // Resuelve un atributo con UNA URL (src/href/data/poster) a un blob URL,
  // preservando el fragmento #frag si lo hubiera (p.ej. sprites SVG).
  async function liveAttrBlob(node, attr, baseDir) {
    var ref = node.getAttribute(attr);
    if (liveIsExternal(ref)) return;
    var hash = ref.indexOf('#') !== -1 ? ref.slice(ref.indexOf('#')) : '';
    var url = await liveBlobURL(liveResolve(baseDir, ref));
    if (url) node.setAttribute(attr, url + hash);
  }
  // Resuelve un srcset ("a.png 1x, b.png 2x, c.png 480w") → blob URLs.
  async function liveSrcset(node, attr, baseDir) {
    var val = node.getAttribute(attr);
    if (!val) return;
    var out = [], parts = val.split(',');
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i].trim(); if (!seg) continue;
      var sp = seg.split(/\s+/), u = sp.shift();
      if (!liveIsExternal(u)) { var b = await liveBlobURL(liveResolve(baseDir, u)); if (b) u = b; }
      out.push(sp.length ? (u + ' ' + sp.join(' ')) : u);
    }
    node.setAttribute(attr, out.join(', '));
  }

  // Genera el HTML autocontenido de la vista previa.
  async function liveBuildHtml() {
    var htmlText = await readFile(live.htmlPath);
    var baseDir = dirname(live.htmlPath);
    var doc = new DOMParser().parseFromString(htmlText, 'text/html');
    var slice = function (sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); };
    var i, node, ref, url;

    // <link rel="stylesheet"> → <style> inline (con url() resueltos).
    var links = slice('link[rel~="stylesheet"][href]');
    for (i = 0; i < links.length; i++) {
      node = links[i]; ref = node.getAttribute('href');
      if (liveIsExternal(ref)) continue;
      try {
        var css = await liveInlineCss(await readFile(liveResolve(baseDir, ref)), dirname(liveResolve(baseDir, ref)));
        var st = doc.createElement('style'); st.textContent = css;
        node.parentNode.replaceChild(st, node);
      } catch (e) {}
    }
    // <link rel="icon" | "apple-touch-icon"> → blob URL.
    var icons = slice('link[rel~="icon"][href], link[rel~="apple-touch-icon"][href]');
    for (i = 0; i < icons.length; i++) {
      node = icons[i]; ref = node.getAttribute('href');
      if (liveIsExternal(ref)) continue;
      url = await liveBlobURL(liveResolve(baseDir, ref)); if (url) node.setAttribute('href', url);
    }
    // <script src> local → inline.
    var scripts = slice('script[src]');
    for (i = 0; i < scripts.length; i++) {
      node = scripts[i]; ref = node.getAttribute('src');
      if (liveIsExternal(ref)) continue;
      try {
        var js = await readFile(liveResolve(baseDir, ref));
        var ns = doc.createElement('script');
        if (node.type) ns.type = node.type;
        ns.textContent = js;
        node.parentNode.replaceChild(ns, node);
      } catch (e) {}
    }
    // src en medios (img/source/video/audio/track/embed/iframe/input[type=image]).
    var media = slice('img[src],source[src],video[src],audio[src],track[src],embed[src],iframe[src],input[type="image"][src]');
    for (i = 0; i < media.length; i++) await liveAttrBlob(media[i], 'src', baseDir);
    // srcset en <img> y <source> (imágenes responsive).
    var sets = slice('img[srcset],source[srcset]');
    for (i = 0; i < sets.length; i++) await liveSrcset(sets[i], 'srcset', baseDir);
    // poster de <video> y data de <object>.
    var posters = slice('video[poster]');
    for (i = 0; i < posters.length; i++) await liveAttrBlob(posters[i], 'poster', baseDir);
    var objects = slice('object[data]');
    for (i = 0; i < objects.length; i++) await liveAttrBlob(objects[i], 'data', baseDir);
    // SVG: <use>/<image> con href y xlink:href.
    var svgRefs = slice('use, image');
    for (i = 0; i < svgRefs.length; i++) {
      if (svgRefs[i].hasAttribute('href')) await liveAttrBlob(svgRefs[i], 'href', baseDir);
      if (svgRefs[i].hasAttribute('xlink:href')) await liveAttrBlob(svgRefs[i], 'xlink:href', baseDir);
    }
    // Atributos style="...url()..." inline (fondos, máscaras…).
    var styled = slice('[style]');
    for (i = 0; i < styled.length; i++) {
      var sv = styled[i].getAttribute('style');
      if (sv && sv.indexOf('url(') !== -1) {
        try { styled[i].setAttribute('style', await liveInlineCss(sv, baseDir)); } catch (e) {}
      }
    }
    // <style> inline dentro del documento → resolver url().
    var styles = slice('style');
    for (i = 0; i < styles.length; i++) {
      try { styles[i].textContent = await liveInlineCss(styles[i].textContent, baseDir); } catch (e) {}
    }
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  function liveRevoke(list) {
    var arr = list || live.urls;
    for (var i = 0; i < arr.length; i++) { try { URL.revokeObjectURL(arr[i]); } catch (e) {} }
    if (!list) live.urls = [];
  }

  // Qué HTML previsualizar: el abierto, index.html, o el primer .html de la raíz.
  async function livePickHtml(openRel) {
    if (openRel && /\.html?$/i.test(openRel)) {
      var p = liveResolve(rootPath, openRel);
      if (await getFileHandleFor(p, false)) return p;
    }
    var idx = rootPath + '/index.html';
    if (await getFileHandleFor(idx, false)) return idx;
    var l = await tList(rootPath);
    if (l) for (var i = 0; i < l.files.length; i++) if (/\.html?$/i.test(l.files[i])) return rootPath + '/' + l.files[i];
    return null;
  }

  async function liveStart(rootDir, openRel) {
    if (!rootHandle) return { error: 'Abrí una carpeta primero.' };
    var htmlPath = await livePickHtml(openRel);
    if (!htmlPath) return { error: 'No encontré un archivo .html para previsualizar.' };
    live.htmlPath = htmlPath;
    liveRevoke();
    var html;
    try { html = await liveBuildHtml(); }
    catch (e) { return { error: (e && e.message) || 'No se pudo generar la vista previa.' }; }
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    live.urls.push(url);
    if (live.win && !live.win.closed) live.win.location.replace(url);
    else live.win = window.open(url, 'hydra-live-preview');
    if (!live.win) { liveRevoke(); return { error: 'El navegador bloqueó la ventana. Permití pop-ups para la vista previa.' }; }
    live.active = true;
    return { ok: true, port: 1, web: true, file: basename(htmlPath) };
  }

  function liveStop() {
    live.active = false;
    if (live.reloadT) { clearTimeout(live.reloadT); live.reloadT = null; }
    try { if (live.win && !live.win.closed) live.win.close(); } catch (e) {}
    live.win = null;
    liveRevoke();
    return true;
  }

  // Regenera y recarga la vista previa tras guardar (con debounce). La llama saveFile().
  function liveScheduleReload() {
    if (!live || !live.active) return;
    if (live.win && live.win.closed) { live.active = false; live.win = null; return; }
    if (live.reloadT) clearTimeout(live.reloadT);
    live.reloadT = setTimeout(async function () {
      live.reloadT = null;
      if (!live.active || !live.win || live.win.closed) return;
      var old = live.urls; live.urls = [];
      try {
        var html = await liveBuildHtml();
        var url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        live.urls.push(url);
        live.win.location.replace(url);
        liveRevoke(old); // recién ahora revocamos los blobs de la versión anterior
      } catch (e) { live.urls = old; }
    }, 250);
  }

  // ==========================================================================
  // window.api — mismo contrato que src/preload.js
  // ==========================================================================
  window.api = {
    // --- Archivos / carpetas ---
    openFolder: openFolder,
    readFile: readFile,
    readImage: readImage,
    saveFile: saveFile,
    search: search,
    tree: tree,
    createFile: createFile,
    createFolder: createFolder,
    rename: rename,
    delete: del,
    exists: exists,
    watchFolder: function () { return false; }, // sin watcher en el navegador
    onFsChange: function () {},

    // --- Núcleo / estado ---
    coreStatus: function () { return 'js'; },
    getState: async function () { return getState(); },
    setState: function (patch) { return setState(patch); },
    appVersion: async function () { return VERSION; },

    // --- Ventana (sin marco propio en el navegador) ---
    win: noop,

    // --- Portapapeles ---
    clipboardWrite: clipboardWrite,
    clipboardRead: clipboardRead,

    // --- Externo ---
    openExternal: openExternal,
    openPath: openPath,

    // --- Login con Google ---
    externalGoogleLogin: externalGoogleLogin,
    onAuthCredential: onAuthCredential,

    // --- Terminal: shell del navegador sobre los archivos reales (arriba) ---
    termStart: function (cwd) { return termStart(cwd); },
    termInput: function (data) { tFeed(String(data)); return true; },
    termResize: noop, // el ancho lo maneja xterm/fit; no reflowamos la salida
    onTermData: function (cb) { termDataCb = cb; },
    onTermExit: function (cb) { termExitCb = cb; },

    // --- IA: DESACTIVADA en el navegador (las claves viven en el main) ---
    aiChat: async function () {
      if (aiStatusCb) { try { aiStatusCb('Hydra AI sólo está disponible en la app de escritorio.'); } catch (e) {} }
      return { ok: false, finishReason: 'unavailable' };
    },
    aiComplete: async function () { return { text: '' }; },
    aiStop: noop,
    aiRun: async function () { return { ok: false, output: '' }; },
    aiDelete: async function () { return false; },
    aiWriteFile: async function () { return false; },
    onAiChunk: function (cb) { aiChunkCb = cb; },
    onAiStatus: function (cb) { aiStatusCb = cb; },

    // --- Lumin AI: desactivada en el navegador (las claves viven en el main) ---
    luminChat: async function () {
      if (luminChunkCb) { try { luminChunkCb('Lumin AI sólo está disponible en la app de escritorio.'); } catch (e) {} }
      return { ok: false };
    },
    luminStop: noop,
    onLuminChunk: function (cb) { luminChunkCb = cb; },

    // --- Actualizaciones (electron-updater; UI oculta por web.css) ---
    checkUpdates: async function () { return { available: false }; },
    installUpdate: noop,
    onUpdateStatus: function () {},

    // --- Hydra Live: vista previa en el navegador (blob URLs; recarga al guardar) ---
    liveStart: function (rootDir, openRel) { return liveStart(rootDir, openRel); },
    liveStop: function () { return liveStop(); },
    liveStatus: async function () { return { running: !!(live && live.active) }; },

    // --- Git (requiere binario local; UI oculta por web.css) ---
    gitLog: async function () { return []; },
    gitBranch: async function () { return null; },
    gitInit: async function () { return false; },
    gitStatus: async function () { return null; },
    gitStage: noop,
    gitUnstage: noop,
    gitDiscard: noop,
    gitCommit: async function () { return false; },

    // --- Python (requiere intérprete local) ---
    pythonDetect: async function () { return []; },
    pythonVersion: async function () { return null; },

    // --- Hydra Team (colaboración: carpeta local) ---
    teamDir: async function () { throw new Error('Hydra Team sólo está disponible en la app de escritorio.'); },

    // --- Claude Code (SDK de Node; imposible en el navegador) ---
    claudeDetect: async function () { return false; },
    claudeStart: async function () { return false; },
    claudeSend: noop,
    claudeInterrupt: noop,
    claudeSetMode: noop,
    claudeSetModel: noop,
    claudeAuthStatus: async function () { return { authenticated: false }; },
    claudePermissionReply: noop,
    onClaudeEvent: function (cb) { claudeEventCb = cb; },
    onClaudePermission: function (cb) { claudePermCb = cb; },
  };
})();
