// Capa de datos: Supabase (Auth + Postgres + Realtime + Storage).
// Todo se guarda en la nube; en el dispositivo solo queda la sesión de login.

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const BUCKET = 'scans';
const TABLE = 'songs';
const COLUMNS = 'id,title,lyrics,raw_text,image_paths,created_at,updated_at';

let sb = null;

export function isConfigured() {
  const c = window.APP_CONFIG || {};
  return Boolean(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && !c.SUPABASE_URL.includes('TU-PROYECTO'));
}

export async function init() {
  if (sb) return sb;
  const { createClient } = await import(SUPABASE_ESM);
  const c = window.APP_CONFIG;
  sb = createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return sb;
}

function check({ data, error }) {
  if (error) throw new Error(translateError(error.message || String(error)));
  return data;
}

function translateError(msg) {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Debes confirmar tu correo antes de entrar (revisa tu bandeja).';
  if (m.includes('already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión.';
  if (m.includes('password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión con la nube. Revisa tu internet.';
  if (m.includes('row-level security')) return 'Permiso denegado (revisa las políticas RLS en Supabase).';
  if (m.includes('bucket not found')) return 'No existe el bucket "scans" en Supabase Storage (ver docs).';
  return msg;
}

// ---------- Auth ----------
export const auth = {
  async session() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  onChange(cb) {
    const { data } = sb.auth.onAuthStateChange((evt, session) => cb(evt, session));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    return check(await sb.auth.signInWithPassword({ email, password }));
  },
  async signUp(email, password) {
    return check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
  },
  async resetPassword(email) {
    return check(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
  },
  async updatePassword(password) {
    return check(await sb.auth.updateUser({ password }));
  },
  async signOut() {
    await sb.auth.signOut();
  },
};

// ---------- Lectura con visión (Edge Function; la clave de IA no sale del servidor) ----------
export const vision = {
  /**
   * @param {string} image data URL o base64 JPEG
   * @param {{ lang?: string, layout?: string }} [opts]
   * @returns {Promise<string>}
   */
  async transcribe(image, opts = {}) {
    const session = await auth.session();
    if (!session?.access_token) throw new Error('Inicia sesión para usar la lectura con IA.');
    const base = window.APP_CONFIG.SUPABASE_URL.replace(/\/$/, '');
    let res;
    try {
      res = await fetch(`${base}/functions/v1/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: window.APP_CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ image, lang: opts.lang || 'spa', layout: opts.layout || 'column' }),
      });
    } catch {
      throw new Error('Sin conexión. La lectura con IA necesita internet.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('La sesión caducó. Vuelve a entrar y reintenta.');
    if (!res.ok) throw new Error(data.error || 'La IA no pudo leer la foto.');
    if (!data.text || !String(data.text).trim()) throw new Error('La IA no devolvió texto.');
    return String(data.text);
  },
};

// ---------- Canciones ----------
export const songs = {
  async list() {
    return check(await sb.from(TABLE).select(COLUMNS).order('title', { ascending: true }).limit(5000));
  },
  async get(id) {
    return check(await sb.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle());
  },
  async create(song) {
    return check(await sb.from(TABLE).insert(song).select(COLUMNS).single());
  },
  async update(id, patch) {
    return check(await sb.from(TABLE).update(patch).eq('id', id).select(COLUMNS).single());
  },
  async remove(song) {
    if (song.image_paths?.length) await scans.remove(song.image_paths).catch(() => {});
    check(await sb.from(TABLE).delete().eq('id', song.id));
  },
  /**
   * Escucha cambios en tiempo real (otros dispositivos).
   * @param {string} userId
   * @param {(evt: {type:'INSERT'|'UPDATE'|'DELETE', row:any, id:string}) => void} onChange
   * @param {(status:string) => void} onStatus
   */
  subscribe(userId, onChange, onStatus) {
    const channel = sb
      .channel('songs-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` }, (p) => {
        onChange({ type: p.eventType, row: p.new, id: (p.new && p.new.id) || (p.old && p.old.id) });
      })
      .subscribe((status) => onStatus && onStatus(status));
    return () => sb.removeChannel(channel);
  },
};

// ---------- Imágenes escaneadas (Storage) ----------
export const scans = {
  async upload(userId, songId, blob) {
    const path = `${userId}/${songId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    check(await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
    return path;
  },
  async signedUrls(paths, seconds = 3600) {
    if (!paths?.length) return [];
    const data = check(await sb.storage.from(BUCKET).createSignedUrls(paths, seconds));
    return data.map((d) => d.signedUrl).filter(Boolean);
  },
  async remove(paths) {
    if (!paths?.length) return;
    check(await sb.storage.from(BUCKET).remove(paths));
  },
};
