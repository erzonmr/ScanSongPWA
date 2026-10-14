// Cantoral — aplicación principal (router + vistas).
import { $, escapeHtml, toast, debounce, fold, slugify, downloadText, formatDate, prefs, icons } from './lib.js';
import * as db from './db.js';
import { stripChords, guessTitle } from './chords.js';
import { mountScanner } from './scanner.js';
import { toUploadBlob } from './imaging.js';

const APP_VERSION = '1.1.0';

const state = {
  session: null,
  songs: new Map(),     // id -> canción (en memoria, fuente de verdad: la nube)
  loaded: false,
  draft: null,          // canción en edición (nueva o existente)
  query: '',
  realtime: 'off',
  unsubscribeRealtime: null,
  viewCleanup: null,
  installPrompt: null,
  wakeLock: null,
};

const app = $('#app');

// ======================= Arranque =======================
// (boot() se invoca al final del archivo, cuando todo está declarado)

async function boot() {
  registerServiceWorker();
  setupChrome();

  if (!db.isConfigured()) return renderSetup();

  try {
    await db.init();
  } catch (err) {
    return renderFatal('No se pudo cargar la librería de la nube. Revisa tu conexión a internet.', err);
  }

  // Importante: no llamar a Supabase dentro del callback (puede bloquearse);
  // se difiere con setTimeout.
  db.auth.onChange((evt, session) => setTimeout(() => handleAuth(evt, session), 0));

  state.session = await db.auth.session();
  if (state.session) await startSession();
  window.addEventListener('hashchange', route);
  route();
}

async function handleAuth(evt, session) {
  if (evt === 'PASSWORD_RECOVERY') { state.session = session; return renderNewPassword(); }
  const before = state.activeUser || null;
  state.session = session;
  if (session) await startSession(); else endSession();
  // Solo re-renderizar si cambió el usuario (no en cada renovación de token,
  // para no interrumpir un escaneo en curso).
  if ((session?.user?.id || null) !== before) route();
}

async function startSession() {
  const uid = state.session.user.id;
  if (state.activeUser === uid) return;
  state.activeUser = uid;
  await refreshSongs();
  if (state.unsubscribeRealtime) state.unsubscribeRealtime();
  state.unsubscribeRealtime = db.songs.subscribe(state.session.user.id, onRemoteChange, (status) => {
    state.realtime = status === 'SUBSCRIBED' ? 'on' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'off';
    updateSyncDot();
    if (status === 'SUBSCRIBED') refreshSongs(true); // al reconectar, trae lo que se perdió
  });
}

function endSession() {
  state.activeUser = null;
  if (state.unsubscribeRealtime) state.unsubscribeRealtime();
  state.unsubscribeRealtime = null;
  state.songs.clear();
  state.loaded = false;
  state.draft = null;
  state.realtime = 'off';
  updateSyncDot();
}

async function refreshSongs(silent = false) {
  if (!state.session) return;
  try {
    setSyncBusy(true);
    const list = await db.songs.list();
    state.songs = new Map(list.map((s) => [s.id, s]));
    state.loaded = true;
    if (silent) rerenderIfShowingData();
  } catch (err) {
    if (!silent) toast(err.message, { error: true });
  } finally {
    setSyncBusy(false);
  }
}

function onRemoteChange({ type, row, id }) {
  if (type === 'DELETE') state.songs.delete(id);
  else if (row) state.songs.set(row.id, row);
  rerenderIfShowingData(type === 'DELETE' ? id : null);
}

function rerenderIfShowingData(deletedId) {
  const [name, param] = parseHash();
  if (name === 'list') renderList();
  else if (name === 'song') {
    if (deletedId && deletedId === param) { toast('Esta canción se eliminó en otro dispositivo.'); location.hash = '#/'; }
    else renderSong(param);
  }
}

// ======================= Chrome (topbar, red, PWA) =======================
function setupChrome() {
  $('#btn-back').onclick = () => {
    if (state.draft?.dirty && !confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) return;
    if (parseHash()[0] === 'draft') state.draft = null;
    history.length > 1 ? history.back() : (location.hash = '#/');
  };
  $('#btn-settings').onclick = () => (location.hash = '#/settings');

  const net = () => {
    $('#offline-banner').hidden = navigator.onLine;
    updateSyncDot();
    if (navigator.onLine && state.session) refreshSongs(true);
  };
  window.addEventListener('online', net);
  window.addEventListener('offline', net);
  net();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (state.session) refreshSongs(true);
      if (state.wakeLockWanted) requestWakeLock();
    }
  });

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });
  window.addEventListener('beforeunload', (e) => { if (state.draft?.dirty) { e.preventDefault(); e.returnValue = ''; } });
}

