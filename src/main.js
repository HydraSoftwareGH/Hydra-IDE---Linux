// Proceso PRINCIPAL de Electron (Node.js).
// Aquí vive el acceso al sistema operativo: abrir ventanas, leer/escribir
// archivos y llamar al núcleo en C++. La interfaz (renderer) NO toca el disco
// directamente: nos pide cosas por IPC y nosotros respondemos.

const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const fsSync = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn, exec, execFile } = require('child_process');
// node-pty es un módulo nativo. Si no está compilado para esta plataforma
// (p. ej. un empaquetado de Linux hecho en otra máquina sin el prebuild),
// seguimos arrancando sin terminal integrada en vez de romper toda la app.
let pty = null;
try {
  pty = require('node-pty');
} catch (err) {
  console.warn('[hydra] node-pty no disponible: la terminal integrada estará deshabilitada.', err && err.message);
}
const discord = require('./discord-presence'); // Rich Presence de Discord (se activa solo con el IDE abierto)

// Actividad base que se muestra en Discord al abrir Hydra IDE. El renderer la
// enriquece luego (proyecto/archivo abierto) por IPC 'discord:activity'.
const DISCORD_BASE_ACTIVITY = {
  details: 'Programando en Hydra IDE',
  state: 'Editor de código',
  largeImage: 'hydra_ide',
  largeText: 'Hydra IDE',
};

