// PRELOAD: corre en un contexto aislado con acceso a Node, y expone a la UI
// una API mínima y segura (contextBridge). La UI nunca recibe 'require' ni 'fs'
// directamente — solo estas funciones concretas.

const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  readImage: (filePath) => ipcRenderer.invoke('file:readImage', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
  search: (rootDir, query) => ipcRenderer.invoke('search:inFolder', rootDir, query),
  coreStatus: () => ipcRenderer.invoke('core:status'),
  win: (action) => ipcRenderer.invoke('win:action', action),
  tree: (rootDir) => ipcRenderer.invoke('fs:tree', rootDir),
  watchFolder: (root) => ipcRenderer.invoke('fs:watch', root),
  onFsChange: (cb) => ipcRenderer.on('fs:changed', (_e, paths) => cb(paths)),
  createFile: (dirPath, name) => ipcRenderer.invoke('fs:createFile', dirPath, name),
  createFolder: (dirPath, name) => ipcRenderer.invoke('fs:createFolder', dirPath, name),
  rename: (oldPath, newName) => ipcRenderer.invoke('fs:rename', oldPath, newName),
  delete: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),

  // Terminal integrada (multi-sesión: 'main' por defecto, 'claude' para Claude Code)
  termStart: (cwd, cols, rows, sessionId, command) => ipcRenderer.invoke('term:start', cwd, cols, rows, sessionId || 'main', command),
  termInput: (data, sessionId) => ipcRenderer.invoke('term:input', data, sessionId || 'main'),
  termResize: (cols, rows, sessionId) => ipcRenderer.invoke('term:resize', cols, rows, sessionId || 'main'),

  // Portapapeles nativo (fiable, sin depender de navigator.clipboard)
  clipboardWrite: (text) => { try { clipboard.writeText(String(text)); return true; } catch { return false; } },
  clipboardRead: () => { try { return clipboard.readText(); } catch { return ''; } },

  // Estado persistente
  getState: () => ipcRenderer.invoke('state:get'),
  setState: (patch) => ipcRenderer.invoke('state:set', patch),

  // Login con Google por el navegador del sistema
  externalGoogleLogin: () => ipcRenderer.invoke('auth:external'),
  onAuthCredential: (cb) => ipcRenderer.on('auth:credential', (_e, data) => cb(data)),

  // Hydra AI (chat con Groq)
  aiChat: (messages, opts) => ipcRenderer.invoke('ai:chat', messages, opts),
  aiComplete: (prefix, suffix, language) => ipcRenderer.invoke('ai:complete', prefix, suffix, language),
  aiStop: () => ipcRenderer.invoke('ai:stop'),
  aiRun: (cmd, cwd) => ipcRenderer.invoke('ai:run', cmd, cwd),
  aiDelete: (p) => ipcRenderer.invoke('ai:delete', p),
  aiWriteFile: (p, content) => ipcRenderer.invoke('ai:writeFile', p, content),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),
  onAiChunk: (cb) => ipcRenderer.on('ai:chunk', (_e, text) => cb(text)),
  onAiStatus: (cb) => ipcRenderer.on('ai:status', (_e, text) => cb(text)),

  // Lumin AI (extensión "Lumin AI Chat": chat con la flota de Lumin Labs)
  luminChat: (messages, opts) => ipcRenderer.invoke('lumin:chat', messages, opts),
  luminStop: () => ipcRenderer.invoke('lumin:stop'),
  onLuminChunk: (cb) => ipcRenderer.on('lumin:chunk', (_e, text) => cb(text)),

  // Discord Rich Presence: informar proyecto/archivo abierto (opcional)
  setDiscordActivity: (info) => ipcRenderer.invoke('discord:activity', info),

  // Abrir URLs/archivos de forma segura (sin shell, validado en el main)
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),

  // Auto-actualización (electron-updater)
  appVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, data) => cb(data)),

  // Hydra Live (Live Server)
  liveStart: (root, openRel) => ipcRenderer.invoke('live:start', root, openRel),
  liveStop: () => ipcRenderer.invoke('live:stop'),
  liveStatus: () => ipcRenderer.invoke('live:status'),

  // Git Graph
  gitLog: (cwd, limit) => ipcRenderer.invoke('git:log', cwd, limit),
  gitBranch: (cwd) => ipcRenderer.invoke('git:branch', cwd),
  gitInit: (cwd) => ipcRenderer.invoke('git:init', cwd),

  // Control de código fuente (SCM)
  gitStatus: (cwd) => ipcRenderer.invoke('git:status', cwd),
  gitStage: (cwd, file) => ipcRenderer.invoke('git:stage', cwd, file),
  gitUnstage: (cwd, file) => ipcRenderer.invoke('git:unstage', cwd, file),
  gitDiscard: (cwd, file) => ipcRenderer.invoke('git:discard', cwd, file),
  gitCommit: (cwd, message) => ipcRenderer.invoke('git:commit', cwd, message),

  // Python
  pythonDetect: () => ipcRenderer.invoke('python:detect'),
  pythonVersion: (interp) => ipcRenderer.invoke('python:version', interp),

  // Hydra Team (colaboración): carpeta local del grupo
  teamDir: (code) => ipcRenderer.invoke('team:dir', code),
  onTermData: (cb, sessionId) => ipcRenderer.on('term:data:' + (sessionId || 'main'), (_e, data) => cb(data)),
  onTermExit: (cb, sessionId) => ipcRenderer.on('term:exit:' + (sessionId || 'main'), (_e, code) => cb(code)),

  // Claude Code: ¿está instalado el CLI `claude`?
  claudeDetect: () => ipcRenderer.invoke('claude:detect'),

  // Claude Code (Agent SDK): chat GUI con el motor real
  claudeStart: (cwd, prompt, opts) => ipcRenderer.invoke('claude:start', cwd, prompt, opts),
  claudeSend: (text) => ipcRenderer.invoke('claude:send', text),
  claudeInterrupt: () => ipcRenderer.invoke('claude:interrupt'),
  claudeSetMode: (mode) => ipcRenderer.invoke('claude:set-mode', mode),
  claudeSetModel: (model) => ipcRenderer.invoke('claude:set-model', model),
  claudeAuthStatus: (apiKey) => ipcRenderer.invoke('claude:auth-status', apiKey),
  claudePermissionReply: (id, decision) => ipcRenderer.invoke('claude:permission-reply', id, decision),
  onClaudeEvent: (cb) => ipcRenderer.on('claude:event', (_e, m) => cb(m)),
  onClaudePermission: (cb) => ipcRenderer.on('claude:permission', (_e, r) => cb(r)),
});
