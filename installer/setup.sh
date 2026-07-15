#!/bin/sh
# Instalador de Hydra IDE para Linux.
# Se ejecuta DENTRO del instalador autoextraíble (.sh hecho con makeself):
# el directorio actual contiene los archivos de la app + este script.
# - Como root  -> instalación para todo el sistema (/opt + /usr/...).
# - Como usuario -> instalación por-usuario (~/.local/...), sin sudo.
set -e

APP_NAME="Hydra IDE"
SLUG="hydra-ide"

if [ "$(id -u)" = "0" ]; then
  PREFIX="/opt/$SLUG"
  BIN="/usr/local/bin"
  APPS="/usr/share/applications"
  ICONS="/usr/share/icons/hicolor/512x512/apps"
  SUID_SANDBOX=1
else
  PREFIX="$HOME/.local/opt/$SLUG"
  BIN="$HOME/.local/bin"
  APPS="$HOME/.local/share/applications"
  ICONS="$HOME/.local/share/icons/hicolor/512x512/apps"
  SUID_SANDBOX=0
fi

echo "Instalando $APP_NAME en: $PREFIX"

# Copiar los archivos de la app (todo el payload menos este script).
rm -rf "$PREFIX"
mkdir -p "$PREFIX" "$BIN" "$APPS" "$ICONS"
cp -a . "$PREFIX/"
rm -f "$PREFIX/setup.sh"

chmod +x "$PREFIX/$SLUG" 2>/dev/null || true

# Sandbox de Chromium: necesita SUID root. Si instalamos como root lo activamos;
# si es por-usuario no se puede, así que el lanzador usará --no-sandbox.
EXEC_ARGS=""
if [ -f "$PREFIX/chrome-sandbox" ]; then
  if [ "$SUID_SANDBOX" = "1" ]; then
    chown root:root "$PREFIX/chrome-sandbox" && chmod 4755 "$PREFIX/chrome-sandbox"
  else
    EXEC_ARGS="--no-sandbox"
  fi
fi

# Icono para el menú.
if [ -f "$PREFIX/$SLUG.png" ]; then
  cp "$PREFIX/$SLUG.png" "$ICONS/$SLUG.png" 2>/dev/null || true
fi

# Lanzador en el PATH.
cat > "$BIN/$SLUG" <<EOF
#!/bin/sh
exec "$PREFIX/$SLUG" $EXEC_ARGS "\$@"
EOF
chmod +x "$BIN/$SLUG"

# Entrada de menú (.desktop).
cat > "$APPS/$SLUG.desktop" <<EOF
[Desktop Entry]
Name=$APP_NAME
GenericName=Editor de código
Comment=Editor de código estilo VS Code con terminal, Live Server y Git
Exec=$BIN/$SLUG %U
Icon=$SLUG
Terminal=false
Type=Application
Categories=Development;IDE;TextEditor;
StartupNotify=true
StartupWMClass=$APP_NAME
EOF

update-desktop-database "$APPS" 2>/dev/null || true

# Desinstalador con las rutas ya resueltas.
cat > "$PREFIX/uninstall.sh" <<EOF
#!/bin/sh
echo "Desinstalando $APP_NAME..."
rm -f "$BIN/$SLUG" "$APPS/$SLUG.desktop" "$ICONS/$SLUG.png"
rm -rf "$PREFIX"
echo "$APP_NAME desinstalado."
EOF
chmod +x "$PREFIX/uninstall.sh"

echo ""
echo "  $APP_NAME instalado correctamente."
echo "  - Ejecútalo con:  $SLUG"
echo "  - O búscalo en el menú de aplicaciones."
echo "  - Para desinstalar: $PREFIX/uninstall.sh"
if [ "$SUID_SANDBOX" = "0" ]; then
  echo ""
  echo "  (Instalación por-usuario. Si '$SLUG' no se encuentra, agrega"
  echo "   \"$BIN\" a tu PATH. Se ejecuta con --no-sandbox por no ser root.)"
fi
