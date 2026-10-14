// Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChord, classifyLine, stripChords, guessTitle } from '../js/chords.js';

test('reconoce acordes en notación americana', () => {
  for (const c of ['C', 'Am', 'G7', 'F#m', 'Bb', 'Cmaj7', 'Dsus4', 'E7sus4', 'Am7/G', 'G/B', 'F#m7b5', 'Cadd9', 'Bdim', 'C#m7', '(Am)', 'A7(b9)', 'D/F#', 'Eb+', 'Cº']) {
    assert.ok(isChord(c), `debería ser acorde: ${c}`);
  }
});

test('reconoce acordes en notación latina', () => {
  for (const c of ['Do', 'Rem', 'Mi7', 'Fa#m', 'Sol', 'SOL7', 'La', 'LAm', 'Sim7', 'Sib', 'Do/Mi', 'Solsus4', 'Re7']) {
    assert.ok(isChord(c), `debería ser acorde: ${c}`);
  }
});

test('no confunde palabras con acordes', () => {
  for (const w of ['la', 'mi', 'si', 'sol', 'Dios', 'Amén', 'Cristo', 'Gloria', 'Aleluya', 'Él', 'Señor', 'Santo,', 'La,', 'Bien']) {
    assert.ok(!isChord(w), `no debería ser acorde: ${w}`);
  }
});

test('clasifica líneas', () => {
  assert.equal(classifyLine('G        D        Em'), 'chords');
  assert.equal(classifyLine('  Do       Sol      Lam    Fa'), 'chords');
  assert.equal(classifyLine('Intro: G  C  D  G'), 'chords');
  assert.equal(classifyLine('| G  | C  | D  |'), 'chords');
  assert.equal(classifyLine('CORO:'), 'label');
  assert.equal(classifyLine('Cuán grande es Él'), 'lyrics');
  assert.equal(classifyLine('A ti sea la gloria'), 'lyrics');
  assert.equal(classifyLine('La mi sol'), 'lyrics');
  assert.equal(classifyLine('G   C   Arn   D'), 'chords'); // OCR leyó "Arn"
  assert.equal(classifyLine(''), 'empty');
});

test('quita líneas de acordes y conserva la letra', () => {
  const input = [
    'CUÁN GRANDE ES ÉL',
    '',
    'Intro: G C D G',
    '',
    'G                C',
    'Señor mi Dios, al contemplar los cielos',
    'D                 G',
    'el firmamento y las estrellas mil',
    '',
    'CORO:',
    'G         C        G',
    'Mi corazón entona la canción',
  ].join('\n');

  const { lyrics, removed } = stripChords(input);
  assert.equal(lyrics, [
    'CUÁN GRANDE ES ÉL',
    '',
    'Señor mi Dios, al contemplar los cielos',
    'el firmamento y las estrellas mil',
    '',
    'CORO:',
    'Mi corazón entona la canción',
  ].join('\n'));
  assert.equal(removed, 4);
});

test('texto OCR real con acordes mal leídos', () => {
  // Salida real de Tesseract sobre una foto de prueba (acordes "C" leídos como "[o", "Cc", "(e").
  const raw = 'CUAN GRANDE ES EL\nC                       F\nSeñor mi Dios, al contemplar los cielos\nG                       C\nel firmamento y las estrellas mil\n[o                       F\nal oír tu voz en los potentes truenos\nG                       Cc\ny ver brillar al sol en su cenit\nCORO:\n[o         F         Cc\nMi corazón entona la canción\nAm        G           (e\ncuán grande es Él, cuán grande es El\n';
  const { lyrics } = stripChords(raw);
  assert.equal(lyrics, [
    'CUAN GRANDE ES EL',
    'Señor mi Dios, al contemplar los cielos',
    'el firmamento y las estrellas mil',
    'al oír tu voz en los potentes truenos',
    'y ver brillar al sol en su cenit',
    'CORO:',
    'Mi corazón entona la canción',
    'cuán grande es Él, cuán grande es El',
  ].join('\n'));
});

test('no borra letra con espacios normales', () => {
  assert.equal(classifyLine('a ti sea la gloria'), 'lyrics');
  assert.equal(classifyLine('Oh, oh, oh'), 'lyrics');
  assert.equal(classifyLine('[o'), 'chords');
});

test('quita acordes en línea estilo ChordPro', () => {
  const { lyrics } = stripChords('[G]Santo, [C]santo, [D]santo [Em](x2)');
  assert.equal(lyrics, 'Santo, santo, santo (x2)');
});

test('opción para quitar etiquetas de sección', () => {
  const { lyrics } = stripChords('Coro:\nAleluya', { keepLabels: false });
  assert.equal(lyrics, 'Aleluya');
});

test('sugiere título', () => {
  assert.equal(guessTitle('\nCORO:\nCuán grande es Él,\n...'), 'Cuán grande es Él');
  assert.equal(guessTitle(''), 'Canción sin título');
});
