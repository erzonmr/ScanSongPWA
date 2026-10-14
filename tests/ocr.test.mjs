import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTranscript } from '../js/ocr.js';

test('quita cercas de markdown de la transcripción', () => {
  assert.equal(cleanTranscript('```\nCORO:\nAleluya\n```'), 'CORO:\nAleluya');
  assert.equal(cleanTranscript('```text\nDo   Sol\n```'), 'Do   Sol');
});

test('deja el texto plano como está', () => {
  assert.equal(cleanTranscript('  Señor mi Dios  \n'), 'Señor mi Dios');
});
