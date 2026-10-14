// Lectura de cancioneros con visión. La clave XAI_API_KEY vive solo como
// secreto de Supabase (supabase secrets set). El gateway exige el JWT del usuario.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LANGS: Record<string, string> = {
  spa: 'español',
  eng: 'inglés',
  'spa+eng': 'español e inglés',
  por: 'portugués',
};

function promptFor(lang: string, layout: string) {
  const language = LANGS[lang] || 'español';
  const columns = layout === 'auto'
    ? 'Si hay dos columnas, transcribe la columna izquierda completa y después la derecha.'
    : 'La página es una sola columna: léela de arriba hacia abajo.';
  return `Transcribe esta foto de una página de cancionero impreso (letra con acordes de guitarra).

Devuelve solo la transcripción en texto plano, sin comentarios, sin markdown y sin comillas.

Reglas:
- Conserva los saltos de línea tal como están impresos.
- Los acordes van en su propia línea, separados por espacios. No los pegues a la línea de la letra.
- Conserva etiquetas como CORO, ESTROFA, Intro, Puente.
- Conserva tildes, eñes y signos. No corrijas la ortografía ni traduzcas.
- La notación puede ser americana (C, Am, G7) o latina (Do, Lam, Sol7). Cópiala como se ve.
- Ignora las zonas tapadas en blanco.
- Idioma esperado: ${language}.
- ${columns}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function extractText(data: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts: string[] = [];
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if ((part.type === 'output_text' || part.type === 'text') && part.text) parts.push(part.text);
    }
  }
  return parts.join('\n').trim();
}

function safeError(value: unknown) {
  const msg = typeof value === 'string' ? value : 'La IA no pudo leer la foto.';
  return msg.replace(/sk-[a-z0-9_-]+/gi, '').slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const key = Deno.env.get('XAI_API_KEY');
  if (!key) return json({ error: 'La lectura con IA no está configurada en el servidor.' }, 503);

  let body: { image?: string; lang?: string; layout?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'La imagen no llegó bien.' }, 400);
  }

  const image = String(body.image || '');
  if (image.length < 100) return json({ error: 'Falta la imagen.' }, 400);
  if (image.length > 8_000_000) return json({ error: 'La imagen es demasiado grande. Recorta solo la canción.' }, 413);
  const dataUrl = image.startsWith('data:image/') ? image : `data:image/jpeg;base64,${image}`;

  let upstream: Response;
  try {
    upstream = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'grok-4.7',
        store: false,
        input: [{
          role: 'user',
          content: [
            { type: 'input_image', image_url: dataUrl, detail: 'high' },
            { type: 'input_text', text: promptFor(body.lang || 'spa', body.layout || 'column') },
          ],
        }],
      }),
    });
  } catch {
    return json({ error: 'No se pudo contactar al servicio de visión.' }, 502);
  }

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const err = payload?.error?.message || payload?.error;
    return json({ error: safeError(err) }, 502);
  }
  const text = extractText(payload);
  if (!text) return json({ error: 'La IA no devolvió texto. Prueba recortando más cerca de la canción.' }, 502);
  return json({ text });
});