// --- Sandbox de rutas -----------------------------------------------------
// El renderer (y por lo tanto cualquier extensión o respuesta de la IA) NO debe
// poder leer/escribir/borrar archivos arbitrarios del disco. Solo permitimos
// tocar carpetas que el usuario abrió explícitamente con el diálogo del sistema
// (más la carpeta de Hydra Team). La lista se persiste en userData y SOLO se
// amplía desde acciones con consentimiento del usuario (diálogo de "abrir
// carpeta"), nunca desde una ruta cruda que mande el renderer.
let allowedRoots = [];
function rootsFile() { return path.join(app.getPath('userData'), 'hydra-roots.json'); }
function loadRoots() {
  if (fsSync.existsSync(rootsFile())) {
    try { const arr = JSON.parse(fsSync.readFileSync(rootsFile(), 'utf-8')); allowedRoots = Array.isArray(arr) ? arr : []; }
    catch { allowedRoots = []; }
    return;
  }
  // Migración ÚNICA (primer arranque tras el update): sembramos la última carpeta
  // que el usuario tenía abierta — la lee el main de su propio archivo de estado,
  // no de una ruta cruda del renderer. Después, el archivo de roots ya existe y
  // esto no se repite: las nuevas carpetas entran solo por el diálogo del SO.
  allowedRoots = [];
  try {
    const st = JSON.parse(fsSync.readFileSync(stateFile(), 'utf-8'));
    if (st && st.lastFolder && fsSync.existsSync(st.lastFolder)) allowedRoots.push(path.resolve(st.lastFolder));
  } catch {}
  persistRoots(); // crea el archivo → marca la migración como hecha
}
function persistRoots() { try { fsSync.writeFileSync(rootsFile(), JSON.stringify(allowedRoots.slice(-100))); } catch {} }
function registerRoot(p) {
  if (!p) return;
  let abs; try { abs = path.resolve(p); } catch { return; }
  if (!allowedRoots.includes(abs)) { allowedRoots.push(abs); persistRoots(); }
}
// ¿`target` está dentro de alguna carpeta permitida?
function isInsideRoots(target) {
  if (!target) return false;
  let abs; try { abs = path.resolve(target); } catch { return false; }
  return allowedRoots.some((root) => {
    const rel = path.relative(root, abs);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}
// Lanza si la ruta queda fuera del sandbox; devuelve la ruta resuelta si pasa.
function assertInside(target) {
  if (!isInsideRoots(target)) {
    const e = new Error('Acceso denegado: la ruta está fuera de las carpetas abiertas en Hydra IDE.');
    e.code = 'EACCES_SANDBOX';
    throw e;
  }
  return path.resolve(target);
}
// Escapa HTML para no reflejar entradas sin sanear en las páginas que servimos.
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Comprueba que una ruta resuelta siga estando DENTRO de `base` (anti traversal).
function isInsideDir(base, candidate) {
  const rel = path.relative(base, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// --- Carga del núcleo C++ -------------------------------------------------
// Si el addon aún no está compilado (faltan las Build Tools de C++), seguimos
// funcionando con una implementación de respaldo en JavaScript.
let core = null;
try {
  core = require('../build/Release/hydra_core.node');
} catch (err) {
  // Sin módulo nativo: se usa el respaldo en JavaScript, en silencio.
}

// User-Agent de Chrome (sin el token "Electron") para que Google acepte el
// login de OAuth, que de otro modo bloquea por "navegador embebido".
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_UA;
let loginWin = null;  // (reservado) ventana interna de login
let loginProc = null; // (reservado) proceso de navegador de login
const HYDRA_WEB = 'https://hydra-ide-official.vercel.app';

// Ventana de login activa: el callback /__authcb solo se acepta mientras esté
// abierta (la inicia el usuario) y se cierra sola a los 3 min.
let authExpected = false;
let authNonce = null;
let authExpectTimer = null;
function expectAuth() {
  authNonce = crypto.randomBytes(16).toString('hex');
  authExpected = true;
  clearTimeout(authExpectTimer);
  authExpectTimer = setTimeout(() => { authExpected = false; authNonce = null; }, 3 * 60 * 1000);
  return authNonce;
}

// --- Servidor estático del propio IDE -------------------------------------
// Firebase Auth NO funciona bajo file://; servimos el renderer por http://localhost
// para que `location.protocol` sea http y el almacenamiento web esté habilitado.
const RENDERER_DIR = path.join(__dirname, 'renderer');
const APP_MIME = {
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', map: 'application/json', wasm: 'application/wasm',
};
let appPort = 0;
function startAppServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    // Callback del login (la web oficial nos devuelve el credencial por GET o POST).
    if (urlPath === '/__authcb') {
      // Defensa contra CSRF de login: solo aceptamos el callback (1) durante una
      // ventana de login que el usuario inició, (2) desde la web oficial cuando
      // el navegador manda Origin/Referer y (3) con el `state` correcto si la web
      // lo reenvía. Sin esto, cualquier web podría forzar una sesión ajena.
      const origin = String(req.headers.origin || '');
      const referer = String(req.headers.referer || '');
      const hasHeaders = !!(origin || referer);
      const fromOfficial = !hasHeaders || origin.startsWith(HYDRA_WEB) || referer.startsWith(HYDRA_WEB);
      const reject = () => { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Forbidden'); };
      if (!authExpected || !fromOfficial) { reject(); return; }

      const deliver = (data) => {
        // Validar el nonce si la web lo reenvía (compatibilidad: si no lo manda,
        // igual quedamos protegidos por la ventana de login + el chequeo de origen).
        if (authNonce && data && data.state && data.state !== authNonce) { reject(); return; }
        authExpected = false; authNonce = null; // un solo uso
        try {
          const main = BrowserWindow.getAllWindows().find((w) => w !== loginWin);
          if (main && !main.isDestroyed()) main.webContents.send('auth:credential', { idToken: data && data.idToken, accessToken: data && data.accessToken });
        } catch {}
        setTimeout(() => {
          if (loginWin && !loginWin.isDestroyed()) loginWin.close();
          if (loginProc) { try { loginProc.kill(); } catch {} loginProc = null; }
        }, 700);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><meta charset=utf-8><body style="font-family:Segoe UI,system-ui,sans-serif;background:#0f1016;color:#c8ccda;text-align:center;padding:60px"><h2><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#22c55e;position:relative;vertical-align:-4px;margin-right:8px"><span style="position:absolute;left:7px;top:3px;width:5px;height:10px;border:solid #0f1016;border-width:0 2px 2px 0;transform:rotate(45deg)"></span></span>Sesión iniciada</h2><p>Ya pod&eacute;s volver a Hydra IDE. Pod&eacute;s cerrar esta pesta&ntilde;a.</p></body>');
      };
      if (req.method === 'GET') {
        const q = new URL(req.url, 'http://localhost').searchParams;
        deliver({ idToken: q.get('idToken'), accessToken: q.get('accessToken'), state: q.get('state') });
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => { let data = {}; try { data = JSON.parse(body || '{}'); } catch {} deliver(data); });
        return;
      }
      reject();
      return;
    }
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = path.join(RENDERER_DIR, urlPath);
    if (!isInsideDir(RENDERER_DIR, filePath)) { res.writeHead(403); res.end('Forbidden'); return; }
    fsSync.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath).slice(1).toLowerCase();
      res.writeHead(200, { 'Content-Type': APP_MIME[ext] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  // Puerto FIJO (con respaldo) para que el origen sea estable y la sesión de
  // Firebase persista entre reinicios.
  return new Promise((resolve) => {
    let port = 7421;
    const tryListen = () => {
      server.removeAllListeners('error');
      server.once('error', () => { if (port < 7430) { port++; tryListen(); } else resolve(0); });
      server.listen(port, '127.0.0.1', () => { appPort = port; resolve(port); });
    };
    tryListen();
  });
}

// --- Auto-actualización (electron-updater + GitHub Releases) ---------------
// En la app INSTALADA, revisa GitHub Releases, descarga la versión nueva en
// segundo plano y la instala al reiniciar. En modo desarrollo (npm start) no
// corre, porque no hay app empaquetada contra la cual comparar.
function setupAutoUpdates(win) {
  if (!app.isPackaged) return; // solo en la app instalada
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (status, data) => {
    try { win.webContents.send('update:status', Object.assign({ status }, data || {})); } catch {}
  };
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info && info.version }));
  autoUpdater.on('update-not-available', () => send('none'));
  autoUpdater.on('error', (err) => send('error', { message: String((err && err.message) || err) }));
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => send('ready', { version: info && info.version }));

  // Primer chequeo a los pocos segundos y luego cada hora.
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { dev: true };
  try { const r = await autoUpdater.checkForUpdates(); return { ok: true, version: r && r.updateInfo && r.updateInfo.version }; }
  catch (e) { return { error: String((e && e.message) || e) }; }
});
ipcMain.handle('update:install', () => { try { autoUpdater.quitAndInstall(); } catch {} });


