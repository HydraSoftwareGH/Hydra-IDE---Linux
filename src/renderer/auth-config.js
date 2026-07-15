// Configuración de Firebase (auth) y Supabase (perfil). Son claves PÚBLICAS de
// cliente (Firebase web config + Supabase anon), seguras de embeber.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCLhFtD8Y2Oj0h9J0kuOpn_l1mjfQ4H_OA',
  authDomain: 'hydra-software-b3408.firebaseapp.com',
  projectId: 'hydra-software-b3408',
  storageBucket: 'hydra-software-b3408.firebasestorage.app',
  messagingSenderId: '321516798200',
  appId: '1:321516798200:web:7b871b5285c0fe660c3b0d',
  measurementId: 'G-N894QT4Y62',
};

// Servidor #1 — CUENTAS / perfiles de usuario.
const SUPABASE_URL = 'https://iubgkxdjohlvmlefyugo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1YmdreGRqb2hsdm1sZWZ5dWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTM3ODAsImV4cCI6MjA5MzE2OTc4MH0.emumEKXCpMYW5vfdzrjqbqyzcPGF4WYqEVGOuHfxJ_4';

// Servidor #2 — EXTENSIONES (marketplace de la comunidad). Solo guarda extensiones.
const SUPABASE_EXT_URL = 'https://gwibpxgibmraqebetvss.supabase.co';
const SUPABASE_EXT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3aWJweGdpYm1yYXFlYmV0dnNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzY1MTgsImV4cCI6MjA5MjkxMjUxOH0.OTCuIj2NpqkSw8bylyd4gajcNx7Fr7T2m8kf4xMriUA';
