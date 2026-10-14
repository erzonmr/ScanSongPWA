// Utilidades de imagen con <canvas>.

/** Carga un File/Blob como HTMLImageElement respetando la orientación EXIF. */
export async function fileToCanvas(file, maxSide = 3000) {
  // createImageBitmap aplica la orientación EXIF en navegadores modernos.
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('No se pudo leer la imagen.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bmp.width, h = bmp.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c;
}

export function cloneCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((res) => canvas.toBlob(res, type, quality));
}

/**
 * JPEG a color para la lectura con visión. Baja el tamaño si la foto pesa mucho:
 * el detalle de los acordes se conserva mejor en color que en blanco y negro.
 */
export async function toVisionBlob(canvas) {
  const attempts = [
    [2000, 0.86],
    [1600, 0.8],
    [1200, 0.72],
  ];
  let blob = null;
  for (const [maxSide, quality] of attempts) {
    blob = await toUploadBlob(canvas, maxSide, quality);
    if (blob && blob.size <= 1_400_000) return blob;
  }
  return blob;
}

/** Reduce para subir a la nube (ahorra espacio). */
export async function toUploadBlob(canvas, maxSide = 1800, quality = 0.8) {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/jpeg', quality);
}

/**
 * Prepara la imagen para OCR: escala a un tamaño útil, escala de grises,
 * estira el contraste y opcionalmente binariza (umbral de Otsu).
 */
export function preprocessForOcr(src, { binarize = false } = {}) {
  const longSide = Math.max(src.width, src.height);
  const scale = longSide < 1400 ? 1400 / longSide : longSide > 2600 ? 2600 / longSide : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * scale);
  c.height = Math.round(src.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    gray[j] = g; hist[g]++;
  }
  // Percentiles 1% y 99% para estirar contraste.
  const total = gray.length;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.01) { hi = v; break; } }
  const range = Math.max(1, hi - lo);

  let threshold = 0;
  if (binarize) threshold = otsu(hist, total);

  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = binarize ? (gray[j] > threshold ? 255 : 0) : ((gray[j] - lo) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, max = 0, th = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > max) { max = between; th = t; }
  }
  return th;
}
