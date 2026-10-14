# 4. Arquitectura

## Visión general

```
┌──────────────────────── Navegador (PWA) ────────────────────────┐
│                                                                 │
│  Cámara/Galería ─► Recorte (Cropper.js) ─► Borrado (canvas)     │
│                                   │                             │
│                                   ▼                             │
│                     Preproceso (grises, contraste, Otsu)        │
│                                   │                             │
│                                   ▼                             │
│                       OCR (Tesseract.js, WASM)                  │
│                                   │  texto con acordes          │
│                                   ▼                             │
│                     Filtro de acordes (chords.js)               │
│                                   │  solo letra                 │
│                                   ▼                             │
│                     Revisión / edición manual                   │
└───────────────────────────────────┬─────────────────────────────┘
                                    │ HTTPS (supabase-js)
┌───────────────────────────────────▼─────────────────────────────┐
│ Supabase:  Auth  │  Postgres (songs + RLS)  │  Storage (scans)  │
│                  │  Realtime ──► otros dispositivos             │
└─────────────────────────────────────────────────────────────────┘
```

Decisiones clave:

- **Sin backend propio ni compilación**: archivos estáticos + Supabase. Fácil de mantener para un proyecto personal.
- **OCR en el dispositivo**: no hay costos de API ni se envían imágenes a terceros para leerlas.
- **Nube como fuente de verdad**: las canciones no se guardan en el dispositivo; solo se mantienen en memoria mientras la app está abierta. En el dispositivo solo quedan la sesión, preferencias visuales y la caché de la app/motor OCR.

## Estructura de archivos

```
cantoral/
├── index.html            Shell de la app
├── config.js             URL y clave pública de Supabase (editar)
├── config.example.js     Plantilla
├── manifest.webmanifest  Metadatos de la PWA
├── sw.js                 Service worker (caché del shell y librerías)
├── css/styles.css        Estilos (claro/oscuro automático)
├── icons/                Íconos de la app
├── js/
│   ├── app.js            Router por hash + vistas (lista, canción, borrador, ajustes, login)
│   ├── db.js             Supabase: auth, CRUD, realtime, storage
│   ├── scanner.js        Flujo de escaneo: captura → recorte → borrado → OCR
│   ├── imaging.js        Utilidades de canvas: EXIF, preproceso OCR, compresión JPEG
│   ├── ocr.js            Tesseract.js + reconstrucción de estrofas
│   ├── chords.js         Filtro de acordes (puro, testeable)
│   └── lib.js            Helpers de UI, íconos, preferencias
├── supabase/schema.sql   Base de datos, RLS, realtime y bucket
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
- **Supabase**: nunca se cachea (datos siempre de la nube).
- `config.js` y navegación: *network-first*.

## Dependencias externas (CDN jsDelivr, versiones fijadas)

| Librería | Versión | Uso |
|---|---|---|
| @supabase/supabase-js | 2.45.4 | Auth, BD, realtime, storage |
| tesseract.js | 5.1.1 | OCR (carga perezosa al escanear) |
| cropperjs | 1.6.2 | Recorte y rotación (carga perezosa) |

Para actualizar una versión, cambia la URL en `db.js`, `ocr.js` o `scanner.js` y sube `VERSION` en `sw.js`.
