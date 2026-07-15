// Discord Rich Presence para Hydra IDE.
// ---------------------------------------------------------------------------
// Habla directamente con el cliente de Discord por su IPC LOCAL (named pipe en
// Windows, socket unix en Linux/Mac) usando solo Node (`net`). Sin dependencias
// externas ni recompilar nada.
//
// Comportamiento: mientras Hydra IDE esté ABIERTO y Discord se esté ejecutando,
// tu perfil muestra "Jugando a Hydra IDE" con el logo y el tiempo transcurrido.
// Al CERRAR Hydra IDE llamamos a stop(): se limpia la actividad y se cierra la
// conexión, así que Discord borra el estado automáticamente. Por eso el estado
// aparece únicamente cuando el IDE está abierto — que es justo lo pedido.
//
// Requisito único (una sola vez): crear una aplicación en el Discord Developer
// Portal (https://discord.com/developers/applications) para obtener el
// "Application ID" y subir un Art Asset llamado `hydra_ide`. Pegá ese ID abajo
// en CLIENT_ID (o pasalo por la variable de entorno HYDRA_DISCORD_CLIENT_ID).
// Sin un ID válido, este módulo no hace nada (falla en silencio, no molesta).

const net = require('net');
const path = require('path');

// Application ID de la app "Hydra IDE" en el Discord Developer Portal.
// (Se puede sobreescribir con la variable de entorno HYDRA_DISCORD_CLIENT_ID.)
const CLIENT_ID = (process.env.HYDRA_DISCORD_CLIENT_ID || '1525938149770137631').trim();

// Opcodes del protocolo IPC de Discord.
const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

// Rutas candidatas del socket de Discord (probamos 0..9 porque puede haber
// varias instancias). En Windows son named pipes; en Linux/Mac, sockets unix.
function ipcCandidates() {
  if (process.platform === 'win32') {
    const arr = [];
    for (let i = 0; i < 10; i++) arr.push('\\\\?\\pipe\\discord-ipc-' + i);
    return arr;
  }
  const base =
    process.env.XDG_RUNTIME_DIR ||
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    '/tmp';
  // Cubre Discord nativo, Flatpak y Snap.
  const prefixes = [
    '',
    'app/com.discordapp.Discord/',
    'app/com.discordapp.DiscordCanary/',
    'snap.discord/',
    'snap.discord-canary/',
  ];
  const arr = [];
  for (const p of prefixes) {
    for (let i = 0; i < 10; i++) arr.push(path.join(base, p + 'discord-ipc-' + i));
  }
  return arr;
}

class DiscordPresence {
  constructor() {
    this.socket = null;
    this.connected = false; // true tras recibir el evento READY (handshake OK)
    this.buffer = Buffer.alloc(0);
    this.activity = null; // última actividad deseada
    this.startTs = Date.now(); // ancla del "tiempo transcurrido" desde que abriste el IDE
    this.reconnectTimer = null;
    this.stopped = false;
    this.nonce = 0;
  }

  // Arranca la conexión y guarda la actividad base a mostrar.
  start(activity) {
    this.stopped = false;
    if (activity) this.activity = activity;
    this._connect();
  }

  // Cambia la actividad en caliente (p. ej. archivo/proyecto abierto).
  setActivity(activity) {
    this.activity = activity || null;
    if (this.connected) this._sendActivity();
  }

  // Limpia la actividad y cierra la conexión (al salir de Hydra IDE).
  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    try {
      if (this.connected && this.socket) {
        // activity: null → Discord borra el estado inmediatamente.
        this._write(OP_FRAME, {
          cmd: 'SET_ACTIVITY',
          args: { pid: process.pid, activity: null },
          nonce: String(++this.nonce),
        });
      }
    } catch {}
    this._destroy();
  }

  // --- interno ------------------------------------------------------------

  _connect() {
    if (this.stopped || this.socket) return;
    if (!CLIENT_ID || CLIENT_ID === 'PON_AQUI_TU_CLIENT_ID') return; // sin ID configurado: no hacemos nada
    const paths = ipcCandidates();
    const tryNext = (idx) => {
      if (this.stopped) return;
      if (idx >= paths.length) {
        // Discord no está abierto (o no encontramos su socket): reintento suave.
        this._scheduleReconnect();
        return;
      }
      const sock = net.connect(paths[idx]);
      let settled = false;
      sock.once('connect', () => {
        settled = true;
        this.socket = sock;
        this.buffer = Buffer.alloc(0);
        this._bind(sock);
        // Handshake: presentamos la app ante Discord.
        this._write(OP_HANDSHAKE, { v: 1, client_id: CLIENT_ID });
      });
      sock.once('error', () => {
        if (!settled) {
          try { sock.destroy(); } catch {}
          tryNext(idx + 1); // este socket no era: probamos el siguiente
        }
      });
    };
    tryNext(0);
  }

  _bind(sock) {
    sock.on('data', (d) => this._onData(d));
    sock.on('close', () => this._onClose());
    sock.on('error', () => {}); // el cierre real lo gestiona 'close'
  }

  _onClose() {
    this.connected = false;
    this.socket = null;
    if (!this.stopped) this._scheduleReconnect();
  }

  _destroy() {
    this.connected = false;
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.stopped) return;
    // Reintento tranquilo: si Discord aún no está abierto, no pasa nada.
    this.reconnectTimer = setTimeout(() => {
      this.socket = null;
      this._connect();
    }, 15000);
  }

  _write(op, data) {
    if (!this.socket) return;
    const json = Buffer.from(JSON.stringify(data), 'utf8');
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0);
    head.writeInt32LE(json.length, 4);
    try { this.socket.write(Buffer.concat([head, json])); } catch {}
  }

  // Va acumulando bytes y extrae marcos completos (cabecera de 8 bytes + JSON).
  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const op = this.buffer.readInt32LE(0);
      const len = this.buffer.readInt32LE(4);
      if (this.buffer.length < 8 + len) break; // marco aún incompleto
      const payload = this.buffer.slice(8, 8 + len).toString('utf8');
      this.buffer = this.buffer.slice(8 + len);
      let msg = null;
      try { msg = JSON.parse(payload); } catch {}
      this._handle(op, msg);
    }
  }

  _handle(op, msg) {
    if (op === OP_PING) { this._write(OP_PONG, msg); return; } // keep-alive
    if (op === OP_CLOSE) { this._destroy(); this._scheduleReconnect(); return; }
    // READY: handshake aceptado → ya podemos publicar la actividad.
    if (op === OP_FRAME && msg && msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
      this.connected = true;
      this._sendActivity();
    }
  }

  _sendActivity() {
    if (!this.connected || !this.socket) return;
    const a = this.activity;
    const activity = a
      ? {
          details: a.details || undefined,
          state: a.state || undefined,
          timestamps: { start: this.startTs }, // ms → Discord muestra "hace Xm"
          assets: {
            large_image: a.largeImage || 'hydra_ide',
            large_text: a.largeText || 'Hydra IDE',
            small_image: a.smallImage || undefined,
            small_text: a.smallText || undefined,
          },
          buttons: Array.isArray(a.buttons) && a.buttons.length ? a.buttons.slice(0, 2) : undefined,
          instance: false,
        }
      : null;
    this._write(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: String(++this.nonce),
    });
  }
}

// Exportamos una única instancia (singleton) para toda la app.
module.exports = new DiscordPresence();
