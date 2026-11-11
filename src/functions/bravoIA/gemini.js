/**
 * Cliente mínimo de la API de Gemini (REST, sin dependencias).
 *
 * La clave sale SOLO del entorno del servidor (GEMINI_API_KEY): nunca viaja al navegador ni se guarda en git.
 * El modelo se elige con GEMINI_MODEL (por defecto un Flash) para poder cambiarlo sin tocar el código.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function iaConfigurada() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * @param {object} p
 * @param {string} p.system      Instrucciones del asistente
 * @param {string} p.usuario     Texto de la consulta
 * @param {number} [p.maxTokens] Tope de largo de la respuesta
 * @param {number} [p.temperatura]
 * @param {number} [p.timeoutMs]
 * @returns {Promise<string>} texto de la respuesta
 */
async function generar({ system, usuario, maxTokens = 1024, temperatura = 0.4, timeoutMs = 20000 }) {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new Error('GEMINI_API_KEY no configurada');
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

  const cuerpo = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: usuario }] }],
    generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens },
  };
  // Estos modelos "piensan" antes de responder y eso gasta el tope de la respuesta (puede salir vacía): se apaga para el chat.
  // Otros modelos pueden no aceptar este ajuste; se probó con 2.5 y 3.5.
  if (/2\.5|3\.5/.test(modelo)) cuerpo.generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const pedir = () => fetch(`${BASE}/${encodeURIComponent(modelo)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(timeoutMs),
  });

  let respuesta = await pedir();
  // Google a veces responde "alta demanda" (503) o un límite momentáneo (429): se reintenta una vez
  if (respuesta.status === 503 || respuesta.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    respuesta = await pedir();
  }

  if (!respuesta.ok) {
    // Solo el código: el cuerpo del error no se registra por si trae algo de la consulta
    throw new Error(`Gemini respondió ${respuesta.status}`);
  }

  const datos = await respuesta.json();
  const texto = (datos?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!texto) throw new Error('Gemini devolvió una respuesta vacía');
  return texto;
}

module.exports = { generar, iaConfigurada };