function setTopbar(title, { back = false, settings = false } = {}) {
  $('#topbar-title').textContent = title;
  $('#btn-back').hidden = !back;
  $('#btn-settings').hidden = !settings;
  $('#sync-dot').hidden = !state.session;
  document.title = title === 'Cantoral' ? 'Cantoral' : `${title} · Cantoral`;
}

let busyCount = 0;
function setSyncBusy(on) { busyCount += on ? 1 : -1; updateSyncDot(); }
function updateSyncDot() {
  const dot = $('#sync-dot');
  dot.classList.remove('off', 'busy');
  if (busyCount > 0) { dot.classList.add('busy'); dot.title = 'Sincronizando…'; }
  else if (!navigator.onLine || state.realtime !== 'on') { dot.classList.add('off'); dot.title = 'Sincronización en tiempo real desconectada'; }
  else dot.title = 'Sincronizado en tiempo real';
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e));
  }
}

// ======================= Router =======================
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const [name, param] = path.split('/');
  return [name || 'list', param, new URLSearchParams(query || '')];
}

function route() {
  if (state.viewCleanup) { state.viewCleanup(); state.viewCleanup = null; }
  releaseWakeLock();
  window.scrollTo(0, 0);

  if (!state.session) return renderAuth();
  const [name, param, query] = parseHash();
  switch (name) {
    case 'list': return renderList();
    case 'song': return renderSong(param);
    case 'scan': return renderScan(query.get('append') === '1');
    case 'draft': return renderDraft();
    case 'new': startDraft(null); return renderDraft();
    case 'edit': {
      const song = state.songs.get(param);
      if (!song) { location.replace(param ? '#/song/' + param : '#/'); return; }
      startDraft(song);
      return renderDraft();
    }
    case 'settings': return renderSettings();
    default: location.hash = '#/';
  }
}

// ======================= Vistas: configuración / errores =======================
function renderSetup() {
  setTopbar('Cantoral');
  app.innerHTML = `
    <div class="card stack">
      <h2>Falta configurar la nube</h2>
      <p>Abre <code>config.js</code> y coloca la URL y la clave pública de tu proyecto de Supabase.</p>
      <ol class="small">
        <li>Crea un proyecto gratis en <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>.</li>
        <li>En <b>SQL Editor</b> ejecuta el archivo <code>supabase/schema.sql</code>.</li>
        <li>Copia <b>Project URL</b> y la clave <b>anon / publishable</b> en <code>config.js</code>.</li>
      </ol>
      <p class="muted small">Guía completa: <code>docs/01-instalacion.md</code></p>
    </div>`;
}

function renderFatal(msg, err) {
  console.error(err);
  setTopbar('Cantoral');
  app.innerHTML = `<div class="card stack"><h2>Algo salió mal</h2><p>${escapeHtml(msg)}</p><button class="btn primary" onclick="location.reload()">Reintentar</button></div>`;
}

