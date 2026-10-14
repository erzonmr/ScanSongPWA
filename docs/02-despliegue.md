# 2. Despliegue (publicar con HTTPS)

La interfaz es estática. La lectura con IA vive en la Edge Function `ocr` de Supabase, no en Netlify. Publicar la carpeta no despliega esa función: eso se hace con `supabase functions deploy ocr` ([01-instalacion.md](01-instalacion.md)).

## Sitio en uso — Netlify

- URL: **https://cantoral-letras.netlify.app**
- Panel: https://app.netlify.com/projects/cantoral-letras
- Nombre pedido `cantoral` (ocupado); el sitio quedó como `cantoral-letras`.
- `netlify.toml` publica la raíz, sin comando de build. `sw.js` y `config.js` se sirven con `Cache-Control: no-cache`.

Un push a GitHub **no** vuelve a publicar. Hay que desplegar de nuevo el mismo sitio y subir `VERSION` en `sw.js` (ahora `cantoral-v1.1.0`).

Con la CLI de Netlify, desde esta carpeta:

```powershell
npx netlify deploy --prod --dir=. --site=cantoral-letras
```

## Otras formas de publicar la carpeta

Cualquier hosting estático con HTTPS sirve. Después hay que añadir esa URL en Auth (abajo).

**Vercel:** `vercel --prod`, sin build, directorio de salida `.`.

**Netlify Drop:** arrastra la carpeta en <https://app.netlify.com/drop>.

**GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. La app usa rutas relativas, así que funciona en una subcarpeta.

## Después de publicar

1. En `supabase/config.toml`, pon la URL HTTPS en `site_url` y en `additional_redirect_urls` (deja también `http://localhost:5173/**`).
2. Sube solo ese cambio de Auth:

```powershell
supabase config push --project-ref ynhhagbciyfntxgiaqbt --yes
```

3. Abre la URL en cada dispositivo e inicia sesión con la misma cuenta.

## Instalar como app

| Dispositivo | Cómo |
|---|---|
| Android (Chrome) | Menú ⋮ → **Instalar app** / *Agregar a pantalla principal* |
| iPhone/iPad (Safari) | Botón Compartir → **Agregar a inicio** |
| Windows (Edge/Chrome) | Icono de instalar en la barra de direcciones, o Ajustes de la app → **Instalar app** |

## Actualizar la app

Cuando cambies archivos, publica de nuevo en **el mismo sitio** y **cambia `VERSION` en `sw.js`** (p. ej. `cantoral-v1.1.1`). Así el service worker descarta la caché vieja. Los usuarios ven la nueva versión al cerrar y volver a abrir la app.

## Seguridad recomendada para uso personal

- Desactiva **Allow new users to sign up** cuando ya tengas tu cuenta.
- Si compartes la app con tu equipo de alabanza, déjalo activo: cada cuenta tiene su propio cancionero aislado (ver [08-hoja-de-ruta.md](08-hoja-de-ruta.md) para cancioneros compartidos).
- La clave de Grok es el secreto `XAI_API_KEY`. La función solo acepta llamadas con la sesión del usuario.
