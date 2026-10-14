// Flujo de escaneo: 1) capturar  2) recortar/rotar  3) borrar zonas  4) OCR.
import { $, escapeHtml, icons, loadScript, loadCss, prefs, toast } from './lib.js';
import { fileToCanvas, cloneCanvas, preprocessForOcr } from './imaging.js';
import { recognize } from './ocr.js';

const CROPPER_JS = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js';
const CROPPER_CSS = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css';

/**
 * Monta el escáner en `root`.
 * @param {HTMLElement} root
 * @param {{ append?: boolean, onDone: (r:{rawText:string, canvas:HTMLCanvasElement}) => void, onCancel: () => void }} opts
 * @returns {() => void} función de limpieza
 */
export function mountScanner(root, opts) {
  let cropper = null;
  let objectUrl = null;
  let cleanup = [];

  const destroyCropper = () => {
    if (cropper) { cropper.destroy(); cropper = null; }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  };

  const steps = (n) => `<div class="steps" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<span class="${i <= n ? 'on' : ''}"></span>`).join('')}</div>`;

  // ---------- Paso 1: capturar ----------
  function stepPick() {
    destroyCropper();
    root.innerHTML = `
      ${steps(1)}
      <h2>${opts.append ? 'Añadir otra página' : 'Escanear canción'}</h2>
      <p class="muted">Toma una foto de la página del cancionero. Luego podrás recortarla y borrar lo que no sea parte de la canción.</p>
      <div class="pick-grid">
        <button class="pick-btn" id="pick-camera">${icons.camera}<span>Usar cámara</span></button>
        <button class="pick-btn" id="pick-gallery">${icons.image}<span>Elegir imagen</span></button>
      </div>
      <p class="muted small">Consejo: buena luz, página plana y el teléfono paralelo a la hoja mejoran mucho el resultado.</p>
      <div class="row end"><button class="btn" id="btn-cancel">Cancelar</button></div>`;

    const cam = $('#input-camera');
    const gal = $('#input-gallery');
    const onFile = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        root.innerHTML = `<div class="center-msg"><div><div class="spinner" style="margin:auto"></div><p>Abriendo imagen…</p></div></div>`;
        const canvas = await fileToCanvas(file);
        stepCrop(canvas);
      } catch (err) {
        toast(err.message, { error: true });
        stepPick();
      }
    };
    cam.onchange = onFile;
    gal.onchange = onFile;
    $('#pick-camera').onclick = () => cam.click();
    $('#pick-gallery').onclick = () => gal.click();
    $('#btn-cancel').onclick = opts.onCancel;
  }

  // ---------- Paso 2: recortar y enderezar ----------
  async function stepCrop(source) {
    root.innerHTML = `
      ${steps(2)}
      <h2>Recorta la canción</h2>
      <p class="muted small">Ajusta el recuadro solo sobre la canción. Gira o endereza si la foto quedó inclinada.</p>
      <div class="crop-wrap"><img id="crop-img" alt="Imagen a recortar" /></div>
      <div class="stack" style="margin-top:12px">
        <div class="row">
          <button class="btn icon" id="rot-l" aria-label="Girar a la izquierda">${icons.rotL}</button>
          <button class="btn icon" id="rot-r" aria-label="Girar a la derecha">${icons.rotR}</button>
          <div class="range-row grow"><span class="small muted">Enderezar</span><input type="range" id="straighten" min="-20" max="20" step="0.5" value="0" aria-label="Enderezar" /><span class="small" id="straighten-val">0°</span></div>
        </div>
        <div class="row end">
          <button class="btn" id="btn-back-step">Otra foto</button>
          <button class="btn primary" id="btn-next">Siguiente</button>
        </div>
      </div>`;

    try {
      loadCss(CROPPER_CSS);
      await loadScript(CROPPER_JS);
    } catch {
      toast('No se pudo cargar el editor (¿sin conexión?). Se usará la imagen completa.', { error: true });
      return stepMask(source);
    }

    const img = $('#crop-img');
    objectUrl = URL.createObjectURL(await new Promise((r) => source.toBlob(r, 'image/jpeg', 0.92)));
    img.src = objectUrl;
    let baseRotation = 0;
    cropper = new window.Cropper(img, {
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.92,
      background: false,
      checkOrientation: false,
      toggleDragModeOnDblclick: false,
      responsive: true,
    });

    const fine = $('#straighten');
    const apply = () => {
      $('#straighten-val').textContent = `${fine.value}°`;
      cropper.rotateTo(baseRotation + Number(fine.value));
    };
    fine.oninput = apply;
    $('#rot-l').onclick = () => { baseRotation -= 90; apply(); };
    $('#rot-r').onclick = () => { baseRotation += 90; apply(); };
    $('#btn-back-step').onclick = stepPick;
    $('#btn-next').onclick = () => {
      const out = cropper.getCroppedCanvas({ fillColor: '#fff', maxWidth: 3000, maxHeight: 3000, imageSmoothingQuality: 'high' });
      destroyCropper();
      if (!out || !out.width) return toast('Recorte inválido.', { error: true });
      stepMask(out, source);
    };
  }

  // ---------- Paso 3: borrar zonas que no son de la canción ----------
  function stepMask(base, original) {
    const ops = []; // {type:'rect',x,y,w,h} | {type:'brush',size,pts:[[x,y],...]}
    let tool = 'rect';
    let brushPct = 4;

    root.innerHTML = `
      ${steps(3)}
      <h2>Borra lo que sobra</h2>
      <p class="muted small">Arrastra sobre títulos de otras canciones, números de página, dibujos o cualquier contenido ajeno para taparlo en blanco. Si no hay nada que borrar, continúa.</p>
      <div class="row" style="margin-bottom:10px">
        <div class="seg" role="group" aria-label="Herramienta">
          <button data-tool="rect" class="on">${icons.rect} Recuadro</button>
          <button data-tool="brush">${icons.brush} Pincel</button>
        </div>
        <button class="btn icon" id="btn-undo" aria-label="Deshacer" title="Deshacer">${icons.undo}</button>
        <button class="btn icon" id="btn-clear" aria-label="Quitar todo" title="Quitar todo">${icons.reset}</button>
      </div>
      <div class="range-row" id="brush-row" hidden style="margin-bottom:10px"><span class="small muted">Grosor</span><input type="range" id="brush-size" min="1" max="12" step="0.5" value="${brushPct}" /></div>
      <div class="mask-wrap"><canvas id="mask-canvas"></canvas></div>
      <div class="stack" style="margin-top:12px">
        <label class="check"><input type="checkbox" id="opt-bw" ${prefs.get('ocrBinarize', false) ? 'checked' : ''}/> Alto contraste (blanco y negro) — útil con fotos oscuras o papel amarillento</label>
        <div class="row end">
          <button class="btn" id="btn-back-step">Atrás</button>
          <button class="btn primary" id="btn-ocr">${icons.text} Leer texto</button>
        </div>
      </div>`;

    const view = $('#mask-canvas');
    view.width = base.width;
    view.height = base.height;
    const ctx = view.getContext('2d');

    const redraw = (preview) => {
      ctx.drawImage(base, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const op of ops) drawOp(ctx, op);
      if (preview) {
        if (preview.type === 'rect') {
          ctx.save();
          ctx.fillStyle = 'rgba(200,40,40,.35)';
          ctx.strokeStyle = 'rgba(200,40,40,.9)';
          ctx.lineWidth = Math.max(2, base.width / 300);
          ctx.fillRect(preview.x, preview.y, preview.w, preview.h);
          ctx.strokeRect(preview.x, preview.y, preview.w, preview.h);
          ctx.restore();
        } else {
          drawOp(ctx, preview);
        }
      }
    };
    redraw();

    // Los eventos se escuchan en el contenedor (área táctil más amplia) y se
    // limitan a los bordes de la imagen, para poder empezar a arrastrar desde fuera.
    const surface = view.parentElement;
    const clamp = (v, max) => Math.max(0, Math.min(max, v));
    const toCanvas = (e) => {
      const r = view.getBoundingClientRect();
      return [
        clamp(((e.clientX - r.left) / r.width) * view.width, view.width),
        clamp(((e.clientY - r.top) / r.height) * view.height, view.height),
      ];
    };

    let drag = null;
    surface.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      surface.setPointerCapture(e.pointerId);
      const [x, y] = toCanvas(e);
      drag = tool === 'rect'
        ? { type: 'rect', x0: x, y0: y, x, y, w: 0, h: 0 }
        : { type: 'brush', size: (brushPct / 100) * base.width, pts: [[x, y]] };
      redraw(drag);
    });
    surface.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = toCanvas(e);
      if (drag.type === 'rect') {
        drag.x = Math.min(drag.x0, x); drag.y = Math.min(drag.y0, y);
        drag.w = Math.abs(x - drag.x0); drag.h = Math.abs(y - drag.y0);
      } else {
        drag.pts.push([x, y]);
      }
      redraw(drag);
    });
    const end = () => {
      if (!drag) return;
      if (drag.type === 'brush' || (drag.w > 4 && drag.h > 4)) {
        ops.push(drag.type === 'rect' ? { type: 'rect', x: drag.x, y: drag.y, w: drag.w, h: drag.h } : drag);
      }
      drag = null;
      redraw();
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);

    root.querySelectorAll('[data-tool]').forEach((b) => {
      b.onclick = () => {
        tool = b.dataset.tool;
        root.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
        $('#brush-row').hidden = tool !== 'brush';
      };
    });
    $('#brush-size').oninput = (e) => (brushPct = Number(e.target.value));
    $('#btn-undo').onclick = () => { ops.pop(); redraw(); };
    $('#btn-clear').onclick = () => { ops.length = 0; redraw(); };
    $('#btn-back-step').onclick = () => (original ? stepCrop(original) : stepPick());
    $('#btn-ocr').onclick = () => {
      const binarize = $('#opt-bw').checked;
      prefs.set('ocrBinarize', binarize);
      const finalCanvas = cloneCanvas(view); // imagen recortada + zonas borradas
      stepOcr(finalCanvas, binarize, () => stepMask(base, original));
    };
  }

  // ---------- Paso 4: OCR ----------
  async function stepOcr(canvas, binarize, back) {
    root.innerHTML = `
      ${steps(4)}
      <h2>Leyendo la canción…</h2>
      <div class="card stack">
        <div class="progress"><div id="ocr-bar"></div></div>
        <p class="muted small" id="ocr-label">Preparando…</p>
        <p class="muted small">La primera vez se descarga el motor de reconocimiento (unos segundos). Después es más rápido.</p>
      </div>`;
    try {
      const prepared = preprocessForOcr(canvas, { binarize });
      const { text } = await recognize(prepared, (pct, label) => {
        const bar = $('#ocr-bar'); const lab = $('#ocr-label');
        if (bar) bar.style.width = pct + '%';
        if (lab) lab.textContent = `${label} ${pct}%`;
      }, { lang: prefs.get('ocrLang', null) || undefined, layout: prefs.get('ocrLayout', 'column') });
      if (!text.trim()) {
        toast('No se detectó texto. Prueba con mejor luz o alto contraste.', { error: true, ms: 4000 });
        return back();
      }
      opts.onDone({ rawText: text, canvas });
    } catch (err) {
      console.error(err);
      root.innerHTML = `
        <div class="card stack">
          <h2>No se pudo leer el texto</h2>
          <p class="muted">${escapeHtml(err.message || String(err))}</p>
          <p class="muted small">El OCR necesita internet la primera vez para descargar el motor y el idioma.</p>
          <div class="row end"><button class="btn" id="btn-retry-back">Atrás</button></div>
        </div>`;
      $('#btn-retry-back').onclick = back;
    }
  }

  function drawOp(ctx, op) {
    if (op.type === 'rect') {
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else {
      ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = op.size;
      ctx.beginPath();
      op.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (op.pts.length === 1) ctx.lineTo(op.pts[0][0] + 0.1, op.pts[0][1]);
      ctx.stroke();
      ctx.restore();
    }
  }

  stepPick();
  return () => { destroyCropper(); cleanup.forEach((f) => f()); };
}
