# Hydra IDE

Un editor de código con interfaz **estilo Visual Studio Code**, construido con
**Electron** y un **núcleo en C++** expuesto a Node.js mediante **N-API**
(`node-addon-api`). Interfaz con barra de actividad, explorador, pestañas,
iconos oficiales de VS Code (Codicons) y la paleta del tema Dark+.

El editor ya funciona solo con JavaScript; el módulo C++ acelera la búsqueda de
texto en toda la carpeta. Si C++ no está compilado, hay un respaldo en JS, así
que la app arranca igual.

## Arquitectura

```
┌─────────────────────────────────────────────┐
│  Renderer  (src/renderer/)                   │  ← la UI: HTML/CSS/JS
│  Árbol · tabs · editor · búsqueda            │     sin acceso al disco
└───────────────┬─────────────────────────────┘
                │  window.api.*  (preload.js, contextBridge)
                │  ── IPC ──
┌───────────────▼─────────────────────────────┐
│  Main process  (src/main.js)  Node.js        │  ← abre ventanas,
│  diálogos · leer/guardar archivos            │     lee/escribe archivos
└───────────────┬─────────────────────────────┘
                │  require('hydra_core.node')
┌───────────────▼─────────────────────────────┐
│  Núcleo C++  (src/native/search.cpp)         │  ← trabajo pesado:
│  búsqueda recursiva con std::filesystem      │     I/O y escaneo de texto
└─────────────────────────────────────────────┘
```

### Las dos formas de usar C++ con Electron

1. **Módulo nativo / N-API (lo que usa este proyecto).** C++ se compila como
   un addon (`.node`) que Node carga con `require`. Misma memoria, llamadas
   directas, sin serializar datos. Ideal para CPU/IO intensivos.
2. **Proceso separado (IPC).** Un binario C++ independiente que habla con
   Electron por stdin/stdout o sockets (estilo Language Server). Más
   desacoplado y reutilizable, pero hay que serializar mensajes.

## Requisitos

- Node.js 18+ (tienes 22 ✔)
- Python 3 (lo usa node-gyp ✔)
- **Compilador C++** — en Windows: *Visual Studio Build Tools* con la carga
  **"Desktop development with C++"**. Sin esto, el editor funciona pero con el
  respaldo JS en vez del núcleo C++.

### Instalar las Build Tools de C++ (Windows)

Opción rápida con winget:

```bash
winget install Microsoft.VisualStudio.2022.BuildTools \
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

O descarga manual: <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
y marca *"Desarrollo para el escritorio con C++"*. Reinicia la terminal después.

## Uso

```bash
npm install            # dependencias (instala y compila el addon C++ si hay compilador)
npm run build:native   # (re)compila solo el núcleo C++
npm start              # arranca el editor
```

Si cambiás `search.cpp`, recompilá con `npm run build:native` y reiniciá.

## Qué hace el MVP

- 📁 Abrir una carpeta y navegar el árbol de archivos
- 📄 Abrir archivos en pestañas (con indicador de cambios sin guardar)
- ✏️ Editar con números de línea y posición del cursor
- 💾 Guardar con botón o `Ctrl+S`
- 🔎 Buscar texto en toda la carpeta — ejecutado en **C++**

## Siguientes pasos sugeridos

- Resaltado de sintaxis (incrustar Monaco o CodeMirror)
- Mover la búsqueda C++ a un hilo (`Napi::AsyncWorker`) para no bloquear la UI
- Crear/renombrar/borrar archivos desde el árbol
- Indexado de símbolos en C++ para "ir a definición"
