// Lanzador de Electron a prueba de entornos.
//
// Algunos entornos (como el terminal integrado de VS Code / Claude Code) dejan
// activa la variable ELECTRON_RUN_AS_NODE=1, que hace que el binario de Electron
// se comporte como Node puro y NO cargue su API (app, ipcMain, etc.).
// Aquí la limpiamos antes de arrancar para evitar ese problema.

const { spawn } = require('child_process');
const electron = require('electron'); // ruta al binario de electron

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 0));
