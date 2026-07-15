# Piston self-hosted para Hydra IDE (ejecución REAL en la terminal web)

La terminal del **IDE web** ejecuta código con la [API de Piston](https://github.com/engineer-man/piston).
La instancia pública `emkc.org` quedó **whitelist-only (15/02/2026)**, así que para que
`run`, `python`, `node`, etc. **funcionen de verdad** hay que correr Piston localmente.

## Qué SÍ y qué NO puede hacer

- ✅ Ejecutar **archivos de código sueltos** en ~80 lenguajes: `run app.py`, `node script.js`,
  `python main.py`, `go run main.go`, etc. (código autocontenido).
- ❌ Correr un **dev server** (`npm run dev` → vite) ni **instalar `node_modules`**.
  Piston ejecuta un programa con timeout en un sandbox: no hay procesos persistentes,
  ni red, ni dependencias del proyecto. Para eso usá la **app de escritorio** de Hydra IDE.

## Requisitos
- Docker + Docker Compose.

## Pasos

```bash
cd piston

# 1) Levantar Piston + proxy CORS
docker compose up -d

# 2) Instalar lenguajes (una instancia nueva viene vacía)
bash install-langs.sh
#   o manualmente:
#   curl -X POST http://localhost:2000/api/v2/packages \
#        -H 'Content-Type: application/json' \
#        -d '{"language":"python","version":"3.12.0"}'
```

## Conectar el IDE web

En la **terminal del IDE web** (Chrome/Edge/Opera):

```
piston url http://localhost:2001/api/v2
piston list
```

> Importante: apuntá al **proxy (:2001)**, no a la API directa (:2000). El proxy agrega
> las cabeceras **CORS** que el navegador necesita para llamar desde otro origen.

Probá:

```
echo "print('hola desde Piston')" > hola.py
run hola.py
```

## ¿Necesitás autenticación / whitelist en emkc?

Si en vez de self-hostear conseguís acceso a un Piston con token:

```
piston url https://tu-instancia/api/v2
piston token TU_TOKEN
```

El IDE manda `Authorization: Bearer TU_TOKEN`. La config se guarda en el navegador
(`localStorage` → `hydra-piston`).

## Puertos
- `2000` — API de Piston directa (para `curl` / instalar paquetes).
- `2001` — API con CORS (para el IDE web). **Esta es la que va en `piston url`.**
