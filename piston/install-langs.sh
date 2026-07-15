#!/usr/bin/env bash
# Instala un set de lenguajes comunes en el Piston local (una vez levantado).
# Uso:  bash install-langs.sh
# Una instancia nueva de Piston viene SIN lenguajes: hay que instalarlos.
set -e
API="${PISTON_API:-http://localhost:2000/api/v2}"

# Lenguaje:versión (dejá la versión vacía para que Piston elija la última disponible).
LANGS=(
  "python:3.12.0"
  "javascript:20.11.1"   # Node.js
  "typescript:5.0.3"
  "c:10.2.0"
  "c++:10.2.0"
  "java:15.0.2"
  "go:1.16.2"
  "rust:1.68.2"
  "ruby:3.0.1"
  "php:8.2.3"
  "bash:5.2.0"
)

echo "Lenguajes disponibles para instalar en $API:"
curl -s "$API/packages" | head -c 400; echo

for entry in "${LANGS[@]}"; do
  lang="${entry%%:*}"; ver="${entry##*:}"
  echo "→ instalando $lang $ver …"
  curl -s -X POST "$API/packages" -H 'Content-Type: application/json' \
    -d "{\"language\":\"$lang\",\"version\":\"$ver\"}" ; echo
done

echo
echo "Listo. Lenguajes instalados:"
curl -s "$API/runtimes" | tr ',' '\n' | grep -E '"language"' || true
