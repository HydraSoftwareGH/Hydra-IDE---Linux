// =============================================================================
// i18n.js — Idioma de la interfaz de Hydra IDE (automático según el dispositivo).
//
// El código fuente está escrito en ESPAÑOL (esa es la fuente de la verdad). Esta
// capa NO reemplaza los textos en el código: los superpone en inglés cuando el
// idioma del equipo no es español. Funciona en la app de escritorio (Electron) y
// en el navegador (/ide), porque ambos comparten este index.html.
//
// Cómo elige el idioma:
//   • navigator.language empieza con "es"  → español (no hace nada; es el origen)
//   • cualquier otro idioma                → inglés (traduce la UI visible)
//   • localStorage['hydra-ide-lang']       → override manual futuro ('es' | 'en')
//
// Cómo traduce, de forma SEGURA:
//   • Sólo reemplaza cuando el texto recortado COINCIDE EXACTO con una clave del
//     diccionario (coincidencia de cadena completa). Nunca traduce subcadenas, así
//     que jamás rompe nombres de archivo, código del editor ni datos del usuario.
//   • Ignora por completo los contenedores de datos del usuario (editor Monaco,
//     terminal, árbol de archivos, pestañas, breadcrumbs, chat de IA, resultados
//     de búsqueda, visor de imágenes).
//   • Un MutationObserver traduce también la UI que se crea dinámicamente (menús,
//     paleta de comandos, diálogos, ajustes) sin tener que tocar renderer.js.
//
// Lo que no está en el diccionario queda en español (fallback no destructivo).
// Para ampliar la cobertura, agregá entradas al mapa EN de abajo.
// =============================================================================
(function () {
  'use strict';

  // --- Elegir idioma --------------------------------------------------------
  function detectLang() {
    try {
      var stored = localStorage.getItem('hydra-ide-lang');
      if (stored === 'es' || stored === 'en') return stored;
    } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || 'es').toLowerCase();
    return nav.indexOf('es') === 0 ? 'es' : 'en';
  }

  var LANG = detectLang();

  // --- Diccionario ES → EN (el español es el original en el código) ---------
  // Claves = texto EXACTO tal como aparece en la UI (sin espacios de los bordes).
  var EN = {
    // --- Barra de menús (títulos) ---
    'Archivo': 'File',
    'Editar': 'Edit',
    'Selección': 'Selection',
    'Ver': 'View',
    'Ir': 'Go',
    'Ejecutar': 'Run',
    'Ayuda': 'Help',

    // --- Barra de título / cuenta / ventana ---
    'Cuenta': 'Account',
    'Iniciar sesión': 'Sign in',
    'Minimizar': 'Minimize',
    'Maximizar': 'Maximize',
    'Cerrar': 'Close',
    'Restaurar': 'Restore',

    // --- Barra de actividad (tooltips) ---
    'Explorador (Ctrl+Shift+E)': 'Explorer (Ctrl+Shift+E)',
    'Buscar (Ctrl+Shift+F)': 'Search (Ctrl+Shift+F)',
    'Control de código fuente': 'Source Control',
    'Ejecutar y depurar': 'Run and Debug',
    'Programar en equipo': 'Collaborate',
    'Extensiones': 'Extensions',
    'Administrar': 'Manage',

    // --- Encabezados de la barra lateral ---
    'Explorador': 'Explorer',
    'Buscar': 'Search',
    'Python': 'Python',

    // --- Explorador ---
    'Nuevo archivo': 'New File',
    'Nueva carpeta': 'New Folder',
    'Actualizar': 'Refresh',
    'Contraer todo': 'Collapse All',
    'Archivos abiertos': 'Open Editors',
    'Aún no has abierto una carpeta.': "You haven't opened a folder yet.",
    'Abrir carpeta': 'Open Folder',
    'PROYECTO': 'PROJECT',
    'Detectar intérpretes': 'Detect interpreters',
    'Seleccioná un intérprete de Python': 'Select a Python interpreter',
    'Selección de intérprete': 'Interpreter selection',
    'Vista de Python': 'Python view',
    'REPL de Python': 'Python REPL',
    'Ejecutar archivo': 'Run file',
    'Instalar paquetes (pip)': 'Install packages (pip)',

    // --- Búsqueda ---
    'Buscar en archivos': 'Search in files',

    // --- Bienvenida ---
    'Tu editor de código moderno': 'Your modern code editor',
    'Ir al archivo': 'Go to file',
    'Paleta de comandos': 'Command palette',

    // --- Panel inferior ---
    'PROBLEMAS': 'PROBLEMS',
    'SALIDA': 'OUTPUT',
    'TERMINAL': 'TERMINAL',
    'Cerrar panel': 'Close panel',
    'No se han detectado problemas en el área de trabajo.': 'No problems have been detected in the workspace.',
    'Alternar panel': 'Toggle panel',
    'Nueva terminal': 'New terminal',
    'Terminal': 'Terminal',
    'Terminal: Nueva terminal': 'Terminal: New terminal',

    // --- Panel de IA ---
    'Nuevo chat': 'New chat',
    'Preguntale a Hydra AI…': 'Ask Hydra AI…',
    'Adjuntar imagen': 'Attach image',
    'Adjuntar imágenes': 'Attach images',
    'Comandos': 'Commands',
    'Comandos y @archivos': 'Commands and @files',
    'Modelo': 'Model',
    'Modelo de Lumin': 'Lumin model',
    'Modo de permisos': 'Permission mode',
    'Permisos por acción': 'Per-action permissions',
    'Preguntar': 'Ask',
    'Enviar': 'Send',
    'Chat de IA': 'AI Chat',
    'Sugerencias con IA': 'AI suggestions',
    'Memoria de conversación': 'Conversation memory',
    'Respuestas en streaming': 'Streaming responses',
    'Flota de modelos': 'Model fleet',
    'Modelos y modos': 'Models and modes',
    'Habilita Claude Code': 'Enables Claude Code',
    'Pestaña de Lumin AI': 'Lumin AI tab',

    // --- Barra de estado ---
    'No hay problemas': 'No problems',
    'Listo': 'Ready',
    'Ir a la línea/columna': 'Go to line/column',
    'Seleccionar indentación': 'Select indentation',
    'Seleccionar codificación': 'Select encoding',
    'Seleccionar fin de línea': 'Select end of line',
    'Seleccionar lenguaje': 'Select language',
    'Texto sin formato': 'Plain Text',
    'Seleccionar intérprete de Python': 'Select Python interpreter',
    'Ver el grafo de commits (Git Graph)': 'View commit graph (Git Graph)',
    'Servir la carpeta con Hydra Live': 'Serve the folder with Hydra Live',
    'Cambiar el tema de color': 'Change color theme',
    'Temas': 'Themes',
    'Palabras y caracteres del archivo': 'Words and characters in file',
    'Palabras y caracteres': 'Words and characters',
    'Modo Zen (enfoque)': 'Zen Mode (focus)',
    'Power Mode (efectos al escribir)': 'Power Mode (typing effects)',
    'Reloj': 'Clock',
    'Notificaciones': 'Notifications',
    'Codificación': 'Encoding',
    'Fin de línea': 'End of line',
    'Indentación': 'Indentation',
    'Modo de lenguaje': 'Language mode',
    'Tabulaciones': 'Tabs',
    'Espacios: 2': 'Spaces: 2',
    'Espacios: 4': 'Spaces: 4',
    'Espacios: 8': 'Spaces: 8',
    'Cualquier lenguaje': 'Any language',

    // --- Inicio de sesión ---
    'Iniciar sesión en Hydra IDE': 'Sign in to Hydra IDE',
    'Accedé a tu perfil y llevá tu cuenta a donde vayas.': 'Access your profile and take your account anywhere.',
    'Continuar con Google': 'Continue with Google',
    'Cancelar': 'Cancel',

    // --- Perfil ---
    'Nombre visible': 'Display name',
    'Usuario': 'Username',
    'usuario': 'username',
    'Biografía': 'Biography',
    'Contá algo sobre vos...': 'Tell us about yourself...',
    'Foto de perfil (URL)': 'Profile photo (URL)',
    'Cerrar sesión': 'Sign out',
    'Guardar': 'Save',

    // --- Menú Archivo / Editar / etc. y paleta de comandos ---
    'Cerrar editor': 'Close editor',
    'Cerrar carpeta': 'Close folder',
    'Deshacer': 'Undo',
    'Rehacer': 'Redo',
    'Cortar': 'Cut',
    'Copiar': 'Copy',
    'Pegar': 'Paste',
    'Reemplazar': 'Replace',
    'Alternar comentario de línea': 'Toggle line comment',
    'Seleccionar todo': 'Select all',
    'Seleccionar línea': 'Select line',
    'Copiar línea arriba': 'Copy line up',
    'Copiar línea abajo': 'Copy line down',
    'Mover línea arriba': 'Move line up',
    'Mover línea abajo': 'Move line down',
    'Borrar línea': 'Delete line',
    'Paleta de comandos...': 'Command palette...',
    'Ajustar línea': 'Word wrap',
    'Acercar': 'Zoom in',
    'Alejar': 'Zoom out',
    'Acercar (zoom)': 'Zoom in',
    'Alejar (zoom)': 'Zoom out',
    'Restablecer zoom': 'Reset zoom',
    'Ir al archivo...': 'Go to file...',
    'Ir a la línea...': 'Go to line...',
    'Acerca de Hydra IDE': 'About Hydra IDE',
    'Alternar barra lateral': 'Toggle sidebar',
    'Live Server: Iniciar / Detener (Go Live)': 'Live Server: Start / Stop (Go Live)',
    'Git Graph: Ver grafo de commits': 'Git Graph: View commit graph',
    'Prettier: Formatear documento': 'Prettier: Format document',
    'Formatear al guardar': 'Format on save',
    'Atajo Shift+Alt+F': 'Shortcut Shift+Alt+F',
    'Autocompletado': 'Autocomplete',
    'Texto fantasma': 'Ghost text',

    // --- Menú contextual del explorador ---
    'Renombrar': 'Rename',
    'Eliminar': 'Delete',
    'Abrir con Live Server': 'Open with Live Server',
    'Copiar ruta': 'Copy path',
    'Menú contextual': 'Context menu',
    'Menú y paleta': 'Menu and palette',

    // --- Estados de la IA (streaming) ---
    'Pensando…': 'Thinking…',
    'Trabajando…': 'Working…',
    'Leyendo…': 'Reading…',
    'Escribiendo archivo…': 'Writing file…',
    'Ejecutando comando…': 'Running command…',
    'Borrando…': 'Deleting…',

    // --- Ajustes (tarjetas / secciones) ---
    'Apariencia': 'Appearance',
    'Editor': 'Editor',
    'Terminal integrada': 'Integrated terminal',
    'Preferencias': 'Preferences',
    'Extensiones Instaladas': 'Installed extensions',
    'Selección': 'Selection',
    'Edita tu código': 'Edit your code',
    'Múltiples lenguajes': 'Multiple languages',
    'Oscuros y claros': 'Dark and light',
    'UI + editor': 'UI + editor',
    'Servidor local': 'Local server',
    'Recarga automática': 'Auto reload',
    'Navegador / Live Server': 'Browser / Live Server',
    'Consola': 'Console',
    'Grafo con ramas': 'Graph with branches',
    'Etiquetas y HEAD': 'Tags and HEAD',
    'Detalle de commits': 'Commit details',
    'Diffs por archivo': 'Per-file diffs',
    'Reacciona a eventos': 'Reacts to events',
    'Escena 3D en vivo': 'Live 3D scene',
    'Juegos 3D': '3D games',
    'Partículas': 'Particles',
    'Shake': 'Shake',
    'Sin distracciones': 'Distraction-free',
    'Hora en vivo': 'Live time',
    'Botón "Go Live"': '"Go Live" button',
    'Botón "Temas"': '"Themes" button',
    'Botón en la barra de estado': 'Status bar button',

    // --- Hydra Team (colaboración) ---
    'Sesión en equipo': 'Team session',
    'Carpeta compartida': 'Shared folder',
    'Sincronización en vivo': 'Live sync',
    'Invitar personas': 'Invite people',
    'Unirse con código': 'Join with code',
    'Entrar/salir': 'Join/leave',
    'Pausar / reanudar': 'Pause / resume',
    'Recuerda tu elección': 'Remembers your choice',

    // --- Palabras comunes de diálogos / botones ---
    'Aceptar': 'OK',
    'Sí': 'Yes',
    'No': 'No',
    'Aviso': 'Notice',
    'Error': 'Error',
    'Cargando…': 'Loading…',
    'Cargando...': 'Loading...',
    'Instalar': 'Install',
    'Desinstalar': 'Uninstall',
    'Instalado': 'Installed',
    'Instalada': 'Installed',
    'Habilitar': 'Enable',
    'Deshabilitar': 'Disable',
    'Confirmar': 'Confirm',
    'Continuar': 'Continue',
    'Abrir': 'Open',
    'Guardando…': 'Saving…',
  };

  // --- Motor ----------------------------------------------------------------
  // Atributos de texto que traducimos (tooltips, placeholders, etiquetas).
  var ATTRS = ['title', 'placeholder', 'aria-label'];

  // Subárboles de DATOS DEL USUARIO que nunca se tocan (código, nombres de
  // archivo, contenido del chat, resultados de búsqueda, imágenes…).
  var SKIP_SEL = [
    '#monaco', '.monaco-editor', '#terminal-container', '#terminal-body',
    '#tree', '#open-list', '#tabs', '#breadcrumbs',
    '#ai-messages', '#search-results', '#image-view', '#gitgraph-view',
    '#threed-view', '[data-i18n-skip]',
  ].join(',');

  function inSkip(node) {
    var e = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(e && e.closest && e.closest(SKIP_SEL));
  }

  function tr(str) {
    var s = String(str);
    var key = s.trim();
    if (!key || !Object.prototype.hasOwnProperty.call(EN, key)) return null;
    return s.replace(key, EN[key]); // conserva los espacios de los bordes
  }

  function translateTextNode(node) {
    var raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    var out = tr(raw);
    if (out !== null && out !== raw && !inSkip(node)) node.nodeValue = out;
  }

  function translateAttrs(elm) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!elm.hasAttribute || !elm.hasAttribute(a)) continue;
      var out = tr(elm.getAttribute(a));
      if (out !== null) elm.setAttribute(a, out);
    }
  }

  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) { translateTextNode(node); return; } // texto
    if (node.nodeType !== 1) return;                              // sólo elementos
    if (inSkip(node)) return;                                     // datos del usuario
    translateAttrs(node);
    for (var n = node.firstChild; n; n = n.nextSibling) walk(n);
  }

  function translateAll() {
    if (LANG === 'es') return;
    try { document.documentElement.lang = 'en'; } catch (e) {}
    if (document.body) walk(document.body);
  }

  // Observa la UI creada dinámicamente (menús, diálogos, ajustes, paleta…).
  var observer = null;
  function startObserver() {
    if (LANG === 'es' || observer || !document.body) return;
    observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (inSkip(m.target)) continue; // corta rápido dentro de Monaco/terminal/etc.
        if (m.type === 'attributes') {
          if (m.target.nodeType === 1) translateAttrs(m.target);
        } else if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        }
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ATTRS,
    });
  }

  function init() {
    translateAll();
    startObserver();
  }

  // API pública (por si renderer.js quiere traducir cadenas dinámicas o cambiar
  // el idioma desde un futuro selector en Ajustes).
  window.HydraI18n = {
    lang: LANG,
    // t('texto en español') -> inglés si corresponde, o el mismo texto.
    t: function (es) { if (LANG === 'es') return es; var o = tr(es); return o === null ? es : o; },
    translate: translateAll,
    setLang: function (l) {
      if (l !== 'es' && l !== 'en') return;
      try { localStorage.setItem('hydra-ide-lang', l); } catch (e) {}
      // El cambio pleno se aplica al recargar (la UI ya renderizada es española).
      try { location.reload(); } catch (e) {}
    },
  };
  window.t = window.HydraI18n.t;

  // Traducir lo antes posible para evitar parpadeo, y de nuevo al cargar el DOM.
  if (LANG !== 'es') {
    if (document.body) init();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