function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 700,
    minHeight: 450,
    backgroundColor: '#1e1e1e',
    frame: false,           // usamos nuestra propia barra de título (estilo VS Code)
    titleBarStyle: 'hidden',
    title: 'Hydra IDE',
    icon: path.join(__dirname, 'renderer', 'app-icon.png'), // icono de Hydra IDE
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // la UI no ve Node directamente (seguridad)
      nodeIntegration: false,
    },
  });

  // Cargar por http://localhost (necesario para Firebase Auth); si el server
  // no levantó, caer a file:// como respaldo.
  if (appPort) win.loadURL(`http://127.0.0.1:${appPort}/index.html`);
  else win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Matar el shell y la sesión de Claude asociados a esta ventana al cerrarse.
  win.webContents.on('destroyed', () => { killShell(win.webContents.id); claudeStop(win.webContents.id); });

  // Permitir el popup de autenticación de Firebase/Google (window.open).
  // Allowlist por HOSTNAME exacto/sufijo (no por substring): así "google.com.evil.com"
  // o "evil.com/?x=google.com" NO pasan el filtro.
  const AUTH_HOST_SUFFIXES = ['.google.com', '.firebaseapp.com', '.googleusercontent.com', '.gstatic.com', '.googleapis.com'];
  const isAuthHost = (host) => AUTH_HOST_SUFFIXES.some((suf) => host === suf.slice(1) || host.endsWith(suf));
  win.webContents.setWindowOpenHandler(({ url }) => {
    let u;
    try { u = new URL(url); } catch { return { action: 'deny' }; }
    if ((u.protocol === 'https:' || u.protocol === 'http:') && isAuthHost(u.hostname.toLowerCase())) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500, height: 650, autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        },
      };
    }
    // Cualquier otro enlace externo se abre en el navegador del sistema (solo http/https).
    if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(url);
    return { action: 'deny' };
  });
  // No permitir que la ventana principal navegue fuera de su propio origen
  // (defiende contra secuestro de navegación desde el renderer).
  win.webContents.on('will-navigate', (e, url) => {
    const ok = appPort && (url.startsWith(`http://127.0.0.1:${appPort}`) || url.startsWith(`http://localhost:${appPort}`));
    if (!ok) e.preventDefault();
  });
  // Diagnóstico: reenviar SOLO errores del renderer al stdout.
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) console.log('[renderer]', message);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[renderer-gone]', d && d.reason));
  return win;
}

// Controles de la ventana (los pide la barra de título personalizada).
ipcMain.handle('win:action', (evt, action) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});

// --- Terminal integrada (PTY real, node-pty / ConPTY) ---------------------
// Igual que VS Code: un pseudo-terminal de verdad. El shell hace su propio eco,
// historial, prompt y maneja Ctrl+C como señal real. La UI (xterm) solo envía
// las teclas y muestra los bytes que llegan.
// Soporta varias sesiones por ventana (terminal normal + Claude Code, etc.),
// con clave compuesta `${webContents.id}:${sessionId}`. sessionId por defecto: 'main'.
const shells = new Map(); // `${wc.id}:${sessionId}` -> IPty
const shellKey = (wcId, sessionId) => wcId + ':' + (sessionId || 'main');

// Mata TODAS las sesiones de una ventana (al destruirse el webContents).
function killShell(id) {
  for (const [key, p] of shells) {
    if (key.startsWith(id + ':')) { try { p.kill(); } catch {} shells.delete(key); }
  }
}

ipcMain.handle('term:start', (evt, cwd, cols, rows, sessionId, command) => {
  if (!pty) return false; // sin módulo nativo no hay terminal integrada
  const wc = evt.sender;
  const sid = sessionId || 'main';
  const key = shellKey(wc.id, sid);
  if (shells.has(key)) return true; // ya hay una sesión con ese id en esta ventana
  const shell = process.platform === 'win32'
    ? (process.env.ComSpec || 'cmd.exe')
    : (process.env.SHELL || '/bin/bash');
  const ptyProc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || os.homedir(),
    env: process.env,
  });
  shells.set(key, ptyProc);
  // Eventos con namespace por sesión, para que cada xterm reciba solo lo suyo.
  ptyProc.onData((data) => { if (!wc.isDestroyed()) wc.send('term:data:' + sid, data); });
  ptyProc.onExit(({ exitCode }) => {
    shells.delete(key);
    if (!wc.isDestroyed()) wc.send('term:exit:' + sid, exitCode);
  });
  // Comando inicial opcional (p. ej. lanzar `claude` escribiéndolo en el shell).
  if (command) { try { ptyProc.write(command + '\r'); } catch {} }
  return true;
});

ipcMain.handle('term:input', (evt, data, sessionId) => {
  const p = shells.get(shellKey(evt.sender.id, sessionId));
  if (p) { try { p.write(data); } catch {} }
});

// Redimensionado REAL del PTY (para que las apps interactivas se ajusten).
ipcMain.handle('term:resize', (evt, cols, rows, sessionId) => {
  const p = shells.get(shellKey(evt.sender.id, sessionId));
  if (p && cols > 0 && rows > 0) { try { p.resize(cols, rows); } catch {} }
});

// Cierra UNA sesión concreta (al cerrar una terminal en la UI). El resto sigue.
ipcMain.handle('term:kill', (evt, sessionId) => {
  const key = shellKey(evt.sender.id, sessionId);
  const p = shells.get(key);
  if (p) { try { p.kill(); } catch {} shells.delete(key); }
  return true;
});


// --- Hydra Live (servidor estático con recarga automática, tipo Live Server) -
let liveServer = null, liveClients = [], liveWatcher = null, liveRoot = null, livePort = 0, liveReloadTimer = null;

const LIVE_MIME = {
  html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript',
  css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  txt: 'text/plain', wasm: 'application/wasm', mp4: 'video/mp4', mp3: 'audio/mpeg', map: 'application/json',
};
// Script inyectado en cada HTML: escucha cambios por SSE y recarga la página.
const LIVE_SNIPPET = `\n<script>(function(){try{var es=new EventSource('/__hydralive');es.onmessage=function(e){if(e.data==='reload')location.reload();};}catch(_){}})();</script>`;

function liveBroadcast() {
  for (const res of liveClients) { try { res.write('data: reload\n\n'); } catch {} }
}

