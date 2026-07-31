// ============================================================
// Netlify Function — leer un Google Doc por link
// Recibe { url } de un Google Docs compartido como "cualquiera con el
// enlace", extrae el ID y baja el texto plano vía el export de Google.
// Corre en el servidor (sin CORS) y solo permite URLs de Google Docs.
// ============================================================

const DOC_ID_RE = /\/d\/([a-zA-Z0-9_-]{20,})/;

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  let url;
  try {
    url = JSON.parse(event.body || "{}").url;
  } catch {
    /* body inválido */
  }
  if (!url || typeof url !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta el link del documento." }) };
  }

  const match = url.match(DOC_ID_RE);
  if (!match) {
    return { statusCode: 400, body: JSON.stringify({ error: "El link no parece un Google Doc válido." }) };
  }

  const exportUrl = `https://docs.google.com/document/d/${match[1]}/export?format=txt`;

  try {
    const res = await fetch(exportUrl, { redirect: "follow" });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    // Un doc privado redirige a una página de login (HTML), no al texto.
    const looksPrivate =
      !res.ok ||
      contentType.includes("text/html") ||
      /accounts\.google\.com|sign ?in|iniciar sesión/i.test(text.slice(0, 600));

    if (looksPrivate) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error:
            "No se pudo leer el documento. Revisá que esté compartido como \"Cualquiera con el enlace\".",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "Error al traer el documento: " + String(e) }) };
  }
};
