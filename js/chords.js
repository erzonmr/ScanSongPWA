/**
 * chords.js — Limpieza de acordes en texto OCR.
 *
 * Módulo puro (sin DOM), testeable con Node: `node --test tests/`.
 *
 * Estrategia:
 *  1. Quita acordes en línea tipo ChordPro: [Am], [Sol7].
 *  2. Clasifica cada línea. Si la línea está compuesta (casi) solo por
 *     acordes, se elimina completa. Esto cubre el formato típico de cancionero:
 *
 *         G        D        Em
 *         Cuán grande es Él, cuán grande es Él
 *
 *  3. Normaliza espacios y líneas vacías.
 *
 * Soporta notación americana (C, Am7, G/B, F#m7b5, Csus4, Bbmaj7...)
 * y latina (Do, Rem, SOL7, La#m, Fa/Do, Sim7...).
 */

const ACC = '(?:#|b|♯|♭)?';
const QUALITY = '(?:maj|Maj|min|dim|aug|sus|add|m|M|º|°|\\+|-)?';
const EXT = '(?:\\d{1,2})?(?:(?:maj|add|sus|no|b|#|\\+|-)\\d{1,2})*';
const PAREN = '(?:\\((?:[#b+\\-]?\\d{1,2}|maj7|sus\\d?|add\\d{1,2})\\))?';
// Latina: capitalizada o en mayúsculas (Do / DO). La minúscula "la", "mi"
// se considera letra de la canción para no borrar texto.
const LATIN_ROOT = '(?:Do|DO|Re|RE|Mi|MI|Fa|FA|Sol|SOL|La|LA|Si|SI)';
const AMER_ROOT = '[A-G]';
const ROOT = `(?:${LATIN_ROOT}|${AMER_ROOT})`;
const BASS = `(?:\\/${ROOT}${ACC})?`;

export const CHORD_RE = new RegExp(`^${ROOT}${ACC}${QUALITY}${EXT}${PAREN}${BASS}\\*?$`);

// Tokens que no aportan (ruido OCR, barras de compás, repeticiones).
const NOISE_RE = /^(?:[|¦\-–—_.:;,·•'"`´~*()[\]/\\=]+|\(?[xX×]\s?\d{1,2}\)?|\d{1,2}[xX×]|N\.?C\.?|%)$/;

// Etiquetas de sección.
const LABEL_RE = /^\(?\s*(intro(?:ducci[oó]n)?|coro|estribillo|pre-?coro|estrofa|verso|puente|final|outro|interludio|instrumental|solo|riff|tono|tonalidad|capo|cejilla|ritmo|chorus|verse|bridge|ending)\b\s*\d*\s*[:.\-)]?/i;

const INLINE_BRACKET_RE = /\[([^\]\n]{1,12})\]/g;

/** ¿El token es un acorde? (tolera paréntesis envolventes: "(Am)") */
export function isChord(token) {
  if (!token) return false;
  let t = token.trim();
  if (/^\(.+\)$/.test(t)) t = t.slice(1, -1);
  return CHORD_RE.test(t);
}

/** ¿Es un token de ruido? */
export function isNoise(token) {
  return NOISE_RE.test(token.trim());
}

/**
 * Clasifica una línea.
 * @returns {'empty'|'chords'|'label'|'lyrics'}
 */
export function classifyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return 'empty';

  let rest = trimmed;
  let hasLabel = false;
  const m = trimmed.match(LABEL_RE);
  if (m) {
    hasLabel = true;
    rest = trimmed.slice(m[0].length).trim();
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !isNoise(t));

  if (hasLabel && meaningful.length === 0) return 'label';
  if (meaningful.length === 0) return hasLabel ? 'label' : 'chords'; // solo ruido (|  -  |)

  // Pista de espaciado: el OCR (con preserve_interword_spaces) conserva los
  // huecos grandes entre acordes. Una línea de tokens muy cortos separados por
  // 3+ espacios es casi siempre una línea de acordes, aunque el OCR haya leído
  // mal algún acorde ("C" → "[o", "Cc", "(e").
  const wideGaps = /\S\s{3,}\S/.test(rest);
  if (wideGaps && meaningful.every((t) => t.length <= 3)) return 'chords';

  // Un único token corto entre corchetes/paréntesis: acorde mal leído.
  if (meaningful.length === 1 && /^[[({|][A-Za-z0-9#]{0,2}[\])}]?$/.test(meaningful[0])) return 'chords';

  const chordCount = meaningful.filter(isChord).length;
  if (chordCount === 0) return 'lyrics';

  const ratio = chordCount / meaningful.length;
  if (ratio >= 0.75) return 'chords';

  // Línea mayoritariamente de acordes con algún token mal leído por el OCR
  // (p. ej. "Arn" en lugar de "Am"): los no-acordes son cortos.
  const unknown = meaningful.filter((t) => !isChord(t));
  if (ratio >= 0.5 && chordCount >= 2 && unknown.every((t) => t.length <= 3)) return 'chords';

  return 'lyrics';
}

/**
 * Quita los acordes de un texto.
 * @param {string} text
 * @param {{keepLabels?: boolean}} [opts]
 * @returns {{ lyrics: string, removed: number }}
 */
export function stripChords(text, opts = {}) {
  const keepLabels = opts.keepLabels !== false;
  let removed = 0;

  const src = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\{[^}\n]*\}/g, '') // directivas ChordPro {title: ...}
    .replace(INLINE_BRACKET_RE, (full, inner) => (isChord(inner) ? (removed++, '') : full));

  const out = [];
  for (const raw of src.split('\n')) {
    const kind = classifyLine(raw);
    if (kind === 'chords') { removed++; continue; }
    if (kind === 'label' && !keepLabels) { removed++; continue; }
    if (kind === 'empty') { out.push(''); continue; }
    out.push(normalizeLyricLine(raw));
  }

  const lyrics = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');

  return { lyrics, removed };
}

/** Limpia una línea de letra: espacios múltiples, comillas, barras sueltas. */
export function normalizeLyricLine(line) {
  return line
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/(^|\s)[|¦](?=\s|$)/g, '$1') // barras de compás sueltas
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Sugiere un título: primera línea de letra razonable. */
export function guessTitle(lyrics) {
  for (const line of String(lyrics || '').split('\n')) {
    const t = line.trim();
    if (!t || LABEL_RE.test(t) || t.length < 3) continue;
    const clean = t.replace(/[.,;:!¡?¿"]+$/g, '').trim();
    return clean.length > 60 ? clean.slice(0, 57).trim() + '…' : clean;
  }
  return 'Canción sin título';
}