function startLive(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      // Canal de eventos (SSE) para la recarga.
      if (urlPath === '/__hydralive') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(': ok\n\n');
        liveClients.push(res);
        req.on('close', () => { liveClients = liveClients.filter((c) => c !== res); });
        return;
      }
      let filePath = path.join(root, urlPath);
      // Anti path-traversal: la ruta resuelta tiene que seguir dentro de `root`.
      if (!isInsideDir(root, filePath)) { res.writeHead(403); res.end('Forbidden'); return; }
      fsSync.stat(filePath, (err, st) => {
        if (!err && st.isDirectory()) {
          const idx = path.join(filePath, 'index.html');
          if (fsSync.existsSync(idx)) { filePath = idx; }
          else {
            const items = fsSync.readdirSync(filePath).sort();
            const up = urlPath !== '/' ? `<li><a href="${escHtml(path.posix.dirname(urlPath))}">..</a></li>` : '';
            const li = items.map((n) => `<li><a href="${escHtml(path.posix.join(urlPath, n))}">${escHtml(n)}</a></li>`).join('');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html><meta charset=utf-8><title>${escHtml(urlPath)}</title><body style="font-family:Segoe UI,sans-serif;background:#14151b;color:#c8ccda;padding:24px"><h2>${escHtml(urlPath)}</h2><ul>${up}${li}</ul>${LIVE_SNIPPET}`);
            return;
          }
        }
        fsSync.readFile(filePath, (e2, buf) => {
          if (e2) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<body style="font-family:sans-serif;background:#14151b;color:#c8ccda;padding:24px"><h1>404</h1><p>${escHtml(urlPath)}</p>${LIVE_SNIPPET}`); return; }
          const ext = path.extname(filePath).slice(1).toLowerCase();
          if (ext === 'html' || ext === 'htm') {
            let html = buf.toString('utf-8');
            html = html.includes('</body>') ? html.replace('</body>', LIVE_SNIPPET + '</body>') : html + LIVE_SNIPPET;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
          } else {
            res.writeHead(200, { 'Content-Type': LIVE_MIME[ext] || 'application/octet-stream' });
            res.end(buf);
          }
        });
      });
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port < 5520) startLive(root, port + 1).then(resolve, reject);
      else reject(err);
    });
    server.listen(port, '127.0.0.1', () => {
      liveServer = server; liveRoot = root; livePort = port;
      try {
        liveWatcher = fsSync.watch(root, { recursive: true }, () => {
          clearTimeout(liveReloadTimer);
          liveReloadTimer = setTimeout(liveBroadcast, 120);
        });
      } catch {}
      resolve(port);
    });
  });
}

function stopLive() {
  for (const res of liveClients) { try { res.end(); } catch {} }
  liveClients = [];
  if (liveWatcher) { try { liveWatcher.close(); } catch {} liveWatcher = null; }
  if (liveServer) { try { liveServer.close(); } catch {} liveServer = null; }
  liveRoot = null; livePort = 0;
}

ipcMain.handle('live:start', async (_evt, root, openRel) => {
  if (!root) return { error: 'Sin carpeta' };
  const open = (port) => { shell.openExternal(`http://localhost:${port}/${openRel || ''}`); };
  if (liveServer && liveRoot === root) { open(livePort); return { port: livePort }; }
  if (liveServer) stopLive();
  try { const port = await startLive(root, 5500); open(port); return { port }; }
  catch (e) { return { error: e.message }; }
});

// Sesión propia para el login: se presenta como Chrome de verdad (UA + Client
// Hints sin "Electron") para que Google no bloquee el OAuth.
let authSessionReady = false;
function authSession() {
  const ses = session.fromPartition('persist:hydra-auth');
  if (!authSessionReady) {
    authSessionReady = true;
    ses.setUserAgent(CHROME_UA);
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      const h = details.requestHeaders;
      h['User-Agent'] = CHROME_UA;
      h['sec-ch-ua'] = '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"';
      h['sec-ch-ua-mobile'] = '?0';
      h['sec-ch-ua-platform'] = '"Windows"';
      delete h['X-Requested-With'];
      cb({ requestHeaders: h });
    });
  }
  return ses;
}

// --- Hydra AI (chat con Groq) — RETIRADO -----------------------------------
// Los servicios de IA que dependían de APIs externas (Groq y Lumin) se
// retiraron de esta build pública. Los handlers responden con un aviso de
// servicio no disponible y no realizan ninguna llamada de red ni contienen
// claves. Para reactivarlos habría que enchufar un backend proxy propio.
const AI_UNAVAILABLE = 'Este servicio no está disponible.';
let aiAbort = null;

ipcMain.handle('ai:chat', async (evt) => {
  const wc = evt.sender;
  // Servicio de IA (Groq) retirado: respondemos con el aviso, sin llamadas de red.
  if (!wc.isDestroyed()) wc.send('ai:chunk', AI_UNAVAILABLE);
  return { ok: true, finishReason: 'stop' };
});

ipcMain.handle('ai:stop', () => { if (aiAbort) { try { aiAbort.abort(); } catch {} } });

// --- Lumin AI (extensión "Lumin AI Chat") — RETIRADO -----------------------
// Dependía de un endpoint externo (Lumin Labs) con token embebido. Retirado de
// esta build: el handler responde con el aviso de servicio no disponible.
let luminAbort = null;

ipcMain.handle('lumin:chat', async (evt) => {
  const wc = evt.sender;
  if (!wc.isDestroyed()) wc.send('lumin:chunk', AI_UNAVAILABLE);
  return { ok: true, finishReason: 'stop' };
});

ipcMain.handle('lumin:stop', () => { if (luminAbort) { try { luminAbort.abort(); } catch {} } });

// Completación de código en línea (estilo "copilot"): dependía de Groq. Retirada
// junto con la IA; devuelve siempre vacío para no mostrar sugerencias fantasma.
ipcMain.handle('ai:complete', async () => {
  return { text: '' };
});

