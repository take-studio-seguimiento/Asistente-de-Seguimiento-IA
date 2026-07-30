import React, { useState, useEffect, useRef } from "react";

// ============================================================
// Take Studio — Seguimiento de Clientes (Prototipo v3)
// + Agenda de tareas diarias + Google Calendar
// Estética: crema + dorado, geométrica bold, redondeado (Apple-style)
// Persistencia: window.storage  |  IA: Anthropic API (Claude)
// En producción: swap a Gemini + Drive + Calendar/Tasks + Firebase
// ============================================================

const STORAGE_KEY = "takestudio:clientes:v3";
const EVENT_TYPES = ["Quince", "Boda", "Book", "Otro"];
const TZ = "America/Argentina/Buenos_Aires";

const STATUSES = [
  { id: "nuevo", label: "Nuevo", color: "#9A928A" },
  { id: "seguimiento", label: "En seguimiento", color: "#C9A961" },
  { id: "propuesta", label: "Propuesta enviada", color: "#6E9BC5" },
  { id: "ganado", label: "Ganado", color: "#7FB07A" },
  { id: "perdido", label: "Perdido", color: "#C98A8A" },
];
const statusMeta = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

const emptyReminder = () => ({ text: "", date: "", time: "", done: false });

const SEED = [
  {
    id: "seed-mariana", name: "Mariana", eventType: "Quince", phone: "",
    meetingDate: "", status: "seguimiento", chat: [], whatsapp: "",
    context: "Reunión por videollamada. Le encantó el portafolio, sobre todo la producción de book. Duda con el valor, dijo que lo charla con la familia. Fecha tentativa: noviembre.",
    reminder: { text: "Enviar links de locaciones y coordinar la seña para congelar valor del Pack Oro Digital.", date: isoInDays(1), time: "16:30", done: false },
    createdAt: Date.now() - 259200000, updatedAt: Date.now() - 259200000, example: true,
  },
  {
    id: "seed-ornella", name: "Ornella", eventType: "Boda", phone: "",
    meetingDate: "", status: "propuesta", chat: [], whatsapp: "",
    context: "Reunión presencial. Muy entusiasmada, comparó con otro estudio pero le gustó más el trato. Le interesa el packaging de madera y el álbum premium.",
    reminder: { text: "Mandar propuesta PDF y mencionar bonificación del fotolibro si cierran.", date: isoInDays(3), time: "15:00", done: false },
    createdAt: Date.now() - 172800000, updatedAt: Date.now() - 172800000, example: true,
  },
  {
    id: "seed-sabrina", name: "Sabrina", eventType: "Quince", phone: "",
    meetingDate: "", status: "nuevo", chat: [], whatsapp: "",
    context: "Primer contacto reciente. Consultó por paquete personalizado. No definió fecha todavía.",
    reminder: { text: "Escribirle sobre el presupuesto del book. Recordar 5 cuotas sin interés o paquete solo digital.", date: isoInDays(0), time: "15:00", done: false },
    createdAt: Date.now() - 86400000, updatedAt: Date.now() - 86400000, example: true,
  },
];

// ---------- helpers de fecha ----------
function isoInDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function parseISO(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
function daysFromToday(iso) {
  if (!iso) return null;
  const a = parseISO(todayISO()), b = parseISO(iso);
  return Math.round((b - a) / 86400000);
}
function prettyDate(iso, time) {
  if (!iso) return "Sin fecha";
  const d = parseISO(iso);
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}${time ? ", " + time : ""}`;
}
function gcalUrl(client) {
  const r = client.reminder || {};
  const title = `Follow-up ${client.name} (Take Studio)`;
  const details = r.text || client.context || "";
  const time = r.time || "10:00";
  const [hh, mm] = time.split(":");
  const start = (r.date || todayISO()).replace(/-/g, "") + "T" + hh + mm + "00";
  const endH = String((parseInt(hh, 10) + 1) % 24).padStart(2, "0");
  const end = (r.date || todayISO()).replace(/-/g, "") + "T" + endH + mm + "00";
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${encodeURIComponent(details)}&ctz=${TZ}`;
}

