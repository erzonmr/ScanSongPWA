// Copia este archivo como config.js y completa los datos de tu proyecto Supabase.
// Supabase → Project Settings → API (o "Connect"): Project URL y la clave pública
// (anon / publishable). Esta clave es pública por diseño: la seguridad la dan
// las políticas RLS definidas en supabase/schema.sql. NUNCA pongas aquí la
// clave "service_role" / "secret".
window.APP_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_CLAVE_PUBLICA',
  // Idioma del OCR: 'spa' (español), 'eng' (inglés) o 'spa+eng'.
  OCR_LANG: 'spa',
};