// Crear/reemplazar un archivo con contenido (crea las carpetas que falten).
ipcMain.handle('ai:writeFile', async (_evt, target, content) => {
  try {
    assertInside(target); // solo dentro de carpetas abiertas
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content != null ? content : '', 'utf-8');
    return { ok: true };
  } catch (e) { return { error: e.message }; }
});

// Borrado robusto (archivos/carpetas, recursivo y forzado, con reintentos por locks).
ipcMain.handle('ai:delete', async (_evt, target) => {
  try {
    assertInside(target); // solo dentro de carpetas abiertas
    await fs.rm(target, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
    return { ok: true };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs:exists', (_evt, p) => { try { return isInsideRoots(p) && fsSync.existsSync(p); } catch { return false; } });

// Hydra AI puede ejecutar comandos en la carpeta del proyecto. El cwd DEBE ser
// una carpeta abierta por el usuario (no se permite ejecutar en cualquier lado).
ipcMain.handle('ai:run', (_evt, cmd, cwd) => new Promise((resolve) => {
  if (!cwd || !isInsideRoots(cwd)) {
    resolve({ stdout: '', stderr: 'Comando bloqueado: solo se puede ejecutar dentro de una carpeta abierta en Hydra IDE.', code: 126 });
    return;
  }
  exec(cmd, { cwd, timeout: 120000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
    resolve({
      stdout: String(stdout || '').slice(0, 8000),
      stderr: String(stderr || '').slice(0, 4000),
      code: err && typeof err.code === 'number' ? err.code : (err ? 1 : 0),
    });
  });
}));

// Abrir una URL externa de forma SEGURA (sin pasar por el shell → sin inyección).
// Solo http/https/mailto; nada de comandos del sistema.
ipcMain.handle('shell:openExternal', (_evt, url) => {
  try {
    const u = new URL(String(url));
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
      shell.openExternal(u.href);
      return { ok: true };
    }
    return { error: 'Protocolo no permitido.' };
  } catch (e) { return { error: 'URL inválida.' }; }
});

// Abrir un archivo local con la app por defecto del SO, validado contra el sandbox.
ipcMain.handle('shell:openPath', async (_evt, p) => {
  try {
    assertInside(p);
    const msg = await shell.openPath(path.resolve(p));
    return msg ? { error: msg } : { ok: true };
  } catch (e) { return { error: e.message }; }
});

// --- Git Graph: leer el historial de commits del repositorio --------------
// Usamos execFile (NO exec) para pasar el formato de `git log` como argumentos
// directos, sin pasar por el shell. Así evitamos los problemas de comillas y de
// expansión de `%VAR%` de cmd.exe en Windows con el `--pretty=format:%H…`.
const GIT_FS = '\x1f'; // separador de campos (unit separator)
const GIT_RS = '\x1e'; // separador de registros (record separator)

function runGit(cwd, args) {
  return new Promise((resolve) => {
    if (!cwd) return resolve({ error: 'no-folder' });
    execFile('git', args, { cwd, windowsHide: true, timeout: 25000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = String(stderr || err.message || '');
          if (err.code === 'ENOENT') return resolve({ error: 'no-git' });
          if (/not a git repository/i.test(msg)) return resolve({ error: 'not-a-repo' });
          return resolve({ error: msg.trim().slice(0, 400) || 'git-error' });
        }
        resolve({ ok: true, raw: String(stdout || '') });
      });
  });
}

// Devuelve el log con grafo (todos los refs) ya formateado para parsear en la UI.
ipcMain.handle('git:log', (_evt, cwd, limit) => {
  const max = Math.min(Math.max(parseInt(limit, 10) || 400, 1), 2000);
  const fmt = ['%H', '%P', '%an', '%ae', '%ad', '%D', '%s'].join(GIT_FS) + GIT_RS;
  return runGit(cwd, [
    'log', '--all', '--topo-order', '--date=format:%Y-%m-%d %H:%M',
    '--pretty=format:' + fmt, '--max-count=' + max,
  ]);
});

// Rama actual (HEAD). Vacío si está en estado "detached".
ipcMain.handle('git:branch', async (_evt, cwd) => {
  const r = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (r && r.ok) return { ok: true, branch: r.raw.trim() };
  return r;
});

// Inicializa un repositorio Git en la carpeta abierta.
ipcMain.handle('git:init', (_evt, cwd) => runGit(cwd, ['init']));

// --- Control de código fuente (SCM) ---------------------------------------
// Estado del árbol de trabajo: rama + archivos modificados (formato porcelain).
ipcMain.handle('git:status', (_evt, cwd) =>
  runGit(cwd, ['status', '--porcelain=v1', '-b', '--untracked-files=all']));

// Preparar (stage) un archivo o todos.
ipcMain.handle('git:stage', (_evt, cwd, file) =>
  runGit(cwd, file ? ['add', '--', file] : ['add', '-A']));

// Quitar de preparados (unstage) un archivo o todos.
ipcMain.handle('git:unstage', (_evt, cwd, file) =>
  runGit(cwd, file ? ['restore', '--staged', '--', file] : ['reset']));

// Descartar cambios del árbol de trabajo de un archivo (revierte a HEAD).
ipcMain.handle('git:discard', (_evt, cwd, file) =>
  runGit(cwd, ['checkout', 'HEAD', '--', file]));

// Crear un commit con los cambios preparados.
ipcMain.handle('git:commit', (_evt, cwd, message) =>
  runGit(cwd, ['commit', '-m', String(message || '').trim() || 'Sin mensaje']));

// --- Python: detección de intérpretes instalados --------------------------
function execFileText(cmd, args, timeout) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeout || 8000 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

ipcMain.handle('python:detect', async () => {
  const candidates = new Set();
  const whereCmd = process.platform === 'win32' ? 'where' : 'which';
  // Buscar python/python3/py en el PATH.
  for (const name of ['python', 'python3']) {
    const out = await execFileText(whereCmd, [name]);
    for (const line of out.split(/\r?\n/)) {
      const p = line.trim();
      // Evitar el alias de la Microsoft Store (stub que abre la tienda).
      if (p && !/WindowsApps/i.test(p)) candidates.add(p);
    }
  }
  // En Windows, el lanzador `py -0p` lista las rutas reales de cada versión.
  if (process.platform === 'win32') {
    const pyPaths = await execFileText('py', ['-0p']);
    for (const line of pyPaths.split(/\r?\n/)) {
      const m = line.match(/([A-Za-z]:\\[^\r\n]*?python\.exe)/i);
      if (m) candidates.add(m[1]);
    }
  }
  // Obtener la versión de cada candidato.
  const interpreters = [];
  for (const p of candidates) {
    const v = (await execFileText(p, ['--version'], 6000)).trim();
    if (v) interpreters.push({ path: p, version: v.replace(/^Python\s*/i, '').trim() });
  }
  return { ok: true, interpreters };
});

// Versión de un intérprete concreto (para validar el seleccionado).
ipcMain.handle('python:version', async (_evt, interp) => {
  const v = (await execFileText(interp || 'python', ['--version'], 6000)).trim();
  return v ? { ok: true, version: v.replace(/^Python\s*/i, '').trim() } : { error: 'no-python' };
});

// --- Claude Code: ¿está instalado el CLI `claude`? -------------------------
// Mismo patrón que python:detect: buscar en el PATH con where/which y leer la
// versión. Devuelve { installed, version, path } para la pantalla de bienvenida.
ipcMain.handle('claude:detect', async () => {
  const whereCmd = process.platform === 'win32' ? 'where' : 'which';
  const out = await execFileText(whereCmd, ['claude']);
  let claudePath = '';
  for (const line of out.split(/\r?\n/)) {
    const p = line.trim();
    if (p && !/WindowsApps/i.test(p)) { claudePath = p; break; }
  }
  if (!claudePath) return { installed: false };
  const raw = (await execFileText('claude', ['--version'], 8000)).trim();
  const m = raw.match(/\d+\.\d+\.\d+/);
  return { installed: true, path: claudePath, version: m ? m[0] : raw };
});

// --- Claude Code (Agent SDK): sesión GUI headless --------------------------
// Maneja el motor real de Claude Code con @anthropic-ai/claude-agent-sdk.
// El SDK es ESM: se carga con import() dinámico y se cachea.
let _claudeSdk = null;
async function claudeSdk() {
  if (!_claudeSdk) _claudeSdk = await import('@anthropic-ai/claude-agent-sdk');
  return _claudeSdk;
}
const claudeSessions = new Map(); // wc.id -> { q, input, permResolvers, seq }

// ¿Hay sesión iniciada para Claude Code? Detecta como VS Code: variables de
// entorno (API key / tokens), credenciales OAuth guardadas, o config de Claude.
ipcMain.handle('claude:auth-status', async (_evt, apiKey) => {
  if (apiKey || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { authed: true, method: 'env' };
  }
  const home = os.homedir();
  // 1) Credenciales OAuth del login interactivo de `claude`.
  for (const f of [path.join(home, '.claude', '.credentials.json'), path.join(home, '.config', 'claude', '.credentials.json')]) {
    try { await fs.access(f); return { authed: true, method: 'subscription' }; } catch {}
  }
  // 2) Config principal de Claude Code: cuenta OAuth o API key ya configuradas.
  for (const f of [path.join(home, '.claude.json'), path.join(home, '.claude', 'config.json')]) {
    try {
      const cfg = JSON.parse(await fs.readFile(f, 'utf8'));
      if (cfg && (cfg.oauthAccount || cfg.primaryApiKey || cfg.customApiKeyResponses || cfg.apiKeyHelper)) {
        return { authed: true, method: 'subscription' };
      }
    } catch {}
  }
  return { authed: false };
});

// Cola de entrada en streaming (async iterable empujable) para multi-turno.
function makeClaudeInput() {
  const buf = []; let resolveNext = null; let ended = false;
  const iterable = { [Symbol.asyncIterator]() { return { next() {
    if (buf.length) return Promise.resolve({ value: buf.shift(), done: false });
    if (ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise((r) => { resolveNext = r; });
  } }; } };
  return {
    iterable,
    push(msg) { if (resolveNext) { const r = resolveNext; resolveNext = null; r({ value: msg, done: false }); } else buf.push(msg); },
    end() { ended = true; if (resolveNext) { const r = resolveNext; resolveNext = null; r({ value: undefined, done: true }); } },
  };
}
function claudeUserMsg(text) {
  return { type: 'user', message: { role: 'user', content: String(text || '') }, parent_tool_use_id: null };
}
function claudeStop(wcId) {
  const s = claudeSessions.get(wcId);
  if (s) { s.aborted = true; try { s.q && s.q.interrupt && s.q.interrupt(); } catch {} try { s.input.end(); } catch {} claudeSessions.delete(wcId); }
}

ipcMain.handle('claude:start', async (evt, cwd, prompt, opts) => {
  const wc = evt.sender;
  claudeStop(wc.id); // reiniciar si ya había una sesión en esta ventana
  let sdk;
  try { sdk = await claudeSdk(); } catch (e) { return { error: 'No se pudo cargar el SDK de Claude: ' + ((e && e.message) || e) }; }
  const input = makeClaudeInput();
  const session = { q: null, input, permResolvers: new Map(), seq: 0 };
  claudeSessions.set(wc.id, session);

  // Aprobación por herramienta: pregunta al renderer y espera su decisión.
  const canUseTool = async (toolName, toolInput) => {
    const id = ++session.seq;
    if (!wc.isDestroyed()) wc.send('claude:permission', { id, toolName, input: toolInput });
    return await new Promise((resolve) => session.permResolvers.set(id, resolve));
  };

  input.push(claudeUserMsg(prompt));
  (async () => {
    try {
      const env = { ...process.env };
      if (opts && opts.apiKey) env.ANTHROPIC_API_KEY = opts.apiKey;
      session.q = sdk.query({
        prompt: input.iterable,
        options: {
          cwd: cwd || undefined,
          permissionMode: (opts && opts.mode) || 'default',
          model: (opts && opts.model) || undefined,
          includePartialMessages: true,
          allowDangerouslySkipPermissions: true, // habilita el modo 'Aceptar todo' (bypassPermissions)
          env,
          canUseTool,
        },
      });
      for await (const m of session.q) {
        if (wc.isDestroyed() || session.aborted) break; // frenado: no emitir más
        wc.send('claude:event', m);
      }
      if (!wc.isDestroyed() && !session.aborted) wc.send('claude:event', { type: '_end' });
    } catch (e) {
      // Si fue un stop intencional del usuario, no mandar nada (el renderer ya reseteó la UI).
      if (!wc.isDestroyed() && !session.aborted) wc.send('claude:event', { type: '_error', error: String((e && e.message) || e) });
    } finally {
      claudeSessions.delete(wc.id);
    }
  })();
  return { ok: true };
});

ipcMain.handle('claude:send', async (evt, text) => {
  const s = claudeSessions.get(evt.sender.id);
  if (!s) return { error: 'no-session' };
  s.input.push(claudeUserMsg(text));
  return { ok: true };
});

ipcMain.handle('claude:permission-reply', async (evt, id, decision) => {
  const s = claudeSessions.get(evt.sender.id);
  if (!s) return { ok: false };
  const r = s.permResolvers.get(id);
  if (r) { s.permResolvers.delete(id); r(decision || { behavior: 'deny', message: 'Denegado' }); }
  return { ok: true };
});

ipcMain.handle('claude:interrupt', async (evt) => { claudeStop(evt.sender.id); return { ok: true }; });

ipcMain.handle('claude:set-mode', async (evt, mode) => {
  const s = claudeSessions.get(evt.sender.id);
  if (s && s.q && s.q.setPermissionMode) { try { await s.q.setPermissionMode(mode); } catch {} }
  return { ok: true };
});

ipcMain.handle('claude:set-model', async (evt, model) => {
  const s = claudeSessions.get(evt.sender.id);
  if (s && s.q && s.q.setModel) { try { await s.q.setModel(model); } catch {} }
  return { ok: true };
});

// --- Hydra Team: carpeta local donde se sincroniza un grupo compartido -------
// Cada grupo recibe una carpeta propia en Documentos/HydraTeam/<código>.
ipcMain.handle('team:dir', async (_evt, code) => {
  const safe = String(code || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'grupo';
  const base = path.join(app.getPath('documents'), 'HydraTeam', safe);
  await fs.mkdir(base, { recursive: true });
  registerRoot(base); // la carpeta del equipo entra al sandbox de rutas permitidas
  return base;
});

// Login de Google: abrimos la WEB OFICIAL (Vercel) en el navegador. Ahí Google
// permite el login y la web nos devuelve el credencial a http://localhost:appPort/__authcb.
ipcMain.handle('auth:external', () => {
  if (!appPort) return false;
  const nonce = expectAuth(); // abre la ventana de login y genera el nonce de un solo uso
  shell.openExternal(`${HYDRA_WEB}/?desktop=1&port=${appPort}&state=${nonce}`);
  return true;
});

ipcMain.handle('live:stop', () => { stopLive(); return true; });
ipcMain.handle('live:status', () => ({ running: !!liveServer, port: livePort }));

app.on('before-quit', stopLive);
app.on('before-quit', () => { try { discord.stop(); } catch {} }); // borra el estado de Discord al salir

// El renderer avisa qué proyecto/archivo está abierto para enriquecer el estado.
ipcMain.handle('discord:activity', (_evt, info) => {
  try {
    if (!info || (!info.workspace && !info.file)) {
      discord.setActivity(DISCORD_BASE_ACTIVITY);
      return true;
    }
    discord.setActivity({
      details: info.workspace ? ('Proyecto: ' + String(info.workspace).slice(0, 96)) : 'Programando en Hydra IDE',
      state: info.file ? ('Editando ' + String(info.file).slice(0, 96)) : 'Editor de código',
      largeImage: 'hydra_ide',
      largeText: 'Hydra IDE',
    });
  } catch {}
  return true;
});

// --- Estado persistente (carpeta abierta, scrollback de terminal, etc.) ----
// Se guarda en userData para que sobreviva al cierre del programa.
function stateFile() { return path.join(app.getPath('userData'), 'hydra-state.json'); }

ipcMain.handle('state:get', async () => {
  try { return JSON.parse(await fs.readFile(stateFile(), 'utf-8')); } catch { return {}; }
});

ipcMain.handle('state:set', async (_evt, patch) => {
  let cur = {};
  try { cur = JSON.parse(await fs.readFile(stateFile(), 'utf-8')); } catch {}
  try { await fs.writeFile(stateFile(), JSON.stringify({ ...cur, ...patch }), 'utf-8'); } catch {}
  return true;
});

// --- Manejadores IPC: la UI llama, el main responde -----------------------

// Abrir un diálogo para elegir carpeta y devolver su árbol de archivos.
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const root = result.filePaths[0];
  registerRoot(root); // consentimiento del usuario → ruta confiable para el sandbox
  return { root, tree: await readTree(root) };
});

// Leer el contenido de un archivo.
ipcMain.handle('file:read', async (_evt, filePath) => {
  assertInside(filePath);
  return await fs.readFile(filePath, 'utf-8');
});

// Leer una imagen y devolverla como data URL (para mostrarla en la UI).
ipcMain.handle('file:readImage', async (_evt, filePath) => {
  assertInside(filePath);
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
    ico: 'image/x-icon', avif: 'image/avif',
  }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
});

// Guardar contenido en un archivo.
ipcMain.handle('file:save', async (_evt, filePath, content) => {
  assertInside(filePath);
  await fs.writeFile(filePath, content, 'utf-8');
  return true;
});

// Releer el árbol de una carpeta (para refrescar tras crear/borrar archivos).
ipcMain.handle('fs:tree', async (_evt, rootDir) => { assertInside(rootDir); return await readTree(rootDir); });

// --- Watcher de archivos: avisa al renderer cuando algo cambia en el disco ---
// (para recargar el editor cuando un agente como Claude Code edita archivos, y
//  para sincronizar esos cambios en Hydra Team).
let fsWatcher = null;
let fsWatchPending = new Set();
let fsWatchTimer = null;
function stopFsWatch() {
  if (fsWatcher) { try { fsWatcher.close(); } catch {} fsWatcher = null; }
  if (fsWatchTimer) { clearTimeout(fsWatchTimer); fsWatchTimer = null; }
  fsWatchPending = new Set();
}
ipcMain.handle('fs:watch', (evt, root) => {
  stopFsWatch();
  if (!root) return false;
  const wc = evt.sender;
  try {
    fsWatcher = fsSync.watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = String(filename);
      if (/(^|[\\/])(node_modules|\.git|\.hydra)([\\/]|$)/.test(rel)) return; // ruido
      fsWatchPending.add(path.join(root, rel));
      if (fsWatchTimer) return;
      fsWatchTimer = setTimeout(() => {
        const list = [...fsWatchPending]; fsWatchPending.clear(); fsWatchTimer = null;
        if (!wc.isDestroyed()) wc.send('fs:changed', list);
      }, 150); // debounce: fs.watch dispara varias veces
    });
  } catch (e) { return false; }
  return true;
});

