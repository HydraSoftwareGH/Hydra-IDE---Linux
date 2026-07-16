# hydra-ai — proxy seguro de Hydra AI

Edge Function que guarda las claves de **Cerebras / Groq / Lumin** del lado
servidor para que no viajen dentro del `app.asar` de la app (serían extraíbles).
La app manda el **ID token de Firebase** del usuario logueado; la función lo
verifica y, si es válido, reenvía la petición al proveedor real con la clave
secreta. La respuesta se reenvía tal cual, incluido el streaming.

```
App (main.js) --Bearer <idToken Firebase>--> hydra-ai --Bearer <secret>--> Cerebras/Groq/Lumin
```

## Deploy (lo corres tú, una vez)

Requiere la CLI de Supabase y estar logueado.

```bash
npm i -g supabase          # si no la tienes
supabase login
supabase link --project-ref iubgkxdjohlvmlefyugo

# Secrets (viven SOLO en Supabase, nunca en git). Cada provider admite VARIAS
# claves separadas por coma → el proxy rota entre ellas y hace failover si una
# se satura (429/503). También acepta el nombre en singular (1 sola clave).
supabase secrets set \
  "CEREBRAS_API_KEYS=csk-1,csk-2,csk-3" \
  "GROQ_API_KEYS=gsk_1,gsk_2,gsk_3,gsk_4,gsk_5" \
  "LUMIN_TOKENS=cdb...-1" \
  FIREBASE_PROJECT_ID=hydra-software-b3408

# Deploy. --no-verify-jwt porque la auth es el token de Firebase (lo validamos
# nosotros dentro de la función), no el JWT de Supabase.
supabase functions deploy hydra-ai --no-verify-jwt
```

Requisito previo (ya lo cumple el login actual de la app): Firebase debe estar
como **Third-Party Auth** en el proyecto de Supabase.

## ⚠️ TODO: rotar las claves

Las 3 claves originales estuvieron hardcodeadas en el repo público, así que
siguen visibles en el historial de git y válidas. Cuando puedas:

1. Entra a cada panel (Cerebras / Groq / Lumin), **revoca** la clave vieja y
   **genera** una nueva.
2. Vuelve a correr `supabase secrets set ...` con las nuevas.
3. `supabase functions deploy hydra-ai --no-verify-jwt`.

No hace falta tocar la app: solo cambian los secrets del servidor.