// ---------- IA ----------
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

async function callClaude(messages, systemExtra = "") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 1000,
      system: SYSTEM_PROMPT + (systemExtra ? "\n\n" + systemExtra : ""),
      messages,
    }),
  });
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

function clientContextBlock(c) {
  return `Ficha del cliente:
- Nombre: ${c.name}
- Tipo de evento: ${c.eventType}
- Fecha de reunión: ${c.meetingDate || "no especificada"}
- Contexto / notas: ${c.context || "sin notas"}
- Estado actual: ${statusMeta(c.status).label}`;
}

// ================= APP =================
export default function App() {
  const [clients, setClients] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        setClients(r && r.value ? JSON.parse(r.value) : SEED);
      } catch { setClients(SEED); }
    })();
  }, []);
  useEffect(() => {
    if (clients) window.storage.set(STORAGE_KEY, JSON.stringify(clients)).catch(() => {});
  }, [clients]);

  const upsert = (client) => setClients((prev) => {
    const i = prev.findIndex((c) => c.id === client.id);
    const next = { ...client, updatedAt: Date.now() };
    if (i === -1) return [next, ...prev];
    const copy = [...prev]; copy[i] = next; return copy;
  });
  const remove = (id) => setClients((prev) => prev.filter((c) => c.id !== id));
  const openClient = clients?.find((c) => c.id === openId);

  return (
    <div className="ts-root">
      <style>{CSS}</style>
      {!openClient ? (
        <Dashboard clients={clients} onOpen={setOpenId} onAdd={() => setShowAdd(true)} onSave={upsert} />
      ) : (
        <Detail client={openClient} onBack={() => setOpenId(null)} onSave={upsert}
          onDelete={(id) => { remove(id); setOpenId(null); }} />
      )}
      {showAdd && <AddModal onClose={() => setShowAdd(false)}
        onCreate={(c) => { upsert(c); setShowAdd(false); setOpenId(c.id); }} />}
    </div>
  );
}