// ======================= Vista: autenticación =======================
function renderAuth(mode = 'login') {
  setTopbar('Cantoral');
  const isLogin = mode === 'login';
  app.innerHTML = `
    <div class="auth">
      <div class="brand"><img src="icons/icon-192.png" alt="" /><div><h2 style="margin:0">Cantoral</h2><div class="muted small">Tus letras, en todos tus dispositivos</div></div></div>
      <form class="card stack" id="auth-form">
        <label class="field">Correo<input type="email" name="email" autocomplete="email" required /></label>
        <label class="field">Contraseña<input type="password" name="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="6" required /></label>
        <button class="btn primary block" type="submit">${isLogin ? 'Entrar' : 'Crear cuenta'}</button>
        <div class="row" style="justify-content:space-between">
          <button class="btn" type="button" id="toggle-mode">${isLogin ? 'Crear cuenta' : 'Ya tengo cuenta'}</button>
          ${isLogin ? '<button class="btn" type="button" id="forgot">Olvidé mi contraseña</button>' : ''}
        </div>
      </form>
    </div>`;

  $('#toggle-mode').onclick = () => renderAuth(isLogin ? 'signup' : 'login');
  const forgot = $('#forgot');
  if (forgot) forgot.onclick = async () => {
    const email = $('#auth-form').email.value.trim();
    if (!email) return toast('Escribe tu correo primero.');
    try { await db.auth.resetPassword(email); toast('Te enviamos un correo para restablecer la contraseña.', { ms: 5000 }); }
    catch (err) { toast(err.message, { error: true }); }
  };
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (isLogin) {
        await db.auth.signIn(f.email.value.trim(), f.password.value);
      } else {
        const r = await db.auth.signUp(f.email.value.trim(), f.password.value);
        if (!r.session) { toast('Cuenta creada. Revisa tu correo para confirmarla y luego entra.', { ms: 6000 }); renderAuth('login'); }
      }
    } catch (err) {
      toast(err.message, { error: true, ms: 4500 });
    } finally {
      btn.disabled = false;
    }
  };
}

function renderNewPassword() {
  setTopbar('Nueva contraseña');
  app.innerHTML = `
    <form class="card stack auth" id="pw-form">
      <h2>Escribe tu nueva contraseña</h2>
      <label class="field">Contraseña<input type="password" name="password" minlength="6" autocomplete="new-password" required /></label>
      <button class="btn primary" type="submit">Guardar</button>
    </form>`;
  $('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    try { await db.auth.updatePassword(e.target.password.value); toast('Contraseña actualizada.'); location.hash = '#/'; route(); }
    catch (err) { toast(err.message, { error: true }); }
  };
}

// ======================= Vista: lista =======================
function renderList() {
  setTopbar('Cantoral', { settings: true });
  const q = fold(state.query);
  const all = [...state.songs.values()].sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
  const items = q ? all.filter((s) => fold(s.title).includes(q) || fold(s.lyrics).includes(q)) : all;

  app.innerHTML = `
    <div class="search row">
      <input type="search" id="q" placeholder="Buscar por título o letra…" value="${escapeHtml(state.query)}" aria-label="Buscar" class="grow" style="flex:1" />
      <button class="btn" id="btn-new" title="Escribir una canción a mano" aria-label="Nueva canción manual">${icons.edit}</button>
    </div>
    ${!state.loaded ? '<div class="center-msg"><div class="spinner"></div></div>' : items.length ? `
      <p class="muted small" style="margin:0 0 8px">${items.length} ${items.length === 1 ? 'canción' : 'canciones'}${q ? ' encontradas' : ''}</p>
      <ul class="song-list">${items.map(songItem).join('')}</ul>` : `
      <div class="empty">${icons.music}<p>${q ? 'Sin resultados para tu búsqueda.' : 'Aún no tienes canciones.<br/>Toca <b>Escanear</b> para agregar la primera.'}</p></div>`}
    <button class="fab" id="fab-scan">${icons.scan} Escanear</button>`;

  const qInput = $('#q');
  qInput.oninput = debounce(() => {
    state.query = qInput.value;
    const pos = qInput.selectionStart;
    renderList();
    const again = $('#q'); again.focus(); again.setSelectionRange(pos, pos);
  }, 200);
  $('#fab-scan').onclick = () => { state.draft = null; location.hash = '#/scan'; };
  $('#btn-new').onclick = () => (location.hash = '#/new');
}

