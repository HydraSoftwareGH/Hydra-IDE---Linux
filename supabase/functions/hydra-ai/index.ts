// Hydra AI — proxy seguro (Supabase Edge Function, Deno).
//
// Guarda las claves de Cerebras / Groq / Lumin del lado servidor para que NUNCA
// viajen dentro del .asar de la app. La app manda el ID token de Firebase del
// usuario logueado; aquí lo verificamos y, si es válido, reenviamos la petición
// al proveedor real añadiendo la clave secreta (que vive solo en los "secrets"
// de Supabase). La respuesta se reenvía TAL CUAL, incluido el streaming SSE.
//
// Deploy:  supabase functions deploy hydra-ai --no-verify-jwt
// Secrets: CEREBRAS_API_KEY, GROQ_API_KEY, LUMIN_TOKEN, FIREBASE_PROJECT_ID
//
// Se despliega con --no-verify-jwt porque NO usamos JWT de Supabase: la auth es
// el ID token de Firebase, que verificamos nosotros mismos abajo.

import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v5.9.6/index.ts';

// --- Config -----------------------------------------------------------------
const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') || 'hydra-software-b3408';

// Lee un "pool" de claves: primero el nombre en plural (varias separadas por
// coma), y si no, el singular (compatibilidad). Devuelve un array ya limpio.
function pool(plural: string, singular: string): string[] {
  const raw = Deno.env.get(plural) || Deno.env.get(singular) || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Allowlist: cada provider tiene su URL upstream FIJA y su POOL de claves. El
// cliente solo elige el provider (no una URL arbitraria) → no se puede usar de
// open proxy. Con varias claves por provider, el proxy rota entre ellas.
const PROVIDERS: Record<string, { url: string; keys: string[] }> = {
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', keys: pool('CEREBRAS_API_KEYS', 'CEREBRAS_API_KEY') },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', keys: pool('GROQ_API_KEYS', 'GROQ_API_KEY') },
  lumin: { url: 'https://ai.luminlabs.es/api/chat', keys: pool('LUMIN_TOKENS', 'LUMIN_TOKEN') },
};

// JWKS de Google para tokens de Firebase (formato JWK estándar).
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Verifica el ID token de Firebase. Lanza si es inválido/expirado.
async function verifyFirebase(token: string): Promise<void> {
  await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  // 1) Auth: ID token de Firebase en el header Authorization.
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json(401, { error: 'Falta el token de sesión.' });
  try {
    await verifyFirebase(token);
  } catch (_e) {
    return json(401, { error: 'Sesión inválida o expirada.' });
  }

  // 2) Body: { provider, payload }. La URL upstream sale de la allowlist.
  let body: { provider?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch (_e) {
    return json(400, { error: 'JSON inválido.' });
  }
  const target = body.provider ? PROVIDERS[body.provider] : undefined;
  if (!target) return json(400, { error: 'Provider no soportado.' });
  if (!target.keys.length) return json(502, { error: `Falta la clave de ${body.provider} en el servidor.` });

  // 3) Reenviar probando las claves del pool: si una está saturada (429/503),
  //    se rota a la siguiente. Empezamos en un índice al azar para repartir carga
  //    entre usuarios simultáneos. fetch resuelve al llegar las cabeceras (antes
  //    del body), así que podemos ver el status y rotar SIN romper el streaming.
  const keys = target.keys;
  const start = Math.floor(Math.random() * keys.length);
  let upstream: Response | null = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    let r: Response;
    try {
      r = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body.payload ?? {}),
      });
    } catch (_e) {
      continue; // error de red con esta clave → probar la siguiente
    }
    if (r.status !== 429 && r.status !== 503) { upstream = r; break; } // clave usable
    try { await r.body?.cancel(); } catch (_e) { /* liberar la conexión antes de rotar */ }
  }

  // Todas las claves del provider están ocupadas → señal de "en cola" para que
  // el cliente muestre "En cola: N" y reintente. HTTP 429 + { queued: true }.
  if (!upstream) {
    return json(429, { error: `Todas las claves de ${body.provider} están ocupadas.`, queued: true, provider: body.provider });
  }

  const headers = new Headers(CORS);
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('Content-Type', ct);
  return new Response(upstream.body, { status: upstream.status, headers });
});
