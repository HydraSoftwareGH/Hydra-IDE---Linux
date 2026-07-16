const el = (id) => document.getElementById(id);

// --------------------------------------------------------------------------
// Monaco Editor (el mismo editor de VS Code). Carga asíncrona vía loader AMD.
// monacoEditor es la instancia; cada pestaña de texto tiene su propio modelo.
// --------------------------------------------------------------------------
let monaco = null;
let monacoEditor = null;
let monacoReady = false;
const _monacoWaiters = [];
function onMonacoReady(cb) { if (monacoReady) cb(); else _monacoWaiters.push(cb); }

// Nombre de lenguaje (Hydra) -> id de lenguaje de Monaco.
// Catálogo de lenguajes (fuente única): nombre visible, id de Monaco y
// extensiones. Monaco trae ~80 tokenizadores en vendor/monaco/vs/basic-languages;
// acá los mapeamos para que el IDE (app y web) resalte todos. Si un id no está
// registrado, Monaco cae a texto plano sin romper nada.
const LANG_DEFS = [
  { name: 'Texto sin formato', id: 'plaintext', ext: ['txt', 'text', 'log'] },
  { name: 'JavaScript', id: 'javascript', ext: ['js', 'mjs', 'cjs'] },
  { name: 'JavaScript JSX', id: 'javascript', ext: ['jsx'] },
  { name: 'TypeScript', id: 'typescript', ext: ['ts', 'mts', 'cts'] },
  { name: 'TypeScript JSX', id: 'typescript', ext: ['tsx'] },
  { name: 'JSON', id: 'json', ext: ['json', 'jsonc', 'json5', 'geojson', 'webmanifest'] },
  { name: 'HTML', id: 'html', ext: ['html', 'htm', 'xhtml'] },
  { name: 'Vue', id: 'html', ext: ['vue'] },
  { name: 'Svelte', id: 'html', ext: ['svelte'] },
  { name: 'CSS', id: 'css', ext: ['css'] },
  { name: 'SCSS', id: 'scss', ext: ['scss'] },
  { name: 'Less', id: 'less', ext: ['less'] },
  { name: 'Markdown', id: 'markdown', ext: ['md', 'markdown', 'mkd', 'mdown'] },
  { name: 'MDX', id: 'mdx', ext: ['mdx'] },
  { name: 'Python', id: 'python', ext: ['py', 'pyw', 'pyi', 'gyp'] },
  { name: 'C++', id: 'cpp', ext: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'ino'] },
  { name: 'C', id: 'c', ext: ['c', 'h'] },
  { name: 'C#', id: 'csharp', ext: ['cs', 'csx'] },
  { name: 'Java', id: 'java', ext: ['java'] },
  { name: 'Go', id: 'go', ext: ['go'] },
  { name: 'Rust', id: 'rust', ext: ['rs'] },
  { name: 'PHP', id: 'php', ext: ['php', 'phtml', 'php3', 'php4', 'php5'] },
  { name: 'Ruby', id: 'ruby', ext: ['rb', 'erb', 'gemspec', 'rake'] },
  { name: 'Shell Script', id: 'shell', ext: ['sh', 'bash', 'zsh', 'ksh', 'fish'] },
  { name: 'PowerShell', id: 'powershell', ext: ['ps1', 'psm1', 'psd1'] },
  { name: 'Batch', id: 'bat', ext: ['bat', 'cmd'] },
  { name: 'XML', id: 'xml', ext: ['xml', 'svg', 'xsl', 'xsd', 'rss', 'plist', 'wxs', 'csproj', 'xaml'] },
  { name: 'YAML', id: 'yaml', ext: ['yml', 'yaml'] },
  { name: 'TOML', id: 'ini', ext: ['toml'] },
  { name: 'INI', id: 'ini', ext: ['ini', 'cfg', 'conf', 'editorconfig'] },
  { name: 'Kotlin', id: 'kotlin', ext: ['kt', 'kts'] },
  { name: 'Swift', id: 'swift', ext: ['swift'] },
  { name: 'Dart', id: 'dart', ext: ['dart'] },
  { name: 'Scala', id: 'scala', ext: ['scala', 'sc'] },
  { name: 'Objective-C', id: 'objective-c', ext: ['m', 'mm'] },
  { name: 'Perl', id: 'perl', ext: ['pl', 'pm', 'pod'] },
  { name: 'Lua', id: 'lua', ext: ['lua'] },
  { name: 'R', id: 'r', ext: ['r'] },
  { name: 'Julia', id: 'julia', ext: ['jl'] },
  { name: 'Elixir', id: 'elixir', ext: ['ex', 'exs'] },
  { name: 'Clojure', id: 'clojure', ext: ['clj', 'cljs', 'cljc', 'edn'] },
  { name: 'F#', id: 'fsharp', ext: ['fs', 'fsi', 'fsx'] },
  { name: 'Visual Basic', id: 'vb', ext: ['vb'] },
  { name: 'SQL', id: 'sql', ext: ['sql'] },
  { name: 'PostgreSQL', id: 'pgsql', ext: ['pgsql'] },
  { name: 'GraphQL', id: 'graphql', ext: ['graphql', 'gql'] },
  { name: 'Dockerfile', id: 'dockerfile', ext: ['dockerfile'] },
  { name: 'CoffeeScript', id: 'coffeescript', ext: ['coffee'] },
  { name: 'Pug', id: 'pug', ext: ['pug', 'jade'] },
  { name: 'Handlebars', id: 'handlebars', ext: ['hbs', 'handlebars'] },
  { name: 'Razor', id: 'razor', ext: ['cshtml', 'razor'] },
  { name: 'Twig', id: 'twig', ext: ['twig'] },
  { name: 'Solidity', id: 'solidity', ext: ['sol'] },
  { name: 'Protocol Buffers', id: 'protobuf', ext: ['proto'] },
  { name: 'HCL / Terraform', id: 'hcl', ext: ['hcl', 'tf', 'tfvars'] },
  { name: 'reStructuredText', id: 'restructuredtext', ext: ['rst'] },
  { name: 'Scheme', id: 'scheme', ext: ['scm', 'ss'] },
  { name: 'Pascal', id: 'pascal', ext: ['pas', 'pp'] },
  { name: 'Tcl', id: 'tcl', ext: ['tcl'] },
  { name: 'SystemVerilog', id: 'systemverilog', ext: ['sv', 'svh', 'v', 'vh'] },
  { name: 'ABAP', id: 'abap', ext: ['abap'] },
  { name: 'Apex', id: 'apex', ext: ['apex', 'cls'] },
  { name: 'Bicep', id: 'bicep', ext: ['bicep'] },
  { name: 'Liquid', id: 'liquid', ext: ['liquid'] },
  { name: 'WGSL', id: 'wgsl', ext: ['wgsl'] },
  { name: 'Q#', id: 'qsharp', ext: ['qs'] },
  { name: 'SPARQL', id: 'sparql', ext: ['rq', 'sparql'] },
  { name: 'Structured Text', id: 'st', ext: ['st'] },
  { name: 'TypeSpec', id: 'typespec', ext: ['tsp'] },
  { name: 'Power Query', id: 'powerquery', ext: ['pq'] },
  { name: 'Redis', id: 'redis', ext: ['redis'] },
];
// Derivados: nombre → id de Monaco, y extensión → nombre (primero gana).
const MONACO_LANG = {};
const EXT_LANG = {};
LANG_DEFS.forEach((d) => {
  MONACO_LANG[d.name] = d.id;
  (d.ext || []).forEach((e) => { if (!(e in EXT_LANG)) EXT_LANG[e] = d.name; });
});
function monacoLangId(lang) { return MONACO_LANG[lang] || 'plaintext'; }

require.config({ paths: { vs: 'vendor/monaco/vs' } });
require(['vs/editor/editor.main'], function () {
  monaco = window.monaco;
  defineHydraTheme();
  monacoEditor = monaco.editor.create(el('monaco'), {
    value: '',
    language: 'plaintext',
    theme: 'hydra-dark',
    automaticLayout: true,
    fontFamily: '"Cascadia Code", "Consolas", monospace',
    fontSize: 14,
    fontLigatures: true,
    minimap: { enabled: true },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: { indentation: true, highlightActiveIndentation: true, bracketPairs: true },
    scrollBeyondLastLine: false,
    tabSize: 4,
  });
  wireMonacoEditor();
  registerMonacoCompletions();
  restoreAppCodicons();
  monacoReady = true;
  for (const cb of _monacoWaiters) { try { cb(); } catch (e) { console.error(e); } }
});

// Monaco trae su propia fuente de codicons (misma familia "codicon") y, al
// cargar después, pisa los iconos de la barra lateral de la app. Re-declaramos
// la @font-face de la app AL FINAL para que gane y se vean los iconos de VS Code.
function restoreAppCodicons() {
  // 1) Re-declarar la @font-face de la app al final (gana sobre la de Monaco).
  // 2) Re-asertar los TAMAÑOS de cada contexto con !important, porque Monaco
  //    fuerza globalmente `.codicon[class*=codicon-]{font-size:16px!important}`
  //    y achicaba todos los iconos de la app (sidebar, AI, etc.). Como esta
  //    hoja se inyecta DESPUÉS de la de Monaco, gana en el desempate.
  const sizes = [
    ['.act .codicon', 24], ['.icon-btn .codicon', 16], ['.win-btn .codicon', 14],
    ['#account-menu .mi .codicon', 14], ['.ext-btn .codicon', 12], ['.toast .t-sub .codicon', 13],
    ['.folder-title .codicon', 16], ['.title-ai-btn .codicon', 15], ['.ai-mode .codicon', 13],
    ['.ai-gate .codicon', 32], ['.ai-welcome .codicon', 30], ['.ai-send .codicon', 16],
    ['.ai-attach .codicon', 16], ['.ai-cmd-head .codicon', 13], ['.result .rfile .codicon', 14],
    ['.status-item .codicon', 14], ['#status-live .codicon', 13],
  ];
  const css =
    "@font-face{font-family:'codicon';font-display:block;src:url('codicons/codicon.ttf') format('truetype');}" +
    sizes.map(([sel, px]) => sel + '{font-size:' + px + 'px !important;}').join('');
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}

// Tema oscuro propio (colores de Hydra) para Monaco.
function defineHydraTheme() {
  monaco.editor.defineTheme('hydra-dark', {
    base: 'vs-dark', inherit: true, rules: [],
    colors: {
      'editor.background': '#14151b',
      'editor.foreground': '#c8ccda',
      'editorCursor.foreground': '#9385ff',
      'editor.lineHighlightBackground': '#1b1d27',
      'editor.selectionBackground': '#3a356b',
      'editorLineNumber.foreground': '#4a4d63',
      'editorLineNumber.activeForeground': '#c8ccda',
      'editorIndentGuide.background1': '#26283a',
      'editorIndentGuide.activeBackground1': '#4a4d6b',
      'editorWidget.background': '#1c1e27',
      'editorWidget.border': '#2c2f3a',
      'editorSuggestWidget.background': '#1c1e27',
      'editorSuggestWidget.selectedBackground': '#2e2a52',
      'minimap.background': '#14151b',
      'scrollbarSlider.background': '#2c2f3a88',
    },
  });
}

// Conecta los eventos de Monaco con el resto de la app (dirty, cursor, hooks).
function wireMonacoEditor() {
  monacoEditor.onDidChangeModelContent((e) => {
    if (_fsApplying) return; // recarga desde disco (watcher): no marcar dirty ni reemitir
    const tab = activeTab && tabs.get(activeTab);
    if (!tab || tab.kind !== 'text') return;
    if (!tab.dirty) { tab.dirty = true; renderTabs(); renderOpenEditors(); }
    const val = monacoEditor.getValue();
    for (const cb of [...extChangeHooks]) { try { cb(val); } catch (e) {} }
    try { if (typeof teamBroadcastEdit === 'function') teamBroadcastEdit(e); } catch (er) {} // co-edición en vivo
    try { if (typeof updateWordCount === 'function') updateWordCount(); } catch (er) {} // contador de palabras
    try { if (powerOn && !_fsApplying) powerBurst(); } catch (er) {} // Power Mode: efectos al escribir
    scheduleAutoSave(); // auto-guardado tras una pausa (si está en modo afterDelay)
  });
  // Auto-guardado "al perder el foco del editor" (modo onFocusChange).
  monacoEditor.onDidBlurEditorText(() => {
    if (appSettings.autoSave === 'onFocusChange') autoSaveTab(activeTab);
  });
  monacoEditor.onDidChangeCursorPosition((e) => {
    el('status-pos').textContent = 'Ln ' + e.position.lineNumber + ', Col ' + e.position.column;
    try { if (typeof teamBroadcastCursor === 'function') teamBroadcastCursor(); } catch (er) {} // Hydra Team: cursor remoto
  });
  monacoEditor.onDidChangeCursorSelection(() => { try { if (typeof updateWordCount === 'function') updateWordCount(); } catch (er) {} });
  // Ctrl+S guarda (Monaco captura el teclado cuando tiene foco).
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveActive());
  // Shift+Alt+F formatea el documento con Prettier.
  monacoEditor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => formatActiveDocument());
}

// Adapta los proveedores de autocompletado de las extensiones al IntelliSense
// nativo de Monaco. Un proveedor para todos los lenguajes que delega en
// extCompletions (cada extensión registra el suyo con registerCompletionProvider).
function registerMonacoCompletions() {
  monaco.languages.registerCompletionItemProvider('*', {
    triggerCharacters: ['.', '<', '/', '"', "'", '-', '_', ' '],
    provideCompletionItems(model, position) {
      if (!extCompletions.length) return { suggestions: [] };
      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      });
      const wi = model.getWordUntilPosition(position);
      const ctx = {
        word: wi.word, linePrefix,
        language: (activeTab && tabs.get(activeTab) ? tabs.get(activeTab).lang : '') || '',
        path: activeTab || '', text: model.getValue(),
      };
      const range = {
        startLineNumber: position.lineNumber, startColumn: wi.startColumn,
        endLineNumber: position.lineNumber, endColumn: wi.endColumn,
      };
      const seen = new Set(), suggestions = [];
      for (const c of extCompletions) {
        let items = [];
        try { const r = c.provider(ctx); if (Array.isArray(r)) items = r; } catch (e) {}
        for (const it of items) {
          const o = (typeof it === 'string') ? { label: it, insert: it } : it;
          const label = o.label || o.insert || '';
          if (!label || seen.has(label)) continue;
          seen.add(label);
          suggestions.push({
            label, kind: monaco.languages.CompletionItemKind.Text,
            insertText: o.insert != null ? o.insert : label,
            detail: o.detail || '', range,
          });
        }
      }
      return { suggestions };
    },
  });
}

let rootDir = null;
let rootName = '';
const tabs = new Map();
let activeTab = null;
let openFiles = []; // orden de tabs para Ctrl+Tab

// --------------------------------------------------------------------------
// Estado persistente (carpeta abierta, terminal) — sobrevive al cierre.
// --------------------------------------------------------------------------
let _statePatch = {}, _stateTimer = null;
function saveState(patch) {
  Object.assign(_statePatch, patch);
  clearTimeout(_stateTimer);
  _stateTimer = setTimeout(() => {
    const p = _statePatch; _statePatch = {};
    try { window.api.setState(p); } catch {}
  }, 500);
}

const codicon = (name) => {
  const i = document.createElement('i');
  i.className = 'codicon codicon-' + name;
  return i;
};

// Extensiones de imagen que se abren en el visor en vez del editor de texto.
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']);
const isImage = (name) => IMAGE_EXTS.has((name.split('.').pop() || '').toLowerCase());

// --------------------------------------------------------------------------
// Controles de ventana
// --------------------------------------------------------------------------
el('win-min').addEventListener('click', () => window.api.win('minimize'));
el('win-max').addEventListener('click', () => window.api.win('maximize'));
el('win-close').addEventListener('click', () => window.api.win('close'));

// --------------------------------------------------------------------------
// Barra de actividad
// --------------------------------------------------------------------------
document.querySelectorAll('.act[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});
el('scm-refresh').addEventListener('click', () => { renderScm(); updateScmBadge(); });

let currentView = 'explorer';
function showView(view) {
  currentView = view;
  document.querySelectorAll('.act[data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.side-view').forEach((s) =>
    s.hidden = s.dataset.view !== view);
  if (view === 'search') setTimeout(() => el('search-input').focus(), 0);
  if (view === 'ext') renderExtensions();
  if (view === 'updates') renderUpdatesList();
  if (view === 'scm') renderScm();
  if (view === 'debug') renderDebug();
  if (view === 'python') renderPython();
  if (view === 'team') renderTeam();
}

// --------------------------------------------------------------------------
// Welcome links (data-cmd)
// --------------------------------------------------------------------------
document.querySelectorAll('[data-cmd]').forEach((a) => {
  a.addEventListener('click', () => {
    switch (a.dataset.cmd) {
      case 'workbench.openFolder': openFolder(); break;
      case 'workbench.quickOpen': showQuickOpen(); break;
      case 'workbench.commandPalette': showCommandPalette(); break;
      case 'search.focus': showView('search'); break;
    }
  });
});

// --------------------------------------------------------------------------
// Abrir carpeta
// --------------------------------------------------------------------------
el('btn-open-folder').addEventListener('click', openFolder);

// Aplica una carpeta (raíz + árbol) a la UI y persiste cuál es.
function applyFolder(root, tree) {
  rootDir = root;
  rootName = rootDir.split(/[\\/]/).filter(Boolean).pop() || rootDir;
  el('folder-name').textContent = rootName;
  el('explorer-empty').hidden = true;
  el('folder-pane').hidden = false;
  el('explorer-actions').hidden = false;
  renderTree(tree, el('tree'));
  termChdir(rootDir); // mover la terminal (si está abierta) a la carpeta del proyecto
  saveState({ lastFolder: rootDir });
  updateScmBadge();   // contador de cambios en el icono de control de código fuente
  if (currentView === 'scm') renderScm();
  if (currentView === 'debug') renderDebug();
  try { if (typeof teamRenderDots === 'function') teamRenderDots(); } catch (e) {} // puntos de presencia
  try { window.api.watchFolder(rootDir); } catch (e) {} // vigilar cambios en disco (agentes, etc.)
  updateDiscordActivity(); // reflejar el proyecto abierto en Discord
}

// Informa a Discord qué proyecto/archivo tenés abierto (estado enriquecido).
function updateDiscordActivity() {
  try {
    const tab = activeTab ? tabs.get(activeTab) : null;
    window.api.setDiscordActivity &&
      window.api.setDiscordActivity({ workspace: rootName || '', file: (tab && tab.name) || '' });
  } catch (e) {}
}

async function openFolder() {
  const res = await window.api.openFolder();
  if (!res) return;
  applyFolder(res.root, res.tree);
}

// Reabre una carpeta por ruta (al iniciar, restaurando la última sesión).
async function openFolderPath(dir) {
  let tree;
  try { tree = await window.api.tree(dir); } catch { return false; }
  applyFolder(dir, tree);
  return true;
}

// Mueve el shell de la terminal a un directorio (como hace VS Code al abrir
// una carpeta). Si la terminal aún no arrancó, arrancará directo ahí.
function termChdir(dir) {
  if (!dir || !activeTermStarted()) return;
  const cmd = navigator.platform.startsWith('Win') ? `cd /d "${dir}"\r` : `cd "${dir}"\r`;
  window.api.termInput(cmd, activeTermSession());
}

// --------------------------------------------------------------------------
// Árbol de archivos
// --------------------------------------------------------------------------
function renderTree(nodes, container) {
  container.innerHTML = '';
  for (const node of nodes) container.appendChild(buildNode(node, 0));
}

function buildNode(node, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'node';

  const label = document.createElement('div');
  label.className = 'node-label';
  label.style.paddingLeft = (8 + depth * 8) + 'px';
  label.dataset.path = node.path;
  label.dataset.type = node.type;

  if (node.type === 'dir') {
    const twisty = codicon('chevron-right');
    twisty.classList.add('twisty');
    const icon = codicon('folder');
    icon.classList.add('ficon', 'folder');
    const name = document.createElement('span');
    name.className = 'nname';
    name.textContent = node.name;
    label.append(twisty, icon, name);

    const children = document.createElement('div');
    children.className = 'children';
    children.hidden = true;
    node.children.forEach((c) => children.appendChild(buildNode(c, depth + 1)));

    label.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = children.hidden;
      children.hidden = !open;
      twisty.className = 'codicon twisty codicon-' + (open ? 'chevron-down' : 'chevron-right');
      icon.className = 'codicon ficon folder codicon-' + (open ? 'folder-opened' : 'folder');
    });

    label.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, node);
    });

    wrap.append(label, children);
  } else {
    const spacer = codicon('blank');
    spacer.classList.add('twisty');
    const icon = codicon('file');
    icon.classList.add('ficon', 'file');
    const name = document.createElement('span');
    name.className = 'nname';
    name.textContent = node.name;
    label.append(spacer, icon, name);
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      openFile(node.path, node.name, label);
    });
    label.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, node);
    });
    wrap.appendChild(label);
  }
  return wrap;
}

// --------------------------------------------------------------------------
// Acciones del explorador
// --------------------------------------------------------------------------
el('new-file-btn').addEventListener('click', () => createItem('file'));
el('new-folder-btn').addEventListener('click', () => createItem('folder'));
el('refresh-btn').addEventListener('click', refreshTree);
el('collapse-btn').addEventListener('click', collapseAll);

// Hydra Team: avisar al grupo de un archivo/carpeta recién creado.
function teamOnCreated(parentPath, name, type) {
  if (typeof teamGroup === 'undefined' || !teamGroup) return;
  const sep = parentPath.includes('\\') ? '\\' : '/';
  const abs = parentPath.replace(/[\\/]$/, '') + sep + name;
  if (teamUnder(abs)) teamPushLocal(abs, '', { isDir: type !== 'file' });
}

async function createItem(type) {
  if (!rootDir) return;
  const parentPath = getSelectedDirPath() || rootDir;
  const name = await showModal(type === 'file' ? 'Nuevo archivo' : 'Nueva carpeta', '', 'Nombre:');
  if (!name) return;
  try {
    if (type === 'file') {
      await window.api.createFile(parentPath, name);
    } else {
      await window.api.createFolder(parentPath, name);
    }
    await refreshTree();
    teamOnCreated(parentPath, name, type);
  } catch (err) {
    showModal('Error', err.message, null, true);
  }
}

function getSelectedDirPath() {
  const active = document.querySelector('.node-label.active');
  if (!active) return null;
  const path = active.dataset.path;
  const type = active.dataset.type;
  return type === 'dir' ? path : path ? path.split(/[\\/]/).slice(0, -1).join('/') : null;
}

async function refreshTree() {
  if (!rootDir) return;
  const tree = await window.api.tree(rootDir);
  renderTree(tree, el('tree'));
  if (activeTab) revealInTree(activeTab);
  try { if (typeof teamRenderDots === 'function') teamRenderDots(); } catch (e) {} // reaplicar puntos de presencia
}

// --- Cambios en disco (agentes como Claude Code / Opencode, o externos) -----
// Recarga el archivo abierto para que se vea lo que cambió, y lo sincroniza al
// equipo (porque el agente escribe directo en disco, sin pasar por "Guardar").
let _fsApplying = false; // true mientras recargamos un modelo desde disco (anti-loop)
let _fsTreeRefreshTimer = null;
function scheduleTreeRefresh() {
  if (_fsTreeRefreshTimer) return;
  _fsTreeRefreshTimer = setTimeout(() => { _fsTreeRefreshTimer = null; refreshTree().catch(() => {}); }, 250);
}
async function handleFsChanges(paths) {
  if (!Array.isArray(paths)) paths = [paths];
  let structural = false;
  for (const abs of paths) {
    if (!abs) continue;
    if (typeof teamSuppress !== 'undefined' && teamSuppress.has(abs)) continue; // lo aplicamos nosotros desde remoto
    let content = null;
    try { content = await window.api.readFile(abs); } catch (e) { content = null; } // null = carpeta/borrado/binario
    const tab = tabs.get(abs);
    if (tab && tab.kind === 'text' && content != null) {
      if (tab.content !== content) {
        if (!tab.dirty) { // no pisar ediciones sin guardar del usuario
          if (tab.model && !tab.model.isDisposed()) {
            const pos = (monacoEditor && activeTab === abs) ? monacoEditor.getPosition() : null;
            _fsApplying = true;
            try { tab.model.setValue(content); } finally { _fsApplying = false; }
            if (pos && monacoEditor) { try { monacoEditor.setPosition(pos); } catch (e) {} }
          }
          tab.content = content; tab.dirty = false;
          renderTabs();
        }
        // sincronizar el cambio del agente al equipo
        if (typeof teamGroup !== 'undefined' && teamGroup && teamUnder(abs)) teamPushLocal(abs, content, { isDir: false });
      }
    } else {
      structural = true; // archivo/carpeta nuevo, borrado o no abierto
      if (typeof teamGroup !== 'undefined' && teamGroup && teamUnder(abs) && content != null) {
        teamPushLocal(abs, content, { isDir: false }); // archivo no abierto cambiado por el agente → sincronizar
      }
    }
  }
  if (structural) scheduleTreeRefresh();
}

// Expande el árbol hasta el archivo dado y lo resalta (auto-reveal de VS Code).
// Funciona aunque el archivo esté en subcarpetas anidadas.
function revealInTree(filePath) {
  const treeEl = el('tree');
  if (!treeEl) return;
  let label = null;
  for (const l of treeEl.querySelectorAll('.node-label[data-type="file"]')) {
    if (l.dataset.path === filePath) { label = l; break; }
  }
  if (!label) return;

  // Abrir todas las carpetas ancestro.
  let node = label.closest('.node');
  let parent = node && node.parentElement;
  while (parent && parent !== treeEl) {
    if (parent.classList.contains('children')) {
      parent.hidden = false;
      const folderLabel = parent.previousElementSibling; // .node-label de la carpeta
      if (folderLabel) {
        const tw = folderLabel.querySelector('.twisty');
        if (tw) tw.className = 'codicon twisty codicon-chevron-down';
        const fi = folderLabel.querySelector('.ficon.folder');
        if (fi) fi.className = 'codicon ficon folder codicon-folder-opened';
      }
    }
    node = parent.closest('.node');
    parent = node && node.parentElement;
  }

  // Resaltar y hacer visible.
  treeEl.querySelectorAll('.node-label.active').forEach((n) => n.classList.remove('active'));
  label.classList.add('active');
  label.scrollIntoView({ block: 'nearest' });
}

function collapseAll() {
  document.querySelectorAll('#tree .children').forEach((c) => {
    c.hidden = true;
  });
  document.querySelectorAll('#tree .node-label .twisty').forEach((t) => {
    t.className = 'codicon twisty codicon-chevron-right';
  });
  document.querySelectorAll('#tree .ficon.folder').forEach((f) => {
    f.className = 'codicon ficon folder codicon-folder';
  });
}

// --------------------------------------------------------------------------
// Menú contextual
// --------------------------------------------------------------------------
let contextTarget = null;

function showContextMenu(x, y, node) {
  const menu = el('context-menu');
  menu.innerHTML = '';
  menu.hidden = false;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  contextTarget = node;

  const items = [];
  if (node.type === 'dir') {
    items.push({ label: 'Nuevo archivo', icon: 'new-file', action: () => contextCreate('file') });
    items.push({ label: 'Nueva carpeta', icon: 'new-folder', action: () => contextCreate('folder') });
    items.push({ type: 'sep' });
  }
  items.push({ label: 'Renombrar', icon: 'edit', action: () => contextRename() });
  items.push({ label: 'Eliminar', icon: 'trash', action: () => contextDelete() });
  if (node.type === 'file') {
    if (/\.html?$/i.test(node.name) && installedExt.has('hydra-live')) {
      items.push({ type: 'sep' });
      items.push({ label: 'Abrir con Live Server', icon: 'broadcast', action: () => startLiveFor(htmlRelOf(node.path)) });
    }
    items.push({ type: 'sep' });
    items.push({ label: 'Copiar ruta', icon: 'link', action: () => {
      navigator.clipboard.writeText(node.path).catch(() => {});
    }});
  }

  items.forEach((item) => {
    if (item.type === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'sep';
      menu.appendChild(sep);
      return;
    }
    const mi = document.createElement('div');
    mi.className = 'mi';
    const left = document.createElement('span');
    left.innerHTML = `<i class="codicon codicon-${item.icon}"></i> ${item.label}`;
    mi.appendChild(left);
    mi.addEventListener('click', () => {
      menu.hidden = true;
      item.action();
    });
    menu.appendChild(mi);
  });
}

document.addEventListener('click', (e) => {
  if (!el('context-menu').contains(e.target)) {
    el('context-menu').hidden = true;
  }
});

async function contextCreate(type) {
  if (!contextTarget) return;
  const parentPath = contextTarget.type === 'dir' ? contextTarget.path : contextTarget.path.split(/[\\/]/).slice(0, -1).join('/');
  const name = await showModal(type === 'file' ? 'Nuevo archivo' : 'Nueva carpeta', '', 'Nombre:');
  if (!name) return;
  try {
    if (type === 'file') {
      await window.api.createFile(parentPath, name);
    } else {
      await window.api.createFolder(parentPath, name);
    }
    await refreshTree();
    teamOnCreated(parentPath, name, type);
  } catch (err) {
    showModal('Error', err.message, null, true);
  }
}

async function contextRename() {
  if (!contextTarget) return;
  const name = await showModal('Renombrar', contextTarget.name, 'Nuevo nombre:');
  if (!name || name === contextTarget.name) return;
  const oldAbs = contextTarget.path;
  const isDir = contextTarget.type === 'dir';
  const sep = oldAbs.includes('\\') ? '\\' : '/';
  const newAbs = oldAbs.split(/[\\/]/).slice(0, -1).join(sep) + sep + name;
  try {
    await window.api.rename(oldAbs, name);
    await refreshTree();
    if (teamGroup && teamUnder(oldAbs)) teamSyncRename(oldAbs, newAbs, isDir); // Hydra Team
  } catch (err) {
    showModal('Error', err.message, null, true);
  }
}

// Sincroniza un rename en Hydra Team: borra el path viejo y sube el/los nuevo(s).
async function teamSyncRename(oldAbs, newAbs, isDir) {
  teamPushLocal(oldAbs, '', { isDir, deleted: true });
  if (!isDir) {
    let content = '';
    try { content = await window.api.readFile(newAbs); } catch (e) {}
    teamPushLocal(newAbs, content || '', { isDir: false });
    return;
  }
  teamPushLocal(newAbs, '', { isDir: true });
  try {
    const files = await teamCollectFiles(newAbs); // rutas relativas a newAbs
    const sep = newAbs.includes('\\') ? '\\' : '/';
    for (const f of files) {
      const abs = newAbs.replace(/[\\/]$/, '') + sep + f.path.replace(/\//g, sep);
      teamPushLocal(abs, f.content || '', { isDir: f.isDir });
    }
  } catch (e) {}
}

async function contextDelete() {
  if (!contextTarget) return;
  const confirmed = await showConfirm('Eliminar', `¿Eliminar "${contextTarget.name}"? Esta acción no se puede deshacer.`, 'Eliminar', true);
  if (!confirmed) return;
  const delPath = contextTarget.path;
  const delDir = contextTarget.type === 'dir';
  try {
    await window.api.delete(delPath);
    closeTabByPath(delPath);
    await refreshTree();
    // Hydra Team: avisar el borrado si estaba en la carpeta compartida.
    if (teamGroup && teamUnder(delPath)) teamPushLocal(delPath, '', { isDir: delDir, deleted: true });
  } catch (err) {
    showModal('Error', err.message, null, true);
  }
}

function closeTabByPath(filePath) {
  for (const [path] of tabs) {
    if (path === filePath || path.startsWith(filePath)) {
      closeTab(path);
    }
  }
}

// --------------------------------------------------------------------------
// Tabs + apertura de archivos
// --------------------------------------------------------------------------
async function openFile(filePath, name, labelEl) {
  document.querySelectorAll('.node-label.active').forEach((n) => n.classList.remove('active'));
  if (labelEl) labelEl.classList.add('active');

  if (!tabs.has(filePath)) {
    if (isImage(name)) {
      const dataUrl = await window.api.readImage(filePath);
      tabs.set(filePath, { kind: 'image', dataUrl, name });
    } else {
      const content = await window.api.readFile(filePath);
      tabs.set(filePath, {
        kind: 'text', content, dirty: false, name, model: null,
        eol: detectEol(content),
        indent: detectIndent(content),
        lang: languageOf(name),
      });
    }
    openFiles.push(filePath);
  }
  setActiveTab(filePath);
  renderTabs();
}

// Crea (o reutiliza) el modelo de Monaco de una pestaña de texto.
function getOrCreateModel(filePath, tab) {
  if (tab.model && !tab.model.isDisposed()) return tab.model;
  const uri = monaco.Uri.file(filePath);
  let model = monaco.editor.getModel(uri);
  if (!model) model = monaco.editor.createModel(tab.content || '', monacoLangId(tab.lang), uri);
  model.setEOL(tab.eol === 'CRLF' ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
  model.updateOptions({ tabSize: tab.indent.size, insertSpaces: !tab.indent.useTabs });
  tab.model = model;
  return model;
}

function setActiveTab(filePath) {
  // Al cambiar de pestaña con auto-guardado "onFocusChange", persistir la saliente.
  if (appSettings.autoSave === 'onFocusChange' && activeTab && activeTab !== filePath) {
    autoSaveTab(activeTab);
  }
  activeTab = filePath;
  const tab = tabs.get(filePath);
  updateDiscordActivity(); // reflejar el archivo activo en Discord
  if (currentView === 'debug') setTimeout(renderDebug, 0); // refrescar "Ejecutar" según el archivo
  el('welcome').hidden = true;
  el('ext-details').hidden = true;
  el('update-details').hidden = true;
  el('webview-view').hidden = true;
  el('gitgraph-view').hidden = true;
  el('threed-view') && (el('threed-view').hidden = true);

  if (tab.kind === 'threed') {
    el('editor-wrap').hidden = true; el('image-view').hidden = true;
    el('threed-view').hidden = false;
    el('breadcrumbs').hidden = true;
    el('status-lang').textContent = 'Hydra 3D'; el('status-pos').textContent = '';
    renderThreeD();
    return;
  }

  if (tab.kind === 'gitgraph') {
    el('editor-wrap').hidden = true;
    el('image-view').hidden = true;
    el('gitgraph-view').hidden = false;
    el('breadcrumbs').hidden = true;
    el('status-lang').textContent = 'Git Graph';
    el('status-pos').textContent = '';
    renderGitGraph();
    return;
  }

  if (tab.kind === 'webview') {
    el('editor-wrap').hidden = true;
    el('image-view').hidden = true;
    const host = el('webview-view');
    host.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.className = 'webview-frame';
    // SIN 'allow-same-origin': con scripts + same-origin el iframe correría en el
    // origen del IDE y podría alcanzar parent.window.api (RCE). Lo dejamos como
    // origen opaco: puede ejecutar su propio JS pero NO toca el host.
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
    let html = tab.html || '<p style="color:#888;font-family:sans-serif;padding:20px">Panel vacío.</p>';
    if (tab.exthost) { html = wrapExthostWebview(html, tab.panelId); exthostWebviewFrames[tab.panelId] = frame; }
    frame.srcdoc = html;
    host.appendChild(frame);
    host.hidden = false;
    el('breadcrumbs').hidden = true;
    el('status-lang').textContent = 'Panel';
    el('status-pos').textContent = '';
    return;
  }

  if (tab.kind === 'update') {
    el('editor-wrap').hidden = true;
    el('image-view').hidden = true;
    renderUpdateDetails(tab.rel);
    el('update-details').hidden = false;
    el('breadcrumbs').hidden = true;
    el('status-lang').textContent = 'Hydra Updates';
    el('status-pos').textContent = '';
    return;
  }

  if (tab.kind === 'extension') {
    el('editor-wrap').hidden = true;
    el('image-view').hidden = true;
    renderExtDetailsView(tab.ext);
    el('ext-details').hidden = false;
    el('breadcrumbs').hidden = true;
    el('status-lang').textContent = 'Extensión';
    el('status-pos').textContent = '';
    return;
  }

  if (tab.kind === 'image') {
    el('editor-wrap').hidden = true;
    el('image-view').hidden = false;
    const img = el('image-el');
    img.onload = () => { el('image-info').textContent = `${img.naturalWidth} × ${img.naturalHeight} px`; };
    img.alt = tab.name;
    img.src = tab.dataUrl;
    updateBreadcrumbs(filePath, tab.name);
    el('status-lang').textContent = 'Imagen';
    el('status-pos').textContent = '';
    revealInTree(filePath);
    return;
  }

  // Pestaña de texto: mostrar Monaco con el modelo de este archivo.
  el('image-view').hidden = true;
  el('editor-wrap').hidden = false;
  onMonacoReady(() => {
    const model = getOrCreateModel(filePath, tab);
    monacoEditor.setModel(model);
    monacoEditor.updateOptions({ wordWrap: appSettings.wordWrap ? 'on' : 'off', fontSize: appSettings.editorFont });
    const p = monacoEditor.getPosition();
    if (p) el('status-pos').textContent = 'Ln ' + p.lineNumber + ', Col ' + p.column;
    monacoEditor.focus();
    if (typeof pushEditorState === 'function') pushEditorState();
    // Hydra Team: avisar qué archivo abrí y repintar cursores remotos del archivo activo.
    try { if (typeof teamTrack === 'function') { teamTrack(); teamRenderRemoteCursors(); } } catch (e) {}
    try { if (typeof updateWordCount === 'function') updateWordCount(); } catch (e) {} // contador de palabras
  });
  updateStatusBarForTab(tab);
  updateBreadcrumbs(filePath, tab.name);
  revealInTree(filePath);
  for (const cb of [...extOpenHooks]) { try { cb(filePath); } catch (e) {} }
}

function renderTabs() {
  const bar = el('tabs');
  bar.innerHTML = '';
  for (const filePath of openFiles) {          // openFiles define el orden (reordenable)
    const tab = tabs.get(filePath);
    if (!tab) continue;
    const t = document.createElement('div');
    t.className = 'tab' + (filePath === activeTab ? ' active' : '') + (tab.dirty ? ' dirty' : '');
    t.draggable = true;
    t.dataset.path = filePath;

    let icon;
    if (tab.kind === 'extension') { icon = document.createElement('img'); icon.src = tab.ext.icon; icon.className = 'tab-img-icon'; }
    else if (tab.kind === 'update') { icon = codicon('cloud-download'); icon.classList.add('ficon'); }
    else if (tab.kind === 'webview') { icon = codicon('window'); icon.classList.add('ficon'); }
    else if (tab.kind === 'gitgraph') { icon = codicon('git-commit'); icon.classList.add('ficon'); }
    else { icon = codicon(tab.kind === 'image' ? 'file-media' : 'file'); icon.classList.add('ficon'); }
    const title = document.createElement('span');
    title.className = 'tname';
    title.textContent = tab.name;

    const close = document.createElement('span');
    close.className = 'tclose';
    close.append(codicon('close'), codicon('circle-filled'));
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(filePath); });

    t.append(icon, title, close);
    t.addEventListener('click', () => { setActiveTab(filePath); renderTabs(); });
    t.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(filePath); } });

    // Reordenar pestañas arrastrando (drag & drop).
    t.addEventListener('dragstart', (e) => {
      draggedPath = filePath; t.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', filePath); } catch {}
    });
    t.addEventListener('dragend', () => {
      draggedPath = null;
      document.querySelectorAll('#tabs .tab').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    t.addEventListener('dragover', (e) => {
      if (!draggedPath || draggedPath === filePath) return;
      e.preventDefault();
      const r = t.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      t.classList.toggle('drop-after', after);
      t.classList.toggle('drop-before', !after);
    });
    t.addEventListener('dragleave', () => t.classList.remove('drop-before', 'drop-after'));
    t.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggedPath || draggedPath === filePath) return;
      const r = t.getBoundingClientRect();
      reorderTab(draggedPath, filePath, e.clientX > r.left + r.width / 2);
    });

    bar.appendChild(t);
  }
  renderOpenEditors();
}

let draggedPath = null;

// Mueve una pestaña antes/después de otra en el orden de openFiles.
function reorderTab(from, target, after) {
  const fromIdx = openFiles.indexOf(from);
  if (fromIdx === -1) return;
  openFiles.splice(fromIdx, 1);
  const tIdx = openFiles.indexOf(target);
  if (tIdx === -1) openFiles.push(from);
  else openFiles.splice(after ? tIdx + 1 : tIdx, 0, from);
  renderTabs();
}

// Lista "Archivos abiertos" del explorador (estilo Open Editors de VS Code).
function renderOpenEditors() {
  const wrap = el('open-editors');
  const list = el('open-list');
  if (!wrap || !list) return;
  list.innerHTML = '';
  if (openFiles.length === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;

  for (const filePath of openFiles) {
    const tab = tabs.get(filePath);
    if (!tab) continue;
    const row = document.createElement('div');
    row.className = 'oe-item' + (filePath === activeTab ? ' active' : '') + (tab.dirty ? ' dirty' : '');

    const close = document.createElement('span');
    close.className = 'oe-close';
    close.append(codicon('close'), codicon('circle-filled'));
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(filePath); });

    let icon;
    if (tab.kind === 'extension') { icon = document.createElement('img'); icon.src = tab.ext.icon; icon.className = 'oe-img-icon'; }
    else if (tab.kind === 'update') { icon = codicon('cloud-download'); icon.classList.add('ficon'); }
    else if (tab.kind === 'webview') { icon = codicon('window'); icon.classList.add('ficon'); }
    else if (tab.kind === 'gitgraph') { icon = codicon('git-commit'); icon.classList.add('ficon'); }
    else { icon = codicon(tab.kind === 'image' ? 'file-media' : 'file'); icon.classList.add('ficon'); }
    const name = document.createElement('span'); name.className = 'oe-name'; name.textContent = tab.name;

    // Subcarpeta relativa (para distinguir archivos con el mismo nombre)
    const rel = (rootDir && tab.kind !== 'extension') ? filePath.replace(rootDir, '').replace(/^[\\/]/, '') : '';
    const dir = rel.split(/[\\/]/).slice(0, -1).join('/');
    if (dir) { const sub = document.createElement('span'); sub.className = 'oe-sub'; sub.textContent = dir; row.append(close, icon, name, sub); }
    else row.append(close, icon, name);

    row.addEventListener('click', () => { setActiveTab(filePath); renderTabs(); });
    list.appendChild(row);
  }
}

// Colapsar / expandir la sección "Archivos abiertos".
el('open-editors-title').addEventListener('click', () => {
  const list = el('open-list');
  const collapse = !list.hidden;
  list.hidden = collapse;
  el('open-editors-title').querySelector('.codicon').className =
    'codicon twisty-oe codicon-' + (collapse ? 'chevron-right' : 'chevron-down');
});

function closeTab(filePath) {
  const tab = tabs.get(filePath);
  if (filePath === THREED_KEY) { try { threedStop(); } catch (e) {} } // detener el render 3D
  if (tab && tab.model && !tab.model.isDisposed()) { try { tab.model.dispose(); } catch (e) {} }
  if (tab && tab.exthost && tab.panelId) { try { window.api.exthost.webviewDisposed(tab.panelId); } catch (e) {} delete exthostWebviewFrames[tab.panelId]; }
  tabs.delete(filePath);
  openFiles = openFiles.filter((p) => p !== filePath);
  if (activeTab === filePath) {
    activeTab = null;
    const next = openFiles.length > 0 ? openFiles[openFiles.length - 1] : null;
    if (next && tabs.has(next)) setActiveTab(next);
    else {
      if (monacoEditor) monacoEditor.setModel(null);
      el('editor-wrap').hidden = true;
      el('image-view').hidden = true;
      el('ext-details').hidden = true;
      el('update-details').hidden = true;
      el('webview-view').hidden = true;
      el('gitgraph-view').hidden = true;
      el('welcome').hidden = false;
      el('breadcrumbs').hidden = true;
      resetStatusBar();
    }
  }
  renderTabs();
}

function closeActiveTab() {
  if (activeTab) closeTab(activeTab);
}

// --------------------------------------------------------------------------
// Acciones de edición (delegadas a Monaco) + utilidades de cursor/gutter.
// Monaco trae de fábrica: Tab para indentar, mover/duplicar/borrar líneas,
// comentar, multicursor, etc. Estas funciones existen por compatibilidad con
// la paleta de comandos y los menús.
// --------------------------------------------------------------------------
function runEditorAction(id) {
  if (!monacoEditor) return;
  const a = monacoEditor.getAction(id);
  if (a) a.run();
  monacoEditor.focus();
}
function toggleComment() { runEditorAction('editor.action.commentLine'); }
function selectLine() { runEditorAction('expandLineSelection'); }
function duplicateLines(dir) { runEditorAction(dir < 0 ? 'editor.action.copyLinesUpAction' : 'editor.action.copyLinesDownAction'); }
function moveLines(dir) { runEditorAction(dir < 0 ? 'editor.action.moveLinesUpAction' : 'editor.action.moveLinesDownAction'); }
function deleteLines() { runEditorAction('editor.action.deleteLines'); }

// Monaco ya dibuja números de línea y resaltado; no-op por compatibilidad.
function updateGutter() {}
function updateCursor() {
  if (!monacoEditor) return;
  const p = monacoEditor.getPosition();
  if (p) el('status-pos').textContent = 'Ln ' + p.lineNumber + ', Col ' + p.column;
}

function updateBreadcrumbs(filePath, name) {
  const bc = el('breadcrumbs');
  bc.hidden = false;
  bc.innerHTML = '';
  const rel = rootDir ? filePath.replace(rootDir, '').replace(/^[\\/]/, '') : name;
  const parts = rel.split(/[\\/]/);
  parts.forEach((p, i) => {
    const crumb = document.createElement('span');
    crumb.className = 'crumb';
    if (i === parts.length - 1) { const ic = codicon('file'); ic.classList.add('ficon'); crumb.appendChild(ic); }
    crumb.appendChild(document.createTextNode(p));
    bc.appendChild(crumb);
    if (i < parts.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'sep'; sep.textContent = '\u203A';
      bc.appendChild(sep);
    }
  });
}

// --------------------------------------------------------------------------
// Guardar
// --------------------------------------------------------------------------
async function saveActive() {
  if (!activeTab) return;
  const tab = tabs.get(activeTab);
  if (tab.kind !== 'text') return; // solo se guardan archivos de texto
  // Prettier: formatear al guardar si la extensión está activa (silencioso).
  if (extActive('hydra-format')) { try { await formatActiveDocument(true); } catch (e) {} }
  // El modelo de Monaco ya tiene el EOL elegido; getValue() lo respeta.
  const out = tab.model ? tab.model.getValue() : (tab.content || '');
  tab.content = out;
  await window.api.saveFile(activeTab, out);
  tab.dirty = false;
  // Avisar a las extensiones que registraron un hook onSave.
  for (const cb of [...extSaveHooks]) { try { cb(activeTab); } catch (e) { console.error('[ext] onSave:', e); } }
  // Avisar a las extensiones de VS Code (onDidSaveTextDocument).
  if (window.api.exthost) window.api.exthost.fireSave({ path: activeTab, text: out, languageId: monacoLangId(tab.lang) });
  renderTabs();
  el('status-core').innerHTML = '';
  el('status-core').append(codicon('circle-filled'), document.createTextNode(' Guardado'));
  pulseStatus(el('status-core'));
  setTimeout(updateCoreStatus, 2000);
  // Reflejar el cambio en el control de código fuente.
  updateScmBadge();
  if (currentView === 'scm') renderScm();
  // Hydra Team: sincronizar el archivo si está en la carpeta compartida.
  if (teamGroup && teamUnder(activeTab)) teamPushLocal(activeTab, out, { isDir: false });
}

// --------------------------------------------------------------------------
// Auto-guardado (estilo VS Code): off · afterDelay · onFocusChange · onWindowChange.
// Objetivo: no perder cambios si se cierra el programa o se apaga el equipo.
// Guarda a disco de forma silenciosa (sin formatear, para no molestar al escribir).
// --------------------------------------------------------------------------
let _autoSaveTimer = null;

// Guarda UNA pestaña (si es texto real y está modificada). Devuelve promesa.
async function autoSaveTab(filePath) {
  const tab = filePath && tabs.get(filePath);
  if (!tab || tab.kind !== 'text' || !tab.dirty) return;
  const out = tab.model ? tab.model.getValue() : (tab.content || '');
  tab.content = out;
  try { await window.api.saveFile(filePath, out); } catch (e) { return; }
  tab.dirty = false;
  for (const cb of [...extSaveHooks]) { try { cb(filePath); } catch (e) {} }
  if (window.api.exthost) { try { window.api.exthost.fireSave({ path: filePath, text: out, languageId: monacoLangId(tab.lang) }); } catch (e) {} }
  renderTabs();
  try { renderOpenEditors(); } catch (e) {}
  try { updateScmBadge(); } catch (e) {}
  if (teamGroup && teamUnder(filePath)) { try { teamPushLocal(filePath, out, { isDir: false }); } catch (e) {} }
}

// Guarda TODAS las pestañas de texto modificadas (al perder foco / cerrar).
async function autoSaveAllDirty() {
  const jobs = [];
  for (const [path, tab] of tabs) {
    if (tab && tab.kind === 'text' && tab.dirty) jobs.push(autoSaveTab(path));
  }
  if (jobs.length) await Promise.all(jobs);
}

// Programa un guardado tras una pausa (modo afterDelay), para la pestaña activa.
function scheduleAutoSave() {
  if (appSettings.autoSave !== 'afterDelay') return;
  clearTimeout(_autoSaveTimer);
  const delay = Math.max(200, appSettings.autoSaveDelay || 1000);
  const path = activeTab;
  _autoSaveTimer = setTimeout(() => { autoSaveTab(path); }, delay);
}

// Al cambiar de app/ventana (modo onWindowChange): guardar todo lo modificado.
window.addEventListener('blur', () => {
  if (appSettings.autoSave === 'onWindowChange') autoSaveAllDirty();
});

// Guardado seguro al cerrar el programa: el main pide un "flush" y esperamos a
// persistir todo lo modificado antes de dejar que la ventana se cierre. Así no se
// pierden cambios aunque no hayas guardado a mano.
if (window.api && window.api.onFlushAndClose) {
  window.api.onFlushAndClose(async () => {
    try { if (appSettings.autoSave !== 'off') await autoSaveAllDirty(); } catch (e) {}
    try { window.api.flushDone(); } catch (e) {}
  });
}

async function updateCoreStatus() {
  const item = el('status-core');
  if (!item) return;
  item.innerHTML = '';
  item.className = 'status-item';
  item.append(codicon('circle-filled'), document.createTextNode(' Listo'));
  pulseStatus(item);
}

// --------------------------------------------------------------------------
// Búsqueda en la carpeta
// --------------------------------------------------------------------------
const searchInput = el('search-input');
let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});

async function runSearch() {
  const q = searchInput.value.trim();
  const resultsEl = el('search-results');
  const infoEl = el('search-info');
  resultsEl.innerHTML = '';

  if (!q || !rootDir) { infoEl.textContent = rootDir ? '' : 'Abre una carpeta para buscar.'; return; }

  const matches = await window.api.search(rootDir, q);
  infoEl.textContent = matches.length
    ? `${matches.length} resultado(s)`
    : 'No se encontraron resultados.';

  for (const m of matches) {
    const div = document.createElement('div');
    div.className = 'result';
    const shortFile = m.file.replace(rootDir, '').replace(/^[\\/]/, '');

    const head = document.createElement('div');
    head.className = 'rfile';
    const fi = codicon('file');
    head.append(fi, document.createTextNode(shortFile + ' '));
    const ln = document.createElement('span');
    ln.className = 'rline'; ln.textContent = ':' + m.line;
    head.appendChild(ln);

    const text = document.createElement('div');
    text.className = 'rtext';
    text.innerHTML = highlight(m.text.trim(), q);

    div.append(head, text);
    div.addEventListener('click', () => {
      showView('explorer');
      openFile(m.file, shortFile.split(/[\\/]/).pop());
    });
    resultsEl.appendChild(div);
  }
}

function highlight(text, q) {
  const esc = escapeHtml(text);
  const i = esc.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc;
  return esc.slice(0, i) + '<span class="match">' +
         esc.slice(i, i + q.length) + '</span>' + esc.slice(i + q.length);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --------------------------------------------------------------------------
// Menús desplegables (barra de título)
// --------------------------------------------------------------------------
const menuDefs = {
  archivo: [
    { label: 'Nuevo archivo', kb: 'Ctrl+N', action: () => createItem('file') },
    { label: 'Nueva carpeta', kb: '', action: () => createItem('folder') },
    { type: 'sep' },
    { label: 'Abrir carpeta', kb: 'Ctrl+K Ctrl+O', action: () => openFolder() },
    { label: 'Guardar', kb: 'Ctrl+S', action: () => saveActive() },
    { type: 'sep' },
    { label: 'Cerrar editor', kb: 'Ctrl+W', action: () => closeActiveTab() },
    { label: 'Cerrar carpeta', kb: '', action: () => closeFolder() },
  ],
  editar: [
    { label: 'Deshacer', kb: 'Ctrl+Z', action: () => document.execCommand('undo') },
    { label: 'Rehacer', kb: 'Ctrl+Shift+Z', action: () => document.execCommand('redo') },
    { type: 'sep' },
    { label: 'Cortar', kb: 'Ctrl+X', action: () => document.execCommand('cut') },
    { label: 'Copiar', kb: 'Ctrl+C', action: () => document.execCommand('copy') },
    { label: 'Pegar', kb: 'Ctrl+V', action: () => document.execCommand('paste') },
    { type: 'sep' },
    { label: 'Buscar', kb: 'Ctrl+F', action: () => runEditorAction('actions.find') },
    { label: 'Reemplazar', kb: 'Ctrl+H', action: () => runEditorAction('editor.action.startFindReplaceAction') },
    { type: 'sep' },
    { label: 'Alternar comentario de línea', kb: 'Ctrl+/', action: () => toggleComment() },
  ],
  seleccion: [
    { label: 'Seleccionar todo', kb: 'Ctrl+A', action: () => runEditorAction('editor.action.selectAll') },
    { label: 'Seleccionar línea', kb: 'Ctrl+L', action: () => selectLine() },
    { type: 'sep' },
    { label: 'Copiar línea arriba', kb: 'Shift+Alt+↑', action: () => duplicateLines(-1) },
    { label: 'Copiar línea abajo', kb: 'Shift+Alt+↓', action: () => duplicateLines(1) },
    { label: 'Mover línea arriba', kb: 'Alt+↑', action: () => moveLines(-1) },
    { label: 'Mover línea abajo', kb: 'Alt+↓', action: () => moveLines(1) },
    { type: 'sep' },
    { label: 'Borrar línea', kb: 'Ctrl+Shift+K', action: () => deleteLines() },
  ],
  ver: [
    { label: 'Paleta de comandos...', kb: 'Ctrl+Shift+P', action: () => showCommandPalette() },
    { type: 'sep' },
    { label: 'Explorador', kb: 'Ctrl+Shift+E', action: () => showView('explorer') },
    { label: 'Buscar', kb: 'Ctrl+Shift+F', action: () => showView('search') },
    { label: 'Control de código fuente', kb: 'Ctrl+Shift+G', action: () => showView('scm') },
    { label: 'Terminal', kb: 'Ctrl+`', action: () => openTerminalPanel() },
    { type: 'sep' },
    { label: 'Ajustar línea', kb: 'Alt+Z', action: () => toggleWordWrap() },
    { label: 'Acercar', kb: 'Ctrl+=', action: () => setEditorFont(editorFont + 1) },
    { label: 'Alejar', kb: 'Ctrl+-', action: () => setEditorFont(editorFont - 1) },
    { label: 'Restablecer zoom', kb: 'Ctrl+0', action: () => setEditorFont(14) },
  ],
  ir: [
    { label: 'Ir al archivo...', kb: 'Ctrl+P', action: () => showQuickOpen() },
    { label: 'Ir a la línea...', kb: 'Ctrl+G', action: () => showGoToLine() },
  ],
  ejecutar: [
    { label: 'Nueva terminal', kb: 'Ctrl+Shift+`', action: () => { openTerminalPanel(); createTerminal(); } },
    { label: 'Alternar terminal', kb: 'Ctrl+`', action: () => openTerminalPanel() },
    { label: 'Alternar panel', kb: '', action: () => togglePanel() },
  ],
  ayuda: [
    { label: 'Acerca de Hydra IDE', action: () => showModal('Hydra IDE', 'Hydra IDE ' + (appVersion ? 'v' + appVersion : 'v0.2.3') + ' — Editor de código con núcleo en C++.', null, true, 'Cerrar') },
  ],
};

document.querySelectorAll('.menu-trigger').forEach((trigger) => {
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const menuName = trigger.dataset.menu;
    toggleMenu(menuName, trigger);
  });
  trigger.addEventListener('mouseenter', () => {
    const openMenu = document.querySelector('.menu-trigger.open');
    if (openMenu && openMenu !== trigger) {
      const menuName = trigger.dataset.menu;
      toggleMenu(menuName, trigger);
    }
  });
});

function toggleMenu(menuName, trigger) {
  const existingOpen = document.querySelector('.menu-trigger.open');
  const dropdown = el('menu-dropdown');

  if (existingOpen === trigger && !dropdown.hidden) {
    existingOpen.classList.remove('open');
    dropdown.hidden = true;
    return;
  }

  document.querySelectorAll('.menu-trigger.open').forEach((m) => m.classList.remove('open'));
  trigger.classList.add('open');

  const items = menuDefs[menuName];
  if (!items) return;

  dropdown.innerHTML = '';
  dropdown.hidden = false;

  const rect = trigger.getBoundingClientRect();
  dropdown.style.left = rect.left + 'px';
  dropdown.style.top = rect.bottom + 'px';

  items.forEach((item) => {
    if (item.type === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'sep';
      dropdown.appendChild(sep);
      return;
    }
    const mi = document.createElement('div');
    mi.className = 'mi';
    const left = document.createElement('span');
    left.textContent = item.label;
    mi.appendChild(left);
    if (item.kb) {
      const kb = document.createElement('span');
      kb.className = 'kb';
      kb.textContent = item.kb;
      mi.appendChild(kb);
    }
    mi.addEventListener('click', () => {
      dropdown.hidden = true;
      document.querySelectorAll('.menu-trigger.open').forEach((m) => m.classList.remove('open'));
      item.action();
    });
    dropdown.appendChild(mi);
  });
}

document.addEventListener('click', () => {
  el('menu-dropdown').hidden = true;
  document.querySelectorAll('.menu-trigger.open').forEach((m) => m.classList.remove('open'));
});

function closeFolder() {
  try { window.api.watchFolder(null); } catch (e) {} // dejar de vigilar el disco
  rootDir = null;
  rootName = '';
  el('explorer-empty').hidden = false;
  el('folder-pane').hidden = true;
  el('explorer-actions').hidden = true;
  el('tree').innerHTML = '';
  el('folder-name').textContent = '';
  try { threedStop(); } catch (e) {}
  for (const t of tabs.values()) { if (t.model && !t.model.isDisposed()) { try { t.model.dispose(); } catch (e) {} } }
  tabs.clear();
  openFiles = [];
  activeTab = null;
  if (monacoEditor) monacoEditor.setModel(null);
  el('editor-wrap').hidden = true;
  el('welcome').hidden = false;
  el('breadcrumbs').hidden = true;
  el('ext-details').hidden = true;
  el('update-details').hidden = true;
  el('webview-view').hidden = true;
  el('gitgraph-view').hidden = true;
  el('threed-view') && (el('threed-view').hidden = true);
  el('image-view').hidden = true;
  renderTabs();
  saveState({ lastFolder: null });
  updateDiscordActivity(); // volver al estado base en Discord
}

// --------------------------------------------------------------------------
// Quick Open (Ctrl+P)
// --------------------------------------------------------------------------
function showQuickOpen() {
  const overlay = el('quick-overlay');
  const input = el('quick-input');
  const list = el('quick-list');
  overlay.hidden = false;
  input.value = '';
  list.innerHTML = '';
  input.focus();

  const handleInput = async () => {
    const q = input.value.toLowerCase();
    list.innerHTML = '';
    if (!rootDir) {
      list.innerHTML = '<div class="qempty">Abre una carpeta primero.</div>';
      return;
    }
    if (!q) {
      const tree = await window.api.tree(rootDir);
      const allFiles = flattenTree(tree);
      renderQuickList(allFiles.slice(0, 30), input);
      return;
    }
    const tree = await window.api.tree(rootDir);
    const allFiles = flattenTree(tree);
    const filtered = allFiles.filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    renderQuickList(filtered.slice(0, 30), input);
  };

  input.placeholder = 'Buscar archivo por nombre';
  input.oninput = handleInput;
  handleInput();

  input.onkeydown = (e) => {
    if (e.key === 'Escape') { closeQuickOverlay(input); }
    else if (e.key === 'Enter') {
      const sel = list.querySelector('.sel');
      if (sel) sel.click();
    }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveQuickSel(list, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveQuickSel(list, -1); }
  };

  overlay.onclick = (e) => { if (e.target === overlay) closeQuickOverlay(input); };
}

// Mover la selección en una lista de quick input (paleta / quick open).
function moveQuickSel(list, dir) {
  const items = Array.from(list.querySelectorAll('.qitem'));
  if (items.length === 0) return;
  let idx = items.findIndex((i) => i.classList.contains('sel'));
  if (idx < 0) idx = 0;
  const next = Math.max(0, Math.min(items.length - 1, idx + dir));
  items.forEach((i) => i.classList.remove('sel'));
  items[next].classList.add('sel');
  items[next].scrollIntoView({ block: 'nearest' });
}

function closeQuickOverlay(input) {
  el('quick-overlay').hidden = true;
  if (monacoEditor) monacoEditor.focus();
}

function flattenTree(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'file') out.push(n);
    if (n.children) out.push(...flattenTree(n.children));
  }
  return out;
}

function renderQuickList(files, input) {
  const list = el('quick-list');
  list.innerHTML = '';
  if (files.length === 0) {
    list.innerHTML = '<div class="qempty">Sin resultados</div>';
    return;
  }
  files.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'qitem' + (i === 0 ? ' sel' : '');
    const icon = codicon('file');
    icon.classList.add('codicon');
    const name = document.createElement('span');
    name.textContent = f.name;
    const sub = document.createElement('span');
    sub.className = 'qsub';
    const rel = f.path.replace(rootDir, '').replace(/^[\\/]/, '');
    sub.textContent = rel;
    div.append(icon, name, sub);
    div.addEventListener('click', () => {
      el('quick-overlay').hidden = true;
      showView('explorer');
      openFile(f.path, f.name);
    });
    list.appendChild(div);
  });
}

// --------------------------------------------------------------------------
// Command Palette (Ctrl+Shift+P)
// --------------------------------------------------------------------------
const commandDefs = [
  { label: 'Abrir carpeta', icon: 'folder-opened', cmd: () => openFolder() },
  { label: 'Cerrar carpeta', icon: 'folder', cmd: () => closeFolder() },
  { type: 'sep' },
  { label: 'Nuevo archivo', icon: 'new-file', cmd: () => createItem('file') },
  { label: 'Nueva carpeta', icon: 'new-folder', cmd: () => createItem('folder') },
  { label: 'Guardar', icon: 'save', cmd: () => saveActive() },
  { type: 'sep' },
  { label: 'Ir al archivo...', icon: 'file', cmd: () => showQuickOpen() },
  { label: 'Ir a la línea...', icon: 'symbol-ruler', cmd: () => showGoToLine() },
  { type: 'sep' },
  { label: 'Buscar en archivos', icon: 'search', cmd: () => showView('search') },
  { label: 'Alternar barra lateral', icon: 'layout-sidebar-left', cmd: () => toggleSidebar() },
  { label: 'Alternar panel', icon: 'layout-panel', cmd: () => togglePanel() },
  { label: 'Terminal: Nueva terminal', icon: 'terminal', cmd: () => { openTerminalPanel(); createTerminal(); } },
  { label: 'Terminal: Alternar terminal', icon: 'terminal', cmd: () => openTerminalPanel() },
  { label: 'Live Server: Iniciar / Detener (Go Live)', icon: 'broadcast', cmd: () => toggleLive() },
  { label: 'Git Graph: Ver grafo de commits', icon: 'git-commit', cmd: () => openGitGraph() },
  { label: 'Prettier: Formatear documento', icon: 'symbol-color', cmd: () => formatActiveDocument() },
  { type: 'sep' },
  { label: 'Alternar comentario de línea', icon: 'comment', cmd: () => toggleComment() },
  { label: 'Copiar línea abajo', icon: 'copy', cmd: () => duplicateLines(1) },
  { label: 'Mover línea arriba', icon: 'arrow-up', cmd: () => moveLines(-1) },
  { label: 'Mover línea abajo', icon: 'arrow-down', cmd: () => moveLines(1) },
  { label: 'Borrar línea', icon: 'trash', cmd: () => deleteLines() },
  { label: 'Seleccionar línea', icon: 'selection', cmd: () => selectLine() },
  { type: 'sep' },
  { label: 'Ajustar línea', icon: 'word-wrap', cmd: () => toggleWordWrap() },
  { label: 'Acercar (zoom)', icon: 'zoom-in', cmd: () => setEditorFont(editorFont + 1) },
  { label: 'Alejar (zoom)', icon: 'zoom-out', cmd: () => setEditorFont(editorFont - 1) },
];

function showCommandPalette() {
  const overlay = el('quick-overlay');
  const input = el('quick-input');
  const list = el('quick-list');
  input.placeholder = 'Buscar comandos...';
  overlay.hidden = false;
  input.value = '';
  list.innerHTML = '';
  input.focus();

  const render = () => {
    const q = input.value.toLowerCase();
    list.innerHTML = '';
    const filtered = commandDefs.filter((cmd) => {
      if (cmd.type === 'sep') return false;
      return cmd.label.toLowerCase().includes(q);
    });
    if (filtered.length === 0) {
      list.innerHTML = '<div class="qempty">Sin comandos</div>';
      return;
    }
    filtered.forEach((cmd, i) => {
      const div = document.createElement('div');
      div.className = 'qitem' + (i === 0 ? ' sel' : '');
      const icon = codicon(cmd.icon);
      icon.classList.add('codicon');
      const label = document.createElement('span');
      label.textContent = cmd.label;
      div.append(icon, label);
      div.addEventListener('click', () => {
        el('quick-overlay').hidden = true;
        cmd.cmd();
      });
      list.appendChild(div);
    });
  };

  input.oninput = render;
  render();

  input.onkeydown = (e) => {
    if (e.key === 'Escape') {
      el('quick-overlay').hidden = true;
      input.placeholder = '';
      if (monacoEditor) monacoEditor.focus();
    }
    else if (e.key === 'Enter') {
      const sel = list.querySelector('.sel');
      if (sel) { el('quick-overlay').hidden = true; sel.click(); }
    }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveQuickSel(list, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveQuickSel(list, -1); }
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) { overlay.hidden = true; input.placeholder = ''; if (monacoEditor) monacoEditor.focus(); }
  };
}

// --------------------------------------------------------------------------
// Ir a la línea (Ctrl+G)
// --------------------------------------------------------------------------
function showGoToLine() {
  // Monaco ya tiene "Ir a la línea" (Ctrl+G); abrimos su acción nativa.
  runEditorAction('editor.action.gotoLine');
}

// --------------------------------------------------------------------------
// Sidebar / Panel toggle
// --------------------------------------------------------------------------
function toggleSidebar() {
  const sidebar = el('sidebar');
  const hide = !sidebar.hidden;
  sidebar.hidden = hide;
  el('resizer-sidebar').hidden = hide;   // ocultar también el divisor
}

function togglePanel() {
  const panel = el('panel');
  panel.hidden = !panel.hidden;
  el('resizer-panel').hidden = panel.hidden;
  persistPanelState();
}

// --------------------------------------------------------------------------
// Resizers: arrastrar para redimensionar barra lateral y panel inferior
// --------------------------------------------------------------------------
function makeResizer(handle, target, axis, min, max, invert) {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handle.classList.add('active');
    const horizontal = axis === 'x';
    const start = horizontal ? e.clientX : e.clientY;
    const rect = target.getBoundingClientRect();
    const startSize = horizontal ? rect.width : rect.height;

    const onMove = (ev) => {
      const cur = horizontal ? ev.clientX : ev.clientY;
      // Barra lateral crece a la derecha; panel inferior hacia arriba; el panel
      // de IA (invert) está a la derecha, así que crece hacia la izquierda.
      let delta = horizontal ? (cur - start) : (start - cur);
      if (invert) delta = -delta;
      const size = Math.max(min, Math.min(max, startSize + delta));
      target.style[horizontal ? 'width' : 'height'] = size + 'px';
    };
    const onUp = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

makeResizer(el('resizer-sidebar'), el('sidebar'), 'x', 170, 600);
makeResizer(el('resizer-panel'), el('panel'), 'y', 80, 500);
makeResizer(el('resizer-ai'), el('ai-panel'), 'x', 280, 680, true);

// --------------------------------------------------------------------------
// Modal genérico
// --------------------------------------------------------------------------
function showModal(title, value, placeholder, confirmOnly, confirmText) {
  return new Promise((resolve) => {
    const overlay = el('modal-overlay');
    const titleEl = el('modal-title');
    const inputEl = el('modal-input');
    const msgEl = el('modal-message');
    const btnsEl = el('modal-buttons');

    overlay.hidden = false;
    titleEl.textContent = title;
    msgEl.textContent = value || '';

    if (placeholder) {
      inputEl.hidden = false;
      inputEl.placeholder = placeholder;
      inputEl.value = '';
      inputEl.focus();
    } else {
      inputEl.hidden = true;
    }

    btnsEl.innerHTML = '';
    if (confirmOnly) {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = confirmText || 'Cerrar';
      btn.addEventListener('click', () => {
        overlay.hidden = true;
        resolve(true);
      });
      btnsEl.appendChild(btn);
    } else {
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.addEventListener('click', () => {
        overlay.hidden = true;
        resolve(null);
      });
      btnsEl.appendChild(cancelBtn);

      const okBtn = document.createElement('button');
      okBtn.className = 'primary';
      okBtn.textContent = 'Aceptar';
      okBtn.addEventListener('click', () => {
        overlay.hidden = true;
        resolve(inputEl.value.trim());
      });
      btnsEl.appendChild(okBtn);

      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') okBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
      };

      setTimeout(() => inputEl.focus(), 0);
    }
  });
}

// Diálogo de confirmación propio (UI del programa, no del sistema).
// Devuelve Promise<boolean>. `danger` resalta el botón de acción en rojo.
function showConfirm(title, message, okText, danger) {
  return new Promise((resolve) => {
    const overlay = el('modal-overlay');
    el('modal-title').textContent = title;
    el('modal-message').textContent = message || '';
    el('modal-input').hidden = true;
    const btnsEl = el('modal-buttons');
    btnsEl.innerHTML = '';

    const close = (val) => { overlay.hidden = true; document.removeEventListener('keydown', onKey, true); resolve(val); };
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => close(false));
    const okBtn = document.createElement('button');
    okBtn.className = 'primary' + (danger ? ' danger' : '');
    okBtn.textContent = okText || 'Aceptar';
    okBtn.addEventListener('click', () => close(true));
    btnsEl.append(cancelBtn, okBtn);

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    document.addEventListener('keydown', onKey, true);

    overlay.hidden = false;
    setTimeout(() => okBtn.focus(), 0);
  });
}

// --------------------------------------------------------------------------
// Panel inferior (tabs)
// --------------------------------------------------------------------------
document.querySelectorAll('.panel-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.panel-body').forEach((b) => b.hidden = b.dataset.panel !== tab.dataset.panel);
    if (tab.dataset.panel === 'terminal') showTerminal();
    persistPanelState();
  });
});

el('panel-close').addEventListener('click', togglePanel);
// Botón "+" de la barra de terminales: crea una terminal nueva.
el('term-new').addEventListener('click', () => { openTerminalPanel(); createTerminal(); });

// --------------------------------------------------------------------------
// Lenguaje según extensión
// --------------------------------------------------------------------------
function languageOf(name) {
  const base = String(name || '').toLowerCase();
  // Archivos sin extensión (o "dotfiles") que igual tienen lenguaje conocido.
  if (base === 'dockerfile' || base.startsWith('dockerfile.') || base.endsWith('.dockerfile')) return 'Dockerfile';
  if (base === '.gitignore' || base === '.gitattributes' || base === '.dockerignore' ||
      base === '.npmrc' || base === '.env' || base.startsWith('.env.') || base === '.editorconfig') return 'INI';
  if (base === 'cmakelists.txt') return 'Texto sin formato';
  const ext = (base.split('.').pop() || '');
  return EXT_LANG[ext] || 'Texto sin formato';
}

// --------------------------------------------------------------------------
// Barra de estado interactiva (estilo VS Code)
// --------------------------------------------------------------------------
function detectEol(content) {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

// Detecta el tamaño de indentación al estilo VS Code: por FRECUENCIA del salto
// de sangría entre líneas (no solo la primera). Robusto ante archivos mixtos.
function detectIndent(content) {
  const lines = content.split('\n');
  let tabLines = 0, spaceLines = 0;
  const deltas = {};       // salto de sangría (en espacios) -> cuántas veces ocurre
  let prevIndent = 0;
  for (const line of lines) {
    if (!line.trim()) continue;                 // saltar líneas en blanco
    if (line[0] === '\t') { tabLines++; continue; }
    const indent = (line.match(/^( *)/)[1]).length;
    if (line[0] === ' ') spaceLines++;
    const d = indent - prevIndent;
    if (d > 0 && d <= 8) deltas[d] = (deltas[d] || 0) + 1;
    prevIndent = indent;
  }
  if (tabLines > spaceLines) return { useTabs: true, size: 4 };
  // El salto más frecuente es la unidad de indentación (2, 4, 8…).
  let size = 0, best = 0;
  for (const k of Object.keys(deltas)) { if (deltas[k] > best) { best = deltas[k]; size = +k; } }
  return { useTabs: false, size: size || 4 };
}

// Dispara la animación de "valor cambiado" reiniciándola si ya estaba activa.
function pulseStatus(elem) {
  elem.classList.remove('changed');
  void elem.offsetWidth; // fuerza reflow para reiniciar la animación
  elem.classList.add('changed');
}

// Actualiza el texto de un item SOLO si cambió, y lo anima. Así la barra nunca
// "se recarga" entera: cada dato transiciona de forma independiente.
function setStatusText(elem, text) {
  if (elem.textContent === text) return;
  elem.textContent = text;
  pulseStatus(elem);
}

// Actualiza el contador de errores/avisos con animación. Listo para cuando se
// agregue un linter/diagnósticos; hoy se mantiene en 0.
function setProblems(errors, warnings) {
  const e = el('err-count'), w = el('warn-count');
  const changed = e.textContent !== String(errors) || w.textContent !== String(warnings);
  e.textContent = errors;
  w.textContent = warnings;
  el('status-problems').classList.toggle('has-problems', errors > 0 || warnings > 0);
  if (changed) pulseStatus(el('status-problems'));
}

function updateStatusBarForTab(tab) {
  setStatusText(el('status-eol'), tab.eol);
  setStatusText(el('status-indent'), tab.indent.useTabs
    ? 'Tabulaciones: ' + tab.indent.size
    : 'Espacios: ' + tab.indent.size);
  setStatusText(el('status-encoding'), 'UTF-8');
  setStatusText(el('status-lang'), tab.lang);
}

function resetStatusBar() {
  el('status-pos').textContent = 'Ln 1, Col 1';
  el('status-eol').textContent = 'LF';
  el('status-indent').textContent = 'Espacios: 4';
  el('status-encoding').textContent = 'UTF-8';
  el('status-lang').textContent = 'Texto sin formato';
}

// Menú emergente anclado HACIA ARRIBA desde un elemento de la barra de estado.
function showPopupMenu(anchorEl, items) {
  const menu = el('popup-menu');
  menu.innerHTML = '';
  menu.hidden = false;

  items.forEach((it) => {
    if (it.type === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'sep';
      menu.appendChild(sep);
      return;
    }
    if (it.type === 'header') {
      const h = document.createElement('div');
      h.className = 'mi-header';
      h.textContent = it.label;
      menu.appendChild(h);
      return;
    }
    const mi = document.createElement('div');
    mi.className = 'mi';
    const left = document.createElement('span');
    left.className = 'mi-left';
    left.innerHTML = (it.checked
      ? '<i class="codicon codicon-check"></i>'
      : '<span class="mi-check-spacer"></span>') + '<span>' + escapeHtml(it.label) + '</span>';
    mi.appendChild(left);
    mi.addEventListener('click', () => { menu.hidden = true; it.action && it.action(); });
    menu.appendChild(mi);
  });

  // Posicionar: justo encima del elemento ancla.
  const r = anchorEl.getBoundingClientRect();
  const mh = menu.offsetHeight;
  menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 4) + 'px';
  menu.style.top = Math.max(4, r.top - mh) + 'px';
}

document.addEventListener('click', (e) => {
  const menu = el('popup-menu');
  if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true;
});

// Cursor → Ir a la línea
el('status-pos').addEventListener('click', (e) => { e.stopPropagation(); if (activeTab) showGoToLine(); });

// Indentación → espacios / tabulaciones
el('status-indent').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!activeTab) return;
  const cur = tabs.get(activeTab).indent;
  showPopupMenu(el('status-indent'), [
    { type: 'header', label: 'Indentación' },
    { label: 'Espacios: 2', checked: !cur.useTabs && cur.size === 2, action: () => setIndent(false, 2) },
    { label: 'Espacios: 4', checked: !cur.useTabs && cur.size === 4, action: () => setIndent(false, 4) },
    { label: 'Espacios: 8', checked: !cur.useTabs && cur.size === 8, action: () => setIndent(false, 8) },
    { type: 'sep' },
    { label: 'Tabulaciones', checked: cur.useTabs, action: () => setIndent(true, cur.size) },
  ]);
});

function setIndent(useTabs, size) {
  if (!activeTab) return;
  const tab = tabs.get(activeTab);
  tab.indent = { useTabs, size };
  if (tab.model) tab.model.updateOptions({ tabSize: size, insertSpaces: !useTabs });
  updateStatusBarForTab(tab);
}

// Codificación (solo soportamos UTF-8)
el('status-encoding').addEventListener('click', (e) => {
  e.stopPropagation();
  showPopupMenu(el('status-encoding'), [
    { type: 'header', label: 'Codificación' },
    { label: 'UTF-8', checked: true },
  ]);
});

// Fin de línea → LF / CRLF
el('status-eol').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!activeTab) return;
  const cur = tabs.get(activeTab).eol;
  showPopupMenu(el('status-eol'), [
    { type: 'header', label: 'Fin de línea' },
    { label: 'LF', checked: cur === 'LF', action: () => setEol('LF') },
    { label: 'CRLF', checked: cur === 'CRLF', action: () => setEol('CRLF') },
  ]);
});

function setEol(eol) {
  if (!activeTab) return;
  const tab = tabs.get(activeTab);
  if (tab.eol === eol) return;
  tab.eol = eol;
  setStatusText(el('status-eol'), eol);
  if (!tab.dirty) { tab.dirty = true; renderTabs(); } // se aplicará al guardar
}

// Selector de lenguaje
// Lista para el selector de lenguaje: "Texto sin formato" primero y el resto
// alfabético, derivado del catálogo (sin duplicados).
const LANGUAGES = ['Texto sin formato'].concat(
  Array.from(new Set(LANG_DEFS.map((d) => d.name)))
    .filter((n) => n !== 'Texto sin formato')
    .sort((a, b) => a.localeCompare(b))
);
el('status-lang').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!activeTab) return;
  const cur = tabs.get(activeTab).lang;
  showPopupMenu(el('status-lang'), [
    { type: 'header', label: 'Modo de lenguaje' },
    ...LANGUAGES.map((l) => ({ label: l, checked: l === cur, action: () => setLang(l) })),
  ]);
});

function setLang(lang) {
  if (!activeTab) return;
  const tab = tabs.get(activeTab);
  tab.lang = lang;
  if (tab.model && monaco) monaco.editor.setModelLanguage(tab.model, monacoLangId(lang));
  // Breve spinner "cargando el modo" y luego el nombre del lenguaje con fade.
  const item = el('status-lang');
  item.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i>';
  clearTimeout(item._langTimer);
  item._langTimer = setTimeout(() => {
    item.textContent = lang;
    pulseStatus(item);
  }, 300);
}

// Contador de problemas → abre el panel inferior en la pestaña Problemas
el('status-problems').addEventListener('click', (e) => {
  e.stopPropagation();
  el('panel').hidden = false;
  el('resizer-panel').hidden = false;
  document.querySelectorAll('.panel-tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === 'problems'));
  document.querySelectorAll('.panel-body').forEach((b) => b.hidden = b.dataset.panel !== 'problems');
});

// --------------------------------------------------------------------------
// Zoom de fuente y ajuste de línea (estilo VS Code)
// --------------------------------------------------------------------------
let editorFont = 14;
function setEditorFont(px) {
  editorFont = Math.max(8, Math.min(40, px));
  if (monacoEditor) monacoEditor.updateOptions({ fontSize: editorFont });
}

let wordWrap = false;
function setWordWrap(on) {
  wordWrap = !!on;
  if (monacoEditor) monacoEditor.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' });
}
function updateWrapWidth() {} // no-op: Monaco maneja el ajuste de línea
function toggleWordWrap() { setWordWrap(!wordWrap); saveSettings(); }

// --------------------------------------------------------------------------
// Configuración (Settings) — opciones reales y persistentes.
// --------------------------------------------------------------------------
const DEFAULT_SETTINGS = { editorFont: 14, wordWrap: false, accent: '#7c6bff', termFont: 13, termCursorBlink: true, autoSave: 'afterDelay', autoSaveDelay: 1000 };
let appSettings = Object.assign({}, DEFAULT_SETTINGS);
const ACCENT_PRESETS = ['#7c6bff', '#3b8eea', '#0dbc79', '#e5a00d', '#f14c4c', '#d670d6', '#11a8cd', '#ff7a59'];

// Aclara un color hex hacia el blanco (para el hover del acento).
function lightenHex(hex, amt) {
  const n = parseInt((hex || '#7c6bff').slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
// Oscurece un color hex hacia el negro (para la barra de estado).
function darkenHex(hex, amt) {
  const n = parseInt((hex || '#7c6bff').slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * (1 - amt)); g = Math.round(g * (1 - amt)); b = Math.round(b * (1 - amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function applyAccent(hex) {
  const r = document.documentElement.style;
  r.setProperty('--accent', hex);
  r.setProperty('--accent-hover', lightenHex(hex, 0.14));
  r.setProperty('--tab-active-border-top', hex);
  r.setProperty('--focus-border', hex);
  r.setProperty('--list-active-bg', hex + '33');     // 20% alpha
  // Barra de estado: degradado derivado del acento (oscuro → acento).
  r.setProperty('--statusbar-bg', darkenHex(hex, 0.38));
  r.setProperty('--statusbar-bg2', darkenHex(hex, 0.08));
}

function applyTermSettings() {
  for (const T of terminals.values()) {
    try {
      T.term.options.fontSize = appSettings.termFont;
      T.term.options.cursorBlink = appSettings.termCursorBlink;
      if (T.id === activeTermId) { T.fitAddon.fit(); window.api.termResize(T.term.cols, T.term.rows, T.sessionId); }
    } catch {}
  }
}

function applySettings(s) {
  appSettings = Object.assign({}, DEFAULT_SETTINGS, s || {});
  setEditorFont(appSettings.editorFont);
  setWordWrap(appSettings.wordWrap);
  applyAccent(appSettings.accent);
  applyTermSettings();
}

function saveSettings() {
  appSettings.editorFont = editorFont;
  appSettings.wordWrap = wordWrap;
  saveState({ settings: appSettings });
}

function openSettings() {
  document.querySelectorAll('.set-overlay').forEach((o) => o.remove());
  const ov = document.createElement('div');
  ov.className = 'overlay pub-overlay set-overlay';
  ov.innerHTML =
    '<div class="pub-card set-card">' +
      '<div class="pub-head"><i class="codicon codicon-settings-gear"></i> Configuración<button class="pub-x" title="Cerrar"><i class="codicon codicon-close"></i></button></div>' +
      '<div class="pub-body">' +
        '<div class="set-sec">Editor</div>' +
        '<div class="set-row"><span>Tamaño de fuente</span>' +
          '<div class="set-ctl"><input type="range" id="set-font" min="8" max="40" step="1"><span class="set-val" id="set-font-val"></span></div></div>' +
        '<div class="set-row"><span>Ajuste de línea (word wrap)</span>' +
          '<label class="switch"><input type="checkbox" id="set-wrap"><span class="slider"></span></label></div>' +
        '<div class="set-row"><span>Guardado automático<small class="set-hint">Guarda tus cambios sin perderlos al cerrar</small></span>' +
          '<div class="set-ctl"><select id="set-autosave" class="set-select">' +
            '<option value="off">Desactivado</option>' +
            '<option value="afterDelay">Tras una pausa</option>' +
            '<option value="onFocusChange">Al cambiar de foco</option>' +
            '<option value="onWindowChange">Al cambiar de ventana</option>' +
          '</select></div></div>' +
        '<div class="set-row" id="set-asdelay-row"><span>Retraso del auto-guardado</span>' +
          '<div class="set-ctl"><input type="range" id="set-asdelay" min="300" max="5000" step="100"><span class="set-val" id="set-asdelay-val"></span></div></div>' +
        '<div class="set-sec">Apariencia</div>' +
        '<div class="set-row"><span>Color de acento</span><div class="set-swatches" id="set-accents"></div></div>' +
        '<div class="set-row"><span>Color personalizado</span><input type="color" id="set-accent-custom" class="set-color"></div>' +
        '<div class="set-sec">Terminal</div>' +
        '<div class="set-row"><span>Tamaño de fuente</span>' +
          '<div class="set-ctl"><input type="range" id="set-tfont" min="8" max="28" step="1"><span class="set-val" id="set-tfont-val"></span></div></div>' +
        '<div class="set-row"><span>Cursor parpadeante</span>' +
          '<label class="switch"><input type="checkbox" id="set-blink"><span class="slider"></span></label></div>' +
      '</div>' +
      '<div class="pub-foot"><button class="ext-btn ghost" id="set-reset">Restablecer</button><button class="ext-btn" id="set-done">Listo</button></div>' +
    '</div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.pub-x').onclick = close;
  ov.querySelector('#set-done').onclick = close;

  // Fuente del editor (en vivo)
  const fontIn = ov.querySelector('#set-font'), fontVal = ov.querySelector('#set-font-val');
  fontIn.value = appSettings.editorFont; fontVal.textContent = appSettings.editorFont + ' px';
  fontIn.oninput = () => { fontVal.textContent = fontIn.value + ' px'; setEditorFont(+fontIn.value); saveSettings(); };

  // Word wrap
  const wrap = ov.querySelector('#set-wrap');
  wrap.checked = appSettings.wordWrap;
  wrap.onchange = () => { setWordWrap(wrap.checked); saveSettings(); };

  // Guardado automático (modo + retraso)
  const asSel = ov.querySelector('#set-autosave');
  const asRow = ov.querySelector('#set-asdelay-row');
  const asDelay = ov.querySelector('#set-asdelay'), asDelayVal = ov.querySelector('#set-asdelay-val');
  const syncAsDelay = () => { asRow.style.display = (asSel.value === 'afterDelay') ? '' : 'none'; };
  asSel.value = appSettings.autoSave || 'off';
  asDelay.value = appSettings.autoSaveDelay || 1000;
  asDelayVal.textContent = ((appSettings.autoSaveDelay || 1000) / 1000).toFixed(1) + ' s';
  syncAsDelay();
  asSel.onchange = () => { appSettings.autoSave = asSel.value; syncAsDelay(); saveSettings(); };
  asDelay.oninput = () => { appSettings.autoSaveDelay = +asDelay.value; asDelayVal.textContent = (+asDelay.value / 1000).toFixed(1) + ' s'; saveSettings(); };

  // Acento: presets + personalizado
  const accBox = ov.querySelector('#set-accents');
  const custom = ov.querySelector('#set-accent-custom');
  custom.value = appSettings.accent;
  const paintSwatches = () => {
    accBox.querySelectorAll('.set-swatch').forEach((s) => s.classList.toggle('active', s.dataset.c.toLowerCase() === appSettings.accent.toLowerCase()));
  };
  for (const c of ACCENT_PRESETS) {
    const sw = document.createElement('button');
    sw.className = 'set-swatch'; sw.dataset.c = c; sw.style.background = c;
    sw.onclick = () => { appSettings.accent = c; applyAccent(c); custom.value = c; paintSwatches(); saveSettings(); };
    accBox.appendChild(sw);
  }
  paintSwatches();
  custom.oninput = () => { appSettings.accent = custom.value; applyAccent(custom.value); paintSwatches(); saveSettings(); };

  // Terminal
  const tfont = ov.querySelector('#set-tfont'), tfontVal = ov.querySelector('#set-tfont-val');
  tfont.value = appSettings.termFont; tfontVal.textContent = appSettings.termFont + ' px';
  tfont.oninput = () => { tfontVal.textContent = tfont.value + ' px'; appSettings.termFont = +tfont.value; applyTermSettings(); saveSettings(); };
  const blink = ov.querySelector('#set-blink');
  blink.checked = appSettings.termCursorBlink;
  blink.onchange = () => { appSettings.termCursorBlink = blink.checked; applyTermSettings(); saveSettings(); };

  // Sección "Acerca de" — versión + buscar actualizaciones.
  const body = ov.querySelector('.pub-body');
  const about = document.createElement('div');
  about.innerHTML =
    '<div class="set-sec">Acerca de</div>' +
    `<div class="set-row"><span>Versión de Hydra IDE</span><b id="set-version">${appVersion || '—'}</b></div>` +
    '<div class="set-row"><span>Actualizaciones</span>' +
      '<div class="set-ctl"><span class="set-val" id="set-update-status" style="min-width:0"></span>' +
      '<button class="ext-btn ghost" id="set-check-update">Buscar</button></div></div>';
  body.appendChild(about);
  about.querySelector('#set-check-update').onclick = doCheckUpdates;
  updateSettingsUpdateText();

  // Restablecer
  ov.querySelector('#set-reset').onclick = () => {
    applySettings(Object.assign({}, DEFAULT_SETTINGS));
    saveSettings();
    close(); openSettings();
  };
}

// --------------------------------------------------------------------------
// Auto-actualización (UI). El motor está en main.js (electron-updater).
// --------------------------------------------------------------------------
let appVersion = '';
let lastUpdate = { status: 'idle' };
(async () => { try { appVersion = await window.api.appVersion(); } catch (e) {} })();

const UPDATE_TEXT = {
  checking: 'Buscando…',
  available: 'Descargando actualización…',
  downloading: 'Descargando…',
  ready: '¡Lista! Reiniciá para instalar.',
  none: 'Estás al día.',
  error: 'No se pudo comprobar.',
  dev: 'Solo en la app instalada.',
  idle: '',
};

function updateSettingsUpdateText() {
  const s = document.getElementById('set-update-status');
  if (!s) return;
  let txt = UPDATE_TEXT[lastUpdate.status] || '';
  if (lastUpdate.status === 'downloading' && typeof lastUpdate.percent === 'number') txt = 'Descargando… ' + lastUpdate.percent + '%';
  s.textContent = txt;
}

async function doCheckUpdates() {
  lastUpdate = { status: 'checking' }; updateSettingsUpdateText();
  const r = await window.api.checkUpdates();
  if (r && r.dev) { lastUpdate = { status: 'dev' }; updateSettingsUpdateText(); }
  else if (r && r.error) { lastUpdate = { status: 'error' }; updateSettingsUpdateText(); }
  // si hay update, los eventos onUpdateStatus actualizan el resto.
}

function ensureUpdateBanner() {
  let b = document.getElementById('update-banner');
  if (!b) { b = document.createElement('div'); b.id = 'update-banner'; b.className = 'update-banner'; b.hidden = true; document.body.appendChild(b); }
  return b;
}
function showUpdateReady(version) {
  const b = ensureUpdateBanner();
  b.hidden = false;
  b.innerHTML =
    '<i class="codicon codicon-cloud-download"></i>' +
    `<span>Hydra IDE ${version || ''} está listo para instalar.</span>` +
    '<button class="ub-btn" id="ub-restart">Reiniciar e instalar</button>' +
    '<button class="ub-x" id="ub-x" title="Después"><i class="codicon codicon-close"></i></button>';
  document.getElementById('ub-restart').onclick = () => window.api.installUpdate();
  document.getElementById('ub-x').onclick = () => { b.hidden = true; };
}

if (window.api && window.api.onUpdateStatus) {
  window.api.onUpdateStatus((d) => {
    lastUpdate = d || { status: 'idle' };
    if (d.status === 'available') showToast({ name: 'Hydra IDE', icon: 'hydra-logo.svg' }, 'Descargando actualización ' + (d.version || ''), 'cloud-download', '#7c6bff');
    else if (d.status === 'ready') showUpdateReady(d.version);
    updateSettingsUpdateText();
  });
}

// --------------------------------------------------------------------------
// Atajos de teclado globales
// --------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  // Ctrl+S — Guardar
  if (ctrl && !shift && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveActive();
    return;
  }

  // Ctrl+W — Cerrar tab
  if (ctrl && !shift && e.key.toLowerCase() === 'w') {
    e.preventDefault();
    // Solo si no hay input activo en modal/quick
    if (el('quick-overlay').hidden && el('modal-overlay').hidden) {
      closeActiveTab();
    }
    return;
  }

  // Ctrl+Tab / Ctrl+Shift+Tab — cambiar tab
  if (ctrl && !shift && e.key === 'Tab') {
    e.preventDefault();
    if (openFiles.length > 0) {
      const idx = activeTab ? openFiles.indexOf(activeTab) : -1;
      const nextIdx = (idx + 1) % openFiles.length;
      const nextPath = openFiles[nextIdx];
      if (tabs.has(nextPath)) {
        setActiveTab(nextPath);
        renderTabs();
      }
    }
    return;
  }
  if (ctrl && shift && e.key === 'Tab') {
    e.preventDefault();
    if (openFiles.length > 0) {
      const idx = activeTab ? openFiles.indexOf(activeTab) : 0;
      const prevIdx = (idx - 1 + openFiles.length) % openFiles.length;
      const prevPath = openFiles[prevIdx];
      if (tabs.has(prevPath)) {
        setActiveTab(prevPath);
        renderTabs();
      }
    }
    return;
  }

  // Ctrl+P — Quick Open
  if (ctrl && !shift && e.key.toLowerCase() === 'p' && !e.altKey) {
    e.preventDefault();
    el('quick-overlay').hidden ? showQuickOpen() : closeQuickOverlay();
    return;
  }

  // Ctrl+Shift+P — Paleta de comandos
  if (ctrl && shift && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    showCommandPalette();
    return;
  }

  // Ctrl+F — Buscar (find nativo de Monaco)
  if (ctrl && !shift && e.key.toLowerCase() === 'f') {
    if (el('editor-wrap').hidden) return;
    e.preventDefault();
    runEditorAction('actions.find');
    return;
  }

  // Ctrl+H — Buscar y reemplazar (de Monaco)
  if (ctrl && !shift && e.key.toLowerCase() === 'h') {
    if (el('editor-wrap').hidden) return;
    e.preventDefault();
    runEditorAction('editor.action.startFindReplaceAction');
    return;
  }

  // Ctrl+Shift+` — Nueva terminal (como VS Code)
  if (ctrl && shift && e.key === '`') {
    e.preventDefault();
    openTerminalPanel();
    createTerminal();
    return;
  }

  // Ctrl+` — Alternar terminal
  if (ctrl && e.key === '`') {
    e.preventDefault();
    const panel = el('panel');
    const termActive = !panel.hidden &&
      document.querySelector('.panel-tab.active')?.dataset.panel === 'terminal';
    if (termActive) togglePanel();
    else openTerminalPanel();
    return;
  }

  // Ctrl+G — Ir a línea
  if (ctrl && !shift && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    showGoToLine();
    return;
  }

  // Ctrl+N — Nuevo archivo
  if (ctrl && !shift && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    createItem('file');
    return;
  }

  // Ctrl+Shift+E — Explorador
  if (ctrl && shift && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    showView('explorer');
    return;
  }

  // Ctrl+Shift+F — Buscar en archivos
  if (ctrl && shift && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    showView('search');
    return;
  }

  // Ctrl+B — Alternar barra lateral
  if (ctrl && !shift && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    toggleSidebar();
    return;
  }

  // F1 — Paleta de comandos
  if (e.key === 'F1') {
    e.preventDefault();
    showCommandPalette();
    return;
  }

  // Ctrl+J — Alternar panel inferior
  if (ctrl && !shift && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    togglePanel();
    return;
  }

  // Ctrl+Shift+G/D/X — vistas Control de fuente / Depurar / Extensiones
  if (ctrl && shift && e.key.toLowerCase() === 'g') { e.preventDefault(); showView('scm'); return; }
  if (ctrl && shift && e.key.toLowerCase() === 'd') { e.preventDefault(); showView('debug'); return; }
  if (ctrl && shift && e.key.toLowerCase() === 'x') { e.preventDefault(); showView('ext'); return; }

  // Ctrl+Shift+M — Panel de problemas
  if (ctrl && shift && e.key.toLowerCase() === 'm') {
    e.preventDefault();
    el('status-problems').click();
    return;
  }

  // Ctrl + = / + / - / 0 — Zoom de fuente del editor
  if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); setEditorFont(editorFont + 1); return; }
  if (ctrl && e.key === '-') { e.preventDefault(); setEditorFont(editorFont - 1); return; }
  if (ctrl && e.key === '0') { e.preventDefault(); setEditorFont(14); return; }

  // Alt+Z — Alternar ajuste de línea
  if (e.altKey && !ctrl && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    toggleWordWrap();
    return;
  }

  // Delete — Cerrar tab activo si el foco no está en inputs
  // Escape — Cerrar quick overlay o menú contextual
  if (e.key === 'Escape') {
    if (!el('quick-overlay').hidden) {
      el('quick-overlay').hidden = true;
      el('quick-input').placeholder = '';
      if (monacoEditor) monacoEditor.focus();
      e.preventDefault();
    } else if (!el('context-menu').hidden) {
      el('context-menu').hidden = true;
      e.preventDefault();
    }
    return;
  }
});

// Middle-click en tab (ya manejado arriba en renderTabs)


// --------------------------------------------------------------------------
// Terminal integrada (xterm + PTY real node-pty/ConPTY — igual que VS Code)
// --------------------------------------------------------------------------
// Varias terminales a la vez (como VS Code). Cada una tiene su propio xterm y su
// PTY (sessionId único). La primera usa la sesión 'main' (compatibilidad con el
// scrollback guardado); las siguientes 'term-2', 'term-3', …
const terminals = new Map();    // id -> { id, sessionId, term, fitAddon, container, started, buffer, exited, name, dataOff, exitOff, resizeObs }
let activeTermId = null;
let termSeq = 0;
let savedTermScrollback = '';   // scrollback restaurado (solo la 1ª terminal)

const termBaseName = () => ((window.api && window.api.platform === 'win32') ? 'cmd' : 'bash');
function activeTerminal() { return activeTermId ? terminals.get(activeTermId) : null; }
function activeTermSession() { const t = activeTerminal(); return t ? t.sessionId : 'main'; }
function activeTermStarted() { const t = activeTerminal(); return !!(t && t.started); }

// xterm con las opciones/tema comunes (paleta ANSI igual a VS Code, tema oscuro).
function makeXterm() {
  return new Terminal({
    fontFamily: '"Cascadia Code", "Consolas", monospace',
    fontSize: appSettings.termFont,
    cursorBlink: appSettings.termCursorBlink,
    scrollback: 8000,
    scrollOnUserInput: true,
    theme: {
      background: '#14151b',
      foreground: '#c8ccda',
      cursor: '#9385ff',
      cursorAccent: '#14151b',
      selectionBackground: '#3a356b',
      black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
      blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
      brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b',
      brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6',
      brightCyan: '#29b8db', brightWhite: '#e5e5e5',
    },
  });
}

// Copiar/pegar (portapapeles nativo) + menú contextual para UNA terminal.
function wireTermClipboard(T) {
  const term = T.term;
  const termCopy = () => {
    if (!term.hasSelection()) return false;
    window.api.clipboardWrite(term.getSelection());
    term.clearSelection();
    return true;
  };
  const termPaste = () => {
    const text = window.api.clipboardRead();
    if (text) window.api.termInput(text, T.sessionId);
  };
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== 'keydown') return true;
    const ctrl = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (ctrl && ev.shiftKey && k === 'c') { termCopy(); return false; }
    if (ctrl && !ev.shiftKey && k === 'c' && term.hasSelection()) { termCopy(); return false; }
    if (ctrl && k === 'v') { termPaste(); return false; }
    return true;
  });
  T.container.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    showTermMenu(ev.clientX, ev.clientY, term, termCopy, termPaste);
  });
}

// Crea una terminal nueva (xterm + PTY con sesión propia) y la activa.
function createTerminal() {
  const first = terminals.size === 0;
  const id = 'T' + (++termSeq);
  const sessionId = first ? 'main' : ('term-' + termSeq);
  const container = document.createElement('div');
  container.className = 'term-pane';
  el('term-panes').appendChild(container);

  const term = makeXterm();
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  try { fitAddon.fit(); } catch {}

  const T = {
    id, sessionId, term, fitAddon, container, started: false, buffer: '', exited: false,
    baseName: termBaseName(),   // 'cmd' / 'bash' — SIN número
    lineBuf: '', runningCmd: null, tabEl: null, _label: null,
    dataOff: null, exitOff: null, resizeObs: null,
  };
  terminals.set(id, T);

  // Restaurar el scrollback de la sesión anterior (solo la primera terminal).
  // Se limpian las secuencias de modos DEC privados (mouse/pantalla alterna/
  // bracketed paste) para que no rompan la selección con el mouse.
  if (first && savedTermScrollback) {
    const clean = savedTermScrollback.replace(/\x1b\[\?[0-9;]*[hl]/g, '');
    T.buffer = clean;
    term.write(clean);
    term.write('\r\n\x1b[90m──── (sesión anterior ↑ · terminal nueva ↓) ────\x1b[0m\r\n');
    savedTermScrollback = '';
  }
  term.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[?2004l\x1b[?25h');

  wireTermClipboard(T);

  // Conexión directa con el PTY de esta sesión. Además rastreamos el comando que
  // se ejecuta para renombrar la pestaña (como VS Code).
  term.onData((d) => { trackTermInput(T, d); window.api.termInput(d, T.sessionId); });
  T.dataOff = window.api.onTermData((data) => {
    term.write(data);
    T.buffer += data;
    if (T.buffer.length > 80000) T.buffer = T.buffer.slice(-60000);
    if (T.sessionId === 'main') saveState({ terminalScrollback: T.buffer }); // solo persiste la principal
    // Cuando vuelve el prompt del shell, la pestaña vuelve a su nombre base.
    if (T.runningCmd && looksLikePrompt(data)) { T.runningCmd = null; refreshTermLabel(T); }
  }, T.sessionId);
  T.exitOff = window.api.onTermExit(() => {
    term.writeln('\r\n\x1b[90m[el proceso terminó — cierra esta terminal o abre una nueva]\x1b[0m');
    T.started = false; T.exited = true;
  }, T.sessionId);

  // Redimensionado real: solo la terminal activa ajusta su PTY.
  T.resizeObs = new ResizeObserver(() => {
    if (activeTermId !== T.id) return;
    try { fitAddon.fit(); window.api.termResize(term.cols, term.rows, T.sessionId); } catch {}
  });
  T.resizeObs.observe(container);

  // Arrancar el PTY en la carpeta del proyecto.
  T.started = true;
  window.api.termStart(rootDir, term.cols, term.rows, T.sessionId);

  setActiveTerminal(id);
  return T;
}

// --- Renombrado dinámico de la pestaña según el comando en ejecución ---------
// Comandos "instantáneos" que no vale la pena mostrar como proceso.
const TERM_SKIP_CMDS = new Set(['cd', 'ls', 'dir', 'cls', 'clear', 'echo', 'set', 'exit',
  'pwd', 'title', 'color', 'type', 'cat', 'export', 'which', 'where', 'rem', 'help']);

// Nombre corto del comando de una línea escrita (primer token, sin ruta ni .exe).
function baseCommandName(line) {
  let s = (line || '').trim();
  if (!s) return '';
  const m = s.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
  let tok = m ? (m[1] || m[2] || m[3]) : s;
  tok = tok.split(/[\\/]/).pop();                       // basename
  tok = tok.replace(/\.(exe|cmd|bat|ps1|sh|com)$/i, '');
  tok = tok.toLowerCase();
  if (!tok || TERM_SKIP_CMDS.has(tok)) return '';
  return tok.slice(0, 24);
}

// ¿El texto termina con un prompt de shell? (para revertir el nombre al terminar)
function looksLikePrompt(text) {
  const t = (text || '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\s+$/, '');
  const tail = t.slice(-160);
  return /[A-Za-z]:\\[^\n]*>$/.test(tail) ||       // cmd:  C:\...>
         /\bPS [^\n]*>$/.test(tail) ||             // PowerShell: PS C:\...>
         /[\w~)\/.][$#]$/.test(tail);              // bash/zsh: ...$  o  ...#
}

// Rastrea lo que se teclea para saber qué comando se ejecuta (Enter) y nombrar
// la pestaña con él. Vuelve al nombre base al pulsar Enter en vacío o con Ctrl+C.
function trackTermInput(T, d) {
  if (!d || d.charCodeAt(0) === 0x1b) return;   // ignora flechas/escapes
  for (const ch of d) {
    const code = ch.charCodeAt(0);
    if (ch === '\r' || ch === '\n') {
      const cmd = baseCommandName(T.lineBuf);
      T.lineBuf = '';
      if (cmd) { T.runningCmd = cmd; refreshTermLabel(T); }
      else if (T.runningCmd) { T.runningCmd = null; refreshTermLabel(T); }
    } else if (code === 0x7f || code === 0x08) {  // backspace
      T.lineBuf = T.lineBuf.slice(0, -1);
    } else if (code === 0x03 || code === 0x15) {  // Ctrl+C / Ctrl+U
      T.lineBuf = '';
      if (code === 0x03 && T.runningCmd) { T.runningCmd = null; refreshTermLabel(T); }
    } else if (code >= 0x20) {
      T.lineBuf += ch;
    }
  }
}

// Etiqueta a mostrar: proceso en ejecución si lo hay, si no el nombre base.
function tabLabel(T) { return T.runningCmd || T.baseName; }

// Actualiza el nombre de UNA pestaña sin reconstruir toda la barra (barato).
function refreshTermLabel(T) {
  const label = tabLabel(T);
  if (label === T._label) return;
  T._label = label;
  const span = T.tabEl && T.tabEl.querySelector('.term-tab-name');
  if (span) { span.textContent = label; T.tabEl.title = label; }
  else renderTermTabs();
}

// Reconstruye la barra de pestañas de terminales.
function renderTermTabs() {
  const list = el('term-tabs-list');
  if (!list) return;
  list.innerHTML = '';
  for (const T of terminals.values()) {
    const label = tabLabel(T);
    T._label = label;
    const tab = document.createElement('div');
    tab.className = 'term-tab' + (T.id === activeTermId ? ' active' : '');
    tab.title = label;
    tab.innerHTML =
      '<i class="codicon codicon-terminal"></i>' +
      '<span class="term-tab-name">' + escapeHtml(label) + '</span>' +
      '<i class="codicon codicon-close term-tab-close" title="Cerrar terminal"></i>';
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('term-tab-close')) { e.stopPropagation(); killTerminal(T.id); return; }
      setActiveTerminal(T.id);
    });
    T.tabEl = tab;
    list.appendChild(tab);
  }
}

// Muestra una terminal (oculta las demás) y le da el foco.
function setActiveTerminal(id) {
  if (!terminals.has(id)) return;
  activeTermId = id;
  for (const T of terminals.values()) T.container.hidden = (T.id !== id);
  renderTermTabs();
  const T = terminals.get(id);
  setTimeout(() => {
    try { T.fitAddon.fit(); window.api.termResize(T.term.cols, T.term.rows, T.sessionId); } catch {}
    T.term.focus();
  }, 0);
}

// Cierra una terminal (mata su PTY y libera recursos). Si era la última, crea una nueva.
function killTerminal(id) {
  const T = terminals.get(id);
  if (!T) return;
  try { window.api.termKill(T.sessionId); } catch {}
  try { if (T.dataOff) T.dataOff(); } catch {}
  try { if (T.exitOff) T.exitOff(); } catch {}
  try { if (T.resizeObs) T.resizeObs.disconnect(); } catch {}
  try { T.term.dispose(); } catch {}
  try { T.container.remove(); } catch {}
  terminals.delete(id);
  if (activeTermId === id) activeTermId = null;
  const rest = [...terminals.keys()];
  if (rest.length) setActiveTerminal(rest[rest.length - 1]);
  else createTerminal();   // siempre queda al menos una terminal
  renderTermTabs();
}

// Menú contextual de la terminal (Copiar / Pegar / Seleccionar todo) — para la
// instancia de xterm que se pasa como argumento.
function showTermMenu(x, y, term, doCopy, doPaste) {
  document.querySelectorAll('.term-menu').forEach((m) => m.remove());
  const menu = document.createElement('div');
  menu.className = 'term-menu';
  const hasSel = term && term.hasSelection();
  const items = [
    { label: 'Copiar', disabled: !hasSel, act: () => doCopy() },
    { label: 'Pegar', disabled: false, act: () => doPaste() },
    { label: 'Seleccionar todo', disabled: false, act: () => term.selectAll() },
  ];
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'term-menu-item' + (it.disabled ? ' disabled' : '');
    row.textContent = it.label;
    if (!it.disabled) row.onclick = () => { it.act(); menu.remove(); term.focus(); };
    menu.appendChild(row);
  }
  document.body.appendChild(menu);
  menu.style.left = Math.min(x, window.innerWidth - menu.offsetWidth - 6) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 6) + 'px';
  const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

function showTerminal() {
  if (terminals.size === 0) { createTerminal(); return; } // crea+activa la primera
  const T = activeTerminal() || terminals.get([...terminals.keys()][0]);
  setActiveTerminal(T.id);
}

function openTerminalPanel() {
  el('panel').hidden = false;
  el('resizer-panel').hidden = false;
  document.querySelectorAll('.panel-tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === 'terminal'));
  document.querySelectorAll('.panel-body').forEach((b) => b.hidden = b.dataset.panel !== 'terminal');
  showTerminal();
  persistPanelState();
}

// ¿Está la terminal visible? (panel abierto y pestaña Terminal activa)
function termPanelVisible() {
  return !el('panel').hidden &&
    document.querySelector('.panel-tab.active')?.dataset.panel === 'terminal';
}
function persistPanelState() {
  saveState({ terminalOpen: termPanelVisible() });
}

// --------------------------------------------------------------------------
// Extensiones (instalables) — habilitan funciones extra como Hydra Live.
// --------------------------------------------------------------------------
const EXTENSIONS = [
  {
    id: 'hydra-live', name: 'Live Server', author: 'Hydra IDE', icon: 'ext/live-server.svg',
    rating: 4.5, ratings: 312, version: '1.2.0', size: '52 KB',
    desc: 'Lanza un servidor de desarrollo local con recarga automática en cada guardado.',
    readme:
      '<h3>Live Server</h3>' +
      '<p>Un servidor de desarrollo local con <b>recarga en vivo</b> para páginas estáticas y dinámicas.</p>' +
      '<h4>Características</h4>' +
      '<ul><li>Botón <code>Go Live</code> en la barra de estado.</li>' +
      '<li>Recarga automática del navegador al guardar (HTML/CSS/JS).</li>' +
      '<li>Clic derecho en un <code>.html</code> → “Abrir con Live Server”.</li>' +
      '<li>Soporta subcarpetas y listado de directorios.</li></ul>' +
      '<h4>Uso</h4><p>Instalá la extensión, abrí una carpeta y pulsá <code>Go Live</code>. Tu navegador se abrirá en <code>localhost:5500</code>.</p>',
    features: [
      { icon: 'broadcast', title: 'Botón "Go Live"', desc: 'Agrega un botón en la barra de estado para iniciar y detener el servidor.' },
      { icon: 'sync', title: 'Recarga automática', desc: 'Recarga el navegador al guardar archivos HTML, CSS o JS.' },
      { icon: 'globe', title: 'Servidor local', desc: 'Sirve la carpeta abierta en localhost con listado de directorios.' },
      { icon: 'menu', title: 'Menú contextual', desc: 'Clic derecho en un .html → "Abrir con Live Server".' },
    ],
  },
  {
    id: 'hydra-format', name: 'Prettier', author: 'Hydra IDE', icon: 'ext/prettier.svg',
    rating: 4.5, ratings: 980, version: '3.8.4', size: '2.1 MB',
    desc: 'Formateador de código con opiniones: ordena tu código automáticamente.',
    readme:
      '<h3>Prettier</h3>' +
      '<p>El formateador de código <b>Prettier</b>, integrado en Hydra IDE. Reescribe tu código con un ' +
      'estilo consistente: sangrías, comillas, saltos de línea y más.</p>' +
      '<h4>Características</h4>' +
      '<ul><li><b>Formatear al guardar</b> (<code>Ctrl+S</code>) automáticamente.</li>' +
      '<li>Atajo <code>Shift+Alt+F</code> para formatear el documento.</li>' +
      '<li>Clic derecho → <code>Format Document</code>, o la paleta de comandos.</li>' +
      '<li>Soporta JavaScript, TypeScript, JSX/TSX, JSON, CSS/SCSS/LESS, HTML, Markdown y YAML.</li></ul>' +
      '<h4>Uso</h4><p>Instalá la extensión y formateá con <code>Shift+Alt+F</code> o simplemente ' +
      'guardando el archivo.</p>',
    features: [
      { icon: 'save', title: 'Formatear al guardar', desc: 'Ordena el código automáticamente cada vez que guardás (Ctrl+S).' },
      { icon: 'symbol-color', title: 'Atajo Shift+Alt+F', desc: 'Formatea el documento activo al instante.' },
      { icon: 'list-unordered', title: 'Menú y paleta', desc: 'Clic derecho → "Format Document", o "Prettier: Formatear documento".' },
      { icon: 'code', title: 'Múltiples lenguajes', desc: 'JS, TS, JSX/TSX, JSON, CSS/SCSS/LESS, HTML, Markdown y YAML.' },
    ],
  },
  {
    id: 'hydra-git', name: 'Git Graph', author: 'Hydra IDE', icon: 'ext/git-graph.svg',
    rating: 4.5, ratings: 540, version: '1.30.0', size: '2.0 MB',
    desc: 'Visualiza el grafo de commits y ramas de tu repositorio Git.',
    readme:
      '<h3>Git Graph</h3>' +
      '<p>Visualizá el <b>árbol de ramas y commits</b> de tu repositorio Git, directamente dentro de Hydra IDE.</p>' +
      '<h4>Características</h4>' +
      '<ul><li>Botón <code>Git Graph</code> en la barra de estado.</li>' +
      '<li>Grafo con <b>lanes de colores</b> para cada rama y sus uniones (merges).</li>' +
      '<li>Etiquetas de ramas, tags y <code>HEAD</code> sobre cada commit.</li>' +
      '<li>Autor, fecha, mensaje y hash corto de cada commit.</li>' +
      '<li>Botón para <b>actualizar</b> e inicializar un repo si la carpeta no es Git.</li></ul>' +
      '<h4>Uso</h4><p>Instalá la extensión, abrí una carpeta con un repositorio Git y pulsá ' +
      '<code>Git Graph</code> en la barra de estado.</p>',
    features: [
      { icon: 'git-commit', title: 'Botón en la barra de estado', desc: 'Abre el grafo de commits con un clic.' },
      { icon: 'git-merge', title: 'Grafo con ramas', desc: 'Dibuja cada rama y sus uniones (merges) con carriles de colores.' },
      { icon: 'tag', title: 'Etiquetas y HEAD', desc: 'Muestra ramas, tags y la posición de HEAD sobre cada commit.' },
      { icon: 'history', title: 'Detalle de commits', desc: 'Autor, fecha, mensaje y hash corto de cada commit.' },
    ],
  },
  {
    id: 'hydra-python', name: 'Python', author: 'Hydra IDE', icon: 'ext/python.svg',
    rating: 5, ratings: 1240, version: '2024.1.0', size: '3.4 MB',
    desc: 'Soporte de Python: intérpretes, ejecutar, REPL e instalación de paquetes.',
    readme:
      '<h3>Python</h3>' +
      '<p>Soporte completo de <b>Python</b> en Hydra IDE, con su propia vista en la barra lateral ' +
      '(estilo VS Code).</p>' +
      '<h4>Características</h4>' +
      '<ul><li><b>Vista de Python</b> en la barra de actividad izquierda.</li>' +
      '<li><b>Selección de intérprete</b>: detecta los Python instalados y muestra la versión en la barra de estado.</li>' +
      '<li><b>Ejecutar archivo</b> Python en la terminal integrada con un clic.</li>' +
      '<li><b>REPL interactivo</b> de Python.</li>' +
      '<li><b>Instalar paquetes</b> con pip desde la UI.</li>' +
      '<li>Resaltado de sintaxis y autocompletado básico para <code>.py</code>.</li></ul>' +
      '<h4>Uso</h4><p>Instalá la extensión, pulsá el icono de Python en la barra lateral y elegí tu ' +
      'intérprete. Luego ejecutá cualquier archivo <code>.py</code>.</p>',
    features: [
      { icon: 'symbol-misc', title: 'Vista de Python', desc: 'Un icono propio en la barra de actividad izquierda, como en VS Code.' },
      { icon: 'versions', title: 'Selección de intérprete', desc: 'Detecta los Python instalados y muestra la versión en la barra de estado.' },
      { icon: 'play', title: 'Ejecutar archivo', desc: 'Corre el archivo .py activo con el intérprete elegido.' },
      { icon: 'terminal', title: 'REPL de Python', desc: 'Abre un intérprete interactivo en la terminal.' },
      { icon: 'package', title: 'Instalar paquetes (pip)', desc: 'Instalá dependencias con pip desde la interfaz.' },
    ],
  },
  {
    id: 'hydra-assist', name: 'Hydra Assist', author: 'Hydra IDE', icon: 'ext/copilot.svg',
    rating: 5, ratings: 2380, version: '1.0.0', size: '120 KB',
    desc: 'Autocompletado con IA: sugerencias de código en línea mientras escribís.',
    readme:
      '<h3>Hydra Assist</h3>' +
      '<p>Autocompletado de código con <b>inteligencia artificial</b> integrado en el editor. ' +
      'Mientras escribís, sugiere la continuación como <b>texto fantasma</b>; aceptala con <code>Tab</code>.</p>' +
      '<h4>Características</h4>' +
      '<ul><li>Sugerencias en línea según el contexto del archivo.</li>' +
      '<li>Funciona en cualquier lenguaje del editor.</li>' +
      '<li>Aceptá con <code>Tab</code>, descartá con <code>Esc</code>.</li>' +
      '<li>Indicador en la barra de estado; clic para pausar o reanudar.</li></ul>' +
      '<p style="color:var(--text-dim)"><small>Funciona con el motor de IA propio de Hydra.</small></p>',
    features: [
      { icon: 'sparkle', title: 'Sugerencias con IA', desc: 'Completa el código en línea según el contexto del archivo.' },
      { icon: 'whole-word', title: 'Texto fantasma', desc: 'Mostrá la sugerencia y aceptala con Tab, descartá con Esc.' },
      { icon: 'code', title: 'Cualquier lenguaje', desc: 'Funciona en todos los lenguajes que abre el editor.' },
      { icon: 'debug-pause', title: 'Pausar / reanudar', desc: 'Indicador en la barra de estado con un clic para pausar.' },
    ],
  },
  {
    id: 'hydra-team', name: 'Hydra Team', author: 'Hydra IDE', icon: 'ext/team.svg',
    rating: 5, ratings: 870, version: '1.0.0', size: '180 KB',
    desc: 'Programá en equipo: compartí una carpeta y editen juntos en tiempo real.',
    readme:
      '<h3>Hydra Team</h3>' +
      '<p>Programación <b>en equipo en vivo</b>. El dueño comparte una carpeta y los invitados la ' +
      'editan en tiempo real desde su propio Hydra IDE.</p>' +
      '<h4>Características</h4>' +
      '<ul><li>Botón propio en la barra lateral izquierda.</li>' +
      '<li>Mostrá las personas que tienen la extensión y están en línea para <b>invitarlas</b>.</li>' +
      '<li>Creá un <b>grupo</b> sobre la carpeta abierta, o unite con un <b>código</b>.</li>' +
      '<li>La carpeta compartida aparece en el IDE de cada miembro y se <b>sincroniza</b> al guardar.</li>' +
      '<li>Crear/editar/borrar archivos y carpetas dentro de la carpeta compartida.</li></ul>' +
      '<p style="color:var(--text-dim)"><small>Necesitás iniciar sesión. Solo quienes tengan esta ' +
      'extensión y estén en el grupo pueden colaborar. Sincronización a nivel de archivo.</small></p>',
    features: [
      { icon: 'live-share', title: 'Sesión en equipo', desc: 'Compartí una carpeta y editen juntos en tiempo real.' },
      { icon: 'organization', title: 'Invitar personas', desc: 'Vé quién tiene la extensión en línea e invitalos al grupo.' },
      { icon: 'folder-active', title: 'Carpeta compartida', desc: 'La carpeta del dueño aparece en el IDE de cada miembro.' },
      { icon: 'sync', title: 'Sincronización en vivo', desc: 'Los cambios de archivos se sincronizan entre todos.' },
      { icon: 'key', title: 'Unirse con código', desc: 'Entrá a un grupo con su código o desde una invitación.' },
    ],
  },
  {
    id: 'hydra-themes', name: 'Color Themes', author: 'Hydra IDE', icon: 'ext/themes.svg',
    rating: 5, ratings: 1530, version: '1.0.0', size: '60 KB',
    desc: 'Cambiá el aspecto del IDE: varios temas de color para la interfaz y el editor.',
    readme:
      '<h3>Color Themes</h3>' +
      '<p>Una colección de <b>temas de color</b> para Hydra IDE. Cambiá toda la interfaz y el ' +
      'editor al instante, sin reiniciar.</p>' +
      '<h4>Características</h4>' +
      '<ul><li>Botón <code>Temas</code> en la barra de estado.</li>' +
      '<li>Galería de temas con <b>vista previa</b> en vivo.</li>' +
      '<li>Cambia colores de la UI <b>y</b> del editor Monaco a la vez.</li>' +
      '<li>Incluye temas oscuros y claros (Hydra Dark, Midnight, Monokai, Dracula, Solarized, Light).</li>' +
      '<li>Recuerda tu tema elegido entre sesiones.</li></ul>' +
      '<h4>Uso</h4><p>Instalá la extensión y pulsá <code>Temas</code> en la barra de estado para ' +
      'elegir un tema.</p>',
    features: [
      { icon: 'symbol-color', title: 'Botón "Temas"', desc: 'Abre la galería de temas desde la barra de estado.' },
      { icon: 'eye', title: 'Vista previa en vivo', desc: 'El tema se aplica al instante al elegirlo.' },
      { icon: 'paintcan', title: 'UI + editor', desc: 'Cambia los colores de toda la interfaz y del editor a la vez.' },
      { icon: 'color-mode', title: 'Oscuros y claros', desc: 'Hydra Dark, Midnight, Monokai, Dracula, Solarized y Light.' },
      { icon: 'save', title: 'Recuerda tu elección', desc: 'Guarda el tema seleccionado entre sesiones.' },
    ],
  },
  {
    id: 'hydra-ai-chat', name: 'Hydra AI Chat', author: 'Hydra IDE', icon: 'ext/copilot.svg',
    rating: 5, ratings: 3210, version: '1.0.0', size: '70 KB',
    desc: 'El chat de IA de Hydra: asistente para tu código, en un panel a la derecha.',
    readme:
      '<h3>Hydra AI Chat</h3>' +
      '<p>Habilita el <b>chat de Hydra AI</b>: un asistente con IA dentro del IDE. Sin esta ' +
      'extensión, el chat no está disponible.</p>' +
      '<h4>Características</h4>' +
      '<ul><li>Botón de chat en la barra de título.</li>' +
      '<li>Respuestas en streaming, formato Markdown y bloques de código.</li>' +
      '<li>Adjuntar imágenes y pedir acciones sobre tu proyecto.</li>' +
      '<li>Base para <b>Claude Code</b> (instalá esa extensión para el agente).</li></ul>',
    features: [
      { icon: 'comment-discussion', title: 'Chat de IA', desc: 'Asistente con IA en un panel a la derecha.' },
      { icon: 'sync', title: 'Respuestas en streaming', desc: 'El texto aparece en vivo, con Markdown.' },
      { icon: 'file-media', title: 'Adjuntar imágenes', desc: 'Mandá capturas o imágenes al chat.' },
      { icon: 'sparkle', title: 'Habilita Claude Code', desc: 'Requisito para usar el agente Claude Code.' },
    ],
  },
  {
    id: 'hydra-claude', name: 'Claude Code', author: 'Hydra IDE', icon: 'ext/claude-code.svg',
    rating: 5, ratings: 4120, version: '1.0.0', size: '90 KB',
    desc: 'Agente de programación dentro de Hydra AI: chat tipo VS Code que edita tu código con permisos.',
    readme:
      '<h3>Claude Code</h3>' +
      '<p>Activa <b>Claude Code</b> dentro del chat de <b>Hydra AI</b>. Aparece un botón ' +
      '"Claude Code" al lado del selector de agentes; al pulsarlo, el chat pasa a un agente que ' +
      '<b>lee y edita tu código</b>, corre comandos y trabaja sobre la carpeta abierta.</p>' +
      '<h4>Características</h4>' +
      '<ul><li>Botón "Claude Code" junto al selector de Hydra AI.</li>' +
      '<li>Chat con respuestas en streaming y bloques de razonamiento.</li>' +
      '<li>Permisos <b>Permitir / Denegar</b> por acción, con diffs por archivo.</li>' +
      '<li>Selector de modelo y de modo de permisos.</li>' +
      '<li>Comandos <code>/</code> y menciones <code>@archivo</code>, lista de tareas.</li></ul>' +
      '<p style="color:var(--text-dim)"><small>Necesita una sesión de Claude Code (suscripción ' +
      'o API key). El inicio de sesión se hace una sola vez.</small></p>',
    features: [
      { icon: 'edit', title: 'Edita tu código', desc: 'Lee, crea y modifica archivos del proyecto.' },
      { icon: 'shield', title: 'Permisos por acción', desc: 'Permitir/Denegar cada edición o comando.' },
      { icon: 'diff', title: 'Diffs por archivo', desc: 'Ves el cambio antes de aplicarlo y podés abrirlo.' },
      { icon: 'list-tree', title: 'Modelos y modos', desc: 'Elegí modelo y modo de permisos.' },
      { icon: 'mention', title: 'Comandos y @archivos', desc: 'Autocompletado de / y menciones de archivos.' },
    ],
  },
  {
    id: 'hydra-3d', name: 'Hydra 3D', author: 'Hydra IDE', icon: 'ext/threed.svg',
    rating: 5, ratings: 640, version: '1.0.0', size: '690 KB',
    desc: 'Playground 3D con Three.js: escribí código y mirá la escena 3D en vivo (modelos, luces, juegos…).',
    readme:
      '<h3>Hydra 3D</h3>' +
      '<p>Un <b>playground 3D</b> con <b>Three.js</b> integrado. Escribí código y vé la escena ' +
      'renderizada al instante: mallas, materiales, luces, cámara, animación y lógica de juego.</p>' +
      '<h4>Características</h4>' +
      '<ul><li>Botón <code>3D</code> en la barra de estado.</li>' +
      '<li>Editor de código + canvas WebGL en vivo, con consola de errores.</li>' +
      '<li>Bucle de animación y ejemplos para empezar (cubo, luces, juego básico).</li>' +
      '<li>Acceso completo a la API de Three.js (todo tipo de 3D, incluso juegos).</li></ul>',
    features: [
      { icon: 'globe', title: 'Escena 3D en vivo', desc: 'Renderiza con Three.js mientras escribís.' },
      { icon: 'play', title: 'Ejecutar', desc: 'Corré tu código 3D y vé el resultado al toque.' },
      { icon: 'game', title: 'Juegos 3D', desc: 'Bucle de animación + input para lógica de juego.' },
      { icon: 'output', title: 'Consola', desc: 'Errores y logs del playground.' },
    ],
  },
  {
    id: 'hydra-clock', name: 'Reloj', author: 'Hydra IDE', icon: 'ext/clock.svg',
    rating: 5, ratings: 410, version: '1.0.0', size: '4 KB',
    desc: 'Muestra la hora actual en la barra de estado.',
    readme: '<h3>Reloj</h3><p>Un reloj en la barra de estado con la hora actual (se actualiza cada segundo).</p>',
    features: [ { icon: 'watch', title: 'Hora en vivo', desc: 'La hora actual, siempre visible en la barra de estado.' } ],
  },
  {
    id: 'hydra-wordcount', name: 'Contador de palabras', author: 'Hydra IDE', icon: 'ext/wordcount.svg',
    rating: 5, ratings: 360, version: '1.0.0', size: '4 KB',
    desc: 'Cuenta palabras y caracteres del archivo abierto, en la barra de estado.',
    readme: '<h3>Contador de palabras</h3><p>Muestra cuántas <b>palabras</b> y <b>caracteres</b> tiene el archivo de texto activo. Se actualiza al escribir.</p>',
    features: [
      { icon: 'symbol-text', title: 'Palabras y caracteres', desc: 'Conteo en vivo del archivo activo.' },
      { icon: 'list-selection', title: 'Selección', desc: 'Si seleccionás texto, cuenta la selección.' },
    ],
  },
  {
    id: 'hydra-zen', name: 'Modo Zen', author: 'Hydra IDE', icon: 'ext/zen.svg',
    rating: 5, ratings: 720, version: '1.0.0', size: '5 KB',
    desc: 'Modo enfoque: oculta barras y paneles para escribir sin distracciones.',
    readme: '<h3>Modo Zen</h3><p>Oculta la barra de actividad, el explorador, los paneles y deja solo el editor. Tocá <b>Zen</b> en la barra de estado o <code>Esc</code> para salir.</p>',
    features: [
      { icon: 'screen-full', title: 'Sin distracciones', desc: 'Solo el editor: oculta barras y paneles.' },
      { icon: 'symbol-event', title: 'Entrar/salir', desc: 'Botón "Zen" en la barra de estado o tecla Esc.' },
    ],
  },
  {
    id: 'hydra-power', name: 'Power Mode', author: 'Hydra IDE', icon: 'ext/power.svg',
    rating: 5, ratings: 1290, version: '1.0.0', size: '6 KB',
    desc: 'Efectos al escribir: partículas de colores y un toque de "shake" en el editor.',
    readme: '<h3>Power Mode</h3><p>Hace que escribir sea más divertido: cada tecla suelta <b>partículas de colores</b> en el cursor y un leve temblor. Activá/desactivá con el botón <b>Power</b>.</p>',
    features: [
      { icon: 'zap', title: 'Partículas', desc: 'Chispas de colores en el cursor al escribir.' },
      { icon: 'screen-full', title: 'Shake', desc: 'Un leve temblor del editor para dar energía.' },
    ],
  },
];

// En el navegador, las extensiones de IA (Hydra AI Chat, Claude Code, Lumin AI)
// no aplican: dependen del proceso nativo (claves de IA, Agent SDK). Las sacamos
// del catálogo para que ni siquiera aparezcan en la vista de Extensiones.
const WEB_HIDDEN_EXT = new Set(['hydra-ai-chat', 'hydra-claude', 'lumin-ai-chat']);
if (typeof window !== 'undefined' && window.__HYDRA_WEB__) {
  for (let i = EXTENSIONS.length - 1; i >= 0; i--) {
    if (WEB_HIDDEN_EXT.has(EXTENSIONS[i].id)) EXTENSIONS.splice(i, 1);
  }
}

let installedExt = new Set();
let disabledExt = new Set(); // instaladas pero apagadas (no corren / sin efecto)
let extBusy = {}; // id -> 'install' | 'uninstall' (durante la animación)

// ¿Está activa? = instalada y NO deshabilitada.
function extActive(id) { return installedExt.has(id) && !disabledExt.has(id); }

// Extensiones de la COMUNIDAD (servidor Supabase #2). Se cargan dinámicamente.
let communityExts = [];          // objetos normalizados al formato de EXTENSIONS
let extLoaded = false;           // ya intentamos cargar de Supabase
const extSaveHooks = new Set();   // callbacks onSave registrados por extensiones
const extChangeHooks = new Set(); // callbacks onEditorChange (cb._ext = id)
const extOpenHooks = new Set();   // callbacks onOpenFile (cb._ext = id)
const extCompletions = [];        // { provider, _ext } — proveedores de autocompletado
const extStatusItems = {};        // id -> [elementos de barra de estado creados]
const extWebTabs = {};            // id -> [keys de pestañas webview abiertas]

const DEFAULT_EXT_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">' +
  '<rect x="2" y="2" width="20" height="20" rx="5" fill="#2a2c38"/>' +
  '<path d="M8 8h4a4 4 0 0 1 0 8H8V8z" fill="#7c6bff"/></svg>');

// Insignia de "verificado" (sello con tilde) — diseño propio. Se muestra junto
// al autor de las extensiones OFICIALES (publicadas por Hydra IDE).
const VERIFIED_BADGE =
  '<svg class="ext-verified" viewBox="0 0 24 24" aria-label="Verificado" role="img">' +
    '<g fill="#3b82f6">' +
      '<rect x="5" y="5" width="14" height="14" rx="4.5"/>' +
      '<rect x="5" y="5" width="14" height="14" rx="4.5" transform="rotate(45 12 12)"/>' +
    '</g>' +
    '<path d="M8.4 12.3 l2.4 2.4 l4.8-5.1" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

// ¿Es una extensión oficial de Hydra IDE? (no de la comunidad / marketplace)
function isOfficialExt(ext) { return !!(ext && !ext.community && !ext.marketplace); }

// Solo esta cuenta puede PUBLICAR extensiones al marketplace de la comunidad.
const OFFICIAL_PUBLISHER_EMAIL = 'hydrasoftwareoficial@gmail.com';
function canPublishExt() {
  const u = (window.HydraAuth && HydraAuth.getUser) ? HydraAuth.getUser() : null;
  return !!(u && String(u.email || '').toLowerCase() === OFFICIAL_PUBLISHER_EMAIL);
}

// Convierte una fila de Supabase al formato que usa la UI de extensiones.
function normalizeCommunityExt(row) {
  return {
    id: row.ext_id,
    name: row.name || 'Sin nombre',
    author: row.author_username || 'comunidad',
    authorEmail: row.author_email || '',
    icon: row.icon_url || DEFAULT_EXT_ICON,
    rating: row.rating || 5,
    ratings: row.installs || 0,
    version: row.version || '1.0.0',
    size: '—',
    desc: row.description || '',
    readme: row.readme || '',
    code: row.code || '',
    category: row.category || 'Otros',
    community: true,
  };
}

// Devuelve TODAS las extensiones visibles (oficiales + comunidad).
function allExtensions() { return EXTENSIONS.concat(communityExts); }
function getExtById(id) { return allExtensions().find((e) => e.id === id) || null; }

// Carga las extensiones de la comunidad desde Supabase #2 y corre las instaladas.
let extLoading = false;
async function loadCommunityExtensions() {
  if (extLoading) return;
  if (!window.HydraAuth || !HydraAuth.ext || !HydraAuth.ext.ready()) return; // reintentará luego
  extLoading = true;
  try {
    const rows = await HydraAuth.ext.list();
    communityExts = (rows || []).map(normalizeCommunityExt);
  } catch (e) { console.warn('[ext] load:', e && e.message); }
  extLoaded = true;
  extLoading = false;
  // Ejecutar las extensiones de comunidad instaladas y NO deshabilitadas.
  for (const ext of communityExts) {
    if (extActive(ext.id)) runExtension(ext);
  }
  if (currentView === 'ext') renderExtensions();
}

// --------------------------------------------------------------------------
// Runtime de extensiones: la API `hydra` que reciben las extensiones de la
// comunidad. Su `code` se ejecuta al instalarse / al abrir la app.
// ⚠️ Ejecuta código JS de terceros: solo instalá extensiones en las que confíes.
// --------------------------------------------------------------------------
function makeHydraApi(ext) {
  return {
    name: ext.name,
    version: '1.0',
    // Muestra una notificación tipo toast.
    notify(msg) { showToast(ext, String(msg), 'check', '#7c6bff'); },
    // Registra en la consola del desarrollador.
    log() { console.log('[ext:' + ext.id + ']', ...arguments); },
    // Carpeta abierta actualmente (o cadena vacía).
    getRootDir() { return rootDir || ''; },
    // Ruta del archivo activo.
    getActiveFile() { return activeTab || ''; },
    // ⚠️ `run()` ejecutaba comandos del sistema en SILENCIO desde una extensión de
    // terceros (RCE). Queda deshabilitado: si una extensión necesita correr algo,
    // que use runInTerminal (lo ve el usuario en la terminal integrada).
    run() {
      showToast(ext, 'Esta extensión intentó ejecutar un comando oculto (bloqueado por seguridad).', 'error', '#ff7a8a');
      return Promise.resolve({ error: 'hydra.run() está deshabilitado por seguridad. Usá hydra.runInTerminal().' });
    },
    // Ejecuta un comando en la TERMINAL integrada activa (VISIBLE para el usuario).
    runInTerminal(cmd) {
      try {
        const wasStarted = activeTermStarted();
        openTerminalPanel();
        const send = () => { try { window.api.termInput(String(cmd) + '\r', activeTermSession()); } catch (e) {} };
        setTimeout(send, wasStarted ? 120 : 700); // esperar a que arranque el shell la 1ª vez
      } catch (e) {}
    },
    // Abre una URL en el navegador del sistema (validada en el main, sin shell).
    openUrl(url) { try { window.api.openExternal(String(url)); } catch (e) {} },
    // Añade un ítem a la barra de estado. Devuelve el elemento creado.
    addStatusItem(text, onClick) {
      const item = document.createElement('span');
      item.className = 'status-item ext-status-item';
      item.textContent = text;
      item.title = ext.name;
      if (typeof onClick === 'function') item.addEventListener('click', () => { try { onClick(); } catch (e) { console.error(e); } });
      const bar = document.querySelector('.status-left');
      if (bar) bar.appendChild(item);
      (extStatusItems[ext.id] = extStatusItems[ext.id] || []).push(item);
      return item;
    },
    // Inserta texto en el editor activo, en el cursor (sobre Monaco).
    insertText(text) {
      if (!monacoEditor || !monacoEditor.getModel()) return;
      const sel = monacoEditor.getSelection();
      monacoEditor.executeEdits('ext', [{ range: sel, text: String(text), forceMoveMarkers: true }]);
      monacoEditor.focus();
    },

    // ----- EDITOR: leer y transformar el código del archivo abierto ----------
    editor: {
      // Texto completo del archivo activo.
      getText() { return (monacoEditor && monacoEditor.getModel()) ? monacoEditor.getValue() : ''; },
      // Reemplaza TODO el contenido del archivo activo.
      setText(text) {
        if (monacoEditor && monacoEditor.getModel()) monacoEditor.setValue(String(text));
      },
      // Texto seleccionado actualmente.
      getSelection() {
        if (!monacoEditor || !monacoEditor.getModel()) return '';
        return monacoEditor.getModel().getValueInRange(monacoEditor.getSelection());
      },
      // Reemplaza la selección por otro texto.
      replaceSelection(text) {
        if (!monacoEditor || !monacoEditor.getModel()) return;
        monacoEditor.executeEdits('ext', [{ range: monacoEditor.getSelection(), text: String(text), forceMoveMarkers: true }]);
      },
      // Lenguaje detectado del archivo activo (ej. "JavaScript").
      getLanguage() { return (activeTab && tabs.get(activeTab)) ? (tabs.get(activeTab).lang || '') : ''; },
      // Ruta del archivo activo.
      getPath() { return activeTab || ''; },
    },

    // ----- EVENTOS -----------------------------------------------------------
    // Se ejecuta cada vez que se guarda un archivo (recibe la ruta).
    onSave(cb) { if (typeof cb === 'function') { cb._ext = ext.id; extSaveHooks.add(cb); } },
    // Se ejecuta cuando cambia el texto del editor (recibe el texto).
    onEditorChange(cb) { if (typeof cb === 'function') { cb._ext = ext.id; extChangeHooks.add(cb); } },
    // Se ejecuta cuando se abre / cambia el archivo activo (recibe la ruta).
    onOpenFile(cb) { if (typeof cb === 'function') { cb._ext = ext.id; extOpenHooks.add(cb); } },

    // ----- AUTOCOMPLETADO (IntelliSense) -------------------------------------
    // provider(ctx) recibe { word, linePrefix, language, path, text } y devuelve
    // un array de sugerencias: strings o { label, insert, detail, kind }.
    registerCompletionProvider(provider) {
      if (typeof provider !== 'function') return;
      extCompletions.push({ provider, _ext: ext.id });
    },

    // ----- COMANDOS: aparecen en la paleta (Ctrl+Shift+P) --------------------
    registerCommand(title, fn, icon) {
      if (typeof fn !== 'function') return;
      const def = {
        label: String(title), icon: icon || 'extensions', _ext: ext.id,
        cmd: () => { try { fn(); } catch (e) { console.error('[ext:' + ext.id + ']', e); } },
      };
      commandDefs.push(def);
      return def;
    },

    // ----- PANEL PROPIO: abre una pestaña con tu UI (HTML/CSS/JS aislado) -----
    openPanel(title, html) {
      const key = 'web:' + ext.id + ':' + (title || 'panel');
      const exists = tabs.get(key);
      if (exists) { exists.html = String(html || ''); }
      else {
        tabs.set(key, { kind: 'webview', name: title || ext.name, html: String(html || ''), extId: ext.id });
        openFiles.push(key);
        (extWebTabs[ext.id] = extWebTabs[ext.id] || []).push(key);
      }
      setActiveTab(key);
      renderTabs();
      return key;
    },
    // Refresca el contenido de un panel ya abierto SIN robar el foco
    // (si está visible se re-renderiza; si no, queda listo para cuando lo abras).
    updatePanel(title, html) {
      const key = 'web:' + ext.id + ':' + (title || 'panel');
      const t = tabs.get(key);
      if (!t) return false;
      t.html = String(html || '');
      if (activeTab === key) setActiveTab(key);
      return true;
    },
    // ¿Está abierto un panel con ese título?
    hasPanel(title) { return tabs.has('web:' + ext.id + ':' + (title || 'panel')); },
  };
}

// Ejecuta el código de una extensión de la comunidad de forma aislada.
function runExtension(ext) {
  if (!ext || !ext.community || !ext.code) return;
  teardownExtension(ext.id); // limpiar lo anterior → evita botones/hooks DUPLICADOS
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('hydra', '"use strict";\n' + ext.code);
    fn(makeHydraApi(ext));
  } catch (e) {
    console.error('[ext:' + ext.id + '] error al ejecutar:', e);
    showToast(ext, 'Error en la extensión: ' + (e && e.message || e), 'error', '#ff7a8a');
  }
}

// Quita TODO lo que registró una extensión: botones, hooks, comandos y paneles.
function teardownExtension(id) {
  for (const item of (extStatusItems[id] || [])) { try { item.remove(); } catch (e) {} }
  delete extStatusItems[id];
  for (const cb of [...extSaveHooks]) { if (cb._ext === id) extSaveHooks.delete(cb); }
  for (const cb of [...extChangeHooks]) { if (cb._ext === id) extChangeHooks.delete(cb); }
  for (const cb of [...extOpenHooks]) { if (cb._ext === id) extOpenHooks.delete(cb); }
  // Quitar sus proveedores de autocompletado.
  for (let i = extCompletions.length - 1; i >= 0; i--) { if (extCompletions[i]._ext === id) extCompletions.splice(i, 1); }
  // Quitar sus comandos de la paleta.
  for (let i = commandDefs.length - 1; i >= 0; i--) { if (commandDefs[i]._ext === id) commandDefs.splice(i, 1); }
  // Cerrar sus paneles (pestañas webview).
  for (const key of (extWebTabs[id] || []).slice()) { try { closeTab(key); } catch (e) {} }
  delete extWebTabs[id];
}

// Aplica el efecto de las extensiones ACTIVAS (instaladas y no deshabilitadas).
function applyExtensions() {
  const live = extActive('hydra-live');
  el('status-live').hidden = !live;
  if (!live && liveRunning) { window.api.liveStop(); liveRunning = false; livePort = 0; renderLiveStatus(); }

  const git = extActive('hydra-git');
  const gitBtn = el('status-git');
  if (gitBtn) gitBtn.hidden = !git;
  // Si se deshabilita/desinstala con el grafo abierto, cerrá su pestaña.
  if (!git && tabs.has(GITGRAPH_KEY)) closeTab(GITGRAPH_KEY);

  applyPrettier();
  applyPython();
  applyCopilot();
  applyTeam();
  applyThemes();
  applyAiChat();
  applyClaudeCode();
  applyLumin();
  applyThreeD();
  applyClock();
  applyWordCount();
  applyZen();
  applyPower();
}


// Habilita o deshabilita una extensión instalada (sin desinstalarla).
function setExtDisabled(ext, off) {
  if (off) disabledExt.add(ext.id); else disabledExt.delete(ext.id);
  saveState({ disabledExtensions: [...disabledExt] });
  if (ext.community) {
    if (off) teardownExtension(ext.id);
    else if (installedExt.has(ext.id)) runExtension(ext);
  }
  applyExtensions();
  refreshExtUI(ext);
  showToast(ext, off ? 'Deshabilitada' : 'Habilitada', off ? 'circle-slash' : 'check', off ? '#e5a00d' : '#2ff0c4');
}

// Re-render de la UI de una extensión (lista lateral + pestaña de detalles).
function refreshExtUI(ext) {
  renderExtensions();
  if (activeTab === 'ext:' + ext.id) renderExtDetailsView(ext);
}

// Animación de "aparición" (pop) de un elemento.
function animateFeatureIn(elm) {
  if (!elm) return;
  elm.classList.remove('feature-in', 'feature-out');
  void elm.offsetWidth;
  elm.classList.add('feature-in');
}

// Animación de "salida" de un elemento; al terminar ejecuta done().
// Si el elemento no es visible (p.ej. oculto por CSS `display:none` en el IDE
// web: #status-live/#status-git/#status-python), la animación NO dispara
// `animationend`, así que ejecutamos done() de una para no colgar la
// desinstalación. Además dejamos un respaldo por timeout por si la animación
// no corre por cualquier otro motivo (reduce-motion, sin keyframes, etc.).
function animateFeatureOut(elm, done) {
  if (!elm || elm.hidden || !elm.offsetParent) { done && done(); return; }
  elm.classList.remove('feature-in');
  elm.classList.add('feature-out');
  let called = false;
  const end = () => {
    if (called) return; called = true;
    clearTimeout(fallback);
    elm.removeEventListener('animationend', end);
    elm.classList.remove('feature-out');
    done && done();
  };
  const fallback = setTimeout(end, 500); // respaldo: nunca dejar la desinstalación a medias
  elm.addEventListener('animationend', end);
}

// Toast (notificación) de extensión.
function showToast(ext, subtitle, icon, accent) {
  const host = el('toast-host');
  if (!host) return;
  const color = accent || '#2ff0c4';
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.borderLeftColor = color;
  t.innerHTML =
    `<img src="${ext.icon}" alt="" onerror="this.onerror=null;this.src='${DEFAULT_EXT_ICON}'">` +
    `<div class="t-body"><div class="t-title">${ext.name}</div>` +
    `<div class="t-sub"><i class="codicon codicon-${icon || 'check'}" style="color:${color}"></i>${subtitle}</div></div>`;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}

// Instala con animación: spinner + barra de progreso, luego instala de verdad.
function installExtAnimated(ext) {
  if (extBusy[ext.id] || installedExt.has(ext.id)) return;
  extBusy[ext.id] = 'install';
  refreshExtUI(ext);
  setTimeout(() => {
    delete extBusy[ext.id];
    setExtInstalled(ext.id, true);             // instala + aplica (muestra Go Live)
    refreshExtUI(ext);
    if (ext.id === 'hydra-live') animateFeatureIn(el('status-live')); // "pop" del botón
    if (ext.id === 'hydra-git') animateFeatureIn(el('status-git'));
    if (ext.id === 'hydra-python') { animateFeatureIn(el('act-python')); showView('python'); }
    if (ext.id === 'hydra-assist') animateFeatureIn(el('status-copilot'));
    if (ext.id === 'hydra-team') { animateFeatureIn(el('act-team')); showView('team'); }
    if (ext.id === 'hydra-themes') { animateFeatureIn(el('status-themes')); openThemePicker(); }
    if (ext.id === 'hydra-ai-chat') { animateFeatureIn(el('ai-toggle')); toggleAiPanel(true); }
    if (ext.id === 'hydra-claude') { animateFeatureIn(el('ai-tab-claude')); toggleClaude(true); }
    if (ext.id === 'hydra-3d') { animateFeatureIn(el('status-3d')); openThreeD(); }
    if (ext.id === 'hydra-clock') animateFeatureIn(el('status-clock'));
    if (ext.id === 'hydra-wordcount') animateFeatureIn(el('status-wordcount'));
    if (ext.id === 'hydra-zen') animateFeatureIn(el('status-zen'));
    if (ext.id === 'hydra-power') animateFeatureIn(el('status-power'));
    if (ext.community) { runExtension(ext); if (HydraAuth.ext) HydraAuth.ext.countInstall(ext.id); } // corre el código real
    showToast(ext, 'Instalada correctamente', 'check', '#2ff0c4');
  }, 1300);
}

// Desinstala con animación: spinner, el botón se va con animación, luego se quita.
function uninstallExtAnimated(ext) {
  if (extBusy[ext.id] || !installedExt.has(ext.id)) return;
  extBusy[ext.id] = 'uninstall';
  refreshExtUI(ext);
  setTimeout(() => {
    delete extBusy[ext.id];
    const finish = () => {
      if (ext.community) teardownExtension(ext.id);
      setExtInstalled(ext.id, false); refreshExtUI(ext);
      showToast(ext, ext.community ? 'Desinstalada (puede requerir reiniciar)' : 'Desinstalada', 'trash', '#ff7a8a');
    };
    if (ext.id === 'hydra-live') animateFeatureOut(el('status-live'), finish);
    else if (ext.id === 'hydra-git') animateFeatureOut(el('status-git'), finish);
    else if (ext.id === 'hydra-python') animateFeatureOut(el('act-python'), finish);
    else if (ext.id === 'hydra-assist') animateFeatureOut(el('status-copilot'), finish);
    else if (ext.id === 'hydra-team') animateFeatureOut(el('act-team'), finish);
    else if (ext.id === 'hydra-themes') animateFeatureOut(el('status-themes'), () => { resetColorTheme(); finish(); });
    else if (ext.id === 'hydra-claude') animateFeatureOut(el('ai-tab-claude'), () => { if (claudeActive) toggleClaude(false); finish(); });
    else if (ext.id === 'hydra-ai-chat') animateFeatureOut(el('ai-toggle'), () => { if (claudeActive) toggleClaude(false); if (!el('ai-panel').hidden) toggleAiPanel(false); finish(); });
    else if (ext.id === 'hydra-3d') animateFeatureOut(el('status-3d'), () => { threedStop(); if (tabs.has(THREED_KEY)) closeTab(THREED_KEY); finish(); });
    else if (ext.id === 'hydra-clock') animateFeatureOut(el('status-clock'), () => { applyClock(); finish(); });
    else if (ext.id === 'hydra-wordcount') animateFeatureOut(el('status-wordcount'), finish);
    else if (ext.id === 'hydra-zen') animateFeatureOut(el('status-zen'), () => { toggleZen(false); finish(); });
    else if (ext.id === 'hydra-power') animateFeatureOut(el('status-power'), () => { powerOn = false; finish(); });
    else finish();
  }, 1000);
}

function setExtInstalled(id, on) {
  if (on) installedExt.add(id);
  else { installedExt.delete(id); disabledExt.delete(id); } // al desinstalar, deja de estar deshabilitada
  saveState({ installedExtensions: [...installedExt], disabledExtensions: [...disabledExt] });
  applyExtensions();
  renderExtensions();
}

function starStr(r) {
  const full = Math.round(r || 0);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

function renderExtensions() {
  const list = el('ext-list');
  if (!list) return;
  list.innerHTML = '';

  // Cabecera: publicar una extensión propia (solo la cuenta oficial de Hydra).
  if (canPublishExt()) {
    const head = document.createElement('div');
    head.className = 'ext-head';
    const pub = document.createElement('button');
    pub.className = 'ext-publish-btn';
    pub.innerHTML = '<i class="codicon codicon-cloud-upload"></i> Publicar extensión';
    pub.onclick = openPublishModal;
    head.appendChild(pub);
    list.appendChild(head);
  }

  // Cargar comunidad la primera vez que se abre la vista.
  if (!extLoaded) { loadCommunityExtensions(); }

  const all = EXTENSIONS.concat(communityExts);
  const installed = all.filter((e) => installedExt.has(e.id));
  const available = all.filter((e) => !installedExt.has(e.id));
  const sections = [
    { title: 'Extensiones Instaladas', items: installed, empty: 'Todavía no instalaste ninguna extensión.' },
    { title: 'Extensiones', items: available, empty: extLoaded ? 'No hay más extensiones disponibles.' : 'Cargando…' },
  ];
  for (const sec of sections) {
    const lbl = document.createElement('div'); lbl.className = 'ext-section';
    lbl.textContent = sec.title + (sec.items.length ? ' (' + sec.items.length + ')' : '');
    list.appendChild(lbl);
    if (!sec.items.length) {
      const empty = document.createElement('div'); empty.className = 'ext-empty';
      empty.textContent = sec.empty; list.appendChild(empty);
      continue;
    }
    for (const ext of sec.items) renderExtCard(ext, list);
  }
}

function renderExtCard(ext, list) {
  {
    const installed = installedExt.has(ext.id);
    const card = document.createElement('div');
    card.className = 'ext-card';

    const ic = document.createElement('img'); ic.className = 'ext-icon'; ic.src = ext.icon; ic.alt = ext.name;
    ic.onerror = () => { ic.onerror = null; ic.src = DEFAULT_EXT_ICON; };

    const body = document.createElement('div'); body.className = 'ext-body';
    const nm = document.createElement('div'); nm.className = 'ext-name'; nm.textContent = ext.name;
    const au = document.createElement('span'); au.className = 'ext-author';
    au.innerHTML = (isOfficialExt(ext) ? VERIFIED_BADGE : '') + escapeHtml(ext.author);
    nm.appendChild(au);
    if (installed) {
      const b = document.createElement('span');
      const off = disabledExt.has(ext.id);
      b.className = 'ext-badge' + (off ? ' off' : '');
      b.textContent = off ? '● Deshabilitada' : '● Instalada';
      nm.appendChild(b);
    }
    const ds = document.createElement('div'); ds.className = 'ext-desc'; ds.textContent = ext.desc;

    const busy = extBusy[ext.id];
    const btn = document.createElement('button');
    if (ext.soon) { btn.className = 'ext-btn soon'; btn.textContent = 'Próximamente'; btn.disabled = true; }
    else if (busy === 'install') { btn.className = 'ext-btn'; btn.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i>Instalando…'; btn.disabled = true; }
    else if (busy === 'uninstall') { btn.className = 'ext-btn installed'; btn.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i>Desinstalando…'; btn.disabled = true; }
    else if (installed) { btn.className = 'ext-btn installed'; btn.textContent = 'Desinstalar'; }
    else { btn.className = 'ext-btn'; btn.textContent = 'Instalar'; }
    btn.onclick = (e) => {
      e.stopPropagation();
      if (ext.soon || busy) return;
      if (installed) uninstallExtAnimated(ext);
      else installExtAnimated(ext);
    };

    body.append(nm, ds, btn);
    card.append(ic, body);
    card.addEventListener('click', () => openExtTab(ext)); // abrir como pestaña
    list.appendChild(card);
  }
}

// Abre la extensión como una pestaña más (igual que un archivo).
function openExtTab(ext) {
  const key = 'ext:' + ext.id;
  if (!tabs.has(key)) { tabs.set(key, { kind: 'extension', ext, name: ext.name }); openFiles.push(key); }
  setActiveTab(key);
  renderTabs();
}

// Construye el HTML de la pestaña CARACTERÍSTICAS de una extensión.
function renderExtFeatures(ext) {
  let feats = Array.isArray(ext.features) ? ext.features.slice() : [];

  // Para extensiones de la comunidad: derivar las características de lo que la
  // extensión registró realmente en la app (comandos, barra de estado, hooks).
  if (ext.community) {
    const cmds = commandDefs.filter((c) => c._ext === ext.id);
    for (const c of cmds) feats.push({ icon: c.icon || 'symbol-event', title: 'Comando: ' + c.label, desc: 'Disponible en la paleta de comandos (Ctrl+Shift+P).' });
    const statusN = (extStatusItems[ext.id] || []).length;
    if (statusN) feats.push({ icon: 'layout-statusbar', title: statusN + ' elemento(s) en la barra de estado', desc: 'Agregados por la extensión.' });
    const hooks = [];
    for (const cb of extSaveHooks) if (cb._ext === ext.id) hooks.push('al guardar');
    for (const cb of extChangeHooks) if (cb._ext === ext.id) hooks.push('al editar');
    for (const cb of extOpenHooks) if (cb._ext === ext.id) hooks.push('al abrir archivos');
    if (hooks.length) feats.push({ icon: 'pulse', title: 'Reacciona a eventos', desc: 'Se ejecuta ' + [...new Set(hooks)].join(', ') + '.' });
    const compl = extCompletions.filter((c) => c._ext === ext.id).length;
    if (compl) feats.push({ icon: 'lightbulb', title: 'Autocompletado', desc: 'Aporta sugerencias al escribir.' });
  }

  if (!feats.length) {
    const installedNote = ext.community && !extActive(ext.id)
      ? '<p style="color:var(--text-dim)">Instalá y activá la extensión para ver las características que aporta.</p>'
      : '<p style="color:var(--text-dim)">Esta extensión no declara características específicas.</p>';
    return '<div class="exd-features">' + installedNote + '</div>';
  }

  let html = '<div class="exd-features">';
  for (const f of feats) {
    html +=
      '<div class="exd-feat">' +
        `<i class="codicon codicon-${f.icon || 'check'}"></i>` +
        '<div class="exd-feat-text">' +
          `<div class="exd-feat-title">${escapeHtml(f.title || '')}</div>` +
          `<div class="exd-feat-desc">${escapeHtml(f.desc || '')}</div>` +
        '</div>' +
      '</div>';
  }
  html += '</div>';
  return html;
}

// Renderiza el contenido de la página de detalles (estilo VS Code).
function renderExtDetailsView(ext) {
  const installed = installedExt.has(ext.id);
  const busy = extBusy[ext.id];
  let action;
  if (ext.soon) action = '<button class="ext-btn soon" disabled>Próximamente</button>';
  else if (busy === 'install') action = '<button class="ext-btn" disabled><i class="codicon codicon-loading codicon-modifier-spin"></i>Instalando…</button>';
  else if (busy === 'uninstall') action = '<button class="ext-btn installed" disabled><i class="codicon codicon-loading codicon-modifier-spin"></i>Desinstalando…</button>';
  else if (installed) action = '<button class="ext-btn installed" data-act="uninstall">Desinstalar</button>';
  else action = '<button class="ext-btn" data-act="install">Instalar</button>';
  const progress = busy ? `<div class="exd-progress"><div class="exd-progress-fill${busy === 'uninstall' ? ' rev' : ''}"></div></div>` : '';

  // Si es una extensión de la comunidad creada por el usuario actual: permitir borrar.
  const me = (window.HydraAuth && HydraAuth.getUser && HydraAuth.getUser());
  const isMine = !!(ext.community && me && ext.authorEmail && me.email === ext.authorEmail);
  const mineBtn = isMine
    ? '<button class="ext-btn ghost" data-act="editpub"><i class="codicon codicon-edit"></i> Editar</button>' +
      '<button class="ext-btn ghost danger" data-act="delpub">Eliminar publicación</button>'
    : '';
  const catRow = ext.community ? `<div class="exd-row"><span>Categoría</span><b>${ext.category || 'Otros'}</b></div>` : '';
  // Botón Deshabilitar/Habilitar: solo si está instalada y no en medio de una animación.
  const off = disabledExt.has(ext.id);
  const toggleBtn = (installed && !busy)
    ? `<button class="ext-btn ghost" data-act="${off ? 'enable' : 'disable'}">${off ? 'Habilitar' : 'Deshabilitar'}</button>`
    : '';

  const d = el('ext-details');
  d.innerHTML =
    '<div class="exd-header">' +
      `<img class="exd-icon" src="${ext.icon}" alt="" onerror="this.onerror=null;this.src='${DEFAULT_EXT_ICON}'">` +
      '<div class="exd-meta">' +
        `<div class="exd-name">${ext.name}${ext.community ? ' <span class="exd-tag">Comunidad</span>' : ''}</div>` +
        `<div class="exd-sub"><span class="exd-author">${isOfficialExt(ext) ? VERIFIED_BADGE : ''}${escapeHtml(ext.author)}</span><span class="exd-stars">${starStr(ext.rating)}</span><span>(${ext.ratings || 0} inst.)</span></div>` +
        `<div class="exd-desc">${ext.desc}</div>` +
        `<div class="exd-actions">${action}${toggleBtn}${mineBtn}</div>` +
        progress +
      '</div>' +
    '</div>' +
    '<div class="exd-tabs"><span class="active" data-tab="details">DETALLES</span><span data-tab="features">CARACTERÍSTICAS</span></div>' +
    '<div class="exd-body" data-pane="details">' +
      `<div class="exd-readme">${ext.readme || ext.desc || ''}</div>` +
      '<div class="exd-info"><h4>Instalación</h4>' +
        `<div class="exd-row"><span>Identificador</span><b>${ext.id}</b></div>` +
        `<div class="exd-row"><span>Versión</span><b>${ext.version || '1.0.0'}</b></div>` +
        catRow +
        `<div class="exd-row"><span>Publicador</span><b>${ext.author}</b></div>` +
      '</div>' +
    '</div>' +
    '<div class="exd-body" data-pane="features" hidden>' + renderExtFeatures(ext) + '</div>';

  // Conmutar entre las pestañas DETALLES / CARACTERÍSTICAS.
  for (const tab of d.querySelectorAll('.exd-tabs [data-tab]')) {
    tab.onclick = () => {
      for (const t of d.querySelectorAll('.exd-tabs [data-tab]')) t.classList.toggle('active', t === tab);
      for (const p of d.querySelectorAll('.exd-body[data-pane]')) p.hidden = p.dataset.pane !== tab.dataset.tab;
    };
  }

  for (const act of d.querySelectorAll('[data-act]')) act.onclick = async () => {
    if (act.dataset.act === 'install') installExtAnimated(ext);
    else if (act.dataset.act === 'uninstall') uninstallExtAnimated(ext);
    else if (act.dataset.act === 'disable') setExtDisabled(ext, true);
    else if (act.dataset.act === 'enable') setExtDisabled(ext, false);
    else if (act.dataset.act === 'editpub') openPublishModal(ext);
    else if (act.dataset.act === 'delpub') {
      const ok = await showConfirm('Eliminar publicación',
        '¿Eliminar tu extensión "' + ext.name + '"? Esto no se puede deshacer.', 'Eliminar', true);
      if (!ok) return;
      try {
        await HydraAuth.ext.remove(ext.id);
        if (installedExt.has(ext.id)) { teardownExtension(ext.id); setExtInstalled(ext.id, false); }
        communityExts = communityExts.filter((e) => e.id !== ext.id);
        closeTab('ext:' + ext.id);
        renderExtensions();
        showToast(ext, 'Publicación eliminada', 'trash', '#ff7a8a');
      } catch (e) { showModal('Extensiones', 'No se pudo eliminar: ' + (e.message || e), null, true, 'Cerrar'); }
    }
  };
}

// --------------------------------------------------------------------------
// Publicar una extensión propia al marketplace (Supabase #2).
// --------------------------------------------------------------------------
function openPublishModal(editing) {
  if (!window.HydraAuth || !HydraAuth.getUser || !HydraAuth.getUser()) {
    showModal('Publicar extensión', 'Iniciá sesión con Google para publicar tu extensión.', null, true, 'Entendido');
    return;
  }
  if (!canPublishExt()) {
    showModal('Publicar extensión', 'Solo la cuenta oficial de Hydra Software puede publicar extensiones.', null, true, 'Entendido');
    return;
  }
  if (!HydraAuth.ext || !HydraAuth.ext.ready()) {
    showModal('Publicar extensión', 'El servidor de extensiones no está disponible.', null, true, 'Cerrar');
    return;
  }
  const isEdit = !!(editing && editing.id);
  const ov = document.createElement('div');
  ov.className = 'overlay pub-overlay';
  ov.innerHTML =
    '<div class="pub-card">' +
      '<div class="pub-head"><i class="codicon codicon-' + (isEdit ? 'edit' : 'cloud-upload') + '"></i> ' +
        (isEdit ? 'Actualizar extensión' : 'Publicar extensión') +
        '<button class="pub-x" title="Cerrar"><i class="codicon codicon-close"></i></button></div>' +
      '<div class="pub-body">' +
        '<label>Nombre <input id="pub-name" maxlength="60" placeholder="Mi extensión genial"></label>' +
        '<label>Descripción <input id="pub-desc" maxlength="160" placeholder="Qué hace en una línea"></label>' +
        '<div class="pub-row2">' +
          '<label>Categoría <input id="pub-cat" maxlength="30" placeholder="Productividad" value="Otros"></label>' +
          '<label>Versión <input id="pub-ver" maxlength="14" placeholder="1.0.0" value="1.0.0"></label>' +
        '</div>' +
        '<label>Ícono (URL) <input id="pub-icon" placeholder="https://… (o subí un archivo)"></label>' +
        '<div class="pub-iconrow"><button class="ext-btn ghost" id="pub-iconfile"><i class="codicon codicon-device-camera"></i> Subir imagen…</button><img id="pub-iconprev" class="pub-iconprev" alt=""><input type="file" id="pub-iconinput" accept="image/*" hidden></div>' +
        '<label>Detalles (HTML, opcional) <textarea id="pub-readme" rows="2" placeholder="<h3>Mi extensión</h3><p>…</p>"></textarea></label>' +
        '<label>Archivos de la extensión (.js)</label>' +
        '<div class="pub-import" id="pub-drop">' +
          '<button class="ext-btn ghost" id="pub-importbtn" type="button"><i class="codicon codicon-cloud-upload"></i> Importar archivo(s) .js</button>' +
          '<span class="pub-import-hint">o arrastrá los archivos acá</span>' +
          '<input type="file" id="pub-fileinput" accept=".js,.mjs,.cjs,.ts,text/javascript,application/javascript" multiple hidden>' +
        '</div>' +
        '<div class="pub-filelist" id="pub-filelist"></div>' +
        '<div class="pub-api">API disponible:<br>' +
          '<b>Comandos/UI:</b> <code>hydra.registerCommand(titulo, fn)</code>, <code>hydra.openPanel(titulo, html)</code>, <code>hydra.addStatusItem(texto, onClick)</code><br>' +
          '<b>Editor:</b> <code>hydra.editor.getText()</code>, <code>setText(t)</code>, <code>getSelection()</code>, <code>replaceSelection(t)</code>, <code>getLanguage()</code>, <code>getPath()</code>, <code>hydra.insertText(t)</code><br>' +
          '<b>Eventos:</b> <code>hydra.onSave(cb)</code>, <code>hydra.onEditorChange(cb)</code>, <code>hydra.onOpenFile(cb)</code><br>' +
          '<b>Sistema:</b> <code>hydra.run(cmd)</code>, <code>hydra.runInTerminal(cmd)</code>, <code>hydra.openUrl(url)</code>, <code>hydra.notify(msg)</code>, <code>hydra.getRootDir()</code>, <code>hydra.log(...)</code></div>' +
        '<div class="pub-warn"><i class="codicon codicon-warning"></i> El código se ejecuta en Hydra IDE. Publicá solo código en el que confíes.</div>' +
        '<div class="pub-err" id="pub-err"></div>' +
      '</div>' +
      '<div class="pub-foot"><button class="ext-btn ghost" id="pub-cancel">Cancelar</button>' +
        '<button class="ext-btn" id="pub-send"><i class="codicon codicon-' + (isEdit ? 'cloud-upload' : 'rocket') + '"></i> ' + (isEdit ? 'Guardar cambios' : 'Publicar') + '</button></div>' +
    '</div>';
  document.body.appendChild(ov);

  // Código de la extensión: se arma importando archivos .js (ya no se pega a mano).
  let importedCode = '';
  const fileList = ov.querySelector('#pub-filelist');
  function renderFileList(items) {
    // items: [{name, size}]; si viene de edición se muestra "código actual".
    if (!items || !items.length) { fileList.innerHTML = ''; return; }
    fileList.innerHTML = items.map((it) =>
      '<div class="pub-file"><i class="codicon codicon-file-code"></i><span class="pf-name">' + escapeHtml(it.name) + '</span>' +
      (it.size != null ? '<span class="pf-size">' + Math.max(1, Math.round(it.size / 1024)) + ' KB</span>' : '') + '</div>').join('');
  }
  async function importFiles(files) {
    const arr = Array.prototype.slice.call(files || []).filter((f) => /\.(js|mjs|cjs|ts)$/i.test(f.name));
    if (!arr.length) { errBox.textContent = 'Importá archivos .js (o .mjs/.cjs/.ts).'; return; }
    errBox.textContent = '';
    const parts = [], meta = [];
    for (const f of arr) {
      const text = await f.text();
      parts.push(arr.length > 1 ? ('// ==== ' + f.name + ' ====\n' + text) : text);
      meta.push({ name: f.name, size: f.size });
    }
    importedCode = parts.join('\n\n');
    renderFileList(meta);
  }

  // Modo edición: precargar los datos actuales de la extensión.
  if (isEdit) {
    ov.querySelector('#pub-name').value = editing.name || '';
    ov.querySelector('#pub-desc').value = editing.desc || '';
    ov.querySelector('#pub-cat').value = editing.category || 'Otros';
    ov.querySelector('#pub-ver').value = editing.version || '1.0.0';
    ov.querySelector('#pub-readme').value = editing.readme || '';
    importedCode = editing.code || '';
    if (importedCode) renderFileList([{ name: (editing.name || 'extensión') + '.js (código actual)', size: importedCode.length }]);
    ov.querySelector('#pub-icon').value = (editing.icon && !editing.icon.startsWith('data:')) ? editing.icon : '';
    const pv = ov.querySelector('#pub-iconprev');
    if (editing.icon) { pv.src = editing.icon; pv.style.display = 'block'; }
  }

  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.pub-x').onclick = close;
  ov.querySelector('#pub-cancel').onclick = close;

  // Importar archivos: botón, input y arrastrar-soltar.
  const fileInput = ov.querySelector('#pub-fileinput');
  const drop = ov.querySelector('#pub-drop');
  ov.querySelector('#pub-importbtn').onclick = () => fileInput.click();
  fileInput.onchange = () => importFiles(fileInput.files);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); importFiles(e.dataTransfer.files); });

  let iconFile = null;
  const iconInput = ov.querySelector('#pub-iconinput');
  const iconPrev = ov.querySelector('#pub-iconprev');
  ov.querySelector('#pub-iconfile').onclick = () => iconInput.click();
  iconInput.onchange = () => {
    iconFile = iconInput.files && iconInput.files[0];
    if (iconFile) { iconPrev.src = URL.createObjectURL(iconFile); iconPrev.style.display = 'block'; ov.querySelector('#pub-icon').value = ''; }
  };
  const urlIn = ov.querySelector('#pub-icon');
  urlIn.oninput = () => { if (urlIn.value) { iconPrev.src = urlIn.value; iconPrev.style.display = 'block'; iconFile = null; } };

  const errBox = ov.querySelector('#pub-err');
  const send = ov.querySelector('#pub-send');
  send.onclick = async () => {
    errBox.textContent = '';
    const name = ov.querySelector('#pub-name').value.trim();
    const code = (importedCode || '').trim();
    if (!name) { errBox.textContent = 'Poné un nombre.'; return; }
    if (!code) { errBox.textContent = 'Importá al menos un archivo .js de la extensión.'; return; }
    send.disabled = true; send.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> ' + (isEdit ? 'Guardando…' : 'Publicando…');
    try {
      let iconUrl = urlIn.value.trim() || (isEdit && editing.icon && !editing.icon.startsWith('data:') ? editing.icon : null);
      if (iconFile) { const up = await HydraAuth.ext.uploadIcon(iconFile); if (up) iconUrl = up; }
      const payload = {
        name,
        description: ov.querySelector('#pub-desc').value.trim(),
        category: ov.querySelector('#pub-cat').value.trim() || 'Otros',
        version: ov.querySelector('#pub-ver').value.trim() || '1.0.0',
        icon_url: iconUrl,
        readme: ov.querySelector('#pub-readme').value.trim(),
        code,
      };
      if (isEdit) payload.ext_id = editing.id; // misma extensión → actualiza, no duplica
      const row = await HydraAuth.ext.publish(payload);
      // Refrescar la lista de comunidad.
      await loadCommunityExtensions();
      // Si la extensión está instalada y activa, re-ejecutar el código nuevo.
      if (isEdit && extActive(editing.id)) { teardownExtension(editing.id); const fresh = getExtById(editing.id); if (fresh) runExtension(fresh); }
      renderExtensions();
      if (activeTab === 'ext:' + (editing && editing.id)) { const fresh = getExtById(editing.id); if (fresh) { tabs.get(activeTab).ext = fresh; renderExtDetailsView(fresh); } }
      close();
      const norm = row ? normalizeCommunityExt(row) : { id: 'pub', name, icon: iconUrl || DEFAULT_EXT_ICON };
      showToast(norm, isEdit ? '¡Actualizada correctamente!' : '¡Publicada! Ya aparece en Comunidad', 'check', '#2ff0c4');
    } catch (e) {
      errBox.textContent = 'Error: ' + (e && e.message || e);
      send.disabled = false; send.innerHTML = '<i class="codicon codicon-' + (isEdit ? 'cloud-upload' : 'rocket') + '"></i> ' + (isEdit ? 'Guardar cambios' : 'Publicar');
    }
  };
}

// --------------------------------------------------------------------------
// Hydra Updates — muestra las releases del repo de actualizaciones (GitHub API).
// Dos plataformas: Windows (.exe, repo de updates) y Linux (.sh x64/arm64, repo
// de builds de Linux). El selector cambia de repo y recarga.
// --------------------------------------------------------------------------
const WINDOWS_REPO = 'HydraSoftwareGH/Hydra-Updates---IDE';
const LINUX_REPO = 'HydraSoftwareGH/Hydra-IDE---Linux';
// Plataforma seleccionada: por defecto el SO actual (linux -> Linux; resto -> Windows).
let updatesPlatform = (localStorage.getItem('hydra.updatesPlatform')
  || ((window.api && window.api.platform === 'linux') ? 'linux' : 'win'));
const updatesRepo = () => (updatesPlatform === 'linux' ? LINUX_REPO : WINDOWS_REPO);

let releases = [];
let releasesLoaded = false, releasesLoading = false, releasesError = '';

async function loadReleases(force) {
  if (releasesLoading) return;
  if (releasesLoaded && !force) return;
  releasesLoading = true; releasesError = '';
  const rb = el('updates-refresh'); if (rb) rb.classList.add('spinning');
  renderUpdatesList();
  try {
    const res = await fetch('https://api.github.com/repos/' + updatesRepo() + '/releases?per_page=30', {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error('GitHub respondió ' + res.status + (res.status === 404 ? ' (¿repo privado o sin releases?)' : ''));
    const data = await res.json();
    releases = Array.isArray(data) ? data : [];
  } catch (e) {
    releasesError = (e && e.message) || String(e);
    releases = [];
  }
  releasesLoaded = true; releasesLoading = false;
  const rb2 = el('updates-refresh'); if (rb2) rb2.classList.remove('spinning');
  renderUpdatesList();
}

// Compara dos versiones tipo "1.2.3" → 1 si a>b, -1 si a<b, 0 igual.
function cmpVersions(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso.slice(0, 10); }
}

// Refleja la plataforma activa en los botones del selector.
function syncPlatButtons() {
  const bw = el('updates-plat-win'), bl = el('updates-plat-linux');
  if (bw) bw.classList.toggle('active', updatesPlatform === 'win');
  if (bl) bl.classList.toggle('active', updatesPlatform === 'linux');
}

// Cambia de plataforma (win/linux): recarga las releases del repo correspondiente.
function setUpdatesPlatform(plat) {
  if (plat !== 'win' && plat !== 'linux') return;
  if (plat === updatesPlatform) return;
  updatesPlatform = plat;
  try { localStorage.setItem('hydra.updatesPlatform', plat); } catch (e) {}
  syncPlatButtons();
  releasesLoaded = false; releases = []; releasesError = '';
  loadReleases(true);
}

function renderUpdatesList() {
  const list = el('updates-list');
  if (!list) return;
  if (!releasesLoaded && !releasesLoading) { loadReleases(); return; } // carga la 1ª vez
  list.innerHTML = '';

  // Cabecera: tu versión vs la última.
  const head = document.createElement('div');
  head.className = 'upd-head' + (releases[0] && appVersion && cmpVersions(releases[0].tag_name, appVersion) > 0 ? ' has-new' : '');
  const latest = releases[0];
  const newer = latest && appVersion && cmpVersions(latest.tag_name, appVersion) > 0;
  head.innerHTML =
    '<div class="upd-head-icon"><i class="codicon codicon-' + (newer ? 'cloud-download' : 'pass-filled') + '"></i></div>' +
    '<div class="upd-head-info">' +
      `<div class="upd-cur">Tu versión: <b>${escapeHtml(appVersion || '—')}</b></div>` +
      (latest ? `<div class="upd-latest ${newer ? 'new' : ''}">${newer ? '¡Nueva versión disponible! ' : 'Estás al día · '}<b>${escapeHtml(latest.tag_name)}</b></div>` : '') +
    '</div>';
  list.appendChild(head);

  if (releasesLoading && !releases.length) {
    const l = document.createElement('div'); l.className = 'upd-empty'; l.textContent = 'Cargando versiones…';
    list.appendChild(l); return;
  }
  if (releasesError) {
    const e = document.createElement('div'); e.className = 'upd-empty';
    e.innerHTML = '⚠ No se pudieron cargar las versiones.<br><small>' + escapeHtml(releasesError) + '</small>';
    list.appendChild(e); return;
  }
  if (!releases.length) {
    const e = document.createElement('div'); e.className = 'upd-empty'; e.textContent = 'Todavía no hay versiones publicadas en el repo.';
    list.appendChild(e); return;
  }

  let i = 0;
  for (const rel of releases) {
    const isCurrent = appVersion && cmpVersions(rel.tag_name, appVersion) === 0;
    const isNewer = appVersion && cmpVersions(rel.tag_name, appVersion) > 0;
    const card = document.createElement('div');
    card.className = 'upd-card' + (isNewer ? ' new' : '') + (isCurrent ? ' current' : '');
    card.style.animationDelay = (i * 45) + 'ms';   // aparición escalonada
    const title = rel.name || rel.tag_name;
    const icon = isNewer ? 'rocket' : (isCurrent ? 'pass-filled' : 'tag');
    card.innerHTML =
      `<div class="upd-card-ic"><i class="codicon codicon-${icon}"></i></div>` +
      '<div class="upd-card-body">' +
        `<div class="upd-tag">${escapeHtml(rel.tag_name)}${rel.prerelease ? '<span class="upd-pre">pre</span>' : ''}${isCurrent ? '<span class="upd-now">actual</span>' : ''}${isNewer ? '<span class="upd-new-badge">nueva</span>' : ''}</div>` +
        `<div class="upd-name">${escapeHtml(title)}</div>` +
        `<div class="upd-date"><i class="codicon codicon-calendar"></i> ${fmtDate(rel.published_at)}</div>` +
      '</div>' +
      '<i class="codicon codicon-chevron-right upd-card-arrow"></i>';
    card.onclick = () => openUpdateTab(rel);
    list.appendChild(card);
    i++;
  }
}

function openUpdateTab(rel) {
  const key = 'upd:' + updatesPlatform + ':' + rel.tag_name;
  if (!tabs.has(key)) { tabs.set(key, { kind: 'update', rel, name: rel.tag_name }); openFiles.push(key); }
  setActiveTab(key);
  renderTabs();
}

function renderUpdateDetails(rel) {
  const d = el('update-details');
  const assets = (rel.assets || []).filter((a) => a && a.browser_download_url);
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
  let dlMain;
  if (updatesPlatform === 'linux') {
    // Instaladores .sh por arquitectura (sin tar.gz).
    const sh = assets.filter((a) => /\.sh$/i.test(a.name));
    const arm = sh.find((a) => /arm64|aarch64/i.test(a.name));
    const x64 = sh.find((a) => /x64|x86[_-]?64|amd64/i.test(a.name) && !/arm64|aarch64/i.test(a.name));
    const btn = (a, label) => `<a class="upd-dl" href="${a.browser_download_url}" data-ext="1"><i class="codicon codicon-desktop-download"></i> ${label} .sh (${mb(a.size)})</a>`;
    const parts = [];
    if (x64) parts.push(btn(x64, 'x86_64'));
    if (arm) parts.push(btn(arm, 'ARM64'));
    dlMain = parts.length
      ? parts.join('')
      : `<a class="upd-dl" href="${rel.html_url}" data-ext="1"><i class="codicon codicon-link-external"></i> Ver en GitHub</a>`;
  } else {
    const installer = assets.find((a) => /\.exe$/i.test(a.name));
    dlMain = installer
      ? `<a class="upd-dl" href="${installer.browser_download_url}" data-ext="1"><i class="codicon codicon-desktop-download"></i> Descargar instalador (${mb(installer.size)})</a>`
      : `<a class="upd-dl" href="${rel.html_url}" data-ext="1"><i class="codicon codicon-link-external"></i> Ver en GitHub</a>`;
  }
  const assetList = assets.length
    ? '<div class="upd-assets"><h4>Archivos</h4>' + assets.map((a) =>
        `<a class="upd-asset" href="${a.browser_download_url}" data-ext="1"><i class="codicon codicon-cloud-download"></i> ${escapeHtml(a.name)} <span>${(a.size/1048576).toFixed(1)} MB · ${a.download_count || 0} descargas</span></a>`
      ).join('') + '</div>'
    : '';
  const body = rel.body ? aiMarkdown(rel.body) : '<p class="upd-nobody">Sin notas de versión.</p>';

  d.innerHTML =
    '<div class="upd-detail">' +
      '<div class="upd-detail-head">' +
        `<div class="upd-detail-tag">${escapeHtml(rel.tag_name)}${rel.prerelease ? '<span class="upd-pre">pre-release</span>' : ''}</div>` +
        `<h2>${escapeHtml(rel.name || rel.tag_name)}</h2>` +
        `<div class="upd-detail-sub"><i class="codicon codicon-calendar"></i> ${fmtDate(rel.published_at)} · por ${escapeHtml((rel.author && rel.author.login) || 'Hydra')}</div>` +
        `<div class="upd-detail-actions">${dlMain}<a class="upd-ghost" href="${rel.html_url}" data-ext="1">Abrir en GitHub</a></div>` +
      '</div>' +
      `<div class="upd-detail-body">${body}</div>` +
      assetList +
    '</div>';

  // Los enlaces se abren en el navegador del sistema (no dentro del IDE).
  d.querySelectorAll('a[data-ext]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); try { window.api.openExternal(a.getAttribute('href')); } catch (err) {} };
  });
}

// --------------------------------------------------------------------------
// Hydra Live (Live Server propio): sirve la carpeta y recarga al guardar.
// --------------------------------------------------------------------------
let liveRunning = false, livePort = 0;

function htmlRelOf(filePath) {
  if (!filePath || !rootDir || !/\.html?$/i.test(filePath)) return '';
  return filePath.replace(rootDir, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
}

async function startLiveFor(openRel) {
  if (!rootDir) { showModal('Live Server', 'Primero abrí una carpeta.', null, true, 'Cerrar'); return; }
  const res = await window.api.liveStart(rootDir, openRel || '');
  if (res && res.port) { liveRunning = true; livePort = res.port; }
  else showModal('Live Server', 'No se pudo iniciar: ' + ((res && res.error) || 'error'), null, true, 'Cerrar');
  renderLiveStatus();
}

async function toggleLive() {
  if (!installedExt.has('hydra-live')) {
    showModal('Live Server', 'Instalá la extensión "Live Server" desde la sección Extensiones para usar Go Live.', null, true, 'Cerrar');
    return;
  }
  if (liveRunning) { await window.api.liveStop(); liveRunning = false; livePort = 0; renderLiveStatus(); }
  else await startLiveFor(htmlRelOf(activeTab));
}

function renderLiveStatus() {
  const item = el('status-live');
  if (!item) return;
  item.innerHTML = '';
  if (liveRunning) {
    if (window.__HYDRA_WEB__) {
      // En el navegador no hay puerto: es una vista previa (pestaña aparte).
      item.append(codicon('circle-slash'), document.createTextNode(' En vivo'));
      item.title = 'Vista previa abierta (recarga al guardar) — clic para cerrar';
    } else {
      item.append(codicon('circle-slash'), document.createTextNode(' Puerto: ' + livePort));
      item.title = 'Live Server activo en localhost:' + livePort + ' — clic para detener';
    }
    item.classList.add('live-on');
  } else {
    item.append(codicon('broadcast'), document.createTextNode(' Go Live'));
    item.title = 'Servir la carpeta con Live Server (recarga automática)';
    item.classList.remove('live-on');
  }
}

el('status-live').addEventListener('click', (e) => { e.stopPropagation(); toggleLive(); });

// --------------------------------------------------------------------------
// Git Graph: grafo de commits y ramas del repositorio abierto.
// --------------------------------------------------------------------------
const GITGRAPH_KEY = 'gitgraph:view';
// Paleta de colores para las "lanes" (ramas) del grafo.
const GG_COLORS = ['#7c6bff', '#2ff0c4', '#e5a00d', '#ff7a8a', '#4aa3ff', '#b96bff', '#52d273', '#ff9d4a', '#ff5fa2', '#3ad6e0'];
const GG_LANE_W = 18;   // ancho de cada carril (px)
const GG_ROW_H = 30;    // alto de cada fila de commit (px)
const GG_PAD_X = 14;    // margen izquierdo del grafo (px)
const GG_DOT_R = 4.5;   // radio del punto del commit (px)

// Abre (o enfoca) la pestaña del Git Graph.
function openGitGraph() {
  if (!installedExt.has('hydra-git')) {
    showModal('Git Graph', 'Instalá la extensión "Git Graph" desde la sección Extensiones para usarla.', null, true, 'Cerrar');
    return;
  }
  if (!tabs.has(GITGRAPH_KEY)) { tabs.set(GITGRAPH_KEY, { kind: 'gitgraph', name: 'Git Graph' }); openFiles.push(GITGRAPH_KEY); }
  setActiveTab(GITGRAPH_KEY);
  renderTabs();
}

el('status-git').addEventListener('click', (e) => { e.stopPropagation(); openGitGraph(); });
el('status-python').addEventListener('click', (e) => { e.stopPropagation(); pickPythonInterpreter(); });
el('status-copilot').addEventListener('click', (e) => { e.stopPropagation(); toggleCopilotPause(); });
el('status-3d').addEventListener('click', (e) => { e.stopPropagation(); openThreeD(); });
el('status-zen').addEventListener('click', (e) => { e.stopPropagation(); toggleZen(); });
el('status-power').addEventListener('click', (e) => { e.stopPropagation(); togglePower(); });


// ==========================================================================
// Extensiones livianas: Reloj, Contador de palabras, Modo Zen, Power Mode
// ==========================================================================
// --- Reloj ---------------------------------------------------------------
let clockTimer = null;
function clockTick() {
  const el2 = el('status-clock'); if (!el2) return;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  el2.innerHTML = '<i class="codicon codicon-watch"></i> ' + hh + ':' + mm;
}
function applyClock() {
  const on = extActive('hydra-clock');
  if (el('status-clock')) el('status-clock').hidden = !on;
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  if (on) { clockTick(); clockTimer = setInterval(clockTick, 1000); }
}

// --- Contador de palabras ------------------------------------------------
function updateWordCount() {
  const item = el('status-wordcount'); if (!item) return;
  if (!extActive('hydra-wordcount')) { item.hidden = true; return; }
  const tab = activeTab && tabs.get(activeTab);
  if (!tab || tab.kind !== 'text' || !monacoEditor || activeTab !== (tab && activeTab)) { item.hidden = true; return; }
  let text = '';
  try {
    const sel = monacoEditor.getSelection();
    text = (sel && !sel.isEmpty()) ? monacoEditor.getModel().getValueInRange(sel) : monacoEditor.getValue();
  } catch (e) { item.hidden = true; return; }
  const words = (text.match(/\S+/g) || []).length;
  item.hidden = false;
  item.textContent = words + ' palabras · ' + text.length + ' car.';
}
function applyWordCount() { updateWordCount(); }

// --- Modo Zen ------------------------------------------------------------
function toggleZen(force) {
  const on = force === undefined ? !document.body.classList.contains('zen-mode') : force;
  document.body.classList.toggle('zen-mode', on);
  const b = el('status-zen'); if (b) b.classList.toggle('active', on);
}
function applyZen() {
  const on = extActive('hydra-zen');
  if (el('status-zen')) el('status-zen').hidden = !on;
  if (!on) toggleZen(false);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('zen-mode')) toggleZen(false); });

// --- Power Mode ----------------------------------------------------------
let powerOn = false;
const POWER_COLORS = ['#f14c4c', '#3b8eea', '#0dbc79', '#e5a00d', '#d670d6', '#2ff0c4', '#ff7a59'];
function applyPower() {
  const on = extActive('hydra-power');
  if (el('status-power')) el('status-power').hidden = !on;
  if (!on) { powerOn = false; el('status-power') && el('status-power').classList.remove('active'); }
}
function togglePower() {
  powerOn = !powerOn;
  el('status-power') && el('status-power').classList.toggle('active', powerOn);
}
// Dispara partículas + shake en la posición del cursor del editor.
function powerBurst() {
  if (!powerOn || !monacoEditor) return;
  const wrap = el('editor-wrap'); if (!wrap || wrap.hidden) return;
  let pos;
  try { pos = monacoEditor.getScrolledVisiblePosition(monacoEditor.getPosition()); } catch (e) { return; }
  if (!pos) return;
  const rect = el('monaco').getBoundingClientRect();
  const wrect = wrap.getBoundingClientRect();
  const x = (rect.left - wrect.left) + pos.left;
  const y = (rect.top - wrect.top) + pos.top;
  for (let i = 0; i < 5; i++) {
    const p = document.createElement('div');
    p.className = 'power-particle';
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.background = POWER_COLORS[(Math.random() * POWER_COLORS.length) | 0];
    const ang = Math.random() * Math.PI * 2, dist = 14 + Math.random() * 22;
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    p.style.setProperty('--dy', (Math.sin(ang) * dist - 10) + 'px');
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 600);
  }
  wrap.classList.remove('power-shake'); void wrap.offsetWidth; wrap.classList.add('power-shake');
}

// ==========================================================================
// Hydra 3D — playground de Three.js (editor + canvas en vivo + consola)
// ==========================================================================
const THREED_KEY = 'threed:view';
let threedRun = null; // { renderer, raf, dispose } de la ejecución actual
const THREED_SAMPLE = [
  '// Hydra 3D · Three.js. Tenés: THREE, scene, camera, renderer, canvas, log().',
  '// El bucle de animación lo maneja Hydra: definí animate(t) si querés.',
  'const geo = new THREE.BoxGeometry(1, 1, 1);',
  'const mat = new THREE.MeshStandardMaterial({ color: 0x7c6bff });',
  'const cube = new THREE.Mesh(geo, mat);',
  'scene.add(cube);',
  'scene.add(new THREE.AmbientLight(0xffffff, 0.5));',
  'const dl = new THREE.DirectionalLight(0xffffff, 1); dl.position.set(3, 5, 2); scene.add(dl);',
  'camera.position.z = 4;',
  '',
  'function animate(t) {',
  '  cube.rotation.x = t * 0.001;',
  '  cube.rotation.y = t * 0.0013;',
  '}',
].join('\n');

function openThreeD() {
  if (!extActive('hydra-3d')) { showModal('Hydra 3D', 'Instalá la extensión "Hydra 3D" desde Extensiones.', null, true, 'Cerrar'); return; }
  if (!tabs.has(THREED_KEY)) { tabs.set(THREED_KEY, { kind: 'threed', name: 'Hydra 3D' }); openFiles.push(THREED_KEY); }
  setActiveTab(THREED_KEY); renderTabs();
}
function renderThreeD() {
  const host = el('threed-view');
  if (host.dataset.ready) { if (!threedRun) setTimeout(runThreeD, 0); return; } // re-ejecutar al reabrir
  host.dataset.ready = '1';
  if (typeof THREE === 'undefined') { host.innerHTML = '<div class="td-empty">No se pudo cargar Three.js.</div>'; return; }
  host.innerHTML =
    '<div class="td-bar"><span class="td-title"><i class="codicon codicon-globe"></i> Hydra 3D</span>' +
      '<button class="td-btn run" id="td-run"><i class="codicon codicon-play"></i> Ejecutar</button>' +
      '<button class="td-btn" id="td-reset"><i class="codicon codicon-debug-restart"></i> Ejemplo</button></div>' +
    '<div class="td-split">' +
      '<textarea id="td-code" class="td-code" spellcheck="false"></textarea>' +
      '<div class="td-preview"><canvas id="td-canvas"></canvas><div id="td-console" class="td-console"></div></div>' +
    '</div>';
  const code = el('td-code');
  code.value = (appSettings.threedCode != null) ? appSettings.threedCode : THREED_SAMPLE;
  el('td-run').onclick = () => runThreeD();
  el('td-reset').onclick = () => { code.value = THREED_SAMPLE; runThreeD(); };
  code.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runThreeD(); } });
  setTimeout(runThreeD, 0);
}
function threedLog(msg, err) {
  const c = el('td-console'); if (!c) return;
  const line = document.createElement('div'); line.className = 'td-log' + (err ? ' err' : '');
  line.textContent = String(msg); c.appendChild(line); c.scrollTop = c.scrollHeight;
}
function threedStop() {
  if (threedRun) {
    try { cancelAnimationFrame(threedRun.raf); } catch (e) {}
    try { threedRun.renderer.dispose(); } catch (e) {}
    threedRun = null;
  }
}
function runThreeD() {
  const code = el('td-code'); const canvas = el('td-canvas'); const cons = el('td-console');
  if (!code || !canvas) return;
  if (cons) cons.innerHTML = '';
  appSettings.threedCode = code.value; saveState({ settings: appSettings }); // recordar el código
  threedStop();
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false); renderer.setPixelRatio(window.devicePixelRatio || 1);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x14151b);
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    const fn = new Function('THREE', 'scene', 'camera', 'renderer', 'canvas', 'log', code.value + '\n;return (typeof animate==="function")?animate:null;');
    const animate = fn(THREE, scene, camera, renderer, canvas, (m) => threedLog(m));
    const run = { renderer, raf: 0, dispose: null };
    threedRun = run;
    const loop = (t) => {
      if (threedRun !== run) return;
      try { if (animate) animate(t); renderer.render(scene, camera); }
      catch (e) { threedLog(e.message || e, true); threedStop(); return; }
      run.raf = requestAnimationFrame(loop);
    };
    run.raf = requestAnimationFrame(loop);
    threedLog('▶ Ejecutando…');
  } catch (e) { threedLog((e && e.message) || e, true); }
}
function applyThreeD() {
  const on = extActive('hydra-3d');
  if (el('status-3d')) el('status-3d').hidden = !on;
  if (!on && tabs.has(THREED_KEY)) { threedStop(); closeTab(THREED_KEY); }
}

el('status-themes').addEventListener('click', (e) => { e.stopPropagation(); openThemePicker(); });
el('team-refresh').addEventListener('click', () => renderTeam());
el('python-refresh').addEventListener('click', () => { detectPython(true).then(() => renderPython()); });
// La rama en la barra de estado también abre el grafo si la extensión está activa.
el('status-branch').addEventListener('click', (e) => {
  e.stopPropagation();
  if (extActive('hydra-git')) openGitGraph();
});

// Colorea un mensaje de estado centrado dentro de la vista del grafo.
function ggMessage(html) {
  return '<div class="gg-empty">' + html + '</div>';
}

// Convierte la salida cruda de `git log` en una lista de commits.
function parseGitLog(raw) {
  const FS = '\x1f', RS = '\x1e';
  const out = [];
  for (const rec of raw.split(RS)) {
    const line = rec.replace(/^\n+/, '');
    if (!line.trim()) continue;
    const f = line.split(FS);
    if (f.length < 7) continue;
    out.push({
      hash: f[0],
      parents: f[1] ? f[1].split(' ').filter(Boolean) : [],
      author: f[2] || '',
      email: f[3] || '',
      date: f[4] || '',
      refs: f[5] || '',
      subject: f[6] || '',
    });
  }
  return out;
}

// Asigna un carril (columna) a un hash de padre, reutilizando uno libre.
function ggAssignLane(lanes, hash, preferredCol) {
  const existing = lanes.indexOf(hash);
  if (existing !== -1) return existing;                       // ya esperado → se une ahí
  if (preferredCol != null && lanes[preferredCol] == null) { lanes[preferredCol] = hash; return preferredCol; }
  let free = lanes.indexOf(null);
  if (free === -1) { free = lanes.length; lanes.push(hash); } else { lanes[free] = hash; }
  return free;
}

// Algoritmo de carriles estilo gitk: para cada commit calcula su columna y
// el estado de los carriles antes (incoming) y después (outgoing) de procesarlo.
function buildGraphRows(commits) {
  let lanes = [];           // hash que cada carril está "esperando" (o null)
  const rows = [];
  for (const c of commits) {
    let col = lanes.indexOf(c.hash);
    if (col === -1) col = ggAssignLane(lanes, c.hash, null); // tip de rama nuevo
    const incoming = lanes.slice();
    // Todos los carriles que esperaban este commit se colapsan en `col`.
    for (let i = 0; i < lanes.length; i++) if (lanes[i] === c.hash) lanes[i] = null;
    // Primer padre continúa en la columna del commit; los demás abren carriles.
    if (c.parents.length) {
      ggAssignLane(lanes, c.parents[0], col);
      for (let p = 1; p < c.parents.length; p++) ggAssignLane(lanes, c.parents[p], null);
    }
    while (lanes.length && lanes[lanes.length - 1] == null) lanes.pop();
    const outgoing = lanes.slice();
    rows.push({ commit: c, col, incoming, outgoing });
  }
  return rows;
}

// Devuelve el SVG (líneas + punto) del grafo para una fila concreta.
function ggRowSvg(row, width) {
  const cx = (i) => GG_PAD_X + i * GG_LANE_W;
  const half = GG_ROW_H / 2;
  const colColor = (i) => GG_COLORS[i % GG_COLORS.length];
  let paths = '';
  const { commit, col, incoming, outgoing } = row;

  // 1) Carriles que solo "pasan de largo" (su hash no es este commit): de arriba a abajo.
  for (let i = 0; i < incoming.length; i++) {
    const h = incoming[i];
    if (!h || h === commit.hash) continue;
    const j = outgoing.indexOf(h);
    if (j === -1) continue;
    paths += `<path d="M ${cx(i)} 0 C ${cx(i)} ${half}, ${cx(j)} ${half}, ${cx(j)} ${GG_ROW_H}" stroke="${colColor(j)}" fill="none" stroke-width="1.6"/>`;
  }
  // 2) Carriles que esperaban este commit (hijos arriba): bajan hasta el punto.
  for (let i = 0; i < incoming.length; i++) {
    if (incoming[i] !== commit.hash) continue;
    paths += `<path d="M ${cx(i)} 0 C ${cx(i)} ${half}, ${cx(col)} ${half}, ${cx(col)} ${half}" stroke="${colColor(col)}" fill="none" stroke-width="1.6"/>`;
  }
  // 3) Del punto hacia cada padre (abajo).
  for (const p of commit.parents) {
    const j = outgoing.indexOf(p);
    if (j === -1) continue;
    paths += `<path d="M ${cx(col)} ${half} C ${cx(col)} ${half}, ${cx(j)} ${half}, ${cx(j)} ${GG_ROW_H}" stroke="${colColor(j)}" fill="none" stroke-width="1.6"/>`;
  }
  // 4) El punto del commit.
  const dot = `<circle cx="${cx(col)}" cy="${half}" r="${GG_DOT_R}" fill="${colColor(col)}" stroke="#11121a" stroke-width="1.5"/>`;
  return `<svg class="gg-svg" width="${width}" height="${GG_ROW_H}" viewBox="0 0 ${width} ${GG_ROW_H}">${paths}${dot}</svg>`;
}

// Convierte el campo %D de git (refs) en chips de rama/tag/HEAD.
function ggRefChips(refs) {
  if (!refs) return '';
  let html = '';
  for (let ref of refs.split(',')) {
    ref = ref.trim();
    if (!ref) continue;
    let cls = 'gg-ref', label = ref;
    if (ref.startsWith('HEAD ->')) { cls += ' head'; label = ref.replace('HEAD ->', '').trim(); html += `<span class="gg-ref head-tag">HEAD</span>`; }
    else if (ref === 'HEAD') { cls += ' head'; }
    else if (ref.startsWith('tag:')) { cls += ' tag'; label = ref.replace('tag:', '').trim(); }
    else if (ref.startsWith('origin/') || ref.includes('/')) { cls += ' remote'; }
    html += `<span class="${cls}">${escapeHtml(label)}</span>`;
  }
  return html;
}

let ggLoading = false;
// Renderiza la vista completa del Git Graph en #gitgraph-view.
async function renderGitGraph() {
  const host = el('gitgraph-view');
  if (!host) return;

  const header =
    '<div class="gg-head">' +
      '<div class="gg-title"><i class="codicon codicon-git-commit"></i> Git Graph' +
        (rootDir ? ' <span class="gg-root">' + escapeHtml(rootDir.split(/[\\/]/).pop()) + '</span>' : '') + '</div>' +
      '<button class="ext-btn ghost" id="gg-refresh"><i class="codicon codicon-refresh"></i> Actualizar</button>' +
    '</div>';
  const wire = () => {
    const r = el('gg-refresh');
    if (r) r.onclick = () => renderGitGraph();
    const ini = el('gg-init');
    if (ini) ini.onclick = async () => {
      ini.disabled = true; ini.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Inicializando…';
      const res = await window.api.gitInit(rootDir);
      if (res && res.ok) renderGitGraph();
      else { ini.disabled = false; ini.textContent = 'Inicializar repositorio'; showModal('Git', 'No se pudo inicializar: ' + ((res && res.error) || 'error'), null, true, 'Cerrar'); }
    };
  };

  if (!rootDir) {
    host.innerHTML = header + ggMessage('<i class="codicon codicon-folder-opened"></i><p>Abrí una carpeta con un repositorio Git para ver su historial.</p>');
    wire(); return;
  }
  if (ggLoading) return;
  ggLoading = true;
  host.innerHTML = header + ggMessage('<i class="codicon codicon-loading codicon-modifier-spin"></i><p>Leyendo el historial…</p>');
  wire();

  let res;
  try { res = await window.api.gitLog(rootDir, 400); }
  catch (e) { res = { error: String(e) }; }
  ggLoading = false;

  if (!res || res.error) {
    let msg;
    if (res && res.error === 'no-git') msg = '<i class="codicon codicon-warning"></i><p>Git no está instalado o no está en el PATH del sistema.</p>';
    else if (res && res.error === 'not-a-repo') msg = '<i class="codicon codicon-source-control"></i><p>Esta carpeta no es un repositorio Git.</p><button class="ext-btn" id="gg-init">Inicializar repositorio</button>';
    else if (res && res.error === 'no-folder') msg = '<i class="codicon codicon-folder-opened"></i><p>Abrí una carpeta primero.</p>';
    else msg = '<i class="codicon codicon-error"></i><p>No se pudo leer el repositorio.</p><small>' + escapeHtml((res && res.error) || 'error') + '</small>';
    host.innerHTML = header + ggMessage(msg);
    wire(); return;
  }

  const commits = parseGitLog(res.raw);
  if (!commits.length) {
    host.innerHTML = header + ggMessage('<i class="codicon codicon-git-commit"></i><p>El repositorio todavía no tiene commits.</p>');
    wire(); return;
  }

  const rows = buildGraphRows(commits);
  let maxLanes = 1;
  for (const r of rows) maxLanes = Math.max(maxLanes, r.incoming.length, r.outgoing.length, r.col + 1);
  const svgW = GG_PAD_X * 2 + maxLanes * GG_LANE_W;

  // Actualizar la rama mostrada en la barra de estado, si la detectamos.
  const headRow = rows.find((r) => /HEAD ->/.test(r.commit.refs));
  if (headRow) {
    const br = headRow.commit.refs.split(',').map((s) => s.trim()).find((s) => s.startsWith('HEAD ->'));
    if (br) { const name = br.replace('HEAD ->', '').trim(); const sb = el('status-branch'); if (sb) sb.innerHTML = '<i class="codicon codicon-git-branch"></i> ' + escapeHtml(name); }
  }

  let body = '<div class="gg-rows">';
  for (const row of rows) {
    const c = row.commit;
    body +=
      '<div class="gg-row" title="' + escapeHtml(c.hash) + '">' +
        '<div class="gg-graph" style="width:' + svgW + 'px">' + ggRowSvg(row, svgW) + '</div>' +
        '<div class="gg-info">' +
          '<span class="gg-refs">' + ggRefChips(c.refs) + '</span>' +
          '<span class="gg-subject">' + escapeHtml(c.subject) + '</span>' +
        '</div>' +
        '<div class="gg-meta">' +
          '<span class="gg-author">' + escapeHtml(c.author) + '</span>' +
          '<span class="gg-date">' + escapeHtml(c.date) + '</span>' +
          '<span class="gg-hash">' + escapeHtml(c.hash.slice(0, 7)) + '</span>' +
        '</div>' +
      '</div>';
  }
  body += '</div>';
  host.innerHTML = header + '<div class="gg-scroll">' + body + '</div>';
  wire();
}

// --------------------------------------------------------------------------
// Prettier: formateo de código (build ESM vendorizado en vendor/prettier).
// --------------------------------------------------------------------------
let _prettier = null;          // { format, plugins } una vez cargado
let _prettierLoading = null;   // promesa en curso de carga
const prettierDisposables = []; // proveedores de formato registrados en Monaco
// Lenguajes (ids de Monaco) que Prettier sabe formatear acá.
const PRETTIER_LANGS = ['javascript', 'typescript', 'json', 'css', 'scss', 'less', 'html', 'markdown', 'yaml'];

// Carga perezosa de Prettier y sus plugins (solo la primera vez que se usa).
function loadPrettier() {
  if (_prettier) return Promise.resolve(_prettier);
  if (_prettierLoading) return _prettierLoading;
  const base = './vendor/prettier/';
  _prettierLoading = Promise.all([
    import(base + 'standalone.mjs'),
    import(base + 'plugins/babel.mjs'),
    import(base + 'plugins/estree.mjs'),
    import(base + 'plugins/postcss.mjs'),
    import(base + 'plugins/html.mjs'),
    import(base + 'plugins/markdown.mjs'),
    import(base + 'plugins/typescript.mjs'),
    import(base + 'plugins/yaml.mjs'),
  ]).then(([std, babel, estree, postcss, html, md, ts, yaml]) => {
    _prettier = {
      format: std.format,
      plugins: {
        babel: babel.default, estree: estree.default, postcss: postcss.default,
        html: html.default, markdown: md.default, typescript: ts.default, yaml: yaml.default,
      },
    };
    return _prettier;
  }).catch((e) => { _prettierLoading = null; throw e; });
  return _prettierLoading;
}

// Devuelve { parser, plugins } de Prettier para un lenguaje/archivo, o null.
function prettierConfigFor(langId, path) {
  const P = _prettier.plugins;
  const byExt = (p) => {
    if (/\.tsx?$/i.test(p)) return { parser: 'typescript', plugins: [P.typescript, P.estree] };
    if (/\.(jsx|mjs|cjs)$/i.test(p)) return { parser: 'babel', plugins: [P.babel, P.estree] };
    if (/\.json5?$/i.test(p) || /\.jsonc$/i.test(p)) return { parser: 'json', plugins: [P.babel, P.estree] };
    if (/\.s[ac]ss$/i.test(p)) return { parser: 'scss', plugins: [P.postcss] };
    if (/\.less$/i.test(p)) return { parser: 'less', plugins: [P.postcss] };
    return null;
  };
  switch (langId) {
    case 'javascript': return { parser: 'babel', plugins: [P.babel, P.estree] };
    case 'typescript': return { parser: 'typescript', plugins: [P.typescript, P.estree] };
    case 'json': return { parser: 'json', plugins: [P.babel, P.estree] };
    case 'css': return { parser: 'css', plugins: [P.postcss] };
    case 'scss': return { parser: 'scss', plugins: [P.postcss] };
    case 'less': return { parser: 'less', plugins: [P.postcss] };
    case 'html': return { parser: 'html', plugins: [P.html] };
    case 'markdown': return { parser: 'markdown', plugins: [P.markdown] };
    case 'yaml': return { parser: 'yaml', plugins: [P.yaml] };
    default: return byExt(path || '');
  }
}

// Formatea texto con Prettier. Lanza un error con .unsupported si el tipo no aplica.
async function runPrettier(text, langId, path) {
  await loadPrettier();
  const cfg = prettierConfigFor(langId, path);
  if (!cfg) { const e = new Error('unsupported'); e.unsupported = true; throw e; }
  const tabSize = (monacoEditor && monacoEditor.getModel()) ? monacoEditor.getModel().getOptions().tabSize : 2;
  return _prettier.format(text, { parser: cfg.parser, plugins: cfg.plugins, tabWidth: tabSize || 2 });
}

// Registra/quita los proveedores de formato de Monaco según esté activa la extensión.
function registerPrettierProviders() {
  if (!monaco || prettierDisposables.length) return;
  for (const langId of PRETTIER_LANGS) {
    const d = monaco.languages.registerDocumentFormattingEditProvider(langId, {
      async provideDocumentFormattingEdits(model) {
        try {
          const formatted = await runPrettier(model.getValue(), langId, model.uri ? model.uri.path : '');
          if (formatted == null) return [];
          return [{ range: model.getFullModelRange(), text: formatted }];
        } catch (e) {
          if (!e || !e.unsupported) console.warn('[prettier]', (e && e.message) || e);
          return [];
        }
      },
    });
    prettierDisposables.push(d);
  }
}
function disposePrettierProviders() {
  for (const d of prettierDisposables) { try { d.dispose(); } catch (e) {} }
  prettierDisposables.length = 0;
}
// Llamado desde applyExtensions(): activa o desactiva Prettier.
function applyPrettier() {
  if (extActive('hydra-format')) onMonacoReady(registerPrettierProviders);
  else disposePrettierProviders();
}

// Formatea el documento activo. silent=true para format-on-save (sin toasts).
async function formatActiveDocument(silent) {
  if (!activeTab) return false;
  const tab = tabs.get(activeTab);
  if (!tab || tab.kind !== 'text' || !monacoEditor || !monacoEditor.getModel()) return false;
  const ext = getExtById('hydra-format');
  if (!extActive('hydra-format')) {
    if (!silent) showModal('Prettier', 'Instalá y activá la extensión "Prettier" desde la sección Extensiones para formatear código.', null, true, 'Cerrar');
    return false;
  }
  const model = monacoEditor.getModel();
  const langId = model.getLanguageId();
  let formatted;
  try { formatted = await runPrettier(model.getValue(), langId, activeTab); }
  catch (e) {
    if (e && e.unsupported) { if (!silent) showToast(ext, 'Prettier no formatea este tipo de archivo.', 'circle-slash', '#e5a00d'); return false; }
    if (!silent) showToast(ext, 'No se pudo formatear: ' + ((e && e.message) || e), 'error', '#ff7a8a');
    return false;
  }
  if (formatted == null || formatted === model.getValue()) {
    if (!silent) showToast(ext, 'El archivo ya estaba formateado.', 'check', '#2ff0c4');
    return true;
  }
  // Aplicar como edición (mantiene el historial de deshacer y la posición del cursor).
  const sel = monacoEditor.getSelection();
  monacoEditor.pushUndoStop();
  monacoEditor.executeEdits('prettier', [{ range: model.getFullModelRange(), text: formatted }]);
  monacoEditor.pushUndoStop();
  if (sel) { try { monacoEditor.setSelection(sel); } catch (e) {} }
  if (!silent) showToast(ext, 'Formateado con Prettier', 'check', '#2ff0c4');
  return true;
}

// --------------------------------------------------------------------------
// Control de código fuente (SCM) — estado de Git, stage/commit.
// --------------------------------------------------------------------------
const SCM_LABEL = { M: 'Modificado', A: 'Agregado', D: 'Eliminado', R: 'Renombrado', C: 'Copiado', U: 'En conflicto', '?': 'Sin seguimiento' };

function scmMsg(icon, text, extra) {
  return '<div class="scm-empty"><i class="codicon codicon-' + icon + '"></i><p>' + escapeHtml(text) + '</p>' + (extra || '') + '</div>';
}

// Une la raíz del repo con una ruta relativa de git (respeta separador de Windows).
function scmAbs(rel) {
  const sep = rootDir.includes('\\') ? '\\' : '/';
  return rootDir.replace(/[\\/]$/, '') + sep + rel.replace(/\//g, sep);
}

// Convierte la salida de `git status --porcelain -b` en datos para la UI.
function parseGitStatus(raw) {
  let branch = '', ahead = 0, behind = 0;
  const staged = [], changes = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    if (line.startsWith('## ')) {
      const info = line.slice(3);
      const m = info.match(/^(?:No commits yet on )?(.+?)(?:\.\.\.|\s|$)/);
      branch = m ? m[1] : info;
      const a = info.match(/ahead (\d+)/); if (a) ahead = +a[1];
      const b = info.match(/behind (\d+)/); if (b) behind = +b[1];
      continue;
    }
    const x = line[0], y = line[1];
    let p = line.slice(3);
    if (p.includes(' -> ')) p = p.split(' -> ')[1]; // renombrados: nombre nuevo
    if (x === '?' && y === '?') { changes.push({ path: p, code: '?' }); continue; }
    if (x !== ' ' && x !== '?') staged.push({ path: p, code: x });
    if (y !== ' ' && y !== '?') changes.push({ path: p, code: y });
  }
  return { branch, ahead, behind, staged, changes };
}

let scmLoading = false;
async function renderScm() {
  const pane = el('scm-pane');
  if (!pane) return;
  if (!rootDir) { pane.innerHTML = scmMsg('folder-opened', 'Abrí una carpeta para usar el control de código fuente.'); return; }
  if (scmLoading) return;
  scmLoading = true;
  let res;
  try { res = await window.api.gitStatus(rootDir); } catch (e) { res = { error: String(e) }; }
  scmLoading = false;

  if (res && res.error === 'not-a-repo') {
    pane.innerHTML = scmMsg('source-control', 'Esta carpeta no es un repositorio Git.',
      '<button class="primary-btn" id="scm-init">Inicializar repositorio</button>');
    const b = el('scm-init'); if (b) b.onclick = async () => { await window.api.gitInit(rootDir); renderScm(); updateScmBadge(); };
    return;
  }
  if (res && res.error === 'no-git') { pane.innerHTML = scmMsg('warning', 'Git no está instalado o no está en el PATH.'); return; }
  if (!res || res.error) { pane.innerHTML = scmMsg('error', 'No se pudo leer el estado: ' + ((res && res.error) || 'error')); return; }

  const st = parseGitStatus(res.raw);
  const sync = (st.ahead ? ' ↑' + st.ahead : '') + (st.behind ? ' ↓' + st.behind : '');

  const fileRow = (f, kind) => {
    const label = SCM_LABEL[f.code] || f.code;
    const name = f.path.split('/').pop();
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    const actions = kind === 'staged'
      ? '<button class="scm-ic" data-act="unstage" title="Quitar de preparados"><i class="codicon codicon-remove"></i></button>'
      : (f.code !== '?' ? '<button class="scm-ic" data-act="discard" title="Descartar cambios"><i class="codicon codicon-discard"></i></button>' : '') +
        '<button class="scm-ic" data-act="stage" title="Preparar cambios"><i class="codicon codicon-add"></i></button>';
    return '<div class="scm-file" data-path="' + escapeHtml(f.path) + '" data-kind="' + kind + '" title="' + escapeHtml(f.path) + ' · ' + label + '">' +
      '<span class="scm-code scm-' + (f.code === '?' ? 'U' : f.code) + '">' + (f.code === '?' ? 'U' : f.code) + '</span>' +
      '<span class="scm-name">' + escapeHtml(name) + '</span>' +
      (dir ? '<span class="scm-dir">' + escapeHtml(dir) + '</span>' : '') +
      '<span class="scm-file-actions">' + actions + '</span>' +
    '</div>';
  };

  let html =
    '<div class="scm-branch"><i class="codicon codicon-git-branch"></i> ' + escapeHtml(st.branch || 'main') +
      (sync ? '<span class="scm-sync">' + sync + '</span>' : '') + '</div>' +
    '<div class="scm-commit">' +
      '<textarea id="scm-msg" rows="2" placeholder="Mensaje (Ctrl+Enter para confirmar)"></textarea>' +
      '<button class="primary-btn" id="scm-commit"><i class="codicon codicon-check"></i> Confirmar (' + st.staged.length + ')</button>' +
    '</div>';

  if (!st.staged.length && !st.changes.length) {
    html += '<div class="scm-clean"><i class="codicon codicon-check-all"></i> No hay cambios.</div>';
  }
  if (st.staged.length) {
    html += '<div class="scm-section"><span>Cambios preparados</span>' +
      '<button class="scm-ic" id="scm-unstage-all" title="Quitar todo"><i class="codicon codicon-remove"></i></button></div>';
    for (const f of st.staged) html += fileRow(f, 'staged');
  }
  if (st.changes.length) {
    html += '<div class="scm-section"><span>Cambios</span>' +
      '<button class="scm-ic" id="scm-stage-all" title="Preparar todo"><i class="codicon codicon-add"></i></button></div>';
    for (const f of st.changes) html += fileRow(f, 'changes');
  }
  pane.innerHTML = html;

  // Confirmar (commit).
  const doCommit = async () => {
    const msg = el('scm-msg').value.trim();
    if (!st.staged.length) { showModal('Confirmar', 'No hay cambios preparados. Prepará archivos con el botón "+".', null, true, 'Entendido'); return; }
    if (!msg) { showModal('Confirmar', 'Escribí un mensaje para el commit.', null, true, 'Entendido'); el('scm-msg').focus(); return; }
    const r = await window.api.gitCommit(rootDir, msg);
    if (r && r.ok) { renderScm(); updateScmBadge(); if (extActive('hydra-git') && tabs.has(GITGRAPH_KEY)) renderGitGraph(); }
    else showModal('Confirmar', 'No se pudo confirmar: ' + ((r && r.error) || 'error'), null, true, 'Cerrar');
  };
  el('scm-commit').onclick = doCommit;
  el('scm-msg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doCommit(); } });

  const sa = el('scm-stage-all'); if (sa) sa.onclick = async () => { await window.api.gitStage(rootDir, null); renderScm(); updateScmBadge(); };
  const ua = el('scm-unstage-all'); if (ua) ua.onclick = async () => { await window.api.gitUnstage(rootDir, null); renderScm(); updateScmBadge(); };

  for (const row of pane.querySelectorAll('.scm-file')) {
    const path = row.dataset.path;
    row.querySelector('.scm-name').onclick = () => { try { openFile(scmAbs(path), path.split('/').pop()); } catch (e) {} };
    for (const btn of row.querySelectorAll('[data-act]')) {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'stage') await window.api.gitStage(rootDir, path);
        else if (act === 'unstage') await window.api.gitUnstage(rootDir, path);
        else if (act === 'discard') {
          const ok = await showConfirm('Descartar cambios', '¿Descartar los cambios de "' + path + '"? No se puede deshacer.', 'Descartar', true);
          if (!ok) return;
          await window.api.gitDiscard(rootDir, path);
          const t = tabs.get(scmAbs(path)); if (t) { try { await reloadTabFromDisk(scmAbs(path)); } catch (e) {} }
        }
        renderScm(); updateScmBadge();
      };
    }
  }
}

// Actualiza el contador del icono SCM en la barra de actividad.
async function updateScmBadge() {
  const act = document.querySelector('.act[data-view="scm"]');
  if (!act) return;
  let badge = act.querySelector('.act-badge');
  let n = 0;
  if (rootDir) {
    try {
      const res = await window.api.gitStatus(rootDir);
      if (res && res.ok) { const st = parseGitStatus(res.raw); n = st.staged.length + st.changes.length; }
    } catch (e) {}
  }
  if (n > 0) {
    if (!badge) { badge = document.createElement('span'); badge.className = 'act-badge'; act.appendChild(badge); }
    badge.textContent = n > 99 ? '99+' : String(n);
  } else if (badge) { badge.remove(); }
}

// Recarga el contenido de una pestaña desde el disco (tras descartar cambios).
async function reloadTabFromDisk(path) {
  const tab = tabs.get(path);
  if (!tab || tab.kind !== 'text') return;
  const content = await window.api.readFile(path);
  if (tab.model) tab.model.setValue(content);
  tab.content = content; tab.dirty = false;
  renderTabs();
}

// --------------------------------------------------------------------------
// Ejecutar y depurar — ejecuta el archivo activo en la terminal integrada.
// --------------------------------------------------------------------------
// Mapa de cómo ejecutar cada tipo de archivo. {} = comando a partir del path.
function runnerFor(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const q = '"' + path + '"';
  switch (ext) {
    case 'js': case 'cjs': case 'mjs': return { cmd: 'node ' + q, label: 'Node.js' };
    case 'ts': return { cmd: 'npx ts-node ' + q, label: 'ts-node' };
    case 'py': {
      const info = (typeof pythonSelectedInfo === 'function') ? pythonSelectedInfo() : null;
      return { cmd: pythonCmd() + ' ' + q, label: info ? 'Python ' + info.version : 'Python' };
    }
    case 'rb': return { cmd: 'ruby ' + q, label: 'Ruby' };
    case 'php': return { cmd: 'php ' + q, label: 'PHP' };
    case 'go': return { cmd: 'go run ' + q, label: 'Go' };
    case 'sh': return { cmd: 'bash ' + q, label: 'Bash' };
    case 'ps1': return { cmd: 'powershell -File ' + q, label: 'PowerShell' };
    case 'java': return { cmd: 'java ' + q, label: 'Java' };
    case 'html': case 'htm': return { cmd: null, label: 'Navegador / Live Server', html: true };
    default: return null;
  }
}

function renderDebug() {
  const pane = el('debug-pane');
  if (!pane) return;
  const tab = activeTab && tabs.get(activeTab);
  const isText = tab && tab.kind === 'text';
  const name = isText ? (tab.name || activeTab.split(/[\\/]/).pop()) : '';
  const runner = isText ? runnerFor(activeTab) : null;

  let html = '<div class="dbg-head"><i class="codicon codicon-debug-alt"></i> Ejecutar y depurar</div>';
  if (!isText) {
    html += scmMsg('run-all', 'Abrí un archivo de código para ejecutarlo.');
    pane.innerHTML = html; return;
  }
  html += '<div class="dbg-file"><i class="codicon codicon-file-code"></i> ' + escapeHtml(name) + '</div>';
  if (!runner) {
    html += '<div class="dbg-note">No hay un intérprete configurado para este tipo de archivo.</div>';
    pane.innerHTML = html; return;
  }
  html +=
    '<button class="dbg-run" id="dbg-run"><i class="codicon codicon-play"></i> Ejecutar archivo</button>' +
    '<div class="dbg-runner">Intérprete: <b>' + escapeHtml(runner.label) + '</b></div>' +
    (runner.html ? '' : '<div class="dbg-cmd"><code>' + escapeHtml(runner.cmd) + '</code></div>') +
    '<div class="dbg-note">El programa se ejecuta en la terminal integrada.</div>';
  pane.innerHTML = html;

  el('dbg-run').onclick = () => {
    if (runner.html) {
      if (extActive('hydra-live')) startLiveFor(htmlRelOf(activeTab));
      else { try { window.api.openPath(activeTab); } catch (e) {} }
      return;
    }
    // Guardar antes de ejecutar para correr la última versión.
    if (tab.dirty) saveActive();
    aiRunInTerminal(runner.cmd);
  };
}

// --------------------------------------------------------------------------
// Selector rápido genérico (estilo "quick pick" de VS Code), reusa #quick-overlay.
// items: [{ label, description, icon, value }]. Resuelve al value elegido o null.
// --------------------------------------------------------------------------
function showQuickPick(items, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const overlay = el('quick-overlay');
    const input = el('quick-input');
    const list = el('quick-list');
    overlay.hidden = false;
    input.value = '';
    input.placeholder = opts.placeholder || 'Elegí una opción';
    let done = false;
    const finish = (val) => { if (done) return; done = true; overlay.hidden = true; input.oninput = null; input.onkeydown = null; overlay.onclick = null; if (monacoEditor) try { monacoEditor.focus(); } catch (e) {} resolve(val); };

    const draw = () => {
      const q = input.value.toLowerCase();
      const filtered = items.filter((it) => !q || (it.label + ' ' + (it.description || '')).toLowerCase().includes(q));
      list.innerHTML = '';
      if (!filtered.length) { list.innerHTML = '<div class="qempty">Sin resultados</div>'; return; }
      filtered.forEach((it, i) => {
        const div = document.createElement('div');
        div.className = 'qitem' + (i === 0 ? ' sel' : '');
        const ic = codicon(it.icon || 'circle-small'); ic.classList.add('codicon');
        const lab = document.createElement('span'); lab.textContent = it.label;
        div.append(ic, lab);
        if (it.description) { const d = document.createElement('span'); d.className = 'qitem-desc'; d.textContent = it.description; div.appendChild(d); }
        div.onclick = () => finish(it.value);
        list.appendChild(div);
      });
    };
    input.oninput = draw;
    input.onkeydown = (e) => {
      if (e.key === 'Escape') finish(null);
      else if (e.key === 'Enter') { const sel = list.querySelector('.sel'); if (sel) sel.click(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveQuickSel(list, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveQuickSel(list, -1); }
    };
    overlay.onclick = (e) => { if (e.target === overlay) finish(null); };
    draw();
    setTimeout(() => input.focus(), 0);
  });
}

// --------------------------------------------------------------------------
// Extensión Python: intérpretes, ejecutar, REPL, pip.
// --------------------------------------------------------------------------
let pythonInterpreters = [];     // [{ path, version }]
let pythonSelected = null;       // ruta del intérprete elegido (o null)
let pythonDetecting = false;

// Comando del intérprete (ruta entre comillas) o 'python' por defecto.
function pythonCmd() { return pythonSelected ? '"' + pythonSelected + '"' : 'python'; }
// Versión legible del intérprete seleccionado.
function pythonSelectedInfo() { return pythonInterpreters.find((i) => i.path === pythonSelected) || null; }

// Detecta los intérpretes instalados (cachea en pythonInterpreters).
async function detectPython(force) {
  if (pythonDetecting) return pythonInterpreters;
  if (pythonInterpreters.length && !force) return pythonInterpreters;
  pythonDetecting = true;
  try {
    const res = await window.api.pythonDetect();
    pythonInterpreters = (res && res.interpreters) || [];
  } catch (e) { pythonInterpreters = []; }
  pythonDetecting = false;
  // Elegir uno por defecto si no había selección válida.
  if (!pythonSelected || !pythonInterpreters.some((i) => i.path === pythonSelected)) {
    pythonSelected = pythonInterpreters.length ? pythonInterpreters[0].path : null;
    if (pythonSelected) saveState({ pythonInterpreter: pythonSelected });
  }
  renderPythonStatus();
  return pythonInterpreters;
}

// Abre el selector de intérprete (quick pick).
async function pickPythonInterpreter() {
  if (!extActive('hydra-python')) return;
  el('status-python').classList.add('busy');
  await detectPython(true);
  el('status-python').classList.remove('busy');
  if (!pythonInterpreters.length) {
    showModal('Python', 'No se encontró ningún intérprete de Python en el sistema. Instalá Python desde python.org y reintentá.', null, true, 'Entendido');
    return;
  }
  const items = pythonInterpreters.map((i) => ({
    label: 'Python ' + i.version, description: i.path, icon: 'symbol-misc', value: i.path,
  }));
  const chosen = await showQuickPick(items, { placeholder: 'Seleccioná un intérprete de Python' });
  if (chosen) {
    pythonSelected = chosen;
    saveState({ pythonInterpreter: pythonSelected });
    renderPythonStatus();
    if (currentView === 'python') renderPython();
    const info = pythonSelectedInfo();
    showToast(getExtById('hydra-python'), 'Intérprete: Python ' + (info ? info.version : ''), 'check', '#4b8bd6');
  }
}

// Ítem de la barra de estado con la versión seleccionada (clic → elegir).
function renderPythonStatus() {
  const item = el('status-python');
  if (!item) return;
  const info = pythonSelectedInfo();
  item.innerHTML = '';
  item.append(codicon('symbol-misc'), document.createTextNode(info ? ' Python ' + info.version : ' Seleccionar intérprete'));
}

// Ejecuta el archivo Python activo en la terminal con el intérprete elegido.
function runPythonFile() {
  if (!activeTab || !tabs.get(activeTab) || tabs.get(activeTab).kind !== 'text') {
    showModal('Python', 'Abrí un archivo .py para ejecutarlo.', null, true, 'Entendido'); return;
  }
  if (!/\.py$/i.test(activeTab)) {
    showModal('Python', 'El archivo activo no es un archivo Python (.py).', null, true, 'Entendido'); return;
  }
  const tab = tabs.get(activeTab);
  if (tab.dirty) saveActive();
  aiRunInTerminal(pythonCmd() + ' "' + activeTab + '"');
}

// Abre un REPL interactivo de Python en la terminal.
function openPythonRepl() {
  aiRunInTerminal(pythonCmd());
}

// Instala un paquete con pip (pregunta el nombre con la UI propia).
async function pipInstall() {
  const pkg = await showModal('Instalar paquete (pip)', '', 'Ej: requests, numpy, flask');
  if (!pkg) return;
  aiRunInTerminal(pythonCmd() + ' -m pip install ' + pkg);
}

// Renderiza la vista lateral de Python.
async function renderPython() {
  const pane = el('python-pane');
  if (!pane) return;
  pane.innerHTML = '<div class="py-loading"><i class="codicon codicon-loading codicon-modifier-spin"></i> Detectando Python…</div>';
  await detectPython();
  const info = pythonSelectedInfo();
  const fileOk = activeTab && /\.py$/i.test(activeTab);
  const fileName = fileOk ? activeTab.split(/[\\/]/).pop() : '';

  let html = '';
  // Sección: intérprete.
  html +=
    '<div class="py-section">Intérprete</div>' +
    '<div class="py-interp" id="py-pick">' +
      '<i class="codicon codicon-symbol-misc"></i>' +
      '<div class="py-interp-text">' +
        (info ? '<b>Python ' + escapeHtml(info.version) + '</b><small>' + escapeHtml(info.path) + '</small>'
              : (pythonInterpreters.length ? '<b>Seleccionar intérprete</b>' : '<b>Python no encontrado</b><small>Instalá Python y actualizá</small>')) +
      '</div>' +
      '<i class="codicon codicon-chevron-down"></i>' +
    '</div>';

  // Sección: acciones.
  html += '<div class="py-section">Acciones</div><div class="py-actions">';
  html += '<button class="py-btn run" id="py-run"' + (fileOk ? '' : ' disabled') + '><i class="codicon codicon-play"></i> ' +
    (fileOk ? 'Ejecutar ' + escapeHtml(fileName) : 'Ejecutar archivo Python') + '</button>';
  html += '<button class="py-btn" id="py-repl"><i class="codicon codicon-terminal"></i> Abrir REPL de Python</button>';
  html += '<button class="py-btn" id="py-pip"><i class="codicon codicon-package"></i> Instalar paquete (pip)</button>';
  html += '</div>';

  // Sección: intérpretes detectados.
  if (pythonInterpreters.length) {
    html += '<div class="py-section">Detectados (' + pythonInterpreters.length + ')</div><div class="py-list">';
    for (const i of pythonInterpreters) {
      const sel = i.path === pythonSelected;
      html += '<div class="py-item' + (sel ? ' sel' : '') + '" data-path="' + escapeHtml(i.path) + '">' +
        '<i class="codicon codicon-' + (sel ? 'pass-filled' : 'circle-large-outline') + '"></i>' +
        '<span class="py-item-v">Python ' + escapeHtml(i.version) + '</span>' +
        '<span class="py-item-p">' + escapeHtml(i.path) + '</span></div>';
    }
    html += '</div>';
  }
  pane.innerHTML = html;

  el('py-pick').onclick = pickPythonInterpreter;
  el('py-run').onclick = runPythonFile;
  el('py-repl').onclick = openPythonRepl;
  el('py-pip').onclick = pipInstall;
  for (const it of pane.querySelectorAll('.py-item')) {
    it.onclick = () => {
      pythonSelected = it.dataset.path;
      saveState({ pythonInterpreter: pythonSelected });
      renderPythonStatus(); renderPython();
    };
  }
}

// Activa/desactiva la extensión Python (botón de actividad + barra de estado).
function applyPython() {
  const on = extActive('hydra-python');
  const btn = el('act-python');
  if (btn) btn.hidden = !on;
  const status = el('status-python');
  if (status) status.hidden = !on;
  if (on) {
    renderPythonStatus();
    detectPython(); // detección en segundo plano
  } else if (currentView === 'python') {
    showView('explorer'); // si estaba en la vista de Python, volver al explorador
  }
}

// --------------------------------------------------------------------------
// Hydra Assist: autocompletado de código con IA (texto fantasma en el editor).
// Usa el motor de IA propio de Hydra.
// --------------------------------------------------------------------------
let copilotDisposable = null;   // proveedor de inline completions registrado
let copilotPaused = false;      // pausa temporal (clic en la barra de estado)
let copilotInFlight = false;    // evita pedidos solapados

// Registra el proveedor de sugerencias en línea de Monaco.
function registerCopilotProvider() {
  if (!monaco || copilotDisposable) return;
  copilotDisposable = monaco.languages.registerInlineCompletionsProvider('*', {
    async provideInlineCompletions(model, position, context, token) {
      if (!extActive('hydra-assist') || copilotPaused) return { items: [] };
      // Debounce: si el usuario sigue escribiendo, este pedido se cancela antes de llamar a la IA.
      await new Promise((r) => setTimeout(r, 400));
      if (token.isCancellationRequested) return { items: [] };
      const offset = model.getOffsetAt(position);
      const full = model.getValue();
      const prefix = full.slice(0, offset);
      const suffix = full.slice(offset);
      if (prefix.trim().length < 2) return { items: [] };
      copilotInFlight = true; renderCopilotStatus();
      let res = null;
      try { res = await window.api.aiComplete(prefix, suffix, model.getLanguageId()); }
      catch (e) { res = null; }
      copilotInFlight = false; renderCopilotStatus();
      if (token.isCancellationRequested) return { items: [] };
      let text = (res && res.text) || '';
      if (!text || !text.trim()) return { items: [] };
      // No sugerir si solo repite lo que ya está escrito al inicio.
      return {
        items: [{
          insertText: text,
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        }],
      };
    },
    freeInlineCompletions() {},
  });
}
function disposeCopilotProvider() {
  if (copilotDisposable) { try { copilotDisposable.dispose(); } catch (e) {} copilotDisposable = null; }
}

// Ítem de la barra de estado de Hydra Assist (clic → pausar/reanudar).
function renderCopilotStatus() {
  const item = el('status-copilot');
  if (!item) return;
  item.innerHTML = '';
  const ic = codicon(copilotInFlight ? 'loading' : (copilotPaused ? 'circle-slash' : 'sparkle'));
  if (copilotInFlight) ic.classList.add('codicon-modifier-spin');
  item.append(ic, document.createTextNode(' Assist' + (copilotPaused ? ' (pausado)' : '')));
  item.classList.toggle('paused', copilotPaused);
  item.title = copilotPaused ? 'Hydra Assist pausado — clic para reanudar' : 'Hydra Assist activo — clic para pausar';
}

// Activa/desactiva Hydra Assist según la extensión.
function applyCopilot() {
  const on = extActive('hydra-assist');
  const item = el('status-copilot');
  if (item) item.hidden = !on;
  if (on) {
    onMonacoReady(() => {
      registerCopilotProvider();
      if (monacoEditor) monacoEditor.updateOptions({ inlineSuggest: { enabled: true } });
    });
    renderCopilotStatus();
  } else {
    disposeCopilotProvider();
  }
}

// Pausa o reanuda las sugerencias.
function toggleCopilotPause() {
  copilotPaused = !copilotPaused;
  renderCopilotStatus();
  const ext = getExtById('hydra-assist');
  if (ext) showToast(ext, copilotPaused ? 'Sugerencias pausadas' : 'Sugerencias activas', copilotPaused ? 'circle-slash' : 'sparkle', copilotPaused ? '#e5a00d' : '#2ff0c4');
}

// --------------------------------------------------------------------------
// Color Themes: temas de color para la interfaz y el editor (extensión).
// --------------------------------------------------------------------------
// Cada tema se arma desde un conjunto compacto de colores "semilla" y se expande
// al mapa completo de variables CSS de la UI + colores del editor Monaco.
function buildTheme(s) {
  return {
    id: s.id, name: s.name, dark: s.dark !== false, accent: s.accent,
    base: s.dark === false ? 'vs' : 'vs-dark',
    // Variables CSS de la interfaz (las que dependen del acento las pone applyAccent).
    ui: {
      '--titlebar-bg': s.bg2, '--activitybar-bg': s.bg, '--activitybar-fg': s.dim,
      '--activitybar-fg-active': s.text, '--sidebar-bg': s.bg2, '--sidebar-section-fg': s.dim,
      '--editor-bg': s.bg, '--tab-active-bg': s.bg, '--tab-inactive-bg': s.bg3, '--tab-border': s.bg2,
      '--tabs-bar-bg': s.bg2, '--text': s.text, '--text-dim': s.dim, '--hover-bg': s.hover,
      '--list-active-inactive-bg': s.bg3, '--border': s.border, '--scrollbar': s.border,
      '--menu-bg': s.bg3, '--menu-hover': s.hover, '--menu-border': s.border, '--widget-bg': s.bg3,
      '--panel-bg': s.bg, '--statusbar-fg': s.statusFg || '#ffffff',
    },
    // Colores del editor Monaco.
    editor: {
      'editor.background': s.bg, 'editor.foreground': s.text, 'editorCursor.foreground': s.accent,
      'editor.lineHighlightBackground': s.bg3, 'editor.selectionBackground': s.sel || s.hover,
      'editorLineNumber.foreground': s.dim, 'editorLineNumber.activeForeground': s.text,
      'editorIndentGuide.background1': s.border, 'editorIndentGuide.activeBackground1': s.dim,
      'editorWidget.background': s.bg3, 'editorWidget.border': s.border,
      'editorSuggestWidget.background': s.bg3, 'editorSuggestWidget.selectedBackground': s.hover,
      'minimap.background': s.bg, 'scrollbarSlider.background': s.border + 'aa',
    },
    swatches: [s.bg, s.bg2, s.text, s.accent], // muestra para la galería
  };
}

const COLOR_THEMES = [
  buildTheme({ id: 'hydra-dark', name: 'Hydra Dark', accent: '#7c6bff',
    bg: '#14151b', bg2: '#181a21', bg3: '#1c1e27', text: '#c8ccda', dim: '#6b7186',
    hover: '#23262f', border: '#2c2f3a', sel: '#3a356b' }),
  buildTheme({ id: 'midnight', name: 'Midnight Blue', accent: '#3b8eea',
    bg: '#0d1117', bg2: '#11161d', bg3: '#161b22', text: '#c9d1d9', dim: '#6e7681',
    hover: '#1c2230', border: '#21262d', sel: '#1f3b5c' }),
  buildTheme({ id: 'monokai', name: 'Monokai', accent: '#a6e22e',
    bg: '#272822', bg2: '#23241e', bg3: '#2f3129', text: '#f8f8f2', dim: '#75715e',
    hover: '#3a3c33', border: '#3e4039', sel: '#49483e' }),
  buildTheme({ id: 'dracula', name: 'Dracula', accent: '#bd93f9',
    bg: '#282a36', bg2: '#21222c', bg3: '#2f313f', text: '#f8f8f2', dim: '#6272a4',
    hover: '#3a3c4e', border: '#44475a', sel: '#44475a' }),
  buildTheme({ id: 'solarized', name: 'Solarized Dark', accent: '#2aa198',
    bg: '#002b36', bg2: '#00252e', bg3: '#073642', text: '#93a1a1', dim: '#586e75',
    hover: '#0a3d4a', border: '#0e4451', sel: '#0e4d5c' }),
  buildTheme({ id: 'light', name: 'Light', accent: '#3b8eea', dark: false, statusFg: '#ffffff',
    bg: '#ffffff', bg2: '#f3f3f3', bg3: '#ececec', text: '#1f2328', dim: '#6e7781',
    hover: '#e8e8e8', border: '#d0d7de', sel: '#cfe3fb' }),
];

// Aplica un tema completo: acento + variables de UI + tema del editor Monaco.
function applyColorTheme(theme, silent) {
  if (!theme) return;
  const r = document.documentElement.style;
  applyAccent(theme.accent || appSettings.accent); // pone --accent y derivados (statusbar, etc.)
  const ui = theme.ui || {};
  for (const k in ui) r.setProperty(k, ui[k]);      // colores de superficie del tema
  document.documentElement.classList.toggle('theme-light', theme.dark === false);
  onMonacoReady(() => {
    const id = 'hydra-theme-' + theme.id;
    try {
      monaco.editor.defineTheme(id, { base: theme.base || 'vs-dark', inherit: true, rules: [], colors: theme.editor || {} });
      monaco.editor.setTheme(id);
    } catch (e) {}
  });
  appSettings.theme = theme.id;
  if (!silent) saveState({ settings: appSettings });
}

// Vuelve al aspecto por defecto (cuando se desactiva la extensión).
function resetColorTheme() {
  const r = document.documentElement.style;
  for (const k in (COLOR_THEMES[0].ui || {})) r.removeProperty(k); // que mande el :root del CSS
  document.documentElement.classList.remove('theme-light');
  applyAccent(appSettings.accent || DEFAULT_SETTINGS.accent);
  onMonacoReady(() => { try { monaco.editor.setTheme('hydra-dark'); } catch (e) {} });
}

// Activa/desactiva la extensión Color Themes.
function applyThemes() {
  const on = extActive('hydra-themes');
  const item = el('status-themes');
  if (item) item.hidden = !on;
  if (on) {
    const t = COLOR_THEMES.find((x) => x.id === appSettings.theme) || COLOR_THEMES[0];
    applyColorTheme(t, true); // al cargar: aplicar sin re-guardar
  } else {
    resetColorTheme();
  }
}

// Galería de temas: tarjetas con vista previa; al clic se aplica al instante.
function openThemePicker() {
  document.querySelectorAll('.theme-overlay').forEach((o) => o.remove());
  const ov = document.createElement('div');
  ov.className = 'overlay pub-overlay theme-overlay';
  const cur = appSettings.theme || 'hydra-dark';
  let cards = '';
  for (const t of COLOR_THEMES) {
    const sw = (t.swatches || []).map((c) => '<span class="theme-sw" style="background:' + c + '"></span>').join('');
    cards += '<button class="theme-card' + (t.id === cur ? ' active' : '') + '" data-id="' + t.id + '">' +
      '<div class="theme-prev" style="background:' + (t.ui['--editor-bg'] || '#14151b') + ';border-color:' + (t.ui['--border'] || '#2c2f3a') + '">' +
        '<span class="theme-prev-bar" style="background:' + (t.ui['--sidebar-bg'] || '#181a21') + '"></span>' +
        '<span class="theme-prev-dot" style="background:' + t.accent + '"></span>' +
      '</div>' +
      '<div class="theme-meta"><span class="theme-name">' + escapeHtml(t.name) + '</span>' +
        '<span class="theme-sws">' + sw + '</span></div>' +
      (t.id === cur ? '<i class="codicon codicon-check theme-check"></i>' : '') +
    '</button>';
  }
  ov.innerHTML =
    '<div class="pub-card theme-card-wrap">' +
      '<div class="pub-head"><i class="codicon codicon-symbol-color"></i> Temas de color<button class="pub-x" title="Cerrar"><i class="codicon codicon-close"></i></button></div>' +
      '<div class="pub-body"><div class="theme-grid">' + cards + '</div></div>' +
      '<div class="pub-foot"><button class="ext-btn" id="theme-done">Listo</button></div>' +
    '</div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.pub-x').onclick = close;
  ov.querySelector('#theme-done').onclick = close;
  for (const card of ov.querySelectorAll('.theme-card')) {
    card.onclick = () => {
      const t = COLOR_THEMES.find((x) => x.id === card.dataset.id);
      if (!t) return;
      applyColorTheme(t);
      // Marcar la tarjeta activa.
      ov.querySelectorAll('.theme-card').forEach((c) => {
        c.classList.toggle('active', c === card);
        const chk = c.querySelector('.theme-check'); if (chk) chk.remove();
      });
      card.insertAdjacentHTML('beforeend', '<i class="codicon codicon-check theme-check"></i>');
      const ext = getExtById('hydra-themes'); if (ext) showToast(ext, 'Tema: ' + t.name, 'symbol-color', t.accent);
    };
  }
}

// --------------------------------------------------------------------------
// Hydra Team: programación en equipo (carpeta compartida, sync con servidor #2).
// --------------------------------------------------------------------------
let teamGroup = null;          // grupo activo { id, code, name, ... }
let teamRole = null;           // 'owner' | 'member'
let teamBase = null;           // carpeta local raíz de la sesión (abs)
let teamChannel = null;        // canal realtime
let teamHeartbeatTimer = null;
let teamViewTimer = null;      // refresco de la vista mientras está abierta
const teamSuppress = new Set();// rutas que estamos aplicando desde remoto (evita eco)
// --- Colaboración en vivo (cursores, presencia, co-edición) ---------------
const teamPresence = new Map();   // email -> { file(rel), color, name }
const teamRemoteCursors = new Map(); // email -> { file(rel), line, col, sel, color, name }
let teamRemoteDecos = null;       // colección de decoraciones de cursores remotos (Monaco)
let teamApplyingEdit = false;     // flag anti-eco al aplicar deltas remotos
let teamCursorThrottle = 0;       // último envío de cursor (ms)
const TEAM_COLORS = ['#f14c4c', '#3b8eea', '#0dbc79', '#e5a00d', '#d670d6', '#11a8cd', '#ff7a59', '#a6e22e'];
function teamColorIdx(email) { let h = 0; const s = String(email || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % TEAM_COLORS.length; }
function teamColor(email) { return TEAM_COLORS[teamColorIdx(email)]; }
// Extensiones que NO se suben (binarios) y límite de tamaño.
const TEAM_BINARY = /\.(png|jpe?g|gif|ico|webp|bmp|svgz|pdf|zip|rar|7z|exe|dll|so|dylib|mp3|mp4|mov|avi|wav|ogg|ttf|otf|woff2?|class|jar|node)$/i;
const TEAM_MAX_BYTES = 200 * 1024;

function teamSignedIn() { return !!(window.HydraAuth && HydraAuth.getUser && HydraAuth.getUser()); }
function teamReady() { return !!(window.HydraAuth && HydraAuth.collab && HydraAuth.collab.ready()); }
function teamRel(abs) {
  if (!teamBase) return null;
  let r = abs.replace(/\\/g, '/');
  const base = teamBase.replace(/\\/g, '/').replace(/\/$/, '');
  if (!r.toLowerCase().startsWith(base.toLowerCase() + '/')) return null;
  return r.slice(base.length + 1);
}
function teamAbs(rel) {
  const sep = teamBase.includes('\\') ? '\\' : '/';
  return teamBase.replace(/[\\/]$/, '') + sep + String(rel).replace(/\//g, sep);
}
function teamUnder(abs) { return teamRel(abs) != null; }

// Recorre el árbol y devuelve { path(rel), content, isDir } de todo lo subible.
async function teamCollectFiles(rootAbs) {
  const tree = await window.api.tree(rootAbs);
  const out = [];
  const base = rootAbs.replace(/\\/g, '/').replace(/\/$/, '');
  const rel = (p) => p.replace(/\\/g, '/').slice(base.length + 1);
  async function walk(nodes) {
    for (const n of nodes || []) {
      if (n.type === 'dir') {
        out.push({ path: rel(n.path), content: '', isDir: true });
        await walk(n.children);
      } else if (!TEAM_BINARY.test(n.name)) {
        try {
          const content = await window.api.readFile(n.path);
          if (content != null && content.length <= TEAM_MAX_BYTES) out.push({ path: rel(n.path), content, isDir: false });
        } catch (e) {}
      }
    }
  }
  await walk(tree);
  return out;
}

// Aplica un cambio remoto de archivo a disco y al editor (sin reenviarlo).
async function teamApplyRemote(row) {
  if (!teamGroup || !teamBase || !row || !row.path) return;
  if (row.updated_by && row.updated_by === HydraAuth.getUser().email) return; // es mío
  const abs = teamAbs(row.path);
  teamSuppress.add(abs);
  try {
    if (row.deleted) {
      try { await window.api.delete(abs); } catch (e) {}
      closeTabByPath(abs);
    } else if (row.is_dir) {
      const parts = abs.split(/[\\/]/); const name = parts.pop(); const parent = parts.join('/');
      try { await window.api.createFolder(parent, name); } catch (e) {}
    } else {
      await window.api.aiWriteFile(abs, row.content || '');
      const tab = tabs.get(abs);
      if (tab && tab.model && tab.model.getValue() !== (row.content || '')) {
        const pos = (monacoEditor && activeTab === abs) ? monacoEditor.getPosition() : null;
        tab.model.setValue(row.content || '');
        tab.content = row.content || ''; tab.dirty = false;
        if (pos && monacoEditor) { try { monacoEditor.setPosition(pos); } catch (e) {} }
        renderTabs();
      }
    }
    if (rootDir === teamBase) await refreshTree();
    teamRenderRemoteCursors();
  } finally {
    setTimeout(() => teamSuppress.delete(abs), 900);
  }
}

// Empuja un cambio local al servidor (si el archivo está en la carpeta compartida).
function teamPushLocal(abs, content, opts) {
  if (!teamGroup || !teamReady()) return;
  if (teamSuppress.has(abs)) return;
  const rel = teamRel(abs);
  if (rel == null) return;
  HydraAuth.collab.pushFile(teamGroup.id, rel, content || '', !!(opts && opts.isDir), !!(opts && opts.deleted)).catch(() => {});
}

// --- Presencia: quién tiene qué archivo abierto (puntos en el árbol) -------
function teamOnPresence(state) {
  teamPresence.clear();
  const me = (HydraAuth.getUser() && HydraAuth.getUser().email) || null;
  for (const key in (state || {})) {
    const metas = state[key]; const p = metas && metas[metas.length - 1];
    if (!p || !p.email || p.email === me) continue;
    teamPresence.set(p.email, { file: p.file || null, color: p.color || teamColor(p.email), name: p.name || p.email.split('@')[0] });
  }
  teamRenderDots();
}
// Pinta un punto de color en el nodo del árbol que cada miembro tiene abierto.
function teamRenderDots() {
  const tree = el('tree'); if (!tree) return;
  tree.querySelectorAll('.presence-dot').forEach((d) => d.remove());
  if (!teamGroup) return;
  const byPath = new Map(); // abs -> [colors]
  for (const [, p] of teamPresence) {
    if (!p.file) continue;
    const abs = teamAbs(p.file);
    if (!byPath.has(abs)) byPath.set(abs, []);
    byPath.get(abs).push(p);
  }
  for (const [abs, people] of byPath) {
    const label = tree.querySelector('.node-label[data-path="' + (window.CSS && CSS.escape ? CSS.escape(abs) : abs) + '"]');
    if (!label) continue;
    for (const p of people.slice(0, 3)) {
      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      dot.style.background = p.color;
      dot.title = p.name;
      label.appendChild(dot);
    }
  }
}

// --- Cursores remotos en el editor ----------------------------------------
function teamOnRemoteCursor(p) {
  if (!p || !p.email) return;
  const me = (HydraAuth.getUser() && HydraAuth.getUser().email) || null;
  if (p.email === me) return;
  teamRemoteCursors.set(p.email, p);
  teamRenderRemoteCursors();
}
// Aplica decoraciones de los cursores cuyo archivo coincide con el activo.
function teamRenderRemoteCursors() {
  if (!monacoEditor || !activeTab) return;
  const relActive = teamRel(activeTab);
  const decos = [];
  if (relActive != null) {
    for (const [, c] of teamRemoteCursors) {
      if (!c || c.file !== relActive || !c.line) continue;
      const idx = teamColorIdx(c.email);
      // Selección (si hay).
      if (c.sel && (c.sel.sl !== c.sel.el || c.sel.sc !== c.sel.ec)) {
        decos.push({ range: new monaco.Range(c.sel.sl, c.sel.sc, c.sel.el, c.sel.ec), options: { className: 'rc-sel-' + idx } });
      }
      // Caret + nombre (etiqueta al inicio de la línea vía hover y clase).
      decos.push({
        range: new monaco.Range(c.line, c.col, c.line, c.col),
        options: { className: 'rc-caret-' + idx, beforeContentClassName: 'rc-caret-bar-' + idx, hoverMessage: { value: (c.name || c.email) }, stickiness: 1 },
      });
    }
  }
  if (!teamRemoteDecos) teamRemoteDecos = monacoEditor.createDecorationsCollection(decos);
  else teamRemoteDecos.set(decos);
}
// Transmite mi posición de cursor/selección a los demás (throttled).
function teamBroadcastCursor() {
  if (!teamGroup || !teamChannel || !monacoEditor || !activeTab) return;
  const rel = teamRel(activeTab); if (rel == null) return;
  const now = Date.now();
  if (now - teamCursorThrottle < 70) return;
  teamCursorThrottle = now;
  const pos = monacoEditor.getPosition(); const s = monacoEditor.getSelection();
  const st = teamPresenceState();
  HydraAuth.collab.send(teamChannel, 'cursor', {
    email: st.email, name: st.name, color: st.color, file: rel,
    line: pos ? pos.lineNumber : 1, col: pos ? pos.column : 1,
    sel: s ? { sl: s.startLineNumber, sc: s.startColumn, el: s.endLineNumber, ec: s.endColumn } : null,
  });
}

// --- Co-edición en vivo (deltas) ------------------------------------------
function teamBroadcastEdit(e) {
  if (!teamGroup || !teamChannel || teamApplyingEdit || !activeTab) return;
  const rel = teamRel(activeTab); if (rel == null) return;
  const changes = (e.changes || []).map((c) => ({ r: { sl: c.range.startLineNumber, sc: c.range.startColumn, el: c.range.endLineNumber, ec: c.range.endColumn }, t: c.text }));
  if (!changes.length) return;
  const st = teamPresenceState();
  HydraAuth.collab.send(teamChannel, 'edit', { email: st.email, file: rel, changes });
}
function teamOnRemoteEdit(p) {
  if (!p || !p.file || !p.changes) return;
  const me = (HydraAuth.getUser() && HydraAuth.getUser().email) || null;
  if (p.email === me) return;
  const abs = teamAbs(p.file);
  const tab = tabs.get(abs);
  if (!tab || !tab.model) return; // archivo no abierto: llegará por guardado completo
  teamApplyingEdit = true;
  try {
    const edits = p.changes.map((c) => ({ range: new monaco.Range(c.r.sl, c.r.sc, c.r.el, c.r.ec), text: c.t }));
    tab.model.applyEdits(edits);
    tab.content = tab.model.getValue();
  } catch (e) {} finally { teamApplyingEdit = false; }
}
// Limpia cursores/puntos remotos (al salir del grupo).
function teamClearRemote() {
  teamPresence.clear(); teamRemoteCursors.clear();
  if (teamRemoteDecos) { try { teamRemoteDecos.clear(); } catch (e) {} teamRemoteDecos = null; }
  const tree = el('tree'); if (tree) tree.querySelectorAll('.presence-dot').forEach((d) => d.remove());
}

// Activa una sesión de equipo (suscribe realtime + guarda estado).
function teamActivate(group, role, base) {
  teamGroup = group; teamRole = role; teamBase = base;
  if (teamChannel) { HydraAuth.collab.unsubscribe(teamChannel); teamChannel = null; }
  teamChannel = HydraAuth.collab.subscribe(group.id, {
    onFile: (row) => teamApplyRemote(row),
    onMember: () => { if (currentView === 'team') renderTeam(); },
    onCursor: (p) => teamOnRemoteCursor(p),
    onEdit: (p) => teamOnRemoteEdit(p),
    onPresence: (state) => teamOnPresence(state),
    initial: teamPresenceState(),
  });
  saveState({ teamGroupId: group.id, teamGroupCode: group.code, teamRole: role, teamBase: base });
  if (currentView === 'team') renderTeam();
  el('act-team') && (el('act-team').classList.add('active-session'));
}

// Mi estado de presencia (qué archivo tengo abierto, mi color).
function teamPresenceState() {
  const u = (window.HydraAuth && HydraAuth.getUser && HydraAuth.getUser()) || {};
  const email = u.email || 'anon';
  const name = (HydraAuth.getProfile && HydraAuth.getProfile() && HydraAuth.getProfile().username) || (u.displayName) || (email.split('@')[0]);
  return { email, name, color: teamColor(email), file: (activeTab && teamRel(activeTab)) || null };
}
// Avisar mi presencia (al cambiar de archivo, etc.).
function teamTrack() {
  if (teamGroup && teamChannel) HydraAuth.collab.track(teamChannel, teamPresenceState());
}

// Sale de la sesión (local). keepServer=false también borra mi membresía.
// promptFolder=true cierra la carpeta compartida (si estaba abierta) y ofrece
// abrir otra (cuando el usuario sale del grupo a propósito).
async function teamLeave(keepServer, promptFolder) {
  const wasBase = teamBase; // carpeta del equipo antes de limpiar
  if (teamGroup && !keepServer) { try { await HydraAuth.collab.leave(teamGroup.id); } catch (e) {} }
  if (teamChannel) { HydraAuth.collab.unsubscribe(teamChannel); teamChannel = null; }
  teamClearRemote();
  teamGroup = null; teamRole = null; teamBase = null;
  saveState({ teamGroupId: null, teamGroupCode: null, teamRole: null, teamBase: null });
  if (el('act-team')) el('act-team').classList.remove('active-session');
  if (currentView === 'team') renderTeam();
  // Si la carpeta abierta era la del equipo, cerrarla y ofrecer abrir otra.
  if (promptFolder && wasBase && rootDir === wasBase) await teamCloseFolderAndPrompt();
}

// Cierra la carpeta compartida que estaba abierta y ofrece abrir una nueva.
async function teamCloseFolderAndPrompt() {
  closeFolder();
  if (currentView === 'team') showView('explorer');
  const ok = await showConfirm('Saliste del grupo',
    'Se cerró la carpeta compartida del equipo. ¿Querés abrir otra carpeta?',
    'Abrir carpeta', false);
  if (ok) await openFolder();
}

// Si el IDE se cerró mientras el usuario estaba en un grupo, en el siguiente
// arranque hay que sacarlo del grupo en el servidor (cuando la sesión esté
// lista), cerrar la carpeta compartida y pedirle abrir otra.
let _teamExitPendingGid = null;
async function teamHandleClosedWhileJoined(groupId, base) {
  // Limpiar el estado de equipo persistido para no repetir esto en cada arranque.
  saveState({ teamGroupId: null, teamGroupCode: null, teamRole: null, teamBase: null });
  if (base && rootDir === base) closeFolder();
  // La baja en el servidor necesita sesión iniciada: se intenta ya y, si todavía
  // no hay auth, queda pendiente y la dispara accountInit al loguear.
  _teamExitPendingGid = groupId;
  teamFlushPendingExit();
  // La carpeta compartida ya no se reabrió en el arranque; solo ofrecer otra.
  if (currentView === 'team') showView('explorer');
  const ok = await showConfirm('Saliste del grupo',
    'Cerraste Hydra IDE mientras estabas en un grupo de Hydra Team. Te sacamos del grupo y se cerró la carpeta compartida. ¿Querés abrir otra carpeta?',
    'Abrir carpeta', false);
  if (ok) await openFolder();
}

// Ejecuta la baja pendiente del grupo en cuanto haya sesión (auth lista).
function teamFlushPendingExit() {
  if (!_teamExitPendingGid) return;
  if (teamReady() && teamSignedIn()) {
    const gid = _teamExitPendingGid; _teamExitPendingGid = null;
    try { HydraAuth.collab.leave(gid); } catch (e) {}
  }
}

// Al cerrar el IDE estando en un grupo: intentar la baja en el servidor
// (best-effort). El próximo arranque la completa y pide abrir otra carpeta.
window.addEventListener('beforeunload', () => {
  if (teamGroup && teamReady() && teamSignedIn()) {
    try { HydraAuth.collab.leave(teamGroup.id); } catch (e) {}
  }
});

// Crear un grupo a partir de la carpeta abierta (yo, dueño).
async function teamCreateGroup() {
  if (!teamSignedIn()) { showModal('Programar en equipo', 'Iniciá sesión con Google para crear un grupo.', null, true, 'Entendido'); return; }
  if (!rootDir) { showModal('Programar en equipo', 'Abrí una carpeta para compartirla con tu equipo.', null, true, 'Entendido'); return; }
  const name = await showModal('Crear grupo de equipo', '', 'Nombre del grupo (ej: Mi proyecto)');
  if (name === null) return;
  const pane = el('team-pane'); if (pane) pane.innerHTML = '<div class="team-loading"><i class="codicon codicon-loading codicon-modifier-spin"></i> Creando grupo y subiendo la carpeta…</div>';
  try {
    const group = await HydraAuth.collab.createGroup(name || rootName, rootName);
    const files = await teamCollectFiles(rootDir);
    await HydraAuth.collab.uploadFiles(group.id, files);
    teamActivate(group, 'owner', rootDir);
    showToast(getExtById('hydra-team'), 'Grupo creado · código ' + group.code, 'live-share', '#2ff0c4');
  } catch (e) {
    showModal('Programar en equipo', 'No se pudo crear el grupo: ' + ((e && e.message) || e), null, true, 'Cerrar');
    renderTeam();
  }
}

// Unirse a un grupo: descarga la carpeta y la abre.
async function teamJoinGroup(group) {
  if (!teamSignedIn()) { showModal('Programar en equipo', 'Iniciá sesión para unirte.', null, true, 'Entendido'); return; }
  const pane = el('team-pane'); if (pane) pane.innerHTML = '<div class="team-loading"><i class="codicon codicon-loading codicon-modifier-spin"></i> Uniéndote y descargando la carpeta…</div>';
  try {
    await HydraAuth.collab.join(group.id);
    const base = await window.api.teamDir(group.code);
    const files = await HydraAuth.collab.listFiles(group.id);
    // Crear carpetas primero, luego archivos.
    for (const f of files.filter((x) => x.is_dir)) {
      const sep = base.includes('\\') ? '\\' : '/';
      const abs = base.replace(/[\\/]$/, '') + sep + f.path.replace(/\//g, sep);
      const parts = abs.split(/[\\/]/); const nm = parts.pop();
      try { await window.api.createFolder(parts.join('/'), nm); } catch (e) {}
    }
    for (const f of files.filter((x) => !x.is_dir)) {
      const sep = base.includes('\\') ? '\\' : '/';
      const abs = base.replace(/[\\/]$/, '') + sep + f.path.replace(/\//g, sep);
      try { await window.api.aiWriteFile(abs, f.content || ''); } catch (e) {}
    }
    await openFolderPath(base);
    teamActivate(group, 'member', base);
    showToast(getExtById('hydra-team'), 'Te uniste a "' + (group.name || group.code) + '"', 'live-share', '#2ff0c4');
  } catch (e) {
    showModal('Programar en equipo', 'No se pudo unir: ' + ((e && e.message) || e), null, true, 'Cerrar');
    renderTeam();
  }
}

async function teamJoinByCode() {
  const code = await showModal('Unirse con código', '', 'Código del grupo (ej: A1B2C3)');
  if (!code) return;
  const group = await HydraAuth.collab.groupByCode(code.trim());
  if (!group) { showModal('Programar en equipo', 'No se encontró un grupo con ese código.', null, true, 'Cerrar'); return; }
  teamJoinGroup(group);
}

// Heartbeat de presencia mientras la extensión está activa.
function teamHeartbeatStart() {
  if (teamHeartbeatTimer || !teamReady()) return;
  const beat = () => { if (teamSignedIn()) HydraAuth.collab.heartbeat(); };
  beat();
  // Limpiar grupos propios que hayan quedado vacíos.
  if (teamSignedIn()) { try { HydraAuth.collab.cleanupEmptyOwnedGroups(); } catch (e) {} }
  teamHeartbeatTimer = setInterval(beat, 15000);
}
function teamHeartbeatStop() { if (teamHeartbeatTimer) { clearInterval(teamHeartbeatTimer); teamHeartbeatTimer = null; } }

// Vista lateral de "Programar en equipo".
async function renderTeam() {
  const pane = el('team-pane');
  if (!pane) return;
  if (!teamReady()) { pane.innerHTML = scmMsg('cloud-offline', 'El servidor de equipo no está disponible.'); return; }
  if (!teamSignedIn()) {
    pane.innerHTML = scmMsg('account', 'Iniciá sesión con Google para programar en equipo.',
      '<button class="primary-btn" id="team-login">Iniciar sesión</button>');
    const b = el('team-login'); if (b) b.onclick = () => { try { HydraAuth.signInWithGoogle(); } catch (e) {} };
    return;
  }

  // --- Sesión activa ---
  if (teamGroup) {
    let members = [], online = [];
    try { members = await HydraAuth.collab.members(teamGroup.id); } catch (e) {}
    try { online = await HydraAuth.collab.onlineUsers(); } catch (e) {}
    const onlineSet = new Set(online.map((u) => u.user_email));
    onlineSet.add(HydraAuth.getUser().email);
    let html =
      '<div class="team-group">' +
        '<div class="team-group-name"><i class="codicon codicon-live-share"></i> ' + escapeHtml(teamGroup.name || 'Grupo') + '</div>' +
        '<div class="team-code">Código: <b>' + escapeHtml(teamGroup.code) + '</b>' +
          '<button class="scm-ic" id="team-copy" title="Copiar código"><i class="codicon codicon-copy"></i></button></div>' +
        '<div class="team-role">' + (teamRole === 'owner' ? 'Sos el dueño del grupo' : 'Miembro del grupo') + '</div>' +
      '</div>';

    html += '<div class="py-section">Miembros (' + members.length + ')</div><div class="team-members">';
    for (const m of members) {
      const isOn = onlineSet.has(m.user_email);
      html += '<div class="team-member">' +
        '<span class="team-dot ' + (isOn ? 'on' : 'off') + '"></span>' +
        '<span class="team-mname">' + escapeHtml(m.username || m.user_email.split('@')[0]) + (m.user_email === HydraAuth.getUser().email ? ' (vos)' : '') + '</span>' +
        (m.role === 'owner' ? '<span class="team-badge">dueño</span>' : (m.status === 'invited' ? '<span class="team-badge inv">invitado</span>' : '')) +
        '</div>';
    }
    html += '</div>';

    // El dueño puede invitar a usuarios en línea.
    if (teamRole === 'owner') {
      const memberEmails = new Set(members.map((m) => m.user_email));
      const invitables = online.filter((u) => !memberEmails.has(u.user_email));
      html += '<div class="py-section">Invitar (en línea)</div><div class="team-invite-list">';
      if (!invitables.length) html += '<div class="ext-empty">No hay otras personas con la extensión en línea ahora.</div>';
      for (const u of invitables) {
        html += '<div class="team-invitable" data-email="' + escapeHtml(u.user_email) + '" data-username="' + escapeHtml(u.username || '') + '">' +
          '<span class="team-dot on"></span>' +
          '<span class="team-mname">' + escapeHtml(u.username || u.user_email.split('@')[0]) + '</span>' +
          '<button class="py-btn team-invite-btn"><i class="codicon codicon-add"></i> Invitar</button>' +
          '</div>';
      }
      html += '</div>';
    }

    html += '<div class="py-actions" style="margin-top:12px"><button class="py-btn" id="team-leave"><i class="codicon codicon-sign-out"></i> Salir del grupo</button></div>';
    pane.innerHTML = html;

    const cp = el('team-copy');
    if (cp) cp.onclick = () => {
      if (!teamGroup) return;
      // Copiar con el portapapeles nativo; si fallara, intentar el del navegador.
      let ok = false;
      try { ok = window.api.clipboardWrite(teamGroup.code) !== false; } catch (e) {}
      if (!ok) { try { navigator.clipboard.writeText(teamGroup.code); ok = true; } catch (e) {} }
      // Feedback visible en el propio botón (no depende del toast).
      const ic = cp.querySelector('i');
      if (ic) {
        const prev = ic.className;
        ic.className = 'codicon codicon-check';
        setTimeout(() => { ic.className = prev; }, 1200);
      }
      // Toast informativo (si la extensión está disponible).
      try { const ext = getExtById('hydra-team'); if (ext) showToast(ext, 'Código copiado', 'copy', '#2ff0c4'); } catch (e) {}
    };
    el('team-leave').onclick = async () => {
      const ok = await showConfirm('Salir del grupo', '¿Salir de "' + (teamGroup.name || teamGroup.code) + '"? Dejarás de sincronizar y se cerrará la carpeta compartida.', 'Salir', false);
      if (ok) teamLeave(false, true);
    };
    for (const row of pane.querySelectorAll('.team-invitable')) {
      const btn = row.querySelector('.team-invite-btn');
      btn.onclick = async () => {
        btn.disabled = true; btn.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i>';
        try { await HydraAuth.collab.invite(teamGroup.id, row.dataset.email, row.dataset.username); showToast(getExtById('hydra-team'), 'Invitación enviada', 'check', '#2ff0c4'); }
        catch (e) {}
        renderTeam();
      };
    }
    return;
  }

  // --- Sin sesión activa: crear / unirse / invitaciones ---
  let invites = [];
  try { invites = await HydraAuth.collab.myInvites(); } catch (e) {}
  let html =
    '<div class="py-section">Nuevo grupo</div><div class="py-actions">' +
      '<button class="py-btn run" id="team-create"><i class="codicon codicon-live-share"></i> ' +
        (rootDir ? 'Compartir "' + escapeHtml(rootName) + '"' : 'Crear grupo (abrí una carpeta)') + '</button>' +
      '<button class="py-btn" id="team-join-code"><i class="codicon codicon-key"></i> Unirse con código</button>' +
    '</div>';
  html += '<div class="py-section">Invitaciones (' + invites.length + ')</div>';
  if (!invites.length) html += '<div class="ext-empty">No tenés invitaciones pendientes.</div>';
  else {
    html += '<div class="team-invites">';
    for (const inv of invites) {
      html += '<div class="team-inv" data-gid="' + inv.group.id + '">' +
        '<div class="team-inv-info"><b>' + escapeHtml(inv.group.name || inv.group.code) + '</b>' +
        '<small>de ' + escapeHtml(inv.group.owner_username || inv.group.owner_email) + '</small></div>' +
        '<button class="py-btn team-accept"><i class="codicon codicon-check"></i> Unirse</button>' +
        '<button class="scm-ic team-decline" title="Rechazar"><i class="codicon codicon-close"></i></button>' +
        '</div>';
    }
    html += '</div>';
  }
  pane.innerHTML = html;

  el('team-create').onclick = teamCreateGroup;
  el('team-join-code').onclick = teamJoinByCode;
  for (const row of pane.querySelectorAll('.team-inv')) {
    const inv = invites.find((i) => String(i.group.id) === row.dataset.gid);
    row.querySelector('.team-accept').onclick = () => teamJoinGroup(inv.group);
    row.querySelector('.team-decline').onclick = async () => { try { await HydraAuth.collab.decline(inv.group.id); } catch (e) {} renderTeam(); };
  }
}

// Activa/desactiva la extensión Hydra Team.
function applyTeam() {
  const on = extActive('hydra-team');
  const btn = el('act-team');
  if (btn) btn.hidden = !on;
  if (on) {
    teamHeartbeatStart();
  } else {
    teamHeartbeatStop();
    if (teamGroup) teamLeave(true); // salir local sin borrar membresía
    if (currentView === 'team') showView('explorer');
  }
}

// --------------------------------------------------------------------------
// Cuenta / sesión (Firebase Auth con Google + perfil en Supabase)
// --------------------------------------------------------------------------
function accountInit() {
  if (!window.HydraAuth) return;
  HydraAuth.onChange((user, profile) => {
    renderAccount(user, profile);
    if (user) el('login-overlay').hidden = true;
    updateAiGate();
    if (user) teamFlushPendingExit(); // baja pendiente tras cerrar el IDE en un grupo
    // Hydra Team: reaccionar al inicio/cierre de sesión.
    if (extActive('hydra-team')) {
      if (user) { teamHeartbeatStart(); }
      else if (teamGroup) { teamLeave(true); } // al cerrar sesión, salir local (sin borrar membresía)
    }
    if (currentView === 'team') renderTeam();
  });

  el('title-account').addEventListener('click', (e) => {
    e.stopPropagation();
    if (HydraAuth.getUser()) toggleAccountMenu();
    else openLogin();
  });
  el('login-google').addEventListener('click', doGoogleLogin);
  el('login-form').addEventListener('submit', doEmailAuth);
  el('login-switch-btn').addEventListener('click', () => setLoginMode(loginMode === 'signup' ? 'signin' : 'signup'));
  el('login-forgot').addEventListener('click', doForgotPassword);
  el('login-close').addEventListener('click', () => { el('login-overlay').hidden = true; });
  el('login-overlay').addEventListener('click', (e) => { if (e.target === el('login-overlay')) el('login-overlay').hidden = true; });

  el('profile-cancel').addEventListener('click', () => { el('profile-overlay').hidden = true; });
  el('profile-overlay').addEventListener('click', (e) => { if (e.target === el('profile-overlay')) el('profile-overlay').hidden = true; });
  el('profile-save').addEventListener('click', saveProfileForm);
  el('profile-logout').addEventListener('click', async () => { await HydraAuth.signOut(); el('profile-overlay').hidden = true; });
  el('profile-username').addEventListener('input', checkUsernameDebounced);
}

function renderAccount(user, profile) {
  const btn = el('title-account');
  btn.innerHTML = '';
  if (user) {
    const photo = (profile && profile.photo_url) || user.photoURL;
    if (photo) { const img = document.createElement('img'); img.className = 'ta-avatar'; img.src = photo; btn.appendChild(img); }
    else { const ic = codicon('account'); ic.classList.add('ta-icon'); btn.appendChild(ic); }
    const label = document.createElement('span'); label.className = 'ta-label';
    label.textContent = (profile && profile.display_name) || user.displayName || user.email;
    btn.appendChild(label);
  } else {
    const ic = codicon('account'); ic.classList.add('ta-icon'); btn.appendChild(ic);
    const label = document.createElement('span'); label.className = 'ta-label'; label.textContent = 'Iniciar sesión';
    btn.appendChild(label);
  }
}

let loginMode = 'signin'; // 'signin' | 'signup'

// Cambia el modal entre iniciar sesión y registrarse (muestra/oculta campos).
function setLoginMode(mode) {
  loginMode = mode === 'signup' ? 'signup' : 'signin';
  const signup = loginMode === 'signup';
  el('login-title').textContent = signup ? 'Crear cuenta en Hydra IDE' : 'Iniciar sesión en Hydra IDE';
  el('login-sub').textContent = signup
    ? 'Registrate para llevar tu cuenta a donde vayas.'
    : 'Accedé a tu perfil y llevá tu cuenta a donde vayas.';
  el('login-name').hidden = !signup;
  el('login-password2').hidden = !signup;
  el('login-forgot').hidden = signup;
  el('login-password').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  el('login-submit').textContent = signup ? 'Registrarme' : 'Iniciar sesión';
  el('login-switch-text').textContent = signup ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?';
  el('login-switch-btn').textContent = signup ? 'Iniciá sesión' : 'Registrate';
  const err = el('login-error'); err.hidden = true; err.style.color = '';
}

function openLogin() {
  setLoginMode('signin');
  ['login-name', 'login-email', 'login-password', 'login-password2'].forEach((id) => { const i = el(id); if (i) i.value = ''; });
  el('login-overlay').hidden = false;
  setTimeout(() => { try { el('login-email').focus(); } catch (e) {} }, 60);
}

// Iniciar sesión / registrarse con correo y contraseña (Firebase).
async function doEmailAuth(ev) {
  if (ev) ev.preventDefault();
  const err = el('login-error'), submit = el('login-submit');
  err.hidden = true; err.style.color = '';
  const email = el('login-email').value.trim();
  const pass = el('login-password').value;
  const signup = loginMode === 'signup';
  if (!email || !pass) { err.hidden = false; err.textContent = 'Completá correo y contraseña.'; return; }
  if (signup) {
    if (pass.length < 6) { err.hidden = false; err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
    if (pass !== el('login-password2').value) { err.hidden = false; err.textContent = 'Las contraseñas no coinciden.'; return; }
  }
  const orig = submit.textContent; submit.disabled = true;
  submit.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> ' + (signup ? 'Creando cuenta…' : 'Entrando…');
  try {
    if (signup) await HydraAuth.signUpWithEmail(email, pass, el('login-name').value.trim());
    else await HydraAuth.signInWithEmail(email, pass);
    el('login-overlay').hidden = true;
  } catch (e) {
    err.hidden = false; err.style.color = ''; err.textContent = friendlyAuthError(e);
  } finally {
    submit.disabled = false; submit.textContent = orig;
  }
}

// Enviar correo para restablecer la contraseña.
async function doForgotPassword() {
  const err = el('login-error');
  const email = el('login-email').value.trim();
  err.hidden = true; err.style.color = '';
  if (!email) { err.hidden = false; err.textContent = 'Escribí tu correo arriba y te mando el enlace de recuperación.'; return; }
  try {
    await HydraAuth.resetPassword(email);
    err.hidden = false; err.style.color = '#7ee787';
    err.textContent = 'Listo, te enviamos un correo para restablecer la contraseña.';
  } catch (e) { err.hidden = false; err.style.color = ''; err.textContent = friendlyAuthError(e); }
}

async function doGoogleLogin() {
  const btn = el('login-google'), err = el('login-error');
  err.hidden = true; btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Continuá en tu navegador…';
  try { await HydraAuth.signInWithGoogle(); el('login-overlay').hidden = true; }
  catch (e) { err.hidden = false; err.textContent = friendlyAuthError(e); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}

function friendlyAuthError(e) {
  const code = (e && e.code) || '';
  const msg = (e && e.message) || '';
  if (code.includes('popup-closed')) return 'Cerraste la ventana antes de terminar.';
  if (code.includes('popup-blocked')) return 'El popup fue bloqueado. Probá de nuevo.';
  if (code.includes('network')) return 'Sin conexión. Revisá tu internet.';
  // Correo / contraseña
  if (code.includes('invalid-email')) return 'El correo no es válido.';
  if (code.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo. Iniciá sesión.';
  if (code.includes('weak-password')) return 'La contraseña es muy débil (mínimo 6 caracteres).';
  if (code.includes('user-not-found')) return 'No existe una cuenta con ese correo. Registrate.';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Correo o contraseña incorrectos.';
  if (code.includes('user-disabled')) return 'Esta cuenta está deshabilitada.';
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Esperá un momento y probá de nuevo.';
  if (code.includes('operation-not-allowed')) return 'El proveedor correo/contraseña no está habilitado en Firebase.';
  if (code.includes('disallowed') || /secure|user-agent/i.test(msg)) return 'Google bloqueó el inicio en este navegador embebido (limitación de Electron).';
  return msg || 'No se pudo iniciar sesión.';
}

function toggleAccountMenu() {
  const menu = el('account-menu');
  if (!menu.hidden) { menu.hidden = true; return; }
  const user = HydraAuth.getUser(), profile = HydraAuth.getProfile();
  menu.innerHTML = '';
  const head = document.createElement('div'); head.className = 'acct-head';
  const photo = (profile && profile.photo_url) || (user && user.photoURL);
  if (photo) { const img = document.createElement('img'); img.src = photo; head.appendChild(img); }
  const info = document.createElement('div');
  info.innerHTML = `<div class="acct-name">${escapeHtml((profile && profile.display_name) || (user && user.displayName) || '')}</div><div class="acct-email">${escapeHtml(user ? user.email : '')}</div>`;
  head.appendChild(info); menu.appendChild(head);

  const mkItem = (icon, label, fn) => {
    const mi = document.createElement('div'); mi.className = 'mi';
    mi.innerHTML = `<i class="codicon codicon-${icon}"></i> ${label}`;
    mi.addEventListener('click', () => { menu.hidden = true; fn(); });
    menu.appendChild(mi);
  };
  mkItem('edit', 'Editar perfil', openProfile);
  const sep = document.createElement('div'); sep.className = 'sep'; menu.appendChild(sep);
  mkItem('sign-out', 'Cerrar sesión', async () => { await HydraAuth.signOut(); });

  const r = el('title-account').getBoundingClientRect();
  menu.hidden = false;
  menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 6) + 'px';
  menu.style.top = r.bottom + 'px';
}

function openProfile() {
  const user = HydraAuth.getUser(), p = HydraAuth.getProfile() || {};
  if (!user) return;
  el('profile-avatar').src = p.photo_url || user.photoURL || '';
  el('profile-email').textContent = user.email;
  el('profile-display').value = p.display_name || user.displayName || '';
  el('profile-username').value = p.username || '';
  el('profile-bio').value = p.bio || '';
  el('profile-photo').value = p.photo_url || '';
  el('profile-username-status').textContent = '';
  el('profile-username-status').className = 'uname-status';
  el('profile-overlay').hidden = false;
}

let unameTimer = null;
function checkUsernameDebounced() {
  clearTimeout(unameTimer);
  const status = el('profile-username-status');
  const u = HydraAuth.sanitizeUsername(el('profile-username').value.trim());
  if (!u) { status.textContent = ''; status.className = 'uname-status'; return; }
  status.textContent = 'Comprobando…'; status.className = 'uname-status';
  unameTimer = setTimeout(async () => {
    const ok = await HydraAuth.isUsernameAvailable(u);
    status.textContent = ok ? `"${u}" disponible` : `"${u}" ya está en uso`;
    status.className = 'uname-status ' + (ok ? 'ok' : 'bad');
  }, 450);
}

async function saveProfileForm() {
  const btn = el('profile-save'); const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const username = HydraAuth.sanitizeUsername(el('profile-username').value.trim());
    const patch = {
      display_name: el('profile-display').value.trim() || null,
      bio: el('profile-bio').value.trim() || null,
      photo_url: el('profile-photo').value.trim() || null,
    };
    if (username) {
      const cur = (HydraAuth.getProfile() || {}).username;
      if (username !== cur && !(await HydraAuth.isUsernameAvailable(username))) {
        showModal('Perfil', 'Ese nombre de usuario ya está en uso. Elegí otro.', null, true, 'Cerrar');
        return;
      }
      patch.username = username;
    }
    await HydraAuth.saveProfile(patch);
    el('profile-overlay').hidden = true;
    showModal('Perfil', 'Perfil guardado correctamente.', null, true, 'Listo');
  } catch (e) {
    showModal('Perfil', 'Error al guardar: ' + ((e && e.message) || e), null, true, 'Cerrar');
  } finally { btn.disabled = false; btn.textContent = orig; }
}

document.addEventListener('click', (e) => {
  const menu = el('account-menu');
  if (menu && !menu.hidden && !menu.contains(e.target) && !el('title-account').contains(e.target)) menu.hidden = true;
});

// --------------------------------------------------------------------------
// Hydra AI — chat con IA (Groq), solo para usuarios con sesión iniciada
// --------------------------------------------------------------------------
// Prompt de sistema BREVE a propósito: Lumin (el backend) responde mucho más
// rápido con contexto corto (un prompt largo lo hacía tardar ~16s). Mantiene lo
// esencial: identidad, idioma, sin emojis, y las etiquetas de herramientas que
// la app parsea (```file / ```run / ```terminal / ```delete).
const AI_SYSTEM = {
  role: 'system',
  content: [
    'Sos el motor de código de Hydra IDE (Windows). Hablás en español, sin emojis. Sos PROFESIONAL: entregás',
    'trabajos COMPLETOS y terminados, no a medias.',
    'REGLA DE ORO: si el pedido implica un cambio en un archivo, SIEMPRE devolvé un bloque ```file con el archivo.',
    'PROHIBIDO decir "listo", "ya lo cambié" o "hecho" SIN incluir el ```file correspondiente. Sin el bloque, NADA cambia.',
    'Para cambios PEQUEÑOS (renombrar un texto/nombre, un color, un efecto): tomá el contenido del "archivo abierto"',
    'que viene en el contexto, aplicá EXACTAMENTE el cambio y devolvé el archivo ENTERO ya modificado en un ```file',
    'con su MISMA ruta (no reescribas de cero, no pierdas lo que había, no entregues fragmentos sueltos).',
    'Si te piden renombrar/cambiar un texto o nombre, reemplazá TODAS sus ocurrencias en el archivo (título, encabezados,',
    'textos visibles, etc.), no solo la primera.',
    'Si no sabés en qué archivo está el texto a cambiar, primero usá ```run para buscarlo (ej: findstr /s /i "miweb" *.*).',
    'Herramientas — bloques con estas etiquetas EXACTAS:',
    '```file RUTA → crea/reemplaza ese archivo con el contenido COMPLETO de abajo.',
    '```run → ejecuta UN comando cmd y te devuelve la salida. ```terminal → lanza un proceso que queda corriendo.',
    '```delete → borra archivos/carpetas (una ruta por línea). En Windows usá cmd (del, rmdir /s /q, copy, move, dir, findstr).',
    'Para mostrar código sin ejecutarlo usá ```lenguaje.',
  ].join(' '),
};

let aiMessages = [];        // historial (sin el system)
let aiStreaming = false;
let aiCurrentText = '';
let aiCurrentEl = null;
let aiAttached = null;      // { dataUrl, name } imagen adjunta

// Agentes del selector de Hydra AI (modelos Groq). Claude Code NO va acá: es un
// botón propio al lado del selector que solo aparece con la extensión instalada.
const AI_AGENTS = [
  { id: 'hydra', name: 'Hydra AI', icon: 'sparkle', model: 'ydr-2.5', label: 'YDR 2.5', ready: true, builtin: true, desc: 'YDR 2.5 · el modelo más actual de Hydra AI' },
];
let aiAgent = AI_AGENTS[0];

// Modo de permisos de Hydra AI (como Claude): controla si ejecuta las acciones
// (crear/ejecutar/borrar) preguntando, sin preguntar, o si solo responde.
const HYDRA_MODES = [
  { id: 'ask', name: 'Preguntar', icon: 'shield', desc: 'Pide permiso antes de crear, ejecutar o borrar.' },
  { id: 'auto', name: 'Automático', icon: 'zap', desc: 'Hace todo al toque, sin preguntar.' },
  { id: 'chat', name: 'Solo chat', icon: 'comment', desc: 'Solo responde; no toca tu equipo.' },
];
let aiPermMode = 'ask';

let claudeActive = false; // ¿el panel está en modo Claude Code? (declarado antes de accountInit por TDZ)
let aiTab = 'hydra';      // pestaña activa del panel de IA: 'hydra' | 'claude' | 'lumin'

// Auth (Firebase): se inicializa acá, después de definir aiAgent/claudeActive, porque su
// callback onChange llama a updateAiGate() que los lee (evita TDZ al cargar).
accountInit();

// Modos en vivo (como Claude Code): Pensando / Trabajando / Escribiendo / Ejecutando…
const AI_MODES = {
  idle:     null,
  thinking: { icon: 'loading codicon-modifier-spin', label: 'Pensando…' },
  working:  { icon: 'loading codicon-modifier-spin', label: 'Trabajando…' },
  writing:  { icon: 'edit',     label: 'Escribiendo archivo…' },
  running:  { icon: 'terminal', label: 'Ejecutando comando…' },
  deleting: { icon: 'trash',    label: 'Borrando…' },
  reading:  { icon: 'book',     label: 'Leyendo…' },
};
let aiMode = 'idle';
function setAiMode(mode) {
  aiMode = mode;
  const elm = el('ai-mode');
  if (!elm) return; // sin el indicador en el DOM, no bloquear la respuesta de la IA
  const m = AI_MODES[mode];
  if (!m) { elm.hidden = true; elm.innerHTML = ''; return; }
  elm.hidden = false;
  elm.innerHTML = '<span class="dot"></span><i class="codicon codicon-' + m.icon + '"></i> ' + m.label;
}

// Markdown ligero: bloques ```código```, `inline`, **negrita**, saltos de línea.
function aiMarkdown(text) {
  const parts = String(text).split('```');
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const raw = parts[i];
      const lm = raw.match(/^([a-zA-Z0-9+#.-]+)\n/);
      const lang = lm ? lm[1] : '';
      const code = raw.replace(/^[a-zA-Z0-9+#./-]*\n/, '').replace(/\n$/, '');
      // Bloque de código con barra superior (lenguaje + copiar), estilo ChatGPT/Claude.
      html += '<div class="ai-code">' +
        '<div class="ai-code-head"><span class="ai-code-lang">' + escapeHtml(lang || 'texto') + '</span>' +
        '<button class="ai-code-copy" title="Copiar"><i class="codicon codicon-copy"></i> Copiar</button></div>' +
        '<pre><code>' + escapeHtml(code) + '</code></pre></div>';
    } else {
      let t = escapeHtml(parts[i]);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      t = t.replace(/\n/g, '<br>');
      html += t;
    }
  }
  return html;
}

function aiReset() {
  aiMessages = [];
  aiStreaming = false; aiCurrentEl = null;
  aiAttached = null; renderAttachPreview();
  el('ai-messages').innerHTML =
    '<div class="ai-welcome"><img src="hydra-ai-oscura.png" class="ai-welcome-logo" alt="">Soy <b>Hydra AI</b>. Preguntame, mandame una imagen o pedime que ejecute algo en la terminal. Recuerdo nuestras conversaciones anteriores.</div>';
  setAiSendStop(false);
  saveAiHistory();
}

function aiAddMessage(role, text, imageUrl) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg ' + role;
  const r = document.createElement('div'); r.className = 'ai-role';
  r.innerHTML = role === 'user'
    ? 'Vos'
    : '<img src="hydra-ai-oscura.png" class="ai-role-logo" alt=""> Hydra AI' +
      '<button class="ai-msg-copy" title="Copiar respuesta"><i class="codicon codicon-copy"></i></button>';
  const t = document.createElement('div'); t.className = 'ai-text';
  if (role === 'user') {
    t.textContent = text || '';
    if (imageUrl) { const im = document.createElement('img'); im.className = 'ai-img'; im.src = imageUrl; t.appendChild(im); }
  } else {
    t.innerHTML = aiMarkdown(text);
  }
  wrap.append(r, t);
  const w = el('ai-messages').querySelector('.ai-welcome'); if (w) w.remove();
  el('ai-messages').appendChild(wrap);
  // Al mandar TU mensaje: reengancha el auto-seguimiento y baja al fondo. Así la
  // respuesta de la IA sigue deslizando pegada al fondo mientras se escribe.
  if (role === 'user') aiStick = true;
  aiScrollToBottom(role === 'user');
  return t;
}

// Auto-scroll pegado al fondo. Compartido por Hydra AI y el panel de agentes
// (ambos usan #ai-messages). aiStick = "seguir pegado al fondo". CLAVE: el stick
// SOLO se apaga cuando el USUARIO sube a leer (rueda/touch/teclas/arrastre de la
// barra) — NUNCA por los scrolls programáticos, que si no corromperían el flag
// durante el streaming y "soltarían" el fondo. rAF: medimos tras el layout.
let aiStick = true;
let aiScrollBound = false;
function aiScrollToBottom(force) {
  const host = el('ai-messages');
  if (!host) return;
  if (!aiScrollBound) { // se monta una sola vez
    aiScrollBound = true;
    const recalc = () => { aiStick = (host.scrollHeight - host.scrollTop - host.clientHeight) < 60; };
    ['wheel', 'touchmove', 'keydown', 'mouseup'].forEach((ev) =>
      host.addEventListener(ev, () => setTimeout(recalc, 0), { passive: true }));
  }
  if (force) aiStick = true;      // tu mensaje / acción → reengancha
  if (!aiStick) return;           // subiste a leer → no te interrumpo
  requestAnimationFrame(() => { host.scrollTop = host.scrollHeight; });
}

// Burbuja con el comando ejecutado y su salida.
function addCommandBubble(cmd, r) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-cmd';
  const out = ((r.stdout || '') + (r.stderr ? '\n' + r.stderr : '')).slice(0, 4000);
  wrap.innerHTML =
    '<div class="ai-cmd-head"><i class="codicon codicon-terminal"></i> ' + escapeHtml(cmd) + '</div>' +
    '<div class="ai-cmd-out">' + (out ? escapeHtml(out) : '<span class="code">(sin salida)</span>') +
    '<div class="code">exit ' + r.code + '</div></div>';
  el('ai-messages').appendChild(wrap);
  aiScrollToBottom(true); // al ejecutar/poner resultados, siempre baja al fondo
}

// Extrae comandos de bloques ```run o ```terminal.
function extractBlocks(text, tag) {
  const out = [];
  const re = new RegExp('```' + tag + '\\s*\\n([\\s\\S]*?)```', 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const cmd = m[1].split('\n').map((s) => s.trim()).filter(Boolean).join(tag === 'run' ? ' && ' : '\n');
    if (cmd) out.push(cmd);
  }
  return out;
}

// Extrae bloques ```file <ruta> con su contenido.
function extractFileBlocks(text) {
  const out = [];
  const re = /```file[ \t]+([^\n]+)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ path: m[1].trim(), content: m[2].replace(/\n$/, '') });
  return out;
}

// Resuelve una ruta relativa a la carpeta del proyecto (o absoluta).
function aiResolvePath(p) {
  let abs = p.replace(/\//g, '\\');
  if (!/^[a-zA-Z]:[\\/]/.test(abs) && rootDir) abs = rootDir.replace(/\//g, '\\') + '\\' + abs;
  return abs;
}

// Crea/reemplaza un archivo y lo abre en el editor (refresca el árbol).
async function aiWriteFile(p, content) {
  const abs = aiResolvePath(p);
  const res = await window.api.aiWriteFile(abs, content); // escribe a DISCO (guardado real)
  if (!res.error) {
    const tab = tabs.get(abs);
    if (tab && tab.kind === 'text') {
      // Archivo ABIERTO: adoptamos el cambio del agente en el editor y lo dejamos
      // GUARDADO (no "dirty"), para que NO se pierda ni lo pise el auto-save/Ctrl+S.
      tab.content = content;
      if (tab.model && !tab.model.isDisposed()) {
        const pos = (monacoEditor && activeTab === abs) ? monacoEditor.getPosition() : null;
        _fsApplying = true;
        try { tab.model.setValue(content); } finally { _fsApplying = false; }
        if (pos && monacoEditor && activeTab === abs) { try { monacoEditor.setPosition(pos); } catch (e) {} }
      }
      tab.dirty = false;
      renderTabs();
      try { renderOpenEditors(); } catch (e) {}
    } else {
      try { await refreshTree(); } catch {}
      try { await openFile(abs, abs.split(/[\\/]/).pop()); } catch {}
    }
    // Sincronizar el cambio del agente al equipo (Hydra Team), como un Ctrl+S.
    if (typeof teamGroup !== 'undefined' && teamGroup && teamUnder(abs)) { try { teamPushLocal(abs, content, { isDir: false }); } catch (e) {} }
    try { updateScmBadge(); } catch (e) {}
  }
  return res;
}

// Borra una ruta "como humano": cierra pestañas/carpeta/terminal que la usen y la elimina.
async function aiDeletePath(p) {
  let abs = p.replace(/\//g, '\\');
  if (!/^[a-zA-Z]:[\\/]/.test(abs) && rootDir) abs = rootDir.replace(/\//g, '\\') + '\\' + abs;
  const al = abs.toLowerCase();
  const rl = rootDir ? rootDir.replace(/\//g, '\\').toLowerCase() : '';
  const isWorkspace = rl && (al === rl || rl.startsWith(al + '\\'));

  // Cerrar pestañas que estén dentro de lo que se borra.
  for (const path of [...tabs.keys()]) {
    if (typeof path === 'string' && path.toLowerCase().startsWith(al)) closeTab(path);
  }
  // Sacar TODAS las terminales de adentro (libera el lock del directorio en Windows).
  try { for (const T of terminals.values()) window.api.termInput('cd /d "%USERPROFILE%"\r', T.sessionId); } catch {}
  if (isWorkspace) closeFolder();           // si borramos la carpeta abierta, la cerramos
  await new Promise((r) => setTimeout(r, 450));

  const res = await window.api.aiDelete(abs);
  if (!isWorkspace && rootDir) { try { await refreshTree(); } catch {} }
  return Object.assign({ path: abs }, res);
}

// Tras cambios de archivos por comandos: refrescar árbol y cerrar pestañas muertas.
async function aiAfterFsChange() {
  if (!rootDir) return;
  try { await refreshTree(); } catch {}
  for (const path of [...tabs.keys()]) {
    if (typeof path !== 'string' || path.startsWith('ext:')) continue;
    try { if (!(await window.api.exists(path))) closeTab(path); } catch {}
  }
}

// Lanza un comando en la terminal integrada activa (para procesos que quedan corriendo).
function aiRunInTerminal(cmd) {
  const wasStarted = activeTermStarted();
  openTerminalPanel();
  const sid = activeTermSession();
  setTimeout(() => {
    try { if (rootDir) window.api.termInput(`cd /d "${rootDir}"\r`, sid); window.api.termInput(cmd + '\r', sid); } catch {}
  }, wasStarted ? 60 : 800);
  const wrap = document.createElement('div');
  wrap.className = 'ai-cmd';
  wrap.innerHTML = '<div class="ai-cmd-head"><i class="codicon codicon-play"></i> En terminal: ' + escapeHtml(cmd) + '</div>';
  el('ai-messages').appendChild(wrap);
  aiScrollToBottom();
}

let aiStatus = '';
function aiRenderCurrent() {
  if (!aiCurrentEl) return;
  // El estado ("Pensando…/Programando…") va en UNA sola píldora (#ai-mode), no acá.
  aiCurrentEl.innerHTML = aiMarkdown(aiCurrentText) || '<span class="ai-cursor"></span>';
  aiScrollToBottom();
}
window.api.onAiChunk((chunk) => {
  if (!aiStreaming || !aiCurrentEl) return;
  if (aiMode === 'thinking') setAiMode('working');
  aiCurrentText += chunk;
  aiRenderCurrent();
});
// El estado del backend (Analizando imagen / Pensando / Programando) se muestra en
// la MISMA píldora que los modos, para que no aparezca duplicado.
window.api.onAiStatus((s) => {
  aiStatus = s || '';
  const elm = el('ai-mode');
  if (!elm) return;
  if (aiStatus) { elm.hidden = false; elm.innerHTML = '<span class="dot"></span> ' + escapeHtml(aiStatus); }
  else setAiMode(aiMode); // sin status: volver a mostrar el modo actual
});

function setAiSendStop(streaming) {
  const btn = el('ai-send');
  btn.classList.toggle('stop', streaming);
  btn.innerHTML = streaming ? '<i class="codicon codicon-stop-circle"></i>' : '<i class="codicon codicon-arrow-up"></i>';
}

// --- Memoria: persistir/restaurar el historial (sin imágenes, recortado) ---
function saveAiHistory() {
  const slim = aiMessages.slice(-30).map((m) => {
    if (Array.isArray(m.content)) {
      const txt = m.content.filter((p) => p.type === 'text').map((p) => p.text).join(' ');
      return { role: m.role, content: (txt || '') + ' [imagen]' };
    }
    return { role: m.role, content: m.content };
  });
  saveState({ aiHistory: slim });
}
function loadAiHistory(arr) {
  if (!Array.isArray(arr) || !arr.length) return;
  aiMessages = arr.slice();
  el('ai-messages').innerHTML = '';
  for (const m of aiMessages) {
    const text = typeof m.content === 'string' ? m.content
      : (m.content || []).filter((p) => p.type === 'text').map((p) => p.text).join(' ');
    aiAddMessage(m.role === 'user' ? 'user' : 'assistant', text);
  }
}

// --- Imagen adjunta ---
function renderAttachPreview() {
  const p = el('ai-attach-preview');
  if (!p) return;
  if (!aiAttached) { p.hidden = true; p.innerHTML = ''; return; }
  p.hidden = false;
  p.innerHTML = '<div class="thumb"><img src="' + aiAttached.dataUrl + '"><button class="rm" title="Quitar">✕</button></div>';
  p.querySelector('.rm').onclick = () => { aiAttached = null; renderAttachPreview(); };
}

// Contexto del archivo abierto para la IA (así puede hacer cambios pequeños,
// efectos, arreglos sobre TU código actual en vez de inventar de cero).
function aiActiveContext() {
  try {
    const tab = activeTab && tabs.get(activeTab);
    if (tab && tab.kind === 'text' && monacoEditor) {
      const content = monacoEditor.getValue();
      if (content && content.length < 100000) {
        const rel = rootDir ? String(activeTab).replace(rootDir, '').replace(/^[\\/]/, '') : String(activeTab);
        return { activeFile: { path: rel, content } };
      }
    }
  } catch (e) {}
  return null;
}

// --- Un turno de la IA: stream + continuación automática + ejecución de tareas ---
async function aiTurn(depth, useVision) {
  aiStreaming = true; aiCurrentText = '';
  aiCurrentEl = aiAddMessage('assistant', '');
  aiCurrentEl.innerHTML = '<span class="ai-cursor"></span>';
  setAiSendStop(true);
  setAiMode('thinking');

  // Bucle de continuación: si la API corta por límite de tokens (finish_reason
  // "length"), pedimos que SIGA y los nuevos chunks se agregan al MISMO mensaje.
  // `authText` = texto AUTORITATIVO devuelto por el backend (evita la carrera
  // entre los chunks en streaming y la resolución de la promesa → "sin respuesta").
  let error = null, conts = 0, authText = '';
  while (aiStreaming) {
    const extra = conts === 0 ? [] : [
      { role: 'assistant', content: authText || aiCurrentText },
      { role: 'user', content: 'Continuá EXACTAMENTE donde te cortaste, sin repetir nada, sin saludar de nuevo ni resumir. Seguí el texto/código tal cual venía.' },
    ];
    let res;
    // Token de Firebase para autenticar contra el proxy de Hydra AI (las claves
    // viven en el servidor, no en la app). Sin sesión, main.js corta con aviso.
    const idToken = window.HydraAuth ? await window.HydraAuth.getIdToken() : null;
    // Mandamos solo los últimos mensajes (acota tokens → menos rate limit) + el
    // contexto del archivo abierto (para que pueda hacer cambios pequeños/efectos).
    try { res = await window.api.aiChat([AI_SYSTEM].concat(aiMessages.slice(-10), extra), { vision: !!useVision && conts === 0, model: aiAgent.model, context: aiActiveContext(), direct: conts > 0, idToken }); }
    catch (e) { res = { error: e.message }; }
    if (res && res.error) { error = res.error; break; }
    if (res && typeof res.text === 'string' && res.text) authText += res.text; // texto completo autoritativo
    conts++;
    if (!(res && res.finishReason === 'length') || conts >= 10) break; // terminó o tope de continuaciones
  }

  aiStreaming = false; setAiSendStop(false); aiStatus = '';
  if (error) {
    aiCurrentEl.innerHTML = '<span style="color:#ff8089">⚠ ' + escapeHtml(error) + '</span>';
    aiCurrentEl = null; return;
  }
  // Preferimos el texto autoritativo del backend; si no vino, lo acumulado por chunks.
  const full = (authText || aiCurrentText || '').trim();
  aiCurrentText = full;
  aiCurrentEl.innerHTML = aiMarkdown(full || '(sin respuesta)');
  aiScrollToBottom(); // seguir al fondo también en el render FINAL (markdown/código cambian el alto)
  aiCurrentEl = null;
  if (full) { aiMessages.push({ role: 'assistant', content: full }); saveAiHistory(); }

  let combined = '';
  const files = extractFileBlocks(full);
  const dels = extractBlocks(full, 'delete');
  const cmds = extractBlocks(full, 'run');
  const terms = extractBlocks(full, 'terminal');

  // ---- MODO DE PERMISOS de Hydra AI (como Claude) ----------------------------
  //  · 'ask'  → pide confirmación antes de tocar el equipo (por defecto).
  //  · 'auto' → ejecuta todo sin preguntar.
  //  · 'chat' → NO ejecuta nada; solo responde (útil para pedir ideas/plan).
  if (files.length || dels.length || cmds.length || terms.length) {
    if (aiPermMode === 'chat') {
      addCommandBubble('Modo Solo chat', { stdout: '', stderr: 'Acciones NO ejecutadas (modo "Solo chat"). Cambiá el modo para que Hydra AI las haga.', code: 0 });
      setAiMode('idle');
      return;
    }
    if (aiPermMode === 'ask') {
      const plan = [];
      for (const f of files) plan.push('+ Escribir archivo:  ' + f.path);
      for (const block of dels) for (const line of block.split('\n')) { const p = line.trim(); if (p) plan.push('- Borrar:  ' + p); }
      for (const cmd of cmds) plan.push('$ Ejecutar:  ' + cmd);
      for (const t of terms) plan.push('$ En la terminal:  ' + t);
      el('modal-message').style.whiteSpace = 'pre-wrap';
      const ok = await showConfirm(
        'Hydra AI quiere modificar tu equipo',
        'La IA pide hacer estas acciones:\n\n' + plan.join('\n') +
        '\n\nRevisá bien los comandos y rutas. ¿Permitir?',
        'Permitir', true);
      if (!ok) {
        addCommandBubble('Acciones canceladas', { stdout: '', stderr: 'El usuario no autorizó la ejecución.', code: 1 });
        aiMessages.push({ role: 'user', content: 'El usuario RECHAZÓ ejecutar las acciones propuestas. No las repitas; explicá o proponé otra cosa y esperá nuevas instrucciones.' });
        saveAiHistory();
        setAiMode('idle');
        return;
      }
    }
    // 'auto' → seguir sin preguntar.
  }

  // Procesos que quedan corriendo → terminal integrada (no devuelven salida).
  for (const t of terms) aiRunInTerminal(t);

  // Crear/escribir archivos de verdad.
  if (files.length) setAiMode('writing');
  for (const f of files) {
    const r = await aiWriteFile(f.path, f.content);
    addCommandBubble('Archivo: ' + f.path, { stdout: r.error ? '' : 'Creado/actualizado', stderr: r.error || '', code: r.error ? 1 : 0 });
    combined += 'file ' + f.path + ' → ' + (r.error ? 'ERROR ' + r.error : 'ok') + '\n';
  }
  // Borrados robustos (archivos/carpetas, aunque estén abiertos).
  if (dels.length) setAiMode('deleting');
  for (const block of dels) {
    for (const line of block.split('\n')) {
      const p = line.trim(); if (!p) continue;
      const r = await aiDeletePath(p);
      addCommandBubble('Borrar: ' + p, { stdout: r.error ? '' : 'Borrado', stderr: r.error || '', code: r.error ? 1 : 0 });
      combined += 'delete ' + p + ' → ' + (r.error ? 'ERROR ' + r.error : 'ok') + '\n';
    }
  }
  // Comandos con salida (se la devolvemos a la IA).
  if (cmds.length) setAiMode('running');
  for (const cmd of cmds) {
    const r = await window.api.aiRun(cmd, rootDir || null);
    addCommandBubble(cmd, r);
    combined += '$ ' + cmd + '\n' + (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '') + '\n[exit ' + r.code + ']\n\n';
    await aiAfterFsChange(); // por si el comando creó/borró cosas
  }

  if (combined && depth < 8) {
    aiMessages.push({ role: 'user', content: 'Resultado:\n```\n' + combined + '```\nSeguí si hace falta o dame la conclusión.' });
    await aiTurn(depth + 1, false);
    return;
  }
  setAiMode('idle');
}

// Hydra AI en mantenimiento: cuando está activo, en vez de llamar a la IA se
// muestra un aviso animado "En mantenimiento…". Ahora Hydra AI usa Lumin (texto)
// + Groq (visión), así que está activo.
const HYDRA_AI_MAINTENANCE = false;

// Burbuja de mantenimiento con animación (ícono que late/oscila + puntos + brillo).
function showAiMaintenance() {
  const t = aiAddMessage('assistant', '');
  t.innerHTML =
    '<div class="ai-maint">' +
      '<span class="ai-maint-ic"><i class="codicon codicon-tools"></i></span>' +
      '<div class="ai-maint-body">' +
        '<div class="ai-maint-title">En mantenimiento' +
          '<span class="ai-maint-dots"><span>.</span><span>.</span><span>.</span></span></div>' +
        '<div class="ai-maint-sub">Hydra AI está en mantenimiento. Estamos mejorando el servicio — ' +
        'volvé a intentar en un rato.</div>' +
      '</div>' +
    '</div>';
  const host = el('ai-messages'); if (host) host.scrollTop = host.scrollHeight;
}

async function aiSend() {
  if (aiStreaming) return;
  if (!(window.HydraAuth && HydraAuth.getUser())) { updateAiGate(); return; }
  const input = el('ai-input');
  const text = input.value.trim();
  if (!text && !aiAttached) return;
  input.value = ''; input.style.height = 'auto';

  const img = aiAttached;
  aiAttached = null; renderAttachPreview();

  aiAddMessage('user', text, img ? img.dataUrl : null);

  // En mantenimiento mostramos el aviso animado y NO llamamos a la IA ni tocamos
  // el historial (así al recargar no queda un mensaje sin respuesta).
  if (HYDRA_AI_MAINTENANCE) { showAiMaintenance(); return; }

  if (img) {
    aiMessages.push({ role: 'user', content: [
      { type: 'text', text: text || '¿Qué ves en esta imagen?' },
      { type: 'image_url', image_url: { url: img.dataUrl } },
    ] });
  } else {
    aiMessages.push({ role: 'user', content: text });
  }
  saveAiHistory();
  await aiTurn(0, !!img);
}

function updateAiGate() {
  // En modo Claude o Lumin no aplica el gate de Google: usan su propia sesión/token.
  if (claudeActive || aiTab === 'lumin') {
    if (el('ai-gate')) el('ai-gate').hidden = true;
    if (el('ai-chat')) el('ai-chat').hidden = false;
    return;
  }
  const logged = !!(window.HydraAuth && HydraAuth.getUser());
  const gate = el('ai-gate'), chat = el('ai-chat');
  if (gate) gate.hidden = logged;
  if (chat) chat.hidden = !logged;
}

// Abrir/cerrar el panel de Hydra AI (a la derecha).
function toggleAiPanel(force) {
  const panel = el('ai-panel');
  const show = force === undefined ? panel.hidden : force;
  panel.hidden = !show;
  el('resizer-ai').hidden = !show;
  el('ai-toggle').classList.toggle('open', show);
  if (show) {
    updateAiGate();
    // Al abrir el chat: deslizar hasta lo más reciente (abajo) y enfocar el input.
    setTimeout(() => { aiScrollToBottom(true); el('ai-input').focus(); }, 0);
  }
}
el('ai-toggle').addEventListener('click', () => toggleAiPanel());
el('ai-close').addEventListener('click', () => toggleAiPanel(false));

// --------------------------------------------------------------------------
// Claude Code: GUI gráfica (como VS Code) sobre el motor real vía Agent SDK.
// El main maneja query()/canUseTool; acá renderizamos chat + tarjetas + permisos.
// --------------------------------------------------------------------------
let claudeStarted = false;     // ¿hay una sesión del SDK en curso?
let claudeStreaming = false;   // ¿esperando respuesta?
let claudeCurEl = null;        // .ai-text de la burbuja del asistente en streaming
let claudeCurText = '';
let claudeThinkEl = null;      // cuerpo del bloque "thinking" en curso
let claudeThinkText = '';
let claudeMode = 'default';    // modo de permisos
let claudeModel = 'sonnet';    // modelo elegido
let claudeApiKey = '';         // API key de Anthropic Console (opcional)
let claudeSlashCmds = [];      // comandos slash reportados por el init
let claudeTodoCard = null;     // tarjeta de lista de tareas (TodoWrite)
let claudeWorkingEl = null;    // indicador "Working…" mientras piensa
let claudeWorkTimer = null;    // timer de rotación de palabras del indicador
const claudeToolCards = new Map(); // tool_use_id -> elemento de tarjeta

const CLAUDE_MODES = [
  { id: 'default', name: 'Preguntar', icon: 'shield', desc: 'Pide permiso para cada acción.' },
  { id: 'auto', name: 'Auto', icon: 'zap', desc: 'Claude evalúa cada acción y aprueba las de bajo riesgo.' },
  { id: 'acceptEdits', name: 'Aceptar ediciones', icon: 'check-all', desc: 'Auto-aprueba ediciones de archivos.' },
  { id: 'bypassPermissions', name: 'Aceptar todo', icon: 'zap', desc: 'Aprueba todas las acciones automáticamente.' },
  { id: 'plan', name: 'Plan', icon: 'list-tree', desc: 'Solo propone un plan, no ejecuta.' },
];
const CLAUDE_MODELS = [
  { value: 'opus', name: 'Opus', desc: 'El más capaz · tareas complejas.' },
  { value: 'sonnet', name: 'Sonnet', desc: 'Equilibrado · el recomendado.' },
  { value: 'haiku', name: 'Haiku', desc: 'El más rápido y económico.' },
];
// Comandos slash locales (el resto se mandan tal cual al motor).
const CLAUDE_LOCAL_CMDS = [
  { name: '/clear', description: 'Empezar un chat nuevo' },
  { name: '/help', description: 'Mostrar ayuda' },
  { name: '/model', description: 'Elegir el modelo' },
];

// Escena pixel-art del welcome (luna + nubes + estrellas + criatura), estilo
// la pantalla de la extensión de VS Code.
function claudeScene() {
  return '<div class="claude-scene">' +
    '<svg viewBox="0 0 320 130" class="claude-scene-svg" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' +
      // estrellas
      '<g fill="#9aa0b8">' +
      '<rect x="40" y="22" width="3" height="3"/><rect x="120" y="14" width="3" height="3"/>' +
      '<rect x="96" y="40" width="3" height="3"/><rect x="160" y="30" width="3" height="3"/>' +
      '<rect x="210" y="20" width="3" height="3"/><rect x="250" y="52" width="3" height="3"/>' +
      '<rect x="285" y="36" width="3" height="3"/><rect x="70" y="58" width="3" height="3"/>' +
      '</g>' +
      // nubes (gris pixel)
      '<g fill="#3a3f52">' +
      '<rect x="44" y="40" width="56" height="10"/><rect x="52" y="32" width="40" height="10"/>' +
      '<rect x="150" y="58" width="56" height="10"/><rect x="158" y="50" width="40" height="10"/>' +
      '</g>' +
      // luna creciente
      '<g fill="#e8eaff"><rect x="232" y="16" width="40" height="40"/></g>' +
      '<g fill="#14151b"><rect x="246" y="16" width="30" height="40"/></g>' +
      '<g fill="#e8eaff"><rect x="262" y="22" width="6" height="6"/><rect x="256" y="40" width="6" height="6"/></g>' +
      // suelo
      '<g fill="#6b7186"><rect x="20" y="104" width="280" height="2"/></g>' +
      // criatura Claude (bloque naranja con ojos)
      '<g fill="#d97757">' +
      '<rect x="120" y="80" width="44" height="24"/><rect x="126" y="104" width="8" height="8"/><rect x="150" y="104" width="8" height="8"/>' +
      '</g>' +
      '<g fill="#14151b"><rect x="130" y="88" width="5" height="7"/><rect x="149" y="88" width="5" height="7"/></g>' +
    '</svg></div>';
}

// Bienvenida / login (estilo VS Code) renderizada DENTRO de #ai-messages.
async function renderClaudeWelcome() {
  const host = el('ai-messages');
  if (!rootDir) {
    host.innerHTML = '<div class="claude-welcome">' + claudeScene() +
      '<p class="claude-msg">Abrí una carpeta para que Claude Code trabaje sobre tu proyecto.</p>' +
      '<button class="primary-btn" id="claude-open-folder"><i class="codicon codicon-folder-opened"></i> Abrir carpeta</button></div>';
    el('claude-open-folder').onclick = () => openFolder();
    return;
  }
  host.innerHTML = '<div class="claude-welcome">' + claudeScene() + '<div class="claude-loading"><i class="codicon codicon-loading codicon-modifier-spin"></i> Comprobando sesión…</div></div>';
  let st = { authed: false };
  try { st = await window.api.claudeAuthStatus(claudeApiKey); } catch (e) {}
  if (st.authed) { openClaudeChat(); return; }   // ya hay sesión → chat directo
  renderClaudeLogin();
}

// Pantalla de elección de método de login (como la captura), dentro de #ai-messages.
function renderClaudeLogin() {
  const host = el('ai-messages');
  host.innerHTML = '<div class="claude-welcome">' + claudeScene() +
    '<p class="claude-lead">Claude Code se puede usar con tu suscripción de Claude o facturando por uso de API con tu cuenta de Console.</p>' +
    '<p class="claude-howto">¿Cómo querés iniciar sesión?</p>' +
    '<button class="claude-login-btn primary" id="claude-login-sub">Claude.ai Subscription' +
      '<small>Usá tu suscripción Claude Pro, Team o Enterprise</small></button>' +
    '<button class="claude-login-btn" id="claude-login-console">Anthropic Console' +
      '<small>Pagá el uso de API con tu cuenta de Console</small></button>' +
    '<button class="claude-login-btn" id="claude-login-bedrock">Bedrock, Foundry o Vertex <i class="codicon codicon-link-external"></i>' +
      '<small>Instrucciones para usar API keys o proveedores externos</small></button></div>';
  el('claude-login-sub').onclick = async () => {
    aiRunInTerminal('claude'); // el login OAuth lo hace el CLI por el navegador (one-time)
    showModal('Iniciar sesión', 'Se abrió la terminal con "claude". Iniciá sesión ahí (se abrirá el navegador) y luego volvé y pulsá "Reintentar".', null, true, 'Entendido');
    el('ai-messages').querySelector('.claude-welcome').insertAdjacentHTML('beforeend', '<button class="ext-btn ghost claude-relogin" id="claude-retry">Reintentar</button>');
    el('claude-retry').onclick = () => renderClaudeWelcome();
  };
  el('claude-login-console').onclick = async () => {
    const key = await showModal('Anthropic Console', 'Pegá tu API key de Anthropic (empieza con sk-ant-…).', 'sk-ant-...');
    if (!key) return;
    claudeApiKey = key.trim();
    saveState({ anthropicApiKey: claudeApiKey });
    renderClaudeWelcome();
  };
  el('claude-login-bedrock').onclick = () => window.api.openExternal('https://code.claude.com/docs/en/third-party-integrations');
}

// Estado vacío del chat de Claude (dentro de #ai-messages).
function openClaudeChat() {
  const host = el('ai-messages');
  host.innerHTML = '<div class="claude-empty">' + claudeScene() +
    '<div class="claude-empty-t">Pedile a <b>Claude Code</b> que cree, edite o explique código.</div>' +
    '<div class="claude-empty-s">Trabaja sobre <b>' + escapeHtml(rootName || 'la carpeta abierta') + '</b> · usá <code>/</code> para comandos y <code>@</code> para archivos.</div></div>';
  setTimeout(() => el('ai-input').focus(), 0);
}

// Agrega una burbuja de mensaje al chat de Claude. Devuelve el .ai-text.
function claudeAddMsg(role, text) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg ' + role;
  const r = document.createElement('div'); r.className = 'ai-role';
  r.innerHTML = role === 'user' ? '<i class="codicon codicon-account"></i> Vos'
    : '<i class="codicon codicon-sparkle"></i> Claude';
  const t = document.createElement('div'); t.className = 'ai-text';
  if (role === 'user') t.textContent = text || ''; else t.innerHTML = aiMarkdown(text || '');
  wrap.append(r, t);
  const host = el('ai-messages');
  host.querySelectorAll('.claude-empty, .claude-welcome').forEach((n) => n.remove());
  host.appendChild(wrap);
  aiScrollToBottom(role === 'user'); // al mandar TU mensaje, baja al fondo sí o sí
  return t;
}
function claudeScroll() { aiScrollToBottom(); } // sigue pegado al fondo (respeta si subiste a leer)

// Palabras divertidas mientras Claude piensa (estilo Claude Code), van rotando.
const CLAUDE_WORDS = ['Working', 'Incubating', 'Pondering', 'Cogitating', 'Conjuring', 'Brewing',
  'Thinking', 'Musing', 'Percolating', 'Noodling', 'Simmering', 'Tinkering', 'Scheming', 'Crafting',
  'Pensando', 'Tramando', 'Maquinando', 'Rumiando'];

// Indicador rotativo mientras Claude piensa (antes de que llegue contenido).
function claudeShowWorking() {
  claudeHideWorking();
  const d = document.createElement('div');
  d.className = 'claude-working';
  d.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> <span class="cw-word"></span><span class="cw-time"></span>';
  el('ai-messages').appendChild(d);
  claudeWorkingEl = d;
  const wordEl = d.querySelector('.cw-word'); const timeEl = d.querySelector('.cw-time');
  const start = Date.now();
  let tick = 0;
  const update = () => {
    if (tick % 3 === 0) wordEl.textContent = CLAUDE_WORDS[Math.floor(Math.random() * CLAUDE_WORDS.length)] + '…';
    const s = Math.round((Date.now() - start) / 1000);
    timeEl.textContent = s > 0 ? '  ' + s + 's' : '';
    tick++;
  };
  update();
  claudeWorkTimer = setInterval(update, 1000);
  claudeScroll();
}
function claudeHideWorking() {
  if (claudeWorkTimer) { clearInterval(claudeWorkTimer); claudeWorkTimer = null; }
  if (claudeWorkingEl) { claudeWorkingEl.remove(); claudeWorkingEl = null; }
}

// Ícono por herramienta para las tarjetas.
function claudeToolIcon(name) {
  return ({ Edit: 'edit', MultiEdit: 'edit', Write: 'new-file', Read: 'file', Bash: 'terminal',
    Glob: 'search', Grep: 'search', WebFetch: 'globe', WebSearch: 'search', TodoWrite: 'checklist',
    Task: 'rocket' }[name]) || 'tools';
}
// Resumen corto del input de una herramienta.
function claudeToolSummary(name, input) {
  input = input || {};
  if (name === 'Bash') return escapeHtml(input.command || '');
  if (input.file_path) return escapeHtml(String(input.file_path).split(/[\\/]/).pop());
  if (input.path) return escapeHtml(input.path);
  if (input.pattern) return escapeHtml(input.pattern);
  return '';
}
// Diff simple old→new para Edit/Write.
function claudeDiffHtml(input) {
  input = input || {};
  let html = '';
  if (typeof input.old_string === 'string' || typeof input.new_string === 'string') {
    const del = (input.old_string || '').split('\n');
    const add = (input.new_string || '').split('\n');
    html += del.filter((l) => l !== '').map((l) => '<div class="dl del">- ' + escapeHtml(l) + '</div>').join('');
    html += add.filter((l) => l !== '').map((l) => '<div class="dl add">+ ' + escapeHtml(l) + '</div>').join('');
  } else if (typeof input.content === 'string') {
    html += input.content.split('\n').slice(0, 40).map((l) => '<div class="dl add">+ ' + escapeHtml(l) + '</div>').join('');
  }
  return html ? '<div class="claude-diff">' + html + '</div>' : '';
}

// Resuelve una ruta (posiblemente relativa) contra la carpeta del proyecto.
function claudeResolvePath(p) {
  if (!p) return null;
  if (/^([a-zA-Z]:[\\/]|\/)/.test(p)) return p;
  if (!rootDir) return p;
  const sep = rootDir.includes('\\') ? '\\' : '/';
  return rootDir.replace(/[\\/]$/, '') + sep + String(p).replace(/\//g, sep);
}

// Renderiza (o devuelve) la tarjeta de una herramienta.
function claudeToolCard(id, name, input) {
  if (name === 'TodoWrite') { claudeRenderTodos(input); return null; }
  if (id && claudeToolCards.has(id)) return claudeToolCards.get(id);
  claudeCurEl = null; // cerrar la burbuja de texto en curso
  const card = document.createElement('div');
  card.className = 'claude-tool';
  const fp = input && input.file_path;
  card.innerHTML =
    '<div class="claude-tool-head"><i class="codicon codicon-' + claudeToolIcon(name) + '"></i>' +
      '<span class="claude-tool-name">' + escapeHtml(name) + '</span>' +
      '<span class="claude-tool-sum">' + claudeToolSummary(name, input) + '</span>' +
      (fp ? '<button class="claude-open-file" title="Abrir archivo"><i class="codicon codicon-go-to-file"></i></button>' : '') +
    '</div>' +
    claudeDiffHtml(input) +
    '<div class="claude-tool-out" hidden></div>';
  el('ai-messages').appendChild(card);
  if (fp) {
    const abs = claudeResolvePath(fp);
    const b = card.querySelector('.claude-open-file');
    if (b) b.onclick = () => { try { openFile(abs, String(fp).split(/[\\/]/).pop()); } catch (e) {} };
  }
  if (id) claudeToolCards.set(id, card);
  claudeScroll();
  return card;
}

// Tarjeta de lista de tareas (TodoWrite): se reemplaza en cada actualización.
function claudeRenderTodos(input) {
  const todos = (input && input.todos) || [];
  if (!todos.length) return;
  claudeCurEl = null;
  const ICON = { completed: 'check', in_progress: 'arrow-right', pending: 'circle-large-outline' };
  let html = '<div class="claude-todos-head"><i class="codicon codicon-checklist"></i> Tareas</div>';
  for (const t of todos) {
    const s = t.status || 'pending';
    const label = (s === 'in_progress' && t.activeForm) ? t.activeForm : (t.content || '');
    html += '<div class="claude-todo ' + s + '"><i class="codicon codicon-' + (ICON[s] || 'circle-large-outline') + '"></i>' +
      '<span>' + escapeHtml(label) + '</span></div>';
  }
  if (claudeTodoCard && claudeTodoCard.isConnected) {
    claudeTodoCard.innerHTML = html;
  } else {
    claudeTodoCard = document.createElement('div');
    claudeTodoCard.className = 'claude-todos';
    claudeTodoCard.innerHTML = html;
    el('ai-messages').appendChild(claudeTodoCard);
  }
  claudeScroll();
}
// Actualiza una tarjeta con el resultado de la herramienta.
function claudeToolResult(id, content, isError) {
  const card = claudeToolCards.get(id);
  if (!card) return;
  const out = card.querySelector('.claude-tool-out');
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) text = content.map((c) => (c && c.type === 'text') ? c.text : '').join('\n');
  text = (text || '').slice(0, 2000);
  if (text) { out.hidden = false; out.textContent = text; }
  card.classList.add(isError ? 'err' : 'done');
  claudeScroll();
}

// Tarjeta de permiso con botones Permitir / Permitir siempre / Denegar.
function claudePermCard(req) {
  claudeHideWorking(); // esperando decisión del usuario, no está "pensando"
  const card = document.createElement('div');
  card.className = 'claude-perm';
  card.innerHTML =
    '<div class="claude-perm-head"><i class="codicon codicon-' + claudeToolIcon(req.toolName) + '"></i>' +
      'Claude quiere usar <b>' + escapeHtml(req.toolName) + '</b>' +
      (claudeToolSummary(req.toolName, req.input) ? ' <span class="claude-tool-sum">' + claudeToolSummary(req.toolName, req.input) + '</span>' : '') +
    '</div>' +
    claudeDiffHtml(req.input) +
    '<div class="claude-perm-btns">' +
      '<button class="perm-allow"><i class="codicon codicon-check"></i> Permitir</button>' +
      '<button class="perm-always">Permitir siempre</button>' +
      '<button class="perm-deny"><i class="codicon codicon-close"></i> Denegar</button>' +
    '</div>';
  el('ai-messages').appendChild(card);
  claudeScroll();
  const finish = (label, cls) => {
    card.querySelector('.claude-perm-btns').innerHTML = '<span class="perm-done ' + cls + '">' + label + '</span>';
  };
  card.querySelector('.perm-allow').onclick = () => { window.api.claudePermissionReply(req.id, { behavior: 'allow' }); finish('✔ Permitido', 'ok'); };
  card.querySelector('.perm-always').onclick = () => {
    window.api.claudePermissionReply(req.id, { behavior: 'allow', updatedPermissions: [{ type: 'addRules', rules: [{ toolName: req.toolName }], behavior: 'allow', destination: 'session' }] });
    finish('✔ Permitido siempre', 'ok');
  };
  card.querySelector('.perm-deny').onclick = () => { window.api.claudePermissionReply(req.id, { behavior: 'deny', message: 'Denegado por el usuario' }); finish('✕ Denegado', 'no'); };
}

// Bloque colapsable de razonamiento ("thinking"); se crea/actualiza en vivo.
function claudeThinkBody(text) {
  if (!claudeThinkEl || !claudeThinkEl.isConnected) {
    claudeCurEl = null;
    const card = document.createElement('div');
    card.className = 'claude-think collapsed';
    card.innerHTML = '<div class="claude-think-head"><i class="codicon codicon-lightbulb"></i> Pensando…<i class="codicon codicon-chevron-right tk-chev"></i></div><div class="claude-think-body"></div>';
    card.querySelector('.claude-think-head').onclick = () => card.classList.toggle('collapsed');
    el('ai-messages').appendChild(card);
    claudeThinkEl = card.querySelector('.claude-think-body');
  }
  claudeThinkEl.textContent = text || '';
  claudeScroll();
}

// Procesa un evento del SDK reenviado por el main.
function claudeOnEvent(m) {
  if (!m || !m.type) return;
  if (m.type === 'system' && m.subtype === 'init') {
    if (Array.isArray(m.slash_commands)) claudeSlashCmds = m.slash_commands.map((c) => ({ name: c[0] === '/' ? c : '/' + c, description: '' }));
    return;
  }
  if (m.type === 'stream_event' && m.event) {
    const ev = m.event;
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
      claudeHideWorking();
      if (!claudeCurEl) { claudeCurEl = claudeAddMsg('assistant', ''); claudeCurText = ''; }
      claudeCurText += ev.delta.text || '';
      claudeCurEl.innerHTML = aiMarkdown(claudeCurText) + '<span class="ai-cursor"></span>';
      claudeScroll();
    } else if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'thinking_delta') {
      claudeHideWorking();
      claudeThinkText += ev.delta.thinking || '';
      claudeThinkBody(claudeThinkText);
    }
    return;
  }
  if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
    claudeHideWorking();
    let txt = '', hadTool = false;
    for (const b of m.message.content) {
      if (b.type === 'text') txt += b.text || '';
      else if (b.type === 'thinking') { claudeThinkBody(b.thinking || claudeThinkText); claudeThinkEl = null; claudeThinkText = ''; }
      else if (b.type === 'tool_use') { claudeToolCard(b.id, b.name, b.input); hadTool = true; }
    }
    if (txt.trim()) {
      if (!claudeCurEl) claudeCurEl = claudeAddMsg('assistant', '');
      claudeCurEl.innerHTML = aiMarkdown(txt);
    } else if (claudeCurEl && !claudeCurText.trim()) {
      const wrap = claudeCurEl.closest('.ai-msg'); if (wrap) wrap.remove();
    }
    claudeCurEl = null; claudeCurText = '';
    if (claudeStreaming && hadTool) claudeShowWorking(); // sigue trabajando (corre la herramienta)
    claudeScroll();
    return;
  }
  if (m.type === 'user' && m.message && Array.isArray(m.message.content)) {
    for (const b of m.message.content) {
      if (b.type === 'tool_result') claudeToolResult(b.tool_use_id, b.content, b.is_error);
    }
    if (claudeStreaming) claudeShowWorking(); // el modelo va a seguir pensando
    return;
  }
  if (m.type === 'result') {
    claudeStreaming = false; setClaudeSendStop(false); claudeHideWorking();
    if (typeof m.total_cost_usd === 'number') {
      const c = document.createElement('div'); c.className = 'claude-cost';
      c.textContent = 'Turno: ' + (m.num_turns || 1) + ' · $' + m.total_cost_usd.toFixed(4);
      el('ai-messages').appendChild(c); claudeScroll();
    }
    return;
  }
  if (m.type === '_end') { claudeStreaming = false; setClaudeSendStop(false); claudeCurEl = null; claudeHideWorking(); return; }
  if (m.type === '_error') {
    claudeStreaming = false; setClaudeSendStop(false); claudeCurEl = null; claudeHideWorking();
    const auth = /auth|login|credential|unauthor|api key/i.test(m.error || '');
    claudeAddMsg('assistant', (auth
      ? '⚠ No hay sesión iniciada. Abrí una terminal y corré `claude` una vez para loguearte, o configurá `ANTHROPIC_API_KEY`.'
      : '⚠ Error: ' + (m.error || 'desconocido')));
    return;
  }
}

// Botón enviar ↔ parar.
function setClaudeSendStop(stop) {
  const b = el('ai-send');
  if (!b) return;
  b.classList.toggle('stop', stop);
  b.innerHTML = stop ? '<i class="codicon codicon-stop-circle"></i>' : '<i class="codicon codicon-arrow-up"></i>';
}

// Envía el mensaje del input (inicia la sesión si es el primero).
async function claudeSendMsg() {
  const input = el('ai-input');
  if (claudeStreaming) { // botón en modo "parar": interrumpir sin error
    window.api.claudeInterrupt();
    claudeStreaming = false; claudeStarted = false; // la sesión se cierra: el próximo mensaje arranca una nueva
    setClaudeSendStop(false); claudeHideWorking(); claudeCurEl = null;
    return;
  }
  const text = (input.value || '').trim();
  if (!text) return;
  if (!rootDir) { renderClaudeWelcome(); return; }
  // Comandos locales.
  if (text === '/clear') { input.value = ''; claudeNewChat(); return; }
  if (text === '/model') { input.value = ''; claudeOpenModelMenu(); return; }
  if (text === '/help') {
    input.value = ''; input.style.height = 'auto';
    claudeAddMsg('assistant', 'Comandos: `/clear` nuevo chat · `/model` elegir modelo · `@archivo` agregar contexto.\nEscribí lo que quieras que haga sobre el proyecto.');
    return;
  }
  input.value = ''; input.style.height = 'auto';
  claudeAddMsg('user', text);
  claudeStreaming = true; claudeCurEl = null; claudeCurText = ''; claudeThinkEl = null; claudeThinkText = '';
  setClaudeSendStop(true);
  claudeShowWorking();
  if (!claudeStarted) {
    claudeStarted = true;
    const r = await window.api.claudeStart(rootDir, text, { mode: claudeMode, model: claudeModel, apiKey: claudeApiKey || undefined });
    if (r && r.error) { claudeStreaming = false; setClaudeSendStop(false); claudeStarted = false; claudeHideWorking(); claudeAddMsg('assistant', '⚠ ' + r.error); }
  } else {
    await window.api.claudeSend(text);
  }
}

// Nuevo chat: termina la sesión actual y limpia.
function claudeNewChat() {
  window.api.claudeInterrupt();
  claudeStarted = false; claudeStreaming = false; claudeCurEl = null; claudeCurText = '';
  claudeThinkEl = null; claudeThinkText = ''; claudeTodoCard = null; claudeHideWorking();
  claudeToolCards.clear();
  setClaudeSendStop(false);
  el('ai-messages').innerHTML = '';
  openClaudeChat();
}

// Menú del selector de modelo.
function claudeOpenModelMenu() {
  const menu = el('ai-model-menu');
  if (!menu.hidden) { menu.hidden = true; return; }
  menu.innerHTML = '';
  for (const md of CLAUDE_MODELS) {
    const mi = document.createElement('div'); mi.className = 'mi';
    mi.innerHTML = '<div class="a-top"><i class="codicon codicon-sparkle"></i><span class="a-name">' + md.name + '</span>' +
      (md.value === claudeModel ? '<i class="codicon codicon-check a-check"></i>' : '') + '</div>' +
      '<div class="a-desc">' + md.desc + '</div>';
    mi.onclick = () => {
      menu.hidden = true;
      claudeModel = md.value;
      el('ai-model-name').textContent = md.name;
      saveState({ claudeModel });
      window.api.claudeSetModel(md.value); // efecto inmediato si hay sesión
    };
    menu.appendChild(mi);
  }
  placeAiMenu(menu, el('ai-model'));
}

// Posiciona un menú del composer ARRIBA del botón, alineado por su borde derecho
// y con margen respecto a los bordes de la ventana (para que no se peguen).
function placeAiMenu(menu, anchorEl) {
  if (!menu || !anchorEl) return;
  const r = anchorEl.getBoundingClientRect();
  menu.hidden = false; // visible para poder medir su tamaño
  const M = 12;                                   // margen mínimo del borde
  const mw = menu.offsetWidth || 220;
  let left = r.right - mw;                         // alinear borde derecho con el botón
  left = Math.min(left, window.innerWidth - mw - M);
  left = Math.max(M, left);
  let top = r.top - menu.offsetHeight - 6;         // abrir hacia arriba
  top = Math.max(M, top);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

// Menú del selector de modo de Hydra AI (Preguntar / Automático / Solo chat).
function hydraOpenModeMenu() {
  const menu = el('ai-hmode-menu');
  if (!menu) return;
  if (!menu.hidden) { menu.hidden = true; return; }
  menu.innerHTML = '';
  for (const md of HYDRA_MODES) {
    const mi = document.createElement('div'); mi.className = 'mi';
    mi.innerHTML = '<div class="a-top"><i class="codicon codicon-' + md.icon + '"></i><span class="a-name">' + md.name + '</span>' +
      (md.id === aiPermMode ? '<i class="codicon codicon-check a-check"></i>' : '') + '</div>' +
      '<div class="a-desc">' + md.desc + '</div>';
    mi.onclick = () => {
      menu.hidden = true;
      aiPermMode = md.id;
      const nm = el('ai-hmode-name'); if (nm) nm.textContent = md.name;
      saveState({ aiPermMode });
    };
    menu.appendChild(mi);
  }
  placeAiMenu(menu, el('ai-hmode'));
}

// Menú del selector de modo de permisos.
function claudeOpenModeMenu() {
  const menu = el('ai-cmode-menu');
  if (!menu.hidden) { menu.hidden = true; return; }
  menu.innerHTML = '';
  for (const md of CLAUDE_MODES) {
    const mi = document.createElement('div'); mi.className = 'mi';
    mi.innerHTML = '<div class="a-top"><i class="codicon codicon-' + md.icon + '"></i><span class="a-name">' + md.name + '</span>' +
      (md.id === claudeMode ? '<i class="codicon codicon-check a-check"></i>' : '') + '</div>' +
      '<div class="a-desc">' + md.desc + '</div>';
    mi.onclick = () => {
      menu.hidden = true;
      claudeMode = md.id;
      el('ai-cmode-name').textContent = md.name;
      window.api.claudeSetMode(md.id);
    };
    menu.appendChild(mi);
  }
  placeAiMenu(menu, el('ai-cmode'));
}

// ¿El panel está en modo Claude Code?
function aiClaude() { return claudeActive; }

// Cada modo (Hydra AI / Claude Code / Lumin AI) guarda su propio chat (nodos del
// DOM) para que NO se restaure/pierda al cambiar de pestaña. Mover los nodos
// preserva botones y listeners.
let aiStashHydra = null, aiStashClaude = null, aiStashLumin = null;

// Cambia la pestaña activa del panel de IA, manteniendo chats independientes.
// target: 'hydra' | 'claude' | 'lumin'. open: si abrir el panel al cambiar.
function switchAiTab(target, open) {
  if (target !== 'claude' && target !== 'lumin') target = 'hydra';
  const host = el('ai-messages');
  // 1) Guardar el chat del modo ACTUAL (mover sus nodos a un contenedor detachado).
  const stash = document.createElement('div');
  while (host.firstChild) stash.appendChild(host.firstChild);
  if (aiTab === 'claude') aiStashClaude = stash;
  else if (aiTab === 'lumin') aiStashLumin = stash;
  else aiStashHydra = stash;

  // 2) Cambiar de modo.
  aiTab = target;
  claudeActive = (target === 'claude');
  el('ai-tab-hydra') && el('ai-tab-hydra').classList.toggle('active', target === 'hydra');
  el('ai-tab-claude') && el('ai-tab-claude').classList.toggle('active', target === 'claude');
  el('ai-tab-lumin') && el('ai-tab-lumin').classList.toggle('active', target === 'lumin');
  el('ai-panel').classList.toggle('claude-mode', target === 'claude');
  el('ai-panel').classList.toggle('lumin-mode', target === 'lumin');
  el('ai-input').placeholder =
    target === 'claude' ? 'Pedile algo a Claude Code…  (/ comandos · @ archivos)' :
    target === 'lumin' ? 'Preguntale a Lumin AI…' :
    'Preguntale a Hydra AI…';
  el('ai-suggest') && (el('ai-suggest').hidden = true);
  aiAttached = null; renderAttachPreview();          // adjuntar independiente por modo
  el('ai-input').value = ''; el('ai-input').style.height = 'auto';
  setAiSendStop(false); // limpia clase 'stop'
  // El botón refleja el estado de streaming del modo activo.
  if (target === 'claude') setClaudeSendStop(claudeStreaming);
  else if (target === 'lumin') setAiSendStop(window.luminIsStreaming ? window.luminIsStreaming() : false);
  else setAiSendStop(aiStreaming);
  updateAiGate();
  if (open) toggleAiPanel(true);

  // 3) Restaurar el chat del modo NUEVO (o renderizar fresco si no hay nada).
  const restore = target === 'claude' ? aiStashClaude : target === 'lumin' ? aiStashLumin : aiStashHydra;
  if (restore && restore.childNodes.length) {
    while (restore.firstChild) host.appendChild(restore.firstChild);
  } else if (target === 'claude') {
    if (!claudeStarted) renderClaudeWelcome(); else openClaudeChat();
  } else if (target === 'lumin') {
    if (window.luminRenderInto) window.luminRenderInto();
  } else {
    if (aiMessages && aiMessages.length) loadAiHistory(aiMessages);
    else host.innerHTML = '<div class="ai-welcome"><img src="hydra-ai-oscura.png" class="ai-welcome-logo" alt="">Soy <b>Hydra AI</b>. Preguntame, mandame una imagen o pedime que ejecute algo en la terminal.</div>';
  }
  // Siempre aterrizar en lo más reciente (abajo) al entrar a un chat.
  setTimeout(() => aiScrollToBottom(true), 0);
}

// Compatibilidad: entra/sale del modo Claude Code (usado por instalar/desinstalar).
function toggleClaude(on) {
  on = (on === undefined) ? (aiTab !== 'claude') : on;
  switchAiTab(on ? 'claude' : 'hydra', on);
}

// Habilita el chat de Hydra AI según la extensión "Hydra AI Chat".
function applyAiChat() {
  const on = extActive('hydra-ai-chat');
  const btn = el('ai-toggle');
  if (btn) btn.hidden = !on;
  if (!on) { // sin la extensión: salir de Claude y cerrar el panel
    if (claudeActive) toggleClaude(false);
    if (el('ai-panel') && !el('ai-panel').hidden) toggleAiPanel(false);
  }
}

// Muestra/oculta la pestaña "Lumin AI" (requiere también el chat de Hydra AI).
function applyLumin() {
  const on = extActive('lumin-ai-chat') && extActive('hydra-ai-chat');
  const tab = el('ai-tab-lumin');
  if (tab) tab.hidden = !on;
  if (!on) {
    if (window.luminIsStreaming && window.luminIsStreaming() && window.luminStopChat) window.luminStopChat();
    if (aiTab === 'lumin') switchAiTab('hydra', false);
  }
}

// Muestra/oculta la pestaña "Claude Code" (requiere también el chat de Hydra AI).
function applyClaudeCode() {
  const on = extActive('hydra-claude') && extActive('hydra-ai-chat');
  const tab = el('ai-tab-claude');
  if (tab) tab.hidden = !on;
  if (!on && claudeActive) toggleClaude(false);
}

// ----- Sugerencias en el input: comandos / y menciones @archivo -----------
let claudeSuggestItems = [], claudeSuggestIdx = 0, claudeSuggestMode = null, claudeFileCache = null, claudeFileCacheDir = null;

function claudeFlattenTree(nodes, base, out) {
  for (const n of nodes || []) {
    if (n.type === 'dir') claudeFlattenTree(n.children, base, out);
    else { const rel = n.path.replace(/\\/g, '/').slice(base.length + 1); out.push(rel); }
  }
  return out;
}
async function claudeFiles() {
  if (claudeFileCache && claudeFileCacheDir === rootDir) return claudeFileCache;
  try {
    const tree = await window.api.tree(rootDir);
    const base = rootDir.replace(/\\/g, '/').replace(/\/$/, '');
    claudeFileCache = claudeFlattenTree(tree, base, []).slice(0, 4000);
    claudeFileCacheDir = rootDir;
  } catch (e) { claudeFileCache = []; }
  return claudeFileCache;
}
function claudeHideSuggest() { claudeSuggestMode = null; claudeSuggestItems = []; el('ai-suggest').hidden = true; }
function claudeRenderSuggest() {
  const box = el('ai-suggest');
  if (!claudeSuggestItems.length) { claudeHideSuggest(); return; }
  box.innerHTML = claudeSuggestItems.map((it, i) =>
    '<div class="cs-item' + (i === claudeSuggestIdx ? ' sel' : '') + '" data-i="' + i + '">' +
      '<i class="codicon codicon-' + (claudeSuggestMode === 'slash' ? 'terminal' : 'file') + '"></i>' +
      '<span class="cs-name">' + escapeHtml(it.label) + '</span>' +
      (it.desc ? '<span class="cs-desc">' + escapeHtml(it.desc) + '</span>' : '') + '</div>').join('');
  box.hidden = false;
  for (const row of box.querySelectorAll('.cs-item')) row.onclick = () => claudeAcceptSuggest(+row.dataset.i);
}
async function claudeUpdateSuggest() {
  const t = el('ai-input'); const v = t.value;
  const caret = t.selectionStart;
  const upto = v.slice(0, caret);
  // Comando slash (solo si la línea empieza con / y no hay espacio aún).
  if (/^\/[a-zA-Z]*$/.test(v.trim()) && !v.includes(' ')) {
    const q = v.trim().toLowerCase();
    const all = CLAUDE_LOCAL_CMDS.concat(claudeSlashCmds.filter((c) => !CLAUDE_LOCAL_CMDS.some((l) => l.name === c.name)));
    claudeSuggestMode = 'slash'; claudeSuggestIdx = 0;
    claudeSuggestItems = all.filter((c) => c.name.toLowerCase().startsWith(q)).slice(0, 8).map((c) => ({ label: c.name, desc: c.description || '', insert: c.name + ' ' }));
    claudeRenderSuggest(); return;
  }
  // Mención @archivo (token actual que empieza con @).
  const m = upto.match(/(^|\s)@([^\s]*)$/);
  if (m) {
    const q = m[2].toLowerCase();
    const files = await claudeFiles();
    claudeSuggestMode = 'file'; claudeSuggestIdx = 0;
    claudeSuggestItems = files.filter((f) => f.toLowerCase().includes(q)).slice(0, 8).map((f) => ({ label: f, insert: '@' + f + ' ', at: m.index + m[1].length }));
    claudeRenderSuggest(); return;
  }
  claudeHideSuggest();
}
function claudeAcceptSuggest(i) {
  const it = claudeSuggestItems[i]; if (!it) return;
  const t = el('ai-input');
  if (claudeSuggestMode === 'slash') {
    t.value = it.insert;
  } else {
    const caret = t.selectionStart; const v = t.value;
    const start = (typeof it.at === 'number') ? it.at : v.lastIndexOf('@', caret);
    t.value = v.slice(0, start) + it.insert + v.slice(caret);
  }
  claudeHideSuggest();
  t.focus();
}

// Maneja teclas del popup de sugerencias en modo Claude. Devuelve true si consumió la tecla.
function claudeSuggestKey(e) {
  if (!aiClaude() || el('ai-suggest').hidden || !claudeSuggestItems.length) return false;
  if (e.key === 'ArrowDown') { e.preventDefault(); claudeSuggestIdx = (claudeSuggestIdx + 1) % claudeSuggestItems.length; claudeRenderSuggest(); return true; }
  if (e.key === 'ArrowUp') { e.preventDefault(); claudeSuggestIdx = (claudeSuggestIdx - 1 + claudeSuggestItems.length) % claudeSuggestItems.length; claudeRenderSuggest(); return true; }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); claudeAcceptSuggest(claudeSuggestIdx); return true; }
  if (e.key === 'Escape') { e.preventDefault(); claudeHideSuggest(); return true; }
  return false;
}

el('ai-tab-hydra').addEventListener('click', () => { if (aiTab !== 'hydra') switchAiTab('hydra', true); });
el('ai-tab-claude').addEventListener('click', () => { if (aiTab !== 'claude') switchAiTab('claude', true); });
el('ai-tab-lumin') && el('ai-tab-lumin').addEventListener('click', () => { if (aiTab !== 'lumin') switchAiTab('lumin', true); });
el('ai-lumin-model') && el('ai-lumin-model').addEventListener('click', (e) => { e.stopPropagation(); if (window.luminOpenModelMenu) window.luminOpenModelMenu(); });
el('ai-cmode').addEventListener('click', (e) => { e.stopPropagation(); claudeOpenModeMenu(); });
el('ai-hmode') && el('ai-hmode').addEventListener('click', (e) => { e.stopPropagation(); hydraOpenModeMenu(); });
// Copiar código (botón de cada bloque) o el mensaje entero (acción al hover).
el('ai-messages').addEventListener('click', (e) => {
  const cbtn = e.target.closest('.ai-code-copy');
  if (cbtn) {
    const codeEl = cbtn.closest('.ai-code') && cbtn.closest('.ai-code').querySelector('pre code');
    if (codeEl) {
      try { window.api.clipboardWrite(codeEl.textContent); } catch (err) {}
      cbtn.innerHTML = '<i class="codicon codicon-check"></i> Copiado';
      setTimeout(() => { cbtn.innerHTML = '<i class="codicon codicon-copy"></i> Copiar'; }, 1500);
    }
    return;
  }
  const mbtn = e.target.closest('.ai-msg-copy');
  if (mbtn) {
    const txt = mbtn.closest('.ai-msg') && mbtn.closest('.ai-msg').querySelector('.ai-text');
    if (txt) { try { window.api.clipboardWrite(txt.innerText); } catch (err) {} mbtn.classList.add('done'); setTimeout(() => mbtn.classList.remove('done'), 1500); }
  }
});
el('ai-model').addEventListener('click', (e) => { e.stopPropagation(); claudeOpenModelMenu(); });
el('ai-slash').addEventListener('click', () => {
  const t = el('ai-input'); t.value = '/'; t.focus(); claudeUpdateSuggest();
});
window.api.onClaudeEvent((m) => { if (aiClaude()) claudeOnEvent(m); });
window.api.onClaudePermission((req) => { if (aiClaude()) claudePermCard(req); });
if (window.api.onFsChange) window.api.onFsChange((paths) => handleFsChanges(paths)); // recargar editor + sync al cambiar el disco
// Terminal del navegador: el comando `code <archivo>` pide abrir un archivo en el editor.
window.addEventListener('hydra-web-open', (e) => {
  const p = e && e.detail && e.detail.path;
  if (p) { try { openFile(p, p.split('/').pop()); } catch (err) {} }
});
document.addEventListener('click', () => { ['ai-cmode-menu', 'ai-hmode-menu', 'ai-model-menu', 'ai-lumin-model-menu'].forEach((id) => { const mm = el(id); if (mm) mm.hidden = true; }); });

// Único agente del chat: Hydra AI (sin menú; el rótulo es estático).

el('ai-send').addEventListener('click', () => {
  if (aiTab === 'lumin') { if (window.luminSendOrStop) window.luminSendOrStop(); return; }
  if (aiClaude()) { claudeSendMsg(); return; }
  if (aiStreaming) window.api.aiStop(); else aiSend();
});
el('ai-input').addEventListener('keydown', (e) => {
  if (claudeSuggestKey(e)) return;                     // navegación del popup en modo Claude
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (aiTab === 'lumin') { if (window.luminSend) window.luminSend(); }
    else if (aiClaude()) claudeSendMsg();
    else aiSend();
  }
});
el('ai-input').addEventListener('input', () => {
  const i = el('ai-input'); i.style.height = 'auto'; i.style.height = Math.min(140, i.scrollHeight) + 'px';
  if (aiClaude()) claudeUpdateSuggest();
});
el('ai-clear').addEventListener('click', () => {
  if (aiTab === 'lumin') { if (window.luminNewChat) window.luminNewChat(); return; }
  if (aiClaude()) claudeNewChat(); else aiReset();
});
el('ai-login-btn').addEventListener('click', () => openLogin());
el('act-settings').addEventListener('click', openSettings);
el('updates-refresh').addEventListener('click', () => loadReleases(true));
// Selector de plataforma (Windows / Linux) del panel Hydra Updates.
el('updates-plat-win').addEventListener('click', () => setUpdatesPlatform('win'));
el('updates-plat-linux').addEventListener('click', () => setUpdatesPlatform('linux'));
syncPlatButtons();

// Adjuntar imagen
el('ai-attach').addEventListener('click', () => el('ai-file').click());
el('ai-file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { aiAttached = { dataUrl: reader.result, name: f.name }; renderAttachPreview(); };
  reader.readAsDataURL(f);
  e.target.value = '';
});

el('ai-messages').innerHTML =
  '<div class="ai-welcome"><img src="hydra-ai-oscura.png" class="ai-welcome-logo" alt="">Soy <b>Hydra AI</b>. Preguntame, mandame una imagen o pedime que ejecute algo en la terminal.</div>';
updateAiGate();

// --------------------------------------------------------------------------
// Arranque: estado del núcleo + restaurar sesión anterior
// --------------------------------------------------------------------------
(async () => {
  await updateCoreStatus();
  renderLiveStatus();
  let st = {};
  try { st = (await window.api.getState()) || {}; } catch {}
  applySettings(st.settings);                             // preferencias (fuente, acento, etc.)
  installedExt = new Set(st.installedExtensions || []);    // extensiones instaladas
  disabledExt = new Set(st.disabledExtensions || []);      // extensiones deshabilitadas
  if (typeof window !== 'undefined' && window.__HYDRA_WEB__) {
    for (const id of WEB_HIDDEN_EXT) { installedExt.delete(id); disabledExt.delete(id); }
  }
  if (st.pythonInterpreter) pythonSelected = st.pythonInterpreter; // intérprete de Python elegido
  applyExtensions();
  renderExtensions();
  loadCommunityExtensions();                               // carga + corre extensiones de comunidad instaladas
  if (st.aiHistory) loadAiHistory(st.aiHistory);          // memoria de Hydra AI
  // Hydra AI: restaurar el modo de permisos (Preguntar / Automático / Solo chat).
  if (st.aiPermMode && HYDRA_MODES.some((m) => m.id === st.aiPermMode)) {
    aiPermMode = st.aiPermMode;
    const md = HYDRA_MODES.find((m) => m.id === aiPermMode);
    if (md && el('ai-hmode-name')) el('ai-hmode-name').textContent = md.name;
  }
  savedTermScrollback = st.terminalScrollback || '';
  // Claude Code: restaurar modelo y API key elegidos.
  if (st.claudeModel) { claudeModel = st.claudeModel; const md = CLAUDE_MODELS.find((x) => x.value === claudeModel); if (md && el('ai-model-name')) el('ai-model-name').textContent = md.name; }
  if (st.anthropicApiKey) claudeApiKey = st.anthropicApiKey;
  // Si la sesión anterior se cerró estando en un grupo de Hydra Team, NO se
  // reabre la carpeta compartida (se descarta) — luego se pide abrir otra.
  const closedInTeam = !!st.teamGroupId;
  if (st.lastFolder && !(closedInTeam && st.lastFolder === st.teamBase)) {
    await openFolderPath(st.lastFolder);                  // reabrir carpeta normal
  }
  if (st.terminalOpen) openTerminalPanel();               // reabrir terminal
  if (closedInTeam) teamHandleClosedWhileJoined(st.teamGroupId, st.teamBase);
})();