// Crear un archivo vacío. Falla si ya existe.
ipcMain.handle('fs:createFile', async (_evt, dirPath, name) => {
  assertInside(dirPath);
  const target = assertInside(path.join(dirPath, name));
  await fs.writeFile(target, '', { flag: 'wx' });
  return target;
});

// Crear una carpeta.
ipcMain.handle('fs:createFolder', async (_evt, dirPath, name) => {
  assertInside(dirPath);
  const target = assertInside(path.join(dirPath, name));
  await fs.mkdir(target);
  return target;
});

// Renombrar (o mover dentro de la misma carpeta).
ipcMain.handle('fs:rename', async (_evt, oldPath, newName) => {
  assertInside(oldPath);
  const target = assertInside(path.join(path.dirname(oldPath), newName));
  await fs.rename(oldPath, target);
  return target;
});

// Eliminar un archivo o carpeta (recursivo).
ipcMain.handle('fs:delete', async (_evt, targetPath) => {
  assertInside(targetPath);
  await fs.rm(targetPath, { recursive: true, force: true });
  return true;
});

// ¿Está activo el núcleo C++ o el respaldo JS?
ipcMain.handle('core:status', () => (core && core.searchInDirectory ? 'cpp' : 'js'));

// Búsqueda de texto en toda la carpeta — delegada al núcleo C++.
ipcMain.handle('search:inFolder', async (_evt, rootDir, query) => {
  if (!isInsideRoots(rootDir)) return [];
  if (core && core.searchInDirectory) {
    return core.searchInDirectory(rootDir, query); // <-- trabajo pesado en C++
  }
  return await searchFallbackJS(rootDir, query);    // respaldo si no hay C++
});

