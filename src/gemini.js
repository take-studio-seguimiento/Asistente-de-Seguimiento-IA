// ============================================================
// Gemini — cliente de IA (reemplaza a la API de Anthropic/Claude)
// Modelo: gemini-flash-latest (alias al flash vigente)
//
// Dos caminos según el entorno:
//  - Desarrollo local: si hay VITE_GEMINI_API_KEY en .env, llama DIRECTO
//    a Google con esa key (para que 'npm run dev' funcione sin más).
//  - Producción (Netlify): sin esa var, llama a la Netlify Function
//    /.netlify/functions/gemini, que agrega la key del lado del servidor.
//    Así la clave nunca queda expuesta en el bundle del navegador.
// ============================================================

const MODEL = "gemini-flash-latest";
const LOCAL_KEY = import.meta.env.VITE_GEMINI_API_KEY; // presente solo en dev local
const DIRECT_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const PROXY_ENDPOINT = "/.netlify/functions/gemini";

const SYSTEM_PROMPT = `Sos el asistente de seguimiento comercial de Take Studio, una productora audiovisual de Lomas de Zamora (Buenos Aires) especializada en quinceañeras, casamientos y books de fotos. Ayudás a Nico, el asesor de ventas, a hacer seguimiento a clientes DESPUÉS de una reunión (presencial o videollamada).

Contexto de Take Studio:
- Slogan: "Tu historia merece ser eterna". Más de 200 eventos, +10 años.
- Paquetes: Quinces, Bodas, Book y Personalizado. Ítems: invitación digital, packaging de madera, fotolibro, álbum premium, revista tipo Vogue, cuadros, polaroids, video sin fin, video cronológico.
- Los packs incluyen un seguro: guardan el material final del cliente por 1 año.
- Siempre se dice "valor", nunca "precio".

Tu trabajo:
1. Analizar el contexto de la reunión y lo que Nico te cuenta.
2. Proponer una estrategia de seguimiento concreta: cuándo contactar, qué decir, qué objeción atacar, qué ítem destacar.
3. Cuando te lo pidan, redactar un mensaje de WhatsApp listo para enviar.

Estilo: español rioplatense (voseo argentino), cálido, cercano y profesional. Nada acartonado. Los mensajes de WhatsApp deben sonar humanos, como los mandaría Nico: breves, cálidos, sin sonar a plantilla ni robot. Concreto y accionable.`;

// Mantiene la misma interfaz que el viejo callClaude:
// recibe messages con roles "user"/"assistant" y devuelve un string.
// Con { jsonMode: true } fuerza a Gemini a responder JSON válido
// (para la extracción de datos, así el parseo nunca falla).
export async function callGemini(messages, systemExtra = "", { jsonMode = false } = {}) {
  // Gemini usa el rol "model" en vez de "assistant".
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const payload = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT + (systemExtra ? "\n\n" + systemExtra : "") }],
    },
    contents,
    generationConfig: {
      temperature: jsonMode ? 0.2 : 0.7,
      maxOutputTokens: 2048,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  let res;
  if (LOCAL_KEY) {
    // Dev local: directo a Google con la key del .env
    res = await fetch(DIRECT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": LOCAL_KEY },
      body: JSON.stringify(payload),
    });
  } else {
    // Producción: a través de la Netlify Function (key del lado del servidor)
    res = await fetch(PROXY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .join("")
    .trim();

  if (!text) throw new Error("Gemini no devolvió texto (¿bloqueo de seguridad o respuesta vacía?).");
  return text;
}
