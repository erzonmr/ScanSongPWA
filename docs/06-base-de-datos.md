# 6. Base de datos y almacenamiento

Script completo: `supabase/schema.sql`.

## Tabla `public.songs`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | Generado en el cliente o por defecto `gen_random_uuid()` |
| `user_id` | uuid | Dueño; por defecto `auth.uid()`. Se borra en cascada con el usuario |
| `title` | text | 1–200 caracteres |
| `lyrics` | text | Letra limpia (sin acordes) |
| `raw_text` | text | Transcripción original con acordes (para re-limpiar) |
| `image_paths` | text[] | Rutas de las imágenes en el bucket `scans` |
| `created_at` | timestamptz | Fecha de creación |
| `updated_at` | timestamptz | Actualizado por trigger en cada `UPDATE` |

Índices: `(user_id, title)` y `(user_id, updated_at desc)`.

## Seguridad (RLS)

Row Level Security está activado. Cuatro políticas (`select/insert/update/delete`) permiten operar solo filas donde `user_id = auth.uid()`. La clave pública (anon) no puede leer nada sin una sesión válida.

## Realtime

La tabla se agrega a la publicación `supabase_realtime`. El cliente se suscribe con filtro `user_id=eq.<uid>`, y Realtime respeta RLS.

## Storage — bucket `scans`

- **Privado**; límite 5 MB por archivo; tipos `image/jpeg`, `image/png`, `image/webp`.
- Ruta: `<user_id>/<song_id>/<timestamp>-<aleatorio>.jpg`.
- Políticas: cada usuario solo lee/escribe/borra dentro de la carpeta con su `user_id`.
- La app muestra las imágenes con **URLs firmadas** que caducan en 1 hora.

## Función `ocr`

No está en `schema.sql`. Es la Edge Function `supabase/functions/ocr`: recibe la foto en base64, exige el JWT del usuario y llama a Grok 4.7. La clave `XAI_API_KEY` es un secreto del proyecto. Una página no se guarda en Postgres hasta que la persona pulsa **Guardar**.

## Límites del plan gratuito (referencia)

Plan Free de Supabase: 500 MB de base de datos y 1 GB de Storage. Una canción ocupa ~2–5 KB de texto y ~200–400 KB de imagen; es decir, miles de canciones de texto y unas 2.500–5.000 imágenes. Si no necesitas las fotos, desmarca "Guardar también la imagen escaneada".

> Nota: en el plan Free, los proyectos sin actividad durante una semana se **pausan**. Se reactivan desde el panel de Supabase (los datos no se pierden).

## Consultas útiles (SQL Editor)

```sql
-- Cuántas canciones tengo
select count(*) from songs;

-- Buscar en letras
select title from songs where lyrics ilike '%gracia%' order by title;

-- Canciones duplicadas por título
select lower(title), count(*) from songs group by 1 having count(*) > 1;
```

## Respaldo

- Desde la app: **Ajustes → Exportar todo (.json)**.
- Desde Supabase: **Database → Backups** (los planes de pago tienen respaldos automáticos) o `pg_dump` con la cadena de conexión.