// --- Utilidades -----------------------------------------------------------

// Construye recursivamente el árbol de archivos para el panel lateral.
async function readTree(dir) {
  const IGNORE = new Set(['node_modules', '.git', 'build', 'dist', '.cache']);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes = [];
  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: fullPath, type: 'dir', children: await readTree(fullPath) });
    } else {
      nodes.push({ name: entry.name, path: fullPath, type: 'file' });
    }
  }
  // Carpetas primero, luego alfabético.
  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return nodes;
}

// Respaldo en JS de la búsqueda, por si el addon C++ no está compilado.
async function searchFallbackJS(rootDir, query) {
  const q = query.toLowerCase();
  const IGNORE = new Set(['node_modules', '.git', 'build', 'dist', '.cache']);
  const out = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      let content = '';
      try { content = await fs.readFile(full, 'utf-8'); } catch { continue; }
      content.split('\n').forEach((line, i) => {
        if (line.toLowerCase().includes(q) && out.length < 1000) {
          out.push({ file: full, line: i + 1, text: line.slice(0, 300) });
        }
      });
    }
  }
  if (q) await walk(rootDir);
  return out;
}

app.whenReady().then(async () => {
  loadRoots();              // carpetas que el usuario ya autorizó en sesiones previas
  await startAppServer();   // servir el IDE por http://localhost (para Firebase Auth)
  const win = createWindow();
  setupAutoUpdates(win);    // auto-update desde GitHub Releases (solo app instalada)
  try { discord.start(DISCORD_BASE_ACTIVITY); } catch {} // "Usando Hydra IDE" en Discord
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