function songItem(s) {
  const firstLine = (s.lyrics || '').split('\n').find((l) => l.trim() && fold(l.trim()) !== fold(s.title)) || '';
  const pages = s.image_paths?.length || 0;
  return `
    <li><a class="song-item" href="#/song/${s.id}">
      <div class="meta"><div class="title">${escapeHtml(s.title)}</div><div class="preview">${escapeHtml(firstLine)}</div></div>
      ${pages ? `<span class="badge" title="Páginas escaneadas guardadas">${pages} ${icons.image.replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"')}</span>` : ''}
    </a></li>`;
}

// ======================= Vista: canción =======================
function renderSong(id) {
  const s = state.songs.get(id);
  if (!s) {
    setTopbar('Canción', { back: true });
    app.innerHTML = state.loaded ? '<div class="empty"><p>Esta canción no existe o fue eliminada.</p><a class="btn" href="#/">Ir al inicio</a></div>' : '<div class="center-msg"><div class="spinner"></div></div>';
    return;
  }
  setTopbar(s.title, { back: true });
  const size = prefs.get('lyricsSize', 1.15);
  app.innerHTML = `
    <div class="toolbar">
      <button class="btn" id="font-down" aria-label="Letra más pequeña">${icons.minus}</button>
      <button class="btn" id="font-up" aria-label="Letra más grande">${icons.plus}</button>
      <button class="btn" id="btn-edit">${icons.edit} Editar</button>
      <button class="btn" id="btn-share">${icons.share} Compartir</button>
      <button class="btn" id="btn-dl" aria-label="Descargar .txt">${icons.download} .txt</button>
      ${'wakeLock' in navigator ? `<button class="btn ${state.wakeLockWanted ? 'primary' : ''}" id="btn-wake" title="Mantener la pantalla encendida">☀︎ Pantalla</button>` : ''}
    </div>
    <h2 style="font-family:var(--font-lyrics)">${escapeHtml(s.title)}</h2>
    <pre class="lyrics" id="lyrics" style="--lyrics-size:${size}rem">${escapeHtml(s.lyrics)}</pre>
    <div style="margin-top:28px" class="stack">
      ${s.image_paths?.length ? `<details id="scans"><summary class="btn">${icons.image} Ver escaneo original (${s.image_paths.length})</summary><div class="scan-thumbs" id="scan-thumbs" style="margin-top:10px"></div></details>` : ''}
      <p class="muted small">Actualizada: ${formatDate(s.updated_at)}</p>
      <div><button class="btn danger" id="btn-delete">${icons.trash} Eliminar canción</button></div>
    </div>`;

  const setSize = (d) => {
    const v = Math.min(2.6, Math.max(0.8, Math.round((prefs.get('lyricsSize', 1.15) + d) * 100) / 100));
    prefs.set('lyricsSize', v);
    $('#lyrics').style.setProperty('--lyrics-size', v + 'rem');
  };
  $('#font-up').onclick = () => setSize(0.1);
  $('#font-down').onclick = () => setSize(-0.1);
  $('#btn-edit').onclick = () => (location.hash = '#/edit/' + s.id);
  $('#btn-dl').onclick = () => downloadText(`${slugify(s.title)}.txt`, `${s.title}\n\n${s.lyrics}\n`);
  $('#btn-share').onclick = async () => {
    const text = `${s.title}\n\n${s.lyrics}`;
    if (navigator.share) { try { await navigator.share({ title: s.title, text }); } catch { /* cancelado */ } }
    else { await navigator.clipboard.writeText(text); toast('Letra copiada al portapapeles.'); }
  };
  const wake = $('#btn-wake');
  if (wake) {
    if (state.wakeLockWanted) requestWakeLock();
    wake.onclick = () => {
      state.wakeLockWanted = !state.wakeLockWanted;
      wake.classList.toggle('primary', state.wakeLockWanted);
      state.wakeLockWanted ? requestWakeLock() : releaseWakeLock();
      toast(state.wakeLockWanted ? 'La pantalla se mantendrá encendida.' : 'Pantalla normal.');
    };
  }
  $('#btn-delete').onclick = async () => {
    if (!confirm(`¿Eliminar "${s.title}"? Se borrará de todos tus dispositivos.`)) return;
    try {
      setSyncBusy(true);
      await db.songs.remove(s);
      state.songs.delete(s.id);
      toast('Canción eliminada.');
      location.hash = '#/';
    } catch (err) { toast(err.message, { error: true }); }
    finally { setSyncBusy(false); }
  };
  const det = $('#scans');
  if (det) det.addEventListener('toggle', async () => {
    if (!det.open || det.dataset.loaded) return;
    det.dataset.loaded = '1';
    const box = $('#scan-thumbs');
    box.innerHTML = '<div class="spinner"></div>';
    try {
      const urls = await db.scans.signedUrls(s.image_paths);
      box.innerHTML = urls.map((u, i) => `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="Página ${i + 1}" loading="lazy" /></a>`).join('');
    } catch (err) { box.innerHTML = `<p class="muted small">${escapeHtml(err.message)}</p>`; }
  });
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !state.wakeLock) { state.wakeLock = await navigator.wakeLock.request('screen'); state.wakeLock.addEventListener('release', () => (state.wakeLock = null)); } }
  catch { /* no soportado / denegado */ }
}
function releaseWakeLock() {
  if (state.wakeLock) { state.wakeLock.release().catch(() => {}); state.wakeLock = null; }
}

// ======================= Vista: escáner =======================
function renderScan(append) {
  setTopbar(append ? 'Añadir página' : 'Escanear', { back: true });
  const keepLabels = prefs.get('keepLabels', true);
  state.viewCleanup = mountScanner(app, {
    append,
    onCancel: () => history.back(),
    onDone: ({ rawText, canvas }) => {
      const { lyrics } = stripChords(rawText, { keepLabels });
      if (append && state.draft) {
        const d = state.draft;
        d.lyrics = [d.lyrics.trim(), lyrics].filter(Boolean).join('\n\n');
        d.rawText = [d.rawText || '', rawText].filter(Boolean).join('\n\n--- página ---\n\n');
        d.pages.push(canvas);
        d.dirty = true;
        history.back(); // regresa al borrador que abrió el escáner
        return;
      }
      state.draft = { songId: null, title: guessTitle(lyrics), lyrics, rawText, pages: [canvas], existingPaths: [], dirty: true };
      location.replace('#/draft');
    },
  });
}

// ======================= Vista: borrador (crear / editar) =======================
function startDraft(song) {
  if (state.draft && (state.draft.songId || null) === (song?.id || null)) return; // conservar borrador en curso
  state.draft = song
    ? { songId: song.id, title: song.title, lyrics: song.lyrics, rawText: song.raw_text || '', pages: [], existingPaths: song.image_paths || [], dirty: false }
    : { songId: null, title: '', lyrics: '', rawText: '', pages: [], existingPaths: [], dirty: false };
}

function renderDraft() {
  const d = state.draft;
  if (!d) { location.replace('#/'); return; }
  setTopbar(d.songId ? 'Editar canción' : 'Nueva canción', { back: true });
  const saveImgs = prefs.get('saveImages', true);
  app.innerHTML = `
    <form class="stack" id="draft-form">
      <label class="field">Título<input type="text" name="title" value="${escapeHtml(d.title)}" placeholder="Título de la canción" required maxlength="160" /></label>
      <label class="field">Letra
        <textarea class="lyrics-input" name="lyrics" spellcheck="true" placeholder="Escribe o pega la letra…">${escapeHtml(d.lyrics)}</textarea>
      </label>
      <p class="muted small" style="margin:-4px 0 0">Revisa la letra: el OCR puede confundir algunas letras. Los acordes ya fueron quitados automáticamente.</p>
      ${d.rawText ? `
      <details class="raw">
        <summary>Texto original detectado (con acordes)</summary>
        <pre>${escapeHtml(d.rawText)}</pre>
        <div class="row"><button type="button" class="btn" id="btn-reclean">${icons.reset} Volver a limpiar desde el original</button></div>
      </details>` : ''}
      <div class="row">
        <button type="button" class="btn" id="btn-add-page">${icons.camera} ${d.pages.length || d.existingPaths.length ? 'Añadir otra página' : 'Escanear página'}</button>
        ${d.pages.length ? `<span class="muted small">${d.pages.length} página(s) nueva(s) escaneada(s)</span>` : ''}
      </div>
      ${d.pages.length ? `<label class="check"><input type="checkbox" id="save-images" ${saveImgs ? 'checked' : ''}/> Guardar también la imagen escaneada en la nube</label>` : ''}
      <div class="row end">
        <button type="button" class="btn" id="btn-discard">Descartar</button>
        <button type="submit" class="btn primary" id="btn-save">Guardar en la nube</button>
      </div>
    </form>`;

  const f = $('#draft-form');
  const sync = () => { d.title = f.title.value; d.lyrics = f.lyrics.value; d.dirty = true; };
  f.title.oninput = sync;
  f.lyrics.oninput = sync;

  const reclean = $('#btn-reclean');
  if (reclean) reclean.onclick = () => {
    if (!confirm('Esto reemplazará la letra actual con una nueva limpieza del texto original. ¿Continuar?')) return;
    const parts = d.rawText.split('\n\n--- página ---\n\n').map((t) => stripChords(t, { keepLabels: prefs.get('keepLabels', true) }).lyrics);
    f.lyrics.value = parts.join('\n\n');
    sync();
  };
  $('#btn-add-page').onclick = () => { sync(); location.hash = '#/scan?append=1'; };
  $('#btn-discard').onclick = () => {
    if (d.dirty && !confirm('¿Descartar los cambios?')) return;
    const back = d.songId ? '#/song/' + d.songId : '#/';
    state.draft = null;
    location.replace(back);
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    sync();
    const title = d.title.trim() || guessTitle(d.lyrics);
    const lyrics = d.lyrics.replace(/\s+$/g, '');
    if (!lyrics.trim()) return toast('La letra está vacía.', { error: true });
    const saveImages = $('#save-images') ? $('#save-images').checked : false;
    if ($('#save-images')) prefs.set('saveImages', saveImages);

    const btn = $('#btn-save');
    btn.disabled = true; btn.textContent = 'Guardando…';
    setSyncBusy(true);
    const uploaded = [];
    try {
      const uid = state.session.user.id;
      const id = d.songId || crypto.randomUUID();
      if (saveImages) {
        for (const c of d.pages) uploaded.push(await db.scans.upload(uid, id, await toUploadBlob(c)));
      }
      const payload = { title, lyrics, raw_text: d.rawText || null, image_paths: [...d.existingPaths, ...uploaded] };
      const saved = d.songId ? await db.songs.update(id, payload) : await db.songs.create({ id, ...payload });
      state.songs.set(saved.id, saved);
      state.draft = null;
      toast('Guardada y sincronizada ✓');
      location.replace('#/song/' + saved.id);
    } catch (err) {
      if (uploaded.length) db.scans.remove(uploaded).catch(() => {});
      toast(err.message, { error: true, ms: 5000 });
      btn.disabled = false; btn.textContent = 'Guardar en la nube';
    } finally {
      setSyncBusy(false);
    }
  };
}

// ======================= Vista: ajustes =======================
function renderSettings() {
  setTopbar('Ajustes', { back: true });
  const lang = prefs.get('ocrLang', null) || window.APP_CONFIG.OCR_LANG || 'spa';
  const layout = prefs.get('ocrLayout', 'column');
  const engine = prefs.get('ocrEngine', 'vision');
  app.innerHTML = `
    <div class="stack">
      <div class="card stack">
        <h3 style="margin-top:0">Cuenta</h3>
        <p class="muted" style="margin:0">${escapeHtml(state.session.user.email)}</p>
        <p class="small muted" style="margin:0">${state.songs.size} canciones en la nube · Sincronización: ${state.realtime === 'on' ? 'en tiempo real ✓' : 'desconectada'}</p>
        <div class="row"><button class="btn" id="btn-sync">${icons.reset} Sincronizar ahora</button><button class="btn danger" id="btn-logout">Cerrar sesión</button></div>
      </div>

      <div class="card stack">
        <h3 style="margin-top:0">Escaneo</h3>
        <label class="field">Motor de lectura
          <select id="set-engine">
            <option value="vision" ${engine === 'vision' ? 'selected' : ''}>IA de visión (recomendado)</option>
            <option value="device" ${engine === 'device' ? 'selected' : ''}>En este dispositivo</option>
          </select>
        </label>
        <p class="small muted" style="margin:0">La IA lee la foto a color y respeta las líneas de acordes. El motor del dispositivo no usa la nube, y conviene con buena luz.</p>
        <label class="field">Idioma del texto
          <select id="set-lang">
            <option value="spa" ${lang === 'spa' ? 'selected' : ''}>Español</option>
            <option value="eng" ${lang === 'eng' ? 'selected' : ''}>Inglés</option>
            <option value="spa+eng" ${lang === 'spa+eng' ? 'selected' : ''}>Español + Inglés</option>
            <option value="por" ${lang === 'por' ? 'selected' : ''}>Portugués</option>
          </select>
        </label>
        <label class="field">Diseño de la página
          <select id="set-layout">
            <option value="column" ${layout === 'column' ? 'selected' : ''}>Una columna (recomendado)</option>
            <option value="auto" ${layout === 'auto' ? 'selected' : ''}>Automático (varias columnas)</option>
          </select>
        </label>
        <p class="small muted" style="margin:0">Si tu cancionero tiene dos columnas, recorta una columna a la vez o elige "Automático".</p>
        <label class="check"><input type="checkbox" id="set-labels" ${prefs.get('keepLabels', true) ? 'checked' : ''}/> Conservar etiquetas como "Coro:" o "Estrofa 2"</label>
      </div>

      <div class="card stack">
        <h3 style="margin-top:0">Respaldo e importación</h3>
        <div class="row">
          <button class="btn" id="btn-export">${icons.download} Exportar todo (.json)</button>
          <button class="btn" id="btn-export-txt">${icons.download} Exportar todo (.txt)</button>
        </div>
        <div class="row">
          <button class="btn" id="btn-import">${icons.plus} Importar .txt o .json</button>
          <input type="file" id="import-file" accept=".txt,.json,text/plain,application/json" multiple hidden />
        </div>
        <p class="small muted" style="margin:0">Importar .txt: la primera línea se usa como título. Las canciones importadas se suben a la nube.</p>
      </div>

      ${state.installPrompt ? `<button class="btn primary" id="btn-install">Instalar app en este dispositivo</button>` : ''}
      <p class="small muted">Cantoral v${APP_VERSION}</p>
    </div>`;

  $('#set-engine').onchange = (e) => { prefs.set('ocrEngine', e.target.value); toast(e.target.value === 'vision' ? 'Lectura con IA activada.' : 'Lectura en el dispositivo activada.'); };
  $('#set-lang').onchange = (e) => { prefs.set('ocrLang', e.target.value); toast('Idioma del texto actualizado.'); };
  $('#set-layout').onchange = (e) => prefs.set('ocrLayout', e.target.value);
  $('#set-labels').onchange = (e) => prefs.set('keepLabels', e.target.checked);
  $('#btn-sync').onclick = async () => { await refreshSongs(); toast('Sincronizado.'); renderSettings(); };
  $('#btn-logout').onclick = async () => { if (confirm('¿Cerrar sesión en este dispositivo?')) { await db.auth.signOut(); location.hash = '#/'; } };

  const all = () => [...state.songs.values()].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  const stamp = new Date().toISOString().slice(0, 10);
  $('#btn-export').onclick = () => downloadText(`cantoral-${stamp}.json`,
    JSON.stringify({ app: 'cantoral', version: 1, exported_at: new Date().toISOString(), songs: all().map(({ title, lyrics, created_at, updated_at }) => ({ title, lyrics, created_at, updated_at })) }, null, 2),
    'application/json');
  $('#btn-export-txt').onclick = () => downloadText(`cantoral-${stamp}.txt`, all().map((s) => `${s.title}\n\n${s.lyrics}`).join('\n\n==========\n\n') + '\n');

  const fileInput = $('#import-file');
  $('#btn-import').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    const toCreate = [];
    for (const file of files) {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        try {
          const data = JSON.parse(text);
          for (const s of data.songs || []) if (s.title && typeof s.lyrics === 'string') toCreate.push({ title: s.title, lyrics: s.lyrics });
        } catch { toast(`${file.name}: JSON inválido`, { error: true }); }
      } else {
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        const title = (lines.find((l) => l.trim()) || file.name.replace(/\.txt$/i, '')).trim();
        const body = lines.slice(lines.findIndex((l) => l.trim()) + 1).join('\n').trim();
        toCreate.push({ title, lyrics: stripChords(body, { keepLabels: prefs.get('keepLabels', true) }).lyrics });
      }
    }
    if (!toCreate.length) return;
    if (!confirm(`¿Importar ${toCreate.length} canción(es) a la nube?`)) return;
    setSyncBusy(true);
    let ok = 0;
    try {
      for (const s of toCreate) { const saved = await db.songs.create(s); state.songs.set(saved.id, saved); ok++; }
      toast(`${ok} canción(es) importadas.`);
    } catch (err) {
      toast(`Importadas ${ok}. Error: ${err.message}`, { error: true, ms: 5000 });
    } finally { setSyncBusy(false); renderSettings(); }
  };

  const inst = $('#btn-install');
  if (inst) inst.onclick = async () => { state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; renderSettings(); };
}

boot();
