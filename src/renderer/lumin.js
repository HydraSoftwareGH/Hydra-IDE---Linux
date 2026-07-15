// ============================================================================
// lumin.js — Extensión "Lumin AI Chat": pestaña de IA en el panel de Hydra IDE.
//
// Reutiliza el panel COMPARTIDO (#ai-messages / #ai-input / #ai-send) y expone
// el contrato window.lumin* que consume renderer.js (switchAiTab y los botones
// del panel):
//   · luminRenderInto()   → dibuja bienvenida/historial al entrar a la pestaña
//   · luminSend()         → envía el texto del input
//   · luminSendOrStop()   → botón enviar: manda si está libre, detiene si stream
//   · luminNewChat()      → limpia la conversación
//   · luminIsStreaming()  → ¿hay respuesta en curso?
//   · luminStopChat()     → corta el streaming
//   · luminOpenModelMenu()→ abre el selector de modelo (#ai-lumin-model-menu)
//
// Habla con el proceso main por window.api.luminChat()/onLuminChunk() (el token
// vive SOLO en main). En el navegador el puente (web-api.js) devuelve un stub
// que avisa que la IA es exclusiva de la app de escritorio.
//
// Se apoya en helpers globales de renderer.js: aiMarkdown() y escapeHtml().
// ============================================================================
(function () {
  'use strict';

  var LOGO = 'ext/lumin-official.png';
  var MODELS = [
    { id: 'lumin-vera-3', name: 'Lumin Vera 3', tag: 'Insignia', desc: 'Modelo multimodal insignia de Lumin Labs.' },
    { id: 'webdev-2-mini', name: 'Webdev 2 Mini', desc: 'Ágil y económico, ideal para desarrollo web.' },
    { id: 'spark-preview', name: 'Spark Preview', desc: 'Preview experimental, muy baja latencia.' },
  ];

  var model = 'lumin-vera-3';
  var messages = [];     // historial: { role:'user'|'assistant', content:string }
  var streaming = false;
  var curText = '';      // texto del assistant que se está recibiendo
  var curTextEl = null;  // nodo .ai-text del assistant en curso

  function host() { return document.getElementById('ai-messages'); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function md(t) { return (typeof aiMarkdown === 'function') ? aiMarkdown(t || '') : esc(t); }
  function setSendStop(on) { if (typeof setAiSendStop === 'function') setAiSendStop(on); }

  function modelName() { for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === model) return MODELS[i].name; return 'Lumin'; }
  function syncModelLabel() { var e = document.getElementById('ai-lumin-model-name'); if (e) e.textContent = modelName(); }

  // --- Render ----------------------------------------------------------------
  function welcomeHTML() {
    return '<div class="lumin-welcome">' +
      '<div class="lumin-hero">' +
      '<img src="' + LOGO + '" class="lumin-hero-logo" alt="Lumin AI">' +
      '<div class="lumin-hero-title">Lumin AI</div>' +
      '<div class="lumin-hero-sub">Flota multimodal de <b>Lumin Labs</b></div>' +
      '</div>' +
      '<div class="lumin-hero-text">Un asistente de programación con memoria de conversación. ' +
      'Preguntale lo que quieras o pedile ayuda con tu código.</div>' +
      '<div class="lumin-chips">' +
      '<span class="lumin-chip"><i class="codicon codicon-chip"></i> ' + esc(modelName()) + '</span>' +
      '<span class="lumin-chip"><i class="codicon codicon-sync"></i> Streaming</span>' +
      '<span class="lumin-chip"><i class="codicon codicon-save"></i> Memoria</span>' +
      '</div>' +
      '<div class="lumin-foot">La IA de Lumin funciona en la app de escritorio de Hydra IDE.</div>' +
      '</div>';
  }

  // Crea una burbuja de mensaje y devuelve su nodo .ai-text.
  function addBubble(role, text) {
    var wrap = document.createElement('div');
    wrap.className = 'ai-msg lumin-msg ' + role;
    var r = document.createElement('div'); r.className = 'ai-role';
    r.innerHTML = role === 'user'
      ? '<i class="codicon codicon-account"></i> Vos'
      : '<img src="' + LOGO + '" class="lumin-role-ic" alt=""> Lumin AI';
    var t = document.createElement('div'); t.className = 'ai-text';
    if (role === 'user') t.textContent = text || '';
    else t.innerHTML = md(text);
    wrap.appendChild(r); wrap.appendChild(t);
    var h = host(); if (!h) return t;
    var w = h.querySelector('.lumin-welcome'); if (w) w.remove();
    h.appendChild(wrap);
    h.scrollTop = h.scrollHeight;
    return t;
  }

  // Dibuja bienvenida o historial dentro del panel compartido (al entrar a la pestaña).
  window.luminRenderInto = function () {
    var h = host(); if (!h) return;
    h.innerHTML = '';
    if (!messages.length) { h.innerHTML = welcomeHTML(); syncModelLabel(); return; }
    for (var i = 0; i < messages.length; i++) addBubble(messages[i].role, messages[i].content);
    if (streaming) { // reconstruir la burbuja en curso con cursor
      curTextEl = addBubble('assistant', '');
      curTextEl.innerHTML = md(curText) + '<span class="ai-cursor"></span>';
    }
    syncModelLabel();
    h.scrollTop = h.scrollHeight;
  };

  // --- Envío / streaming -----------------------------------------------------
  window.luminIsStreaming = function () { return streaming; };

  window.luminSend = function () {
    if (streaming) return;
    var input = document.getElementById('ai-input');
    if (!input) return;
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = ''; input.style.height = 'auto';
    addBubble('user', text);
    messages.push({ role: 'user', content: text });
    // Burbuja del assistant en curso (solo cursor hasta que lleguen chunks).
    curText = '';
    curTextEl = addBubble('assistant', '');
    curTextEl.innerHTML = '<span class="ai-cursor"></span>';
    streaming = true; setSendStop(true);
    Promise.resolve(window.api.luminChat(messages.slice(), { model: model }))
      .then(function (res) { finishStream(res || {}); })
      .catch(function (e) {
        if (!curText) curText = '⚠️ ' + (e && e.message ? e.message : 'Error de conexión.');
        finishStream({ error: e && e.message });
      });
  };

  function finishStream(res) {
    streaming = false; setSendStop(false);
    if (res && res.error && !curText) curText = '⚠️ ' + res.error;
    if (curTextEl) curTextEl.innerHTML = md(curText);
    messages.push({ role: 'assistant', content: curText });
    curText = ''; curTextEl = null;
    var h = host(); if (h) h.scrollTop = h.scrollHeight;
  }

  window.luminStopChat = function () {
    if (!streaming) return;
    try { window.api.luminStop(); } catch (e) {}
    finishStream({});
  };

  window.luminSendOrStop = function () { if (streaming) window.luminStopChat(); else window.luminSend(); };

  window.luminNewChat = function () {
    if (streaming) { try { window.api.luminStop(); } catch (e) {} }
    streaming = false; curText = ''; curTextEl = null; messages = [];
    setSendStop(false);
    window.luminRenderInto();
  };

  // Chunks del streaming (main → renderer). Se engancha UNA vez al cargar el módulo.
  window.api.onLuminChunk(function (delta) {
    if (!streaming || !curTextEl) return;
    curText += delta;
    curTextEl.innerHTML = md(curText) + '<span class="ai-cursor"></span>';
    var h = host(); if (h) h.scrollTop = h.scrollHeight;
  });

  // --- Selector de modelo ----------------------------------------------------
  window.luminOpenModelMenu = function () {
    var menu = document.getElementById('ai-lumin-model-menu');
    if (!menu) return;
    if (!menu.hidden) { menu.hidden = true; return; }
    menu.innerHTML = '';
    for (var i = 0; i < MODELS.length; i++) {
      (function (m) {
        var it = document.createElement('button');
        it.className = 'lumin-model-item' + (m.id === model ? ' active' : '');
        it.innerHTML =
          '<div class="di-main"><i class="codicon codicon-chip"></i>' + esc(m.name) +
          (m.tag ? '<span class="lumin-mtag">' + esc(m.tag) + '</span>' : '') + '</div>' +
          '<div class="di-desc">' + esc(m.desc) + '</div>';
        it.onclick = function () {
          model = m.id; syncModelLabel(); menu.hidden = true;
          if (!messages.length) window.luminRenderInto(); // refrescar el chip de la bienvenida
        };
        menu.appendChild(it);
      })(MODELS[i]);
    }
    var btn = document.getElementById('ai-lumin-model');
    var r = btn ? btn.getBoundingClientRect() : { left: 20, top: 80 };
    menu.hidden = false;
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, r.top - menu.offsetHeight - 6) + 'px'; // abrir hacia arriba
  };

  // Etiqueta inicial del botón de modelo.
  syncModelLabel();
})();
