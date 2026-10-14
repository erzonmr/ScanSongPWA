// OCR en el navegador con Tesseract.js (no requiere servidor).
// La primera vez descarga el modelo de idioma (~2-4 MB para español);
// Tesseract lo guarda en caché del navegador para las siguientes veces.
import { loadScript } from './lib.js';

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

/**
 * Reconoce el texto de un canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {(pct:number, label:string) => void} onProgress
 * @param {{lang?:string, layout?:'column'|'auto'}} [opts]
 *   layout 'column' (PSM 6): un bloque de texto, conserva el orden línea a línea
 *   (ideal para acordes encima de la letra). 'auto' (PSM 3): detecta columnas.
 * @returns {Promise<{text:string, confidence:number}>}
 */
export async function recognize(canvas, onProgress, opts = {}) {
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
  return { text, confidence: data.confidence || 0 };
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
