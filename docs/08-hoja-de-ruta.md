# 8. Hoja de ruta (ideas para después del MVP)

Ordenadas de mayor a menor valor práctico.

## Corto plazo

- [ ] **Detección automática de bordes** de la página (corrección de perspectiva tipo "escáner de documentos", con OpenCV.js o jscanify).
- [ ] **Etiquetas / categorías** (adoración, alabanza, Santa Cena, himnos) y filtro en la lista.
- [ ] **Listas de culto (setlists)**: ordenar canciones para un servicio y pasar con deslizamiento.
- [ ] **Modo presentación**: pantalla completa, letra grande, siguiente estrofa con un toque.
- [ ] **Campo de autor y número de himno** del cancionero original.

## Mediano plazo

- [ ] **Cancioneros compartidos** con el equipo de alabanza (tabla `songbooks` + `songbook_members` y políticas RLS por membresía).
- [ ] **Lectura sin conexión** opcional (caché de solo lectura en IndexedDB) para lugares sin señal.
- [x] **Lectura con IA** (Grok 4.7 vía Edge Function `ocr`). Es el motor por defecto; Tesseract queda en el dispositivo.
- [ ] **Letra manuscrita**: la visión actual está afinada para cancionero impreso.
- [ ] **Historial de versiones** de cada canción.
- [ ] Exportar a **PDF** o a **diapositivas** para proyectar.

## Técnico

- [ ] Pruebas end-to-end con Playwright.
- [ ] Empaquetar dependencias localmente (sin CDN) con Vite.
- [ ] Búsqueda de texto completo en Postgres (`tsvector` con diccionario español) cuando haya miles de canciones.
