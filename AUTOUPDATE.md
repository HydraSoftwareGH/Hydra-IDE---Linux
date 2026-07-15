# Auto-actualización de Hydra IDE

Hydra IDE se actualiza solo en todos los usuarios usando **electron-builder**
(genera el instalador) + **electron-updater** (descarga e instala) +
**GitHub Releases** (donde subís cada versión).

> ⚠️ El auto-update SOLO funciona en la app **instalada** (el `.exe` del instalador).
> En desarrollo (`npm start`) no corre — es normal.

---

## Cómo sacar una actualización (cada vez)

1. **Subí el número de versión** en `package.json` (campo `"version"`).
   Ej: de `0.1.0` a `0.1.1`. electron-updater compara este número.

2. **Generá y publicá la Release** en un solo comando:

   ```bash
   # Necesitás un token de GitHub con permiso sobre el repo (ver abajo)
   set GH_TOKEN=ghp_tu_token_aqui        # PowerShell:  $env:GH_TOKEN="ghp_..."
   npm run release
   ```

   Esto compila el instalador y **sube a GitHub Releases** (como borrador):
   - `Hydra IDE-Setup-0.1.1.exe`  ← el instalador
   - `latest.yml`                 ← el archivo que lee electron-updater
   - `*.blockmap`                 ← para descargas diferenciales (más rápidas)

3. Entrá a **GitHub → Releases**, abrí el borrador y **publicalo** (Publish release).

4. Listo. Los usuarios que tengan Hydra IDE abierto reciben la actualización en
   segundo plano (en minutos / al próximo chequeo), y ven el banner
   **“Hydra IDE X.Y.Z está listo para instalar → Reiniciar e instalar”**.
   La app revisa al abrir y cada 1 hora.

---

## Configuración inicial (una sola vez)

### 1. Token de GitHub
- GitHub → Settings → Developer settings → **Personal access tokens** →
  *Tokens (classic)* → Generate new token con permiso **`repo`**.
- Guardalo en la variable `GH_TOKEN` antes de `npm run release`.

### 2. El repo
- El `package.json` ya apunta a:
  ```json
  "publish": [{ "provider": "github", "owner": "HydraSoftwareGH", "repo": "Hydra-IDE" }]
  ```
- Si cambiás de repo/usuario, actualizá `owner`/`repo` ahí.

### 3. Ícono del instalador (opcional)
- Poné un `build/icon.ico` (256×256 o mayor) para que el instalador y la app
  usen tu logo. Sin eso, usa el ícono por defecto de Electron.

---

## Probar el auto-update de punta a punta

1. `npm run dist` (sin publicar) → te genera el instalador en `dist/`.
2. Instalá esa versión (ej. 0.1.0) en tu PC.
3. Subí la versión en `package.json` (0.1.1), `npm run release`, publicá la Release.
4. Abrí la app 0.1.0 instalada → debería detectar la 0.1.1, descargarla y mostrar
   el banner para reiniciar.

---

## Notas

- **Sin firma de código**: en Windows funciona igual, pero la **primera** instalación
  muestra el aviso de SmartScreen (“Windows protegió tu PC” → *Más información* →
  *Ejecutar de todas formas*). Las actualizaciones siguientes son automáticas.
  Para quitar ese aviso hace falta un **certificado de firma de código** (de pago).
- El repo debe ser **público** (o el token con acceso) para que electron-updater
  pueda leer las Releases.
- `node-pty` (la terminal) se empaqueta como módulo nativo desempaquetado
  (`asarUnpack`), ya configurado en `package.json`.
