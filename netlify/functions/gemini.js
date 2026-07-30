// ============================================================
// Netlify Function — proxy a Gemini
// El navegador llama a /.netlify/functions/gemini SIN la API key.
// Esta función (que corre en el servidor de Netlify) le agrega la key
// desde la variable de entorno GEMINI_API_KEY y reenvía a Google.
// Así la clave nunca queda expuesta en el bundle del cliente.
// ============================================================

const MODEL = "gemini-flash-latest";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falta GEMINI_API_KEY en las variables de entorno de Netlify." }),
    };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: event.body, // el cliente arma el payload completo; acá solo lo reenviamos
      }
    );
    const text = await res.text();
    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body: text,
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "Error al contactar Gemini: " + String(e) }) };
  }
};
