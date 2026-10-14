# 4. Arquitectura

## Visión general

```
┌──────────────────────── Navegador (PWA) ────────────────────────┐
│                                                                 │
│  Cámara/Galería ─► Recorte (Cropper.js) ─► Borrado (canvas)     │
│                                   │                             │
│                    ┌──────────────┴──────────────┐              │
│                    ▼                             ▼              │
│         JPEG a color (visión)          Grises / Otsu            │
│                    │                    (motor local)           │
│                    ▼                             │              │
│         Edge Function ocr                        ▼              │
│         Grok 4.7, detail high            Tesseract.js           │
│                    │                             │              │
│                    └──────────────┬──────────────┘              │
│                                   ▼  texto con acordes          │
│                     Filtro de acordes (chords.js)               │
│                                   │  solo letra                 │
│                                   ▼                             │
│                     Revisión / edición manual                   │
└───────────────────────────────────┬─────────────────────────────┘
                                    │ HTTPS (supabase-js)
┌───────────────────────────────────▼─────────────────────────────┐
│ Supabase:  Auth  │  Postgres (songs + RLS)  │  Storage (scans)  │
│            Edge Function ocr (XAI_API_KEY)  │  Realtime         │
└─────────────────────────────────────────────────────────────────┘
```

Decisiones clave:

- **La interfaz no se compila**: archivos estáticos en Netlify. La única pieza de servidor es la función `ocr`.
- **La clave de Grok no llega al navegador.** La función exige el JWT de la sesión y llama a `https://api.x.ai/v1/responses` con `store: false` para no guardar la foto en el historial de xAI.
- **Visión por defecto, Tesseract de respaldo.** La IA recibe la foto a color (lado largo 2000 px, o menos si pesa más de 1,4 MB). El motor local sigue binarizando cuando el usuario lo pide.
- **Nube como fuente de verdad**: las canciones no se guardan en el dispositivo; solo se mantienen en memoria mientras la app está abierta. En el dispositivo quedan la sesión, las preferencias y la caché del shell.

## Estructura de archivos

```
cantoral/
├── index.html            Shell de la app
├── config.js             URL y clave pública de Supabase (editar)
├── config.example.js     Plantilla
├── netlify.toml          Publicación estática, sin build
├── manifest.webmanifest  Metadatos de la PWA
├── sw.js                 Service worker (caché del shell y librerías)
├── css/styles.css        Estilos (claro/oscuro automático)
├── icons/                Íconos de la app
├── js/
│   ├── app.js            Router por hash + vistas (lista, canción, borrador, ajustes, login)
│   ├── db.js             Supabase: auth, CRUD, realtime, storage, llamada a ocr
│   ├── scanner.js        Flujo de escaneo: captura → recorte → borrado → lectura
│   ├── imaging.js        Canvas: EXIF, JPEG para visión, preproceso local, compresión
│   ├── ocr.js            Visión o Tesseract, más reconstrucción de estrofas local
│   ├── chords.js         Filtro de acordes (puro, testeable)
│   └── lib.js            Helpers de UI, íconos, preferencias
├── supabase/schema.sql   Base de datos, RLS, realtime y bucket
├── supabase/config.toml  Auth y ajustes del proyecto enlazado
├── supabase/functions/ocr  Transcripción con Grok (Deno)
├── tests/                Pruebas (node --test)
└── docs/                 Esta documentación
```

## Rutas

| Hash | Vista |
|---|---|
| `#/` | Lista y búsqueda |
| `#/song/:id` | Ver canción |
| `#/scan` · `#/scan?append=1` | Escáner (nueva canción / añadir página al borrador) |
| `#/draft` | Revisión de una canción recién escaneada |
| `#/new` | Canción escrita a mano |
| `#/edit/:id` | Editar canción existente |
| `#/settings` | Ajustes |

## Sincronización multidispositivo

1. Al iniciar sesión se descarga la lista completa (`select` de `songs`).
2. Se abre un canal **Realtime** (`postgres_changes` filtrado por `user_id`). Cada `INSERT/UPDATE/DELETE` hecho en otro dispositivo actualiza la memoria y la pantalla al instante.
3. Para no perder cambios ocurridos mientras el canal estaba caído, se vuelve a descargar la lista cuando:
   - el canal se (re)conecta,
   - vuelve internet (`online`),
   - la app vuelve a primer plano (`visibilitychange`).
4. Conflictos: **gana la última escritura** (`updated_at` lo pone un trigger en el servidor). Para uso personal es suficiente.

## Guardado de una canción escaneada

1. Se genera el `id` en el cliente (`crypto.randomUUID()`).
2. Si se eligió guardar la imagen, se comprime (JPEG, máx. 1800 px, ~150–400 KB) y se sube a `scans/<user_id>/<song_id>/<timestamp>.jpg`.
3. Se inserta/actualiza la fila con `title`, `lyrics`, `raw_text` e `image_paths`.
4. Si falla el paso 3, se borran las imágenes subidas en el paso 2 (no quedan huérfanas).

## Service worker

- **Shell** (HTML/CSS/JS/íconos): *stale-while-revalidate* → la app abre al instante.
- **CDN versionado** (supabase-js, Tesseract, Cropper, modelo de idioma): *cache-first*.
- **Supabase** (datos, auth y la función `ocr`): nunca se cachea.
- `config.js` y navegación: *network-first*.

## Dependencias externas (CDN jsDelivr, versiones fijadas)

| Librería | Versión | Uso |
|---|---|---|
| @supabase/supabase-js | 2.45.4 | Auth, BD, realtime, storage |
| tesseract.js | 5.1.1 | Lectura local (solo si se elige o si la IA falla) |
| cropperjs | 1.6.2 | Recorte y rotación (carga perezosa) |

Para actualizar una versión, cambia la URL en `db.js`, `ocr.js` o `scanner.js` y sube `VERSION` en `sw.js`.
