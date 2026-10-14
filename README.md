# Cantoral — Letras escaneadas

PWA personal para **escanear canciones de un cancionero con la cámara**, **leerlas con IA de visión**, **quitar los acordes** y **guardar solo la letra en la nube**, sincronizada entre todos tus dispositivos.

Sitio publicado: **https://cantoral-letras.netlify.app**

## Qué hace

- 📷 Escanea con la cámara del celular (o elige una imagen de la galería / PC).
- ✂️ Editor de imagen: **recortar**, **girar**, **enderezar** y **borrar zonas** (recuadro o pincel) para eliminar contenido ajeno (otra canción, número de página, dibujos).
- 🔤 Lectura con **Grok 4.7** (visión) a través de una Edge Function de Supabase. La clave de la API no sale del servidor.
- 📱 Motor de respaldo en el dispositivo (Tesseract.js), por si la IA no responde.
- 🎸➡️📝 Quita los acordes (notación americana `C Am G7` y latina `Do Lam Sol7`), incluso cuando la lectura los deja en su propia línea o los lee mal.
- ☁️ Guarda en la nube (Supabase): letras en Postgres e imágenes escaneadas en Storage.
- 🔄 Sincronización en **tiempo real** entre dispositivos (celular, tablet, PC).
- 📄 Canciones de varias páginas ("Añadir otra página").
- 🔍 Búsqueda por título o letra (sin importar tildes), tamaño de letra ajustable, pantalla siempre encendida, compartir, exportar/importar `.txt` y `.json`.
- 📲 Instalable como app (Android, iOS, Windows, macOS).

## Inicio rápido (Windows)

El proyecto **cantoral** de Supabase y el sitio de Netlify ya están configurados. Para probar en el PC:

```powershell
npm run dev
```

Abre <http://localhost:5173> e inicia sesión con la misma cuenta que en el celular.

Para dejar la lectura con IA operativa en un proyecto nuevo, hace falta el secreto `XAI_API_KEY` y la función `ocr`. Los pasos están en [docs/01-instalacion.md](docs/01-instalacion.md).

## Documentación

| Archivo | Contenido |
|---|---|
| [docs/01-instalacion.md](docs/01-instalacion.md) | Supabase, clave de visión y prueba en local |
| [docs/02-despliegue.md](docs/02-despliegue.md) | Sitio en Netlify, alternativas e instalación en dispositivos |
| [docs/03-guia-de-uso.md](docs/03-guia-de-uso.md) | Cómo escanear para obtener buenos resultados |
| [docs/04-arquitectura.md](docs/04-arquitectura.md) | Estructura del código, flujo de datos y sincronización |
| [docs/05-filtro-de-acordes.md](docs/05-filtro-de-acordes.md) | Cómo se detectan y quitan los acordes |
| [docs/06-base-de-datos.md](docs/06-base-de-datos.md) | Tablas, Storage, función de lectura y seguridad (RLS) |
| [docs/07-solucion-de-problemas.md](docs/07-solucion-de-problemas.md) | Errores comunes |
| [docs/08-hoja-de-ruta.md](docs/08-hoja-de-ruta.md) | Ideas para siguientes versiones |

## Pruebas

```bash
npm test   # filtro de acordes y limpieza de la transcripción (Node 18+)
```

## Stack

HTML + CSS + JavaScript (módulos ES) **sin paso de compilación** · Supabase (Auth, Postgres, Realtime, Storage, Edge Functions) · Grok 4.7 · Tesseract.js 5 · Cropper.js 1.6 · Netlify · Service Worker.
