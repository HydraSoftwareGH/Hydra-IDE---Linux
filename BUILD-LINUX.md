# Build de Linux (x86_64 + ARM64) con GitHub Actions

Los instaladores **`.sh`** de Linux se generan en **GitHub Actions**, no en Windows, porque
los módulos nativos (`node-pty` y `hydra_core`, ambos N-API) deben compilarse **en Linux**
para que la **terminal integrada funcione**.

Workflow: [`.github/workflows/build-linux.yml`](.github/workflows/build-linux.yml)

## Qué hace
- Verifica que el **tag coincida con `package.json.version`** (misma versión que Windows).
- Compila `hydra_core` (`npm run build:native`) y `node-pty` (`node-gyp rebuild`) en Linux.
- Empaqueta con `electron-builder --linux dir` (sin tar.gz) y crea el instalador
  autoextraíble `.sh` con **makeself**, para **x64** (`ubuntu-22.04`) y **arm64**
  (`ubuntu-22.04-arm`, ARM64 nativo de GitHub).
- Verifica que los `.node` sean ELF de Linux de la arquitectura correcta.
- Sube los `.sh` como *artifacts*. Si se empuja un tag `v*`, además crea un **Release** con
  los instaladores (la web y el panel Hydra Updates los leen de aquí).

## Cómo lanzarlo

### 1. Subir el proyecto a GitHub (si aún no está)
```bash
cd "Hydra IDE"
git init
git add .
git commit -m "Hydra IDE + workflow de build Linux"
git branch -M main
git remote add origin https://github.com/<usuario>/<repo>.git
git push -u origin main
```

### 2a. Ejecutar manualmente
GitHub → pestaña **Actions** → *Build Linux (tar.gz x64 + arm64)* → **Run workflow**.
Los `.tar.gz` quedan en los **Artifacts** de la ejecución.

### 2b. O publicar un Release con un tag
```bash
git tag v0.2.3
git push origin v0.2.3
```
Esto genera los tarballs y los adjunta a un Release `v0.2.3`.

## Notas
- Los runners **ARM64** de GitHub (`ubuntu-22.04-arm`) son gratis en repos **públicos**.
  En repos **privados** requieren un plan con runners ARM; si no lo tienes, quita la fila
  `arm64` de la matriz o cámbiala por build con QEMU.
- El icono de Linux se genera en el workflow copiando `Hydra IDE.png` (1024×1024) a
  `build/icon.png`, porque `build/` está en `.gitignore`.
- `npmRebuild` está en `false` a propósito: el workflow compila los nativos **antes**
  de empaquetar, así que electron-builder solo empaqueta los binarios ya correctos.
