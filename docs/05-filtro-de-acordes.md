# 5. Filtro de acordes

Archivo: `js/chords.js` · Pruebas: `tests/chords.test.mjs` (`npm test`).

## El problema

Un cancionero típico pone los acordes en una línea encima de la letra:

```
G                C
Señor mi Dios, al contemplar los cielos
```

La lectura devuelve ambas líneas. Grok recibe la instrucción de dejar los acordes en su propia línea. Tesseract, además, a veces **lee mal los acordes** (una `C` pequeña sale como `[o`, `Cc` o `(e`), así que no basta con buscar acordes válidos.

## Cómo funciona

Para cada línea del texto leído:

1. **Acordes en línea** estilo ChordPro (`[G]Santo`) → se quitan los corchetes con acorde.
2. **Etiquetas** (`Coro:`, `Estrofa 2`, `Intro:`, `Tono:`…) se detectan y se separan del resto.
3. Se separan los **tokens** y se ignora el **ruido** (`|`, `-`, `x2`, `(x2)`, `N.C.`, `%`).
4. La línea se considera **de acordes** (y se elimina) si:
   - **Pista de espaciado**: hay huecos de 3+ espacios entre tokens y todos los tokens tienen ≤ 3 caracteres. Tesseract conserva esos huecos (`preserve_interword_spaces`). La letra nunca se ve así, y esto atrapa acordes mal leídos.
   - **Proporción**: ≥ 75 % de los tokens son acordes válidos.
   - **Mayoría con ruido**: ≥ 50 % son acordes, hay al menos 2, y los demás tokens son muy cortos.
   - Un solo token corto entre corchetes/paréntesis (`[o`, `(e`).
5. Etiqueta + acordes (`Intro: G C D`) → se elimina la línea completa. Etiqueta sola (`CORO:`) → se conserva (configurable).
6. La letra se normaliza: espacios múltiples, comillas tipográficas, barras de compás sueltas, máximo una línea en blanco seguida.

## Acordes reconocidos

**Americana:** `C D E F G A B` + `#/b` + calidad (`m`, `maj`, `min`, `dim`, `aug`, `sus`, `add`, `º`, `+`) + extensiones (`7`, `9`, `11`, `13`, `b5`, `#9`…) + paréntesis (`A7(b9)`) + bajo (`G/B`, `D/F#`).

**Latina:** `Do Re Mi Fa Sol La Si` (o en mayúsculas `DO RE…`) con las mismas variantes: `Lam`, `Sol7`, `Fa#m`, `Sib`, `Do/Mi`, `Sim7`.

### Protección contra falsos positivos

- La notación latina solo se reconoce con **mayúscula inicial** (`La`, `LA`): `la`, `mi`, `si`, `sol` en minúscula son letra.
- Palabras con puntuación (`La,`, `Santo,`) no son acordes.
- Una línea se elimina solo si (casi) **todos** sus tokens son acordes; `A ti sea la gloria` se conserva.

## Reconstrucción de estrofas

Solo aplica al motor del dispositivo. Tesseract en modo "una columna" no devuelve líneas vacías. `ocr.js` usa la posición vertical de cada línea: si el espacio entre dos líneas es ≥ 1,5 veces el habitual (percentil 75), inserta una línea en blanco. La visión ya trae los saltos que vio en la página; si envuelve la respuesta en una cerca de markdown, `cleanTranscript` la quita (`tests/ocr.test.mjs`).

## Siempre hay revisión humana

Ninguna lectura es perfecta. Por eso la pantalla de revisión muestra la letra editable y conserva el **texto original** para poder volver a limpiarlo.

## Ajustar el filtro

- Para agregar etiquetas de sección: `LABEL_RE`.
- Para más ruido ignorado: `NOISE_RE`.
- Agrega un caso en `tests/chords.test.mjs` con el texto real que falló y corre `npm test`.
