# Cantoral — Letras escaneadas (MVP)

PWA personal para **escanear canciones de un cancionero con la cámara**, **quitar automáticamente los acordes** y **guardar solo la letra en la nube**, sincronizada entre todos tus dispositivos.

## Qué hace

- 📷 Escanea con la cámara del celular (o elige una imagen de la galería / PC).
- ✂️ Editor de imagen: **recortar**, **girar**, **enderezar** y **borrar zonas** (recuadro o pincel) para eliminar contenido ajeno (otra canción, número de página, dibujos).
- 🔤 OCR en el navegador (Tesseract.js, español) — sin servidor propio.
- 🎸➡️📝 Quita los acordes (notación americana `C Am G7` y latina `Do Lam Sol7`), incluso cuando el OCR los lee mal.
- ☁️ Guarda en la nube (Supabase): letras en Postgres e imágenes escaneadas en Storage.
- 🔄 Sincronización en **tiempo real** entre dispositivos (celular, tablet, PC).
- 📄 Canciones de varias páginas ("Añadir otra página").
- 🔍 Búsqueda por título o letra (sin importar tildes), tamaño de letra ajustable, pantalla siempre encendida, compartir, exportar/importar `.txt` y `.json`.
- 📲 Instalable como app (Android, iOS, Windows, macOS).

## Inicio rápido (Windows)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com) y ejecuta `supabase/schema.sql` en el **SQL Editor**.
2. Edita `config.js` con tu **Project URL** y tu **clave anon/publishable**.
3. En la carpeta del proyecto: `npm run dev` → abre <http://localhost:5173>.
4. Para usarla en el celular, publícala con HTTPS (Vercel/Netlify, gratis) → `docs/02-despliegue.md`.

## Documentación

| Archivo | Contenido |
|---|---|
| [docs/01-instalacion.md](docs/01-instalacion.md) | Configurar Supabase y correr en local |
| [docs/02-despliegue.md](docs/02-despliegue.md) | Publicar en Vercel / Netlify / GitHub Pages e instalar en dispositivos |
| [docs/03-guia-de-uso.md](docs/03-guia-de-uso.md) | Cómo escanear para obtener buenos resultados |
| [docs/04-arquitectura.md](docs/04-arquitectura.md) | Estructura del código, flujo de datos y sincronización |
| [docs/05-filtro-de-acordes.md](docs/05-filtro-de-acordes.md) | Cómo se detectan y quitan los acordes |
| [docs/06-base-de-datos.md](docs/06-base-de-datos.md) | Tablas, Storage y seguridad (RLS) |
| [docs/07-solucion-de-problemas.md](docs/07-solucion-de-problemas.md) | Errores comunes |
| [docs/08-hoja-de-ruta.md](docs/08-hoja-de-ruta.md) | Ideas para siguientes versiones |

## Pruebas

```bash
npm test   # pruebas del filtro de acordes (Node 18+)
```

## Stack

HTML + CSS + JavaScript (módulos ES) **sin paso de compilación** · Supabase (Auth, Postgres, Realtime, Storage) · Tesseract.js 5 · Cropper.js 1.6 · Service Worker.
