// =============================================================================
// build-web-ide.js — Genera la versión NAVEGADOR de Hydra IDE en /ide.
//
// Copia los assets del renderer (Monaco, xterm, codicons, auth, renderer.js…)
// a website/public/ide/ y aplica los parches mínimos para que arranquen en el
// navegador en vez de en Electron:
//
//   1. Inyecta el puente web (src/web/web-api.js) ANTES de cualquier script que
//      use window.api, y la hoja web.css que oculta la UI exclusiva de escritorio.
//   2. Marca <body class="web-mode">.
//   3. Reescribe monaco-env.js para que los web workers se resuelvan bajo /ide/
//      (usaba una ruta absoluta location.origin + '/vendor/monaco/').
//
// El IDE queda servido en la web oficial bajo la ruta /ide (ver website/vercel.json).
// Uso:  npm run build:web
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_RENDERER = path.join(ROOT, 'src', 'renderer');
const SRC_WEB = path.join(ROOT, 'src', 'web');
const OUT = path.join(ROOT, 'website', 'public', 'ide');
const PKG = require(path.join(ROOT, 'package.json'));

function log(msg) { console.log('[build:web] ' + msg); }

// --- 1. Copiar el renderer completo a website/public/ide -------------------
log('Limpiando ' + path.relative(ROOT, OUT));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

log('Copiando src/renderer -> website/public/ide');
fs.cpSync(SRC_RENDERER, OUT, { recursive: true });

// --- 2. Copiar los archivos web propios (con la versión sustituida) --------
log('Copiando puente web (web-api.js) y estilos (web.css)');
let webApi = fs.readFileSync(path.join(SRC_WEB, 'web-api.js'), 'utf-8');
webApi = webApi.replace('__HYDRA_VERSION__', String(PKG.version || '0.0.0') + '-web');
fs.writeFileSync(path.join(OUT, 'web-api.js'), webApi);
fs.copyFileSync(path.join(SRC_WEB, 'web.css'), path.join(OUT, 'web.css'));

// --- 3. Parchear index.html ------------------------------------------------
const indexPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf-8');

// 3a. body en modo web
if (!/<body[^>]*class=/.test(html)) {
  html = html.replace('<body>', '<body class="web-mode">');
} else {
  html = html.replace(/<body([^>]*)class="([^"]*)"/, '<body$1class="$2 web-mode"');
}

// 3a-bis. favicon del IDE web (en la app de escritorio no hace falta; en el
//         navegador la pestaña debe mostrar el ícono de Hydra).
if (html.indexOf('rel="icon"') === -1) {
  html = html.replace('</title>', '</title>\n  <link rel="icon" href="hydra-logo.svg" />');
}

// 3b. hoja web.css tras style.css (o dentro del <head> si no estuviera)
if (html.indexOf('href="web.css"') === -1) {
  if (html.indexOf('href="style.css"') !== -1) {
    html = html.replace(
      /(<link[^>]*href="style\.css"[^>]*>)/,
      '$1\n  <link rel="stylesheet" href="web.css" />'
    );
  } else {
    html = html.replace('</head>', '  <link rel="stylesheet" href="web.css" />\n</head>');
  }
}

// 3c. cargar web-api.js como PRIMER script del <body> (antes de que nada use
//     window.api). Lo anclamos justo antes del primer <script> del body.
if (html.indexOf('src="web-api.js"') === -1) {
  const firstBodyScript = html.indexOf('<script', html.indexOf('<body'));
  if (firstBodyScript !== -1) {
    html = html.slice(0, firstBodyScript) +
      '<script src="web-api.js"></script>\n  ' +
      html.slice(firstBodyScript);
  } else {
    html = html.replace('</body>', '  <script src="web-api.js"></script>\n</body>');
  }
}

// 3d. Relajar el CSP SÓLO en la web. El IDE web ejecuta código en el navegador
//     (Python vía Pyodide, JS con paquetes desde CDN) y hace red desde la
//     terminal (Piston, curl, npm, micropip). El CSP del escritorio es estricto
//     porque ahí nada de eso corre en el renderer; en la web lo ampliamos:
//       · script-src  → permitir cargar scripts/módulos de CDNs https
//         (pyodide en jsDelivr, paquetes JS en esm.sh/unpkg/skypack…).
//       · connect-src → permitir fetch a URLs arbitrarias (run/curl/piston/npm/pip).
//     worker-src ya permite blob: (para el sandbox de JavaScript).
if (html.indexOf('http-equiv="Content-Security-Policy"') !== -1) {
  const before = html;
  // script-src: permitir CDNs https (Pyodide + import de paquetes JS al vuelo).
  html = html.replace(/(script-src\b[^;]*?)(;)/, (m, body, semi) =>
    /(^|\s)https:(\s|$)/.test(body) ? m : body + ' https:' + semi);
  // connect-src: permitir fetch a URLs arbitrarias (código, paquetes, red).
  html = html.replace(/connect-src\b[^;]*?;/, "connect-src 'self' https: http: ws: wss: data: blob:;");
  if (html !== before) log('CSP relajado para la web (Pyodide/paquetes/Piston/curl/npm)');
  else log('AVISO: no se pudo relajar el CSP (patrón no encontrado)');
}

fs.writeFileSync(indexPath, html);
log('index.html parcheado (web-mode + web.css + web-api.js)');

// --- 4. Parchear monaco-env.js (base de los web workers bajo /ide) ---------
const monacoEnvPath = path.join(OUT, 'monaco-env.js');
if (fs.existsSync(monacoEnvPath)) {
  let env = fs.readFileSync(monacoEnvPath, 'utf-8');
  const before = env;
  // Resolver la base relativa al documento, sea cual sea la ruta de montaje.
  env = env.replace(
    /var base = location\.origin \+ '\/vendor\/monaco\/';/,
    "var base = new URL('vendor/monaco/', document.baseURI).href;"
  );
  if (env !== before) {
    fs.writeFileSync(monacoEnvPath, env);
    log('monaco-env.js parcheado (workers relativos a /ide)');
  } else {
    log('AVISO: no se pudo parchear monaco-env.js (patrón no encontrado)');
  }
}

// --- Resumen ---------------------------------------------------------------
const count = (function walk(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? walk(path.join(dir, e.name)) : 1;
  }
  return n;
})(OUT);
log('Listo. ' + count + ' archivos en ' + path.relative(ROOT, OUT) + ' (versión ' + PKG.version + '-web)');
log('Serví la web oficial (Vercel) y abrí /ide para probar.');
