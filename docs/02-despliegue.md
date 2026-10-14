# 2. Despliegue (publicar con HTTPS)

La app es **100 % estática** (no hay servidor propio): se publica subiendo la carpeta tal cual. Cualquier hosting estático con HTTPS sirve.

## Opción A — Vercel (recomendada)

**Sin Git (arrastrar y soltar con la CLI):**

```powershell
npm i -g vercel
cd ruta\a\cantoral
vercel          # primera vez: responde las preguntas (framework: Other, sin build)
vercel --prod   # publicar a producción
```

**Con GitHub:** sube la carpeta a un repositorio → en vercel.com **Add New → Project** → importa el repo → *Framework Preset: Other*, sin *Build Command*, *Output Directory* `.` → **Deploy**.

## Opción B — Netlify Drop (la más rápida)

1. Entra a <https://app.netlify.com/drop>.
2. Arrastra la carpeta `cantoral` completa.
3. Listo: te da una URL `https://algo.netlify.app`.

## Opción C — GitHub Pages

1. Sube la carpeta a un repositorio.
2. **Settings → Pages → Deploy from a branch → main / root**.
3. URL: `https://tuusuario.github.io/cantoral/` (la app usa rutas relativas, funciona en subcarpetas).

## Después de publicar

1. En Supabase → **Authentication → URL Configuration**: pon la URL publicada en **Site URL** y en **Redirect URLs**.
2. Abre la URL en cada dispositivo e inicia sesión con la misma cuenta.

## Instalar como app

| Dispositivo | Cómo |
|---|---|
| Android (Chrome) | Menú ⋮ → **Instalar app** / *Agregar a pantalla principal* |
| iPhone/iPad (Safari) | Botón Compartir → **Agregar a inicio** |
| Windows (Edge/Chrome) | Icono de instalar en la barra de direcciones, o Ajustes de la app → **Instalar app** |

## Actualizar la app

Cuando cambies archivos, sube a **la misma versión** en el hosting y **cambia `VERSION` en `sw.js`** (p. ej. `cantoral-v1.0.1`). Así el service worker descarta la caché vieja. Los usuarios verán la nueva versión al reabrir la app (a veces hay que cerrarla y abrirla dos veces).

## Seguridad recomendada para uso personal

- Desactiva **Allow new users to sign up** cuando ya tengas tu cuenta.
- Si compartes la app con tu equipo de alabanza, déjalo activo: cada cuenta tiene su propio cancionero aislado (ver [08-hoja-de-ruta.md](08-hoja-de-ruta.md) para cancioneros compartidos).
