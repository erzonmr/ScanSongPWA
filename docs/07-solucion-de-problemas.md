# 7. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Pantalla "Falta configurar la nube" | `config.js` vacío | Completa URL y clave ([01-instalacion.md](01-instalacion.md)) |
| Pantalla en blanco abriendo `index.html` | Abierto como `file://` | Usa `npm run dev` o Live Server |
| "No se pudo cargar la librería de la nube" | Sin internet o CDN bloqueado | Revisa la conexión; prueba otra red |
| "Correo o contraseña incorrectos" | Datos erróneos | Usa "Olvidé mi contraseña" |
| "Debes confirmar tu correo" | *Confirm email* activo | En este proyecto está desactivado. Si lo vuelves a activar, confirma el correo |
| El enlace del correo abre `localhost` o no entra | *Site URL* o redirect distinta de la publicada | Site URL: `https://cantoral-letras.netlify.app`. Redirects: esa URL, `localhost:5173` y `127.0.0.1:5173` |
| "Permiso denegado (RLS)" | No se ejecutó `schema.sql` | Ejecútalo completo de nuevo |
| "No existe el bucket scans" | Falta la parte 5 del script | Ejecuta `schema.sql` de nuevo |
| El punto de sincronización queda gris | Realtime no habilitado o sin internet | Ejecuta `schema.sql` (parte 4); revisa la conexión. Igual se sincroniza al volver a la app |
| La cámara no abre | Sitio sin HTTPS o permiso negado | Publica con HTTPS; permite la cámara en el navegador |
| "La lectura con IA no está configurada en el servidor" | Falta `XAI_API_KEY` o la función no se redesplegó | [01-instalacion.md](01-instalacion.md), paso 5. Mientras, **Leer en el dispositivo** |
| "La sesión caducó" al leer | El JWT no llegó o venció | Vuelve a entrar. La función `ocr` rechaza llamadas sin sesión (401) |
| La IA tarda y no termina | Foto grande o sin red | Recorta más cerca. Medio minuto es normal. Si no hay red, usa el motor del dispositivo |
| El motor del dispositivo se queda en 0 % | Primera descarga de Tesseract sin internet | Conéctate; la segunda vez queda en caché |
| La letra sale con basura | Foto oscura, inclinada o con 2 columnas | Mejor luz, enderezar, recortar una columna. Alto contraste solo en el motor del dispositivo |
| Quedan acordes en la letra | Acorde pegado a la letra o formato raro | Bórralos a mano; si se repite, agrega el caso a `tests/` (ver doc 05) |
| Se borró una línea de letra | Línea muy corta con espacios grandes | Revisa el *Texto original* y cópiala; reporta el caso en las pruebas |
| No aparece la versión nueva tras publicar | Caché del service worker | Sube `VERSION` en `sw.js`; cierra y reabre la app |
| En iPhone no aparece "Instalar" | iOS no muestra aviso | Safari → Compartir → **Agregar a inicio** |

## Ver errores detallados

- **PC**: F12 → pestaña *Console*.
- **Android**: conecta el celular por USB y abre `chrome://inspect` en el PC.
- **Supabase**: panel → **Logs** (API, Auth, Realtime, Storage, Edge Functions).
