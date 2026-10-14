// Lectura de la página. Por defecto usa visión (Grok) en el servidor.
// Tesseract.js queda como motor local: no requiere clave y funciona sin la función.
import { loadScript } from './lib.js';
import * as db from './db.js';
import { toVisionBlob } from './imaging.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let workerPromise = null;
let workerLang = null;
let progressCb = null;

async function getWorker(lang) {
  if (workerPromise && workerLang === lang) return workerPromise;
  if (workerPromise) { (await workerPromise).terminate(); }
  workerLang = lang;
  workerPromise = (async () => {
    await loadScript(TESSERACT_URL);
    const worker = await window.Tesseract.createWorker(lang, 1, {
      logger: (m) => progressCb && progressCb(m),
    });
    await worker.setParameters({
      preserve_interword_spaces: '1', // conserva la separación de los acordes
    });
    return worker;
  })();
  workerPromise.catch(() => { workerPromise = null; });
  return workerPromise;
}

/** Quita cercas de markdown si el modelo envolvió la transcripción. */
export function cleanTranscript(text) {
  let t = String(text || '').replace(/^\uFEFF/, '').trim();
  const fenced = t.match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i);
  if (fenced) t = fenced[1].trim();
  return t;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('No se pudo preparar la imagen.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Reconoce el texto de un canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {(pct:number, label:string) => void} onProgress
 * @param {{lang?:string, layout?:'column'|'auto', engine?:'vision'|'device'}} [opts]
 *   engine 'vision': Grok lee la foto a color. 'device': Tesseract en el navegador.
 *   layout 'column' conserva el orden línea a línea. 'auto' admite varias columnas.
 * @returns {Promise<{text:string, confidence:number, engine:string}>}
 */
export async function recognize(canvas, onProgress, opts = {}) {
  if ((opts.engine || 'vision') === 'device') return recognizeLocal(canvas, onProgress, opts);
  return recognizeVision(canvas, onProgress, opts);
}

async function recognizeVision(canvas, onProgress, opts) {
  const lang = opts.lang || (window.APP_CONFIG && window.APP_CONFIG.OCR_LANG) || 'spa';
  onProgress && onProgress(8, 'Preparando la foto…');
  const blob = await toVisionBlob(canvas);
  if (!blob) throw new Error('No se pudo preparar la imagen.');
  const image = await blobToDataUrl(blob);
  onProgress && onProgress(25, 'Leyendo con IA… puede tardar medio minuto');
  const raw = await db.vision.transcribe(image, { lang, layout: opts.layout || 'column' });
  const text = cleanTranscript(raw);
  if (!text) throw new Error('La IA no devolvió texto.');
  onProgress && onProgress(100, 'Listo');
  return { text, confidence: 1, engine: 'vision' };
}

async function recognizeLocal(canvas, onProgress, opts) {
  const lang = opts.lang || (window.APP_CONFIG && window.APP_CONFIG.OCR_LANG) || 'spa';
  progressCb = (m) => {
    if (!onProgress) return;
    const labels = {
      'loading tesseract core': 'Cargando motor OCR…',
      'initializing tesseract': 'Iniciando OCR…',
      'loading language traineddata': 'Descargando idioma…',
      'initializing api': 'Preparando…',
      'recognizing text': 'Leyendo texto…',
    };
    const base = m.status === 'recognizing text' ? 0.3 : 0;
    const span = m.status === 'recognizing text' ? 0.7 : 0.3;
    onProgress(Math.round((base + (m.progress || 0) * span) * 100), labels[m.status] || 'Procesando…');
  };
  onProgress && onProgress(2, 'Cargando motor OCR…');
  const worker = await getWorker(lang);
  await worker.setParameters({ tessedit_pageseg_mode: opts.layout === 'auto' ? '3' : '6' });
  const { data } = await worker.recognize(canvas);
  onProgress && onProgress(100, 'Listo');
  let text = data.text || '';
  try { text = restoreStanzaBreaks(text, data.lines || []); } catch { /* usar texto tal cual */ }
  return { text, confidence: data.confidence || 0, engine: 'device' };
}

/**
 * El modo "bloque de texto" no devuelve líneas vacías entre estrofas.
 * Las recuperamos con la geometría: si el espacio vertical entre dos líneas
 * es bastante mayor que el habitual, insertamos una línea en blanco.
 */
function restoreStanzaBreaks(text, lines) {
  const textLines = text.replace(/\n+$/, '').split('\n');
  const boxes = lines.map((l) => l.bbox).filter(Boolean);
  if (boxes.length < 4 || boxes.length !== textLines.filter((l) => l.trim()).length) return text;

  const gaps = [];
  for (let i = 1; i < boxes.length; i++) gaps.push(boxes[i].y0 - boxes[i - 1].y1);
  const heights = boxes.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];
  // Con acordes los huecos alternan (acorde→letra pequeño, letra→acorde mayor),
  // por eso la referencia "normal" es el percentil 75 y no la mediana.
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const normalGap = Math.max(1, sortedGaps[Math.floor(sortedGaps.length * 0.75)]);

  const out = [];
  let k = 0; // índice de línea no vacía
  for (const line of textLines) {
    if (!line.trim()) { out.push(line); continue; }
    if (k > 0) {
      const g = gaps[k - 1];
      if (g > normalGap * 1.5 && g > medianH * 0.6 && out[out.length - 1].trim()) out.push('');
    }
    out.push(line);
    k++;
  }
  return out.join('\n') + '\n';
}
