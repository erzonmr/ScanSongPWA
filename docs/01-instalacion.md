# 1. Instalación y configuración

Tiempo estimado: 10–15 minutos, más la clave de visión si partes de cero.

## Estado actual

| Pieza | Valor |
|---|---|
| Proyecto Supabase | `cantoral` (`ynhhagbciyfntxgiaqbt`), región East US (Virginia) |
| App | https://cantoral-letras.netlify.app |
| Site URL de Auth | `https://cantoral-letras.netlify.app` |
| Redirect URLs | esa URL, `http://localhost:5173/**` y `http://127.0.0.1:5173/**` |
| Confirmación de correo | desactivada |
| Lectura con IA | función `ocr`; secreto `XAI_API_KEY` (no está en el repositorio) |

`config.js` ya apunta a ese proyecto. La clave anónima es pública; la de Grok no va ahí.

## Requisitos

- Una cuenta en [supabase.com](https://supabase.com) (puedes entrar con GitHub).
- Para probar en tu PC: [Node.js 18+](https://nodejs.org) (solo para el servidor local) **o** la extensión *Live Server* de VS Code.
- Un navegador moderno (Chrome, Edge, Safari, Firefox).

## Paso 1 — Crear el proyecto de Supabase

1. En el panel de Supabase: **New project**.
2. Nombre: `cantoral`. Contraseña de la base de datos: guárdala (no la usa la app).
3. Región: la más cercana (p. ej. *East US* o *South America (São Paulo)* para Colombia).
4. Espera 1–2 minutos a que se cree.

## Paso 2 — Crear tablas, seguridad, realtime y almacenamiento

1. Menú izquierdo → **SQL Editor** → **New query**.
2. Pega **todo** el contenido de `supabase/schema.sql` y pulsa **Run**.
3. Debe decir *Success. No rows returned*.

Esto crea:

- La tabla `songs` con seguridad por fila (cada usuario solo ve lo suyo).
- La publicación de **Realtime** para sincronizar entre dispositivos.
- El bucket privado `scans` para las imágenes escaneadas, con sus políticas.

> Puedes volver a ejecutar el script cuantas veces quieras; es idempotente.

## Paso 3 — Configurar la autenticación

**Authentication → Sign In / Providers → Email**:

- Deja **Email** habilitado.
- Como es un proyecto personal, puedes **desactivar "Confirm email"** para entrar sin tener que confirmar el correo. Si lo dejas activo, al crear la cuenta te llegará un correo de confirmación.

**Authentication → URL Configuration**:

- **Site URL**: `https://cantoral-letras.netlify.app`.
- **Redirect URLs**: `https://cantoral-letras.netlify.app/**`, `http://localhost:5173/**` y `http://127.0.0.1:5173/**`. Hacen falta para "Olvidé mi contraseña".

En este proyecto la confirmación de correo está desactivada y el registro sigue abierto hasta que crees tu cuenta.

> Recomendado: después de crear tu cuenta, desactiva **"Allow new users to sign up"** (Authentication → Sign In / Providers) para que nadie más pueda registrarse en tu app.

## Paso 4 — Conectar la app

1. En Supabase: **Project Settings → API** (o el botón **Connect** arriba).
2. Copia:
   - **Project URL** → `https://xxxxxxxx.supabase.co`
   - **anon public** key (o **Publishable key** `sb_publishable_...`).
3. Abre `config.js` y pega los valores:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  OCR_LANG: 'spa',
};
```

> ⚠️ Nunca uses la clave **service_role / secret** ni la clave de Grok en `config.js`. La clave anon es pública por diseño; la protección real está en las políticas RLS.

## Paso 5 — Clave de visión

La función `supabase/functions/ocr` llama a Grok 4.7. La clave se guarda como secreto del proyecto, no en git.

En PowerShell, dentro de la carpeta del proyecto, sustituye `PEGA_LA_CLAVE` y ejecuta:

```powershell
Set-Content -Path "$env:TEMP\cantoral-xai.env" -Value "XAI_API_KEY=PEGA_LA_CLAVE"
supabase secrets set --env-file "$env:TEMP\cantoral-xai.env" --project-ref ynhhagbciyfntxgiaqbt
Remove-Item "$env:TEMP\cantoral-xai.env"
supabase functions deploy ocr --project-ref ynhhagbciyfntxgiaqbt --use-api --yes
```

`supabase secrets list --project-ref ynhhagbciyfntxgiaqbt` debe mostrar el nombre `XAI_API_KEY`. En este proyecto el secreto ya está cargado.

## Paso 6 — Ejecutar en tu PC (Windows)

En PowerShell, dentro de la carpeta del proyecto:

```powershell
npm run dev
```

Abre <http://localhost:5173>, crea tu cuenta y prueba con una foto (botón **Elegir imagen**).

Alternativas sin Node:

- **VS Code + Live Server**: clic derecho en `index.html` → *Open with Live Server*.
- **Python**: `python -m http.server 5173`.

> La app **no funciona abriendo `index.html` con doble clic** (`file://`): los módulos JS, el service worker y la cámara requieren un servidor `http://localhost` o `https://`.

## Paso 7 — Probar en el celular

La cámara y la instalación como app requieren **HTTPS**. El sitio ya publicado es https://cantoral-letras.netlify.app. Si vuelves a publicar, sigue [02-despliegue.md](02-despliegue.md).

En local, **Leer con IA** también funciona: el navegador llama a la función de Supabase. El motor del dispositivo no necesita esa clave.
