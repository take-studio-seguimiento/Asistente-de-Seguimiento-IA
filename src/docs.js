// ============================================================
// docs — traer el texto de un Google Doc por link
// Llama a la Netlify Function /readdoc (corre en el servidor).
// Solo funciona en el sitio publicado o con `netlify dev`, no con
// `npm run dev` a secas (la Function no existe en ese entorno).
// ============================================================

export async function fetchGoogleDoc(url) {
  const res = await fetch("/.netlify/functions/readdoc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `No se pudo traer el documento (error ${res.status}).`);
  return data.text || "";
}