// ================= DASHBOARD =================
function Dashboard({ clients, onOpen, onAdd, onSave }) {
  const [filter, setFilter] = useState("todos");
  const [view, setView] = useState("agenda"); // agenda | fichas
  if (!clients) return <div className="ts-loading">Cargando…</div>;

  // --- agenda ---
  const withTask = clients.filter((c) => c.reminder && c.reminder.text && !c.reminder.done);
  const groups = { hoy: [], semana: [], despues: [], sinfecha: [] };
  withTask.forEach((c) => {
    const d = daysFromToday(c.reminder.date);
    if (d === null) groups.sinfecha.push(c);
    else if (d <= 0) groups.hoy.push(c);
    else if (d <= 7) groups.semana.push(c);
    else groups.despues.push(c);
  });
  const sortByDate = (a, b) => (a.reminder.date || "9").localeCompare(b.reminder.date || "9") ||
    (a.reminder.time || "").localeCompare(b.reminder.time || "");
  Object.values(groups).forEach((g) => g.sort(sortByDate));

  const toggleDone = (c) => onSave({ ...c, reminder: { ...c.reminder, done: !c.reminder.done } });

  // --- fichas ---
  const filtered = clients.filter((c) => filter === "todos" || c.status === filter);
  const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);

  const TaskRow = (c) => (
    <div key={c.id} className="ts-task">
      <button className="ts-check" onClick={() => toggleDone(c)} aria-label="Marcar hecha" />
      <div className="ts-task-body" onClick={() => onOpen(c.id)}>
        <div className="ts-task-head">
          <span className="ts-task-name">Follow-up {c.name}</span>
          <span className="ts-task-type">{c.eventType}</span>
        </div>
        <div className="ts-task-text">{c.reminder.text}</div>
        <div className="ts-task-when">🗓 {prettyDate(c.reminder.date, c.reminder.time)}</div>
      </div>
      <a className="ts-task-cal" href={gcalUrl(c)} target="_blank" rel="noreferrer" title="Agendar en Google Calendar">＋</a>
    </div>
  );

  return (
    <div className="ts-dash">
      <header className="ts-header">
        <div className="ts-wordmark">TAKE<span>STUDIO</span></div>
        <button className="ts-btn-primary" onClick={onAdd}>+ Nuevo cliente</button>
      </header>

      <div className="ts-hero">
        <div className="ts-eyebrow">— Seguimiento de clientes —</div>
        <h1 className="ts-h1">Tu día, <span className="ts-ital">en orden</span></h1>
      </div>

      <div className="ts-seg center">
        <button className={view === "agenda" ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => setView("agenda")}>Agenda</button>
        <button className={view === "fichas" ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => setView("fichas")}>Fichas</button>
      </div>

      {view === "agenda" ? (
        <div className="ts-agenda">
          {withTask.length === 0 && (
            <div className="ts-empty">No hay tareas pendientes. Entrá a una ficha y cargá el próximo seguimiento.</div>
          )}
          {groups.hoy.length > 0 && <><div className="ts-agenda-h hoy">Hoy</div>{groups.hoy.map(TaskRow)}</>}
          {groups.semana.length > 0 && <><div className="ts-agenda-h">Esta semana</div>{groups.semana.map(TaskRow)}</>}
          {groups.despues.length > 0 && <><div className="ts-agenda-h">Más adelante</div>{groups.despues.map(TaskRow)}</>}
          {groups.sinfecha.length > 0 && <><div className="ts-agenda-h">Sin fecha</div>{groups.sinfecha.map(TaskRow)}</>}
        </div>
      ) : (
        <>
          <div className="ts-pillbar">
            <button className={filter === "todos" ? "ts-pill on" : "ts-pill"} onClick={() => setFilter("todos")}>Todos</button>
            {STATUSES.map((s) => (
              <button key={s.id} className={filter === s.id ? "ts-pill on" : "ts-pill"} onClick={() => setFilter(s.id)}>{s.label}</button>
            ))}
          </div>
          <div className="ts-grid">
            {sorted.map((c) => (
              <button key={c.id} className="ts-card" onClick={() => onOpen(c.id)}>
                <div className="ts-card-top">
                  <span className="ts-card-type">{c.eventType}</span>
                  {c.example && <span className="ts-tag-ej">ejemplo</span>}
                </div>
                <div className="ts-card-name">{c.name}</div>
                <div className="ts-card-ctx">{c.context ? c.context.slice(0, 110) : "Sin notas todavía"}{c.context && c.context.length > 110 ? "…" : ""}</div>
                <div className="ts-card-foot">
                  <span className="ts-status-chip" style={{ color: statusMeta(c.status).color }}>
                    <span className="ts-dot" style={{ background: statusMeta(c.status).color }} />
                    {statusMeta(c.status).label}
                  </span>
                </div>
              </button>
            ))}
            {sorted.length === 0 && <div className="ts-empty">No hay fichas en este estado.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ================= ADD MODAL =================
function AddModal({ onClose, onCreate }) {
  const [mode, setMode] = useState("pegar");
  const [paste, setPaste] = useState("");
  const [parsing, setParsing] = useState(false);
  const [form, setForm] = useState({ name: "", eventType: "Quince", phone: "", meetingDate: "", context: "" });

  const build = (extra = {}) => ({
    id: "c-" + Date.now(), name: "", eventType: "Quince", phone: "", meetingDate: "",
    context: "", status: "nuevo", chat: [], whatsapp: "", reminder: emptyReminder(),
    createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  });

  const handleParse = async () => {
    if (!paste.trim()) return;
    setParsing(true);
    try {
      const out = await callClaude([{
        role: "user",
        content: `Extraé los datos y devolvé SOLO un JSON válido, sin markdown, con esta forma: {"name": string, "eventType": "Quince"|"Boda"|"Book"|"Otro", "phone": string, "context": string}. Si un dato no está, string vacío. "context" es un resumen limpio.\n\nNota:\n${paste}`,
      }]);
      const parsed = JSON.parse(out.replace(/```json|```/g, "").trim());
      onCreate(build({
        name: parsed.name || "Sin nombre",
        eventType: EVENT_TYPES.includes(parsed.eventType) ? parsed.eventType : "Otro",
        phone: parsed.phone || "", context: parsed.context || paste,
      }));
    } catch { onCreate(build({ name: "Sin nombre", context: paste })); }
    finally { setParsing(false); }
  };

  return (
    <div className="ts-overlay" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-modal-head">
          <h2>Nuevo cliente</h2>
          <button className="ts-x" onClick={onClose}>✕</button>
        </div>
        <div className="ts-seg">
          <button className={mode === "pegar" ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => setMode("pegar")}>Pegar nota</button>
          <button className={mode === "manual" ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => setMode("manual")}>Cargar a mano</button>
        </div>
        {mode === "pegar" ? (
          <div className="ts-modal-body">
            <label className="ts-label">Pegá tu nota de la reunión — la IA arma la ficha sola</label>
            <textarea className="ts-textarea" rows={7}
              placeholder="Ej: Mariana, quince, 11-5555-5555. La vi por videollamada, le encantó el book, duda con el valor…"
              value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button className="ts-btn-primary full" onClick={handleParse} disabled={parsing || !paste.trim()}>
              {parsing ? "Armando ficha…" : "Crear ficha"}
            </button>
          </div>
        ) : (
          <div className="ts-modal-body">
            <label className="ts-label">Nombre</label>
            <input className="ts-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="ts-row">
              <div style={{ flex: 1 }}>
                <label className="ts-label">Tipo de evento</label>
                <select className="ts-input" value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
                  {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="ts-label">Teléfono</label>
                <input className="ts-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <label className="ts-label">Fecha de reunión</label>
            <input className="ts-input" type="date" value={form.meetingDate} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} />
            <label className="ts-label">Notas de la reunión</label>
            <textarea className="ts-textarea" rows={4} value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} />
            <button className="ts-btn-primary full" onClick={() => onCreate(build(form))} disabled={!form.name.trim()}>Crear ficha</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ================= DETAIL =================
function Detail({ client, onBack, onSave, onDelete }) {
  const [c, setC] = useState({ ...client, reminder: client.reminder || emptyReminder() });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [genWA, setGenWA] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatEnd = useRef(null);

  useEffect(() => setC({ ...client, reminder: client.reminder || emptyReminder() }), [client.id]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [c.chat, thinking]);

  const persist = (next) => { setC(next); onSave(next); };
  const setR = (patch) => persist({ ...c, reminder: { ...c.reminder, ...patch } });

  const send = async () => {
    if (!input.trim() || thinking) return;
    const history = [...c.chat, { role: "user", content: input.trim() }];
    persist({ ...c, chat: history }); setInput(""); setThinking(true);
    try {
      const reply = await callClaude([
        { role: "user", content: clientContextBlock(c) + "\n\nEste es el contexto. A partir de acá te voy pidiendo cosas para el seguimiento." },
        { role: "assistant", content: "Perfecto, tengo el contexto. Decime." },
        ...history,
      ]);
      persist({ ...c, chat: [...history, { role: "assistant", content: reply }] });
    } catch {
      persist({ ...c, chat: [...history, { role: "assistant", content: "Uy, no pude conectarme al servicio de IA. Probá de nuevo." }] });
    } finally { setThinking(false); }
  };

  const askForSuggestion = async () => {
    if (thinking) return; setThinking(true);
    try {
      const reply = await callClaude([{ role: "user", content: clientContextBlock(c) + "\n\nDame tu propuesta de seguimiento: cuándo contactarlo, qué objeción atacar y qué destacar. Después ofrecés redactar el WhatsApp." }]);
      persist({ ...c, chat: [...c.chat, { role: "assistant", content: reply }] });
    } catch {} finally { setThinking(false); }
  };

  const generateWhatsApp = async () => {
    setGenWA(true);
    try {
      const convo = c.chat.map((m) => (m.role === "user" ? "Nico: " : "Asistente: ") + m.content).join("\n");
      const reply = await callClaude([{
        role: "user",
        content: clientContextBlock(c) + (convo ? "\n\nConversación previa:\n" + convo : "") +
          `\n\nRedactá el mensaje de WhatsApp final para ${c.name}, listo para copiar y pegar. Que suene humano y cálido, como lo mandaría Nico. Devolvé SOLO el texto del mensaje, sin comillas ni explicaciones.`,
      }]);
      persist({ ...c, whatsapp: reply });
    } catch {} finally { setGenWA(false); }
  };

  const suggestReminder = async () => {
    setSuggesting(true);
    try {
      const convo = c.chat.map((m) => (m.role === "user" ? "Nico: " : "Asistente: ") + m.content).join("\n");
      const out = await callClaude([{
        role: "user",
        content: clientContextBlock(c) + (convo ? "\n\nConversación:\n" + convo : "") +
          `\n\nHoy es ${todayISO()}. Proponé el próximo seguimiento y devolvé SOLO un JSON válido, sin markdown: {"text": string, "date": "YYYY-MM-DD", "time": "HH:MM"}. "text" es la tarea concreta (qué hacer). Elegí una fecha próxima y razonable.`,
      }]);
      const p = JSON.parse(out.replace(/```json|```/g, "").trim());
      setR({ text: p.text || c.reminder.text, date: p.date || c.reminder.date, time: p.time || c.reminder.time || "10:00", done: false });
    } catch {} finally { setSuggesting(false); }
  };

  const copyWA = () => {
    const ta = document.createElement("textarea");
    ta.value = c.whatsapp; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta); setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="ts-detail">
      <div className="ts-detail-bar">
        <button className="ts-back" onClick={onBack}>← Volver al tablero</button>
        <button className="ts-del" onClick={() => { if (confirm(`¿Borrar la ficha de ${c.name}?`)) onDelete(c.id); }}>Borrar ficha</button>
      </div>

      <div className="ts-detail-grid">
        {/* IZQUIERDA */}
        <div className="ts-panel">
          <div className="ts-card-type">{c.eventType}</div>
          <input className="ts-name-edit" value={c.name} onChange={(e) => persist({ ...c, name: e.target.value })} />

          <label className="ts-label">Estado</label>
          <div className="ts-seg wrap">
            {STATUSES.map((s) => (
              <button key={s.id} className={c.status === s.id ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => persist({ ...c, status: s.id })}>{s.label}</button>
            ))}
          </div>

          <div className="ts-row" style={{ marginTop: 18 }}>
            <div style={{ flex: 1 }}>
              <label className="ts-label">Teléfono</label>
              <input className="ts-input" value={c.phone} onChange={(e) => persist({ ...c, phone: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="ts-label">Reunión</label>
              <input className="ts-input" type="date" value={c.meetingDate} onChange={(e) => persist({ ...c, meetingDate: e.target.value })} />
            </div>
          </div>

          <label className="ts-label" style={{ marginTop: 18 }}>Contexto de la reunión</label>
          <textarea className="ts-textarea" rows={6} value={c.context} onChange={(e) => persist({ ...c, context: e.target.value })} />

          {/* PRÓXIMO SEGUIMIENTO */}
          <div className="ts-wa-head">
            <span>Próximo seguimiento</span>
            <button className="ts-btn-ghost" onClick={suggestReminder} disabled={suggesting}>{suggesting ? "Pensando…" : "Sugerir con IA"}</button>
          </div>
          <textarea className="ts-textarea" rows={2} placeholder="¿Qué hay que hacer?" value={c.reminder.text} onChange={(e) => setR({ text: e.target.value })} />
          <div className="ts-row">
            <div style={{ flex: 1 }}>
              <label className="ts-label">Fecha</label>
              <input className="ts-input" type="date" value={c.reminder.date} onChange={(e) => setR({ date: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="ts-label">Hora</label>
              <input className="ts-input" type="time" value={c.reminder.time} onChange={(e) => setR({ time: e.target.value })} />
            </div>
          </div>
          {c.reminder.text && (
            <a className="ts-btn-ghost" style={{ marginTop: 4 }} href={gcalUrl(c)} target="_blank" rel="noreferrer">📅 Agendar en Google Calendar</a>
          )}

          {/* WHATSAPP */}
          <div className="ts-wa-head">
            <span>Mensaje de WhatsApp</span>
            <button className="ts-btn-ghost" onClick={generateWhatsApp} disabled={genWA}>{genWA ? "Generando…" : c.whatsapp ? "Regenerar" : "Generar"}</button>
          </div>
          {c.whatsapp ? (
            <div>
              <textarea className="ts-textarea" rows={6} value={c.whatsapp} onChange={(e) => persist({ ...c, whatsapp: e.target.value })} />
              <div className="ts-wa-actions">
                <button className="ts-btn-primary" onClick={copyWA}>{copied ? "¡Copiado!" : "Copiar mensaje"}</button>
                {c.phone && <a className="ts-btn-ghost" href={`https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(c.whatsapp)}`} target="_blank" rel="noreferrer">Abrir en WhatsApp</a>}
              </div>
            </div>
          ) : (
            <div className="ts-wa-empty">Charlá con el asistente y después generá el mensaje listo para enviar.</div>
          )}
        </div>

        {/* DERECHA: chat */}
        <div className="ts-panel ts-chat-panel">
          <div className="ts-chat-title">Asistente de seguimiento</div>
          <div className="ts-chat-scroll">
            {c.chat.length === 0 && !thinking && (
              <div className="ts-chat-start">
                <p>Pedile una estrategia o escribile directo lo que quieras trabajar con {c.name}.</p>
                <button className="ts-btn-primary" onClick={askForSuggestion}>Proponeme un seguimiento</button>
              </div>
            )}
            {c.chat.map((m, i) => <div key={i} className={m.role === "user" ? "ts-msg user" : "ts-msg bot"}>{m.content}</div>)}
            {thinking && <div className="ts-msg bot ts-typing">escribiendo…</div>}
            <div ref={chatEnd} />
          </div>
          <div className="ts-chat-input">
            <textarea rows={2} placeholder="Escribí acá…" value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="ts-btn-primary" onClick={send} disabled={thinking || !input.trim()}>Enviar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= CSS =================
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&family=Playfair+Display:ital@1&display=swap');

.ts-root{
  --bg:#F4F1EA; --surface:#FFFFFF; --ink:#1C1A17; --ink-soft:#6B655E;
  --gold:#C4A155; --gold-deep:#A8863C; --line:#E7E1D6; --line-soft:#EFEAE1;
  --shadow:0 4px 24px rgba(28,26,23,.06); --shadow-hover:0 10px 34px rgba(28,26,23,.10);
  --r:18px; --r-sm:12px;
  font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;width:100%;
}
.ts-root *{box-sizing:border-box}
.ts-loading{padding:80px;text-align:center;color:var(--ink-soft)}

.ts-btn-primary{background:var(--ink);color:#F4F1EA;border:none;border-radius:999px;
  padding:12px 22px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:transform .15s,background .2s;white-space:nowrap}
.ts-btn-primary:hover{background:#2E2A25;transform:translateY(-1px)}
.ts-btn-primary:disabled{opacity:.35;cursor:not-allowed;transform:none}
.ts-btn-primary.full{width:100%;margin-top:16px;padding:14px}
.ts-btn-ghost{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:999px;
  padding:11px 18px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;
  display:inline-flex;align-items:center;gap:6px;transition:all .18s}
.ts-btn-ghost:hover{border-color:var(--gold);color:var(--gold-deep)}
.ts-btn-ghost:disabled{opacity:.4;cursor:not-allowed}

.ts-dash{max-width:1120px;margin:0 auto;padding:32px 30px 90px}
.ts-header{display:flex;justify-content:space-between;align-items:center}
.ts-wordmark{font-family:'Poppins',sans-serif;font-weight:700;font-size:22px;letter-spacing:.02em;line-height:1}
.ts-wordmark span{display:block;font-size:9px;font-weight:600;letter-spacing:.42em;color:var(--ink-soft);margin-top:1px}
.ts-hero{text-align:center;padding:48px 0 30px}
.ts-eyebrow{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold-deep);font-weight:600;margin-bottom:16px}
.ts-h1{font-family:'Poppins',sans-serif;font-weight:700;font-size:clamp(34px,6vw,56px);line-height:1.02;margin:0;letter-spacing:-.02em}
.ts-ital{font-family:'Playfair Display',serif;font-style:italic;font-weight:400;color:var(--gold-deep)}

.ts-pillbar{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:30px}
.ts-pill{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:9px 18px;
  font:inherit;font-size:13px;font-weight:500;color:var(--ink-soft);cursor:pointer;transition:all .18s}
.ts-pill:hover{border-color:var(--gold)}
.ts-pill.on{background:var(--ink);color:#F4F1EA;border-color:var(--ink)}

/* ---- agenda ---- */
.ts-agenda{max-width:720px;margin:0 auto}
.ts-agenda-h{font-family:'Poppins',sans-serif;font-weight:600;font-size:13px;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-soft);margin:26px 0 12px}
.ts-agenda-h.hoy{color:var(--gold-deep)}
.ts-task{display:flex;align-items:flex-start;gap:14px;background:var(--surface);border:1px solid var(--line-soft);
  border-radius:var(--r);padding:16px 18px;margin-bottom:10px;box-shadow:var(--shadow);transition:box-shadow .2s}
.ts-task:hover{box-shadow:var(--shadow-hover)}
.ts-check{flex:none;width:20px;height:20px;margin-top:2px;border-radius:50%;border:2px solid var(--line);
  background:var(--surface);cursor:pointer;transition:all .18s}
.ts-check:hover{border-color:var(--gold);background:#F6EFDD}
.ts-task-body{flex:1;cursor:pointer;min-width:0}
.ts-task-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.ts-task-name{font-family:'Poppins',sans-serif;font-weight:600;font-size:16px}
.ts-task-type{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);font-weight:600}
.ts-task-text{color:var(--ink-soft);font-size:13.5px;line-height:1.55;margin-bottom:6px}
.ts-task-when{font-size:12px;color:var(--ink);font-weight:500}
.ts-task-cal{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);
  display:flex;align-items:center;justify-content:center;color:var(--ink-soft);font-size:18px;
  text-decoration:none;transition:all .18s}
.ts-task-cal:hover{border-color:var(--gold);color:var(--gold-deep);background:#F6EFDD}

.ts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:20px}
.ts-card{text-align:left;background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--r);
  padding:24px;cursor:pointer;color:inherit;font:inherit;box-shadow:var(--shadow);
  transition:transform .2s,box-shadow .2s;display:flex;flex-direction:column;gap:12px;min-height:200px}
.ts-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover)}
.ts-card-top{display:flex;justify-content:space-between;align-items:center}
.ts-card-type{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-deep);font-weight:600}
.ts-card-name{font-family:'Poppins',sans-serif;font-size:30px;font-weight:600;line-height:1;letter-spacing:-.01em}
.ts-card-ctx{color:var(--ink-soft);font-size:13.5px;line-height:1.6;flex:1}
.ts-card-foot{padding-top:14px;border-top:1px solid var(--line-soft)}
.ts-status-chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600}
.ts-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.ts-tag-ej{color:var(--gold-deep);background:#F6EFDD;border-radius:999px;padding:3px 9px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:600}
.ts-empty{color:var(--ink-soft);padding:44px;text-align:center;border:1px dashed var(--line);border-radius:var(--r);background:var(--surface)}

.ts-label{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);font-weight:600;margin:0 0 8px}
.ts-input,.ts-textarea{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);
  color:var(--ink);font:inherit;font-size:14px;padding:12px 14px;margin-bottom:6px;outline:none;transition:border-color .18s}
.ts-input:focus,.ts-textarea:focus{border-color:var(--gold);background:var(--surface)}
.ts-textarea{resize:vertical;line-height:1.6}
.ts-row{display:flex;gap:14px}

.ts-seg{display:inline-flex;gap:4px;background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:4px;margin:14px 0}
.ts-seg.center{display:flex;width:max-content;margin:0 auto 30px}
.ts-seg.wrap{display:flex;flex-wrap:wrap;border-radius:16px}
.ts-seg-btn{background:transparent;border:none;border-radius:999px;padding:8px 18px;font:inherit;font-size:13px;font-weight:500;color:var(--ink-soft);cursor:pointer;transition:all .18s}
.ts-seg-btn.on{background:var(--ink);color:#F4F1EA}

.ts-overlay{position:fixed;inset:0;background:rgba(28,26,23,.35);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50}
.ts-modal{background:var(--surface);border-radius:var(--r);width:100%;max-width:540px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(28,26,23,.2)}
.ts-modal-head{display:flex;justify-content:space-between;align-items:center;padding:24px 26px 0}
.ts-modal-head h2{font-family:'Poppins',sans-serif;font-weight:600;font-size:26px;margin:0}
.ts-x{background:var(--bg);border:none;color:var(--ink-soft);width:32px;height:32px;border-radius:999px;font-size:14px;cursor:pointer}
.ts-x:hover{background:var(--line)}
.ts-modal .ts-seg{margin:16px 26px 0;display:flex}
.ts-modal .ts-seg-btn{flex:1;text-align:center}
.ts-modal-body{padding:18px 26px 26px}

.ts-detail{max-width:1180px;margin:0 auto;padding:28px 30px 70px}
.ts-detail-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
.ts-back{background:none;border:none;color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.ts-back:hover{color:var(--gold-deep)}
.ts-del{background:none;border:none;color:var(--ink-soft);font:inherit;font-size:12.5px;cursor:pointer}
.ts-del:hover{color:#C05656}
.ts-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
.ts-panel{background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--r);padding:26px;box-shadow:var(--shadow)}
.ts-name-edit{width:100%;background:none;border:none;color:var(--ink);font-family:'Poppins',sans-serif;font-size:40px;font-weight:600;letter-spacing:-.02em;padding:6px 0 14px;margin:6px 0 6px;outline:none;border-bottom:2px solid transparent}
.ts-name-edit:focus{border-color:var(--gold)}
.ts-wa-head{display:flex;justify-content:space-between;align-items:center;margin:26px 0 12px;padding-top:22px;border-top:1px solid var(--line-soft)}
.ts-wa-head span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);font-weight:600}
.ts-wa-actions{display:flex;gap:10px;margin-top:12px}
.ts-wa-empty{color:var(--ink-soft);font-size:13.5px;line-height:1.6;padding:16px;border:1px dashed var(--line);border-radius:var(--r-sm);background:var(--bg)}

.ts-chat-panel{display:flex;flex-direction:column;height:720px}
.ts-chat-title{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);font-weight:600;padding-bottom:16px;border-bottom:1px solid var(--line-soft);margin-bottom:16px}
.ts-chat-scroll{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px}
.ts-chat-start{color:var(--ink-soft);font-size:14px;line-height:1.6;text-align:center;margin:auto;max-width:300px;display:flex;flex-direction:column;gap:18px;align-items:center}
.ts-msg{max-width:86%;padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.6;white-space:pre-wrap}
.ts-msg.user{align-self:flex-end;background:var(--ink);color:#F4F1EA;border-bottom-right-radius:5px}
.ts-msg.bot{align-self:flex-start;background:var(--bg);border:1px solid var(--line-soft);color:var(--ink);border-bottom-left-radius:5px}
.ts-typing{color:var(--ink-soft);font-style:italic}
.ts-chat-input{display:flex;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line-soft)}
.ts-chat-input textarea{flex:1;background:var(--bg);border:1px solid var(--line);border-radius:14px;color:var(--ink);font:inherit;font-size:14px;padding:11px 14px;resize:none;outline:none;line-height:1.5}
.ts-chat-input textarea:focus{border-color:var(--gold);background:var(--surface)}

@media(max-width:820px){.ts-detail-grid{grid-template-columns:1fr}.ts-chat-panel{height:520px}}
`;
