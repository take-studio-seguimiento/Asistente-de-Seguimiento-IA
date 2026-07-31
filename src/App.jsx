import React, { useState, useEffect, useRef } from "react";
import {
  subscribeClientes,
  upsertCliente,
  removeCliente,
  seedIfEmpty,
} from "./clientesService";
import { callGemini } from "./gemini";
import { fetchGoogleDoc } from "./docs";
import { onAuth, logout } from "./auth";
import Login from "./Login";
import SpecularButton from "./SpecularButton";
import SpotlightCard from "./SpotlightCard";
import { IconSearch, IconX, IconPlus, IconCalendar, IconCheck, IconSparkle, IconChevronDown, IconChevronUp } from "./icons";

// ============================================================
// Take Studio — Seguimiento de Clientes (Prototipo v3)
// + Agenda de tareas diarias + Google Calendar
// Estética: crema + dorado, geométrica bold, redondeado (Apple-style)
// Persistencia: Firebase Firestore (colección "clientes")
// IA: Google Gemini (gemini-flash-latest) — ver src/gemini.js
// Auth: Firebase Authentication (email + contraseña) — ver src/auth.js
// ============================================================

const EVENT_TYPES = ["Quince", "18 años", "Cumpleaños", "Boda", "Egresados", "Book", "Otro"];
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

// Marca la tarea actual (reminder) como completada y la mueve al historial
// (client.tasks), dejando el "próximo seguimiento" en blanco para el siguiente.
function withCompletedReminder(c) {
  if (!c.reminder || !c.reminder.text) return c;
  const done = { ...c.reminder, id: "t-" + Date.now(), done: true, completedAt: Date.now() };
  return { ...c, reminder: emptyReminder(), tasks: [done, ...(c.tasks || [])] };
}

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
// Fin de la semana calendario (domingo) en ISO. Semana lun–dom.
function endOfWeekISO() {
  const d = parseISO(todayISO());
  const dow = d.getDay(); // 0=dom ... 6=sáb
  const toSunday = dow === 0 ? 0 : 7 - dow;
  d.setDate(d.getDate() + toSunday);
  return d.toISOString().slice(0, 10);
}
// Fin del mes calendario en ISO.
function endOfMonthISO() {
  const d = parseISO(todayISO());
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}
// Etiqueta del festejado según el tipo de evento.
function celebranteLabel(eventType) {
  if (eventType === "Quince") return "Quinceañera";
  if (eventType === "18 años" || eventType === "Cumpleaños") return "Cumpleañera/o";
  if (eventType === "Boda") return "Festejados";
  if (eventType === "Egresados") return "Curso / división";
  return "Homenajeada/o";
}
// Normaliza texto para búsqueda: minúsculas y sin acentos.
function norm(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
// ISO (YYYY-MM-DD) → DD/MM/YYYY (para que la búsqueda por fecha sea flexible).
function ddmmyyyy(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
// ¿El lead matchea la búsqueda? Busca en cualquier dato cargado.
function matchesQuery(c, q) {
  if (!q) return true;
  const hay = norm([
    c.name, c.celebrante, c.eventType, c.context, c.phone,
    c.meetingDate, ddmmyyyy(c.meetingDate), c.meetingDate ? prettyDate(c.meetingDate) : "",
    c.fechaFiesta, ddmmyyyy(c.fechaFiesta), c.fechaFiesta ? prettyDate(c.fechaFiesta) : "",
  ].join(" "));
  if (hay.includes(q)) return true;
  const qDigits = q.replace(/\D/g, "");
  if (qDigits && (c.phone || "").replace(/\D/g, "").includes(qDigits)) return true;
  return false;
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

// ---------- IA (Gemini) ----------
// El cliente de IA vive en src/gemini.js (callGemini).

function clientContextBlock(c) {
  return `Ficha del cliente:
- Nombre: ${c.name}
- Tipo de evento: ${c.eventType}
- Fecha de reunión: ${c.meetingDate || "no especificada"}
- Contexto / notas: ${c.context || "sin notas"}
- Estado actual: ${statusMeta(c.status).label}`;
}

// ================= APP (puerta de autenticación) =================
export default function App() {
  // undefined = verificando sesión | null = sin sesión | objeto = logueado
  const [user, setUser] = useState(undefined);

  useEffect(() => onAuth((u) => setUser(u)), []);

  if (user === undefined) {
    return (
      <div className="ts-root">
        <style>{CSS}</style>
        <div className="ts-loading">Cargando…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="ts-root">
        <style>{CSS}</style>
        <Login />
      </div>
    );
  }

  return (
    <div className="ts-root">
      <style>{CSS}</style>
      <Workspace />
    </div>
  );
}

// ================= WORKSPACE (app con sesión iniciada) =================
// Solo se monta cuando hay un usuario logueado, así Firestore nunca se
// consulta sin sesión (necesario con las reglas cerradas).
function Workspace() {
  const [clients, setClients] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  // Carga inicial + escucha en tiempo real desde Firestore.
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        await seedIfEmpty(SEED);
      } catch (e) {
        console.error("[Firestore] no se pudo sembrar datos de ejemplo:", e);
      }
      unsub = subscribeClientes(
        (list) => setClients(list),
        () => setClients([]) // ante un error, mostramos tablero vacío en vez de spinner infinito
      );
    })();
    return () => unsub();
  }, []);

  // Escribe (crea o actualiza) en Firestore. El listener refresca el estado.
  const upsert = (client) => {
    upsertCliente(client).catch((e) =>
      console.error("[Firestore] no se pudo guardar el cliente:", e)
    );
  };
  const remove = (id) =>
    removeCliente(id).catch((e) =>
      console.error("[Firestore] no se pudo borrar el cliente:", e)
    );
  const openClient = clients?.find((c) => c.id === openId);

  return (
    <>
      {!openClient ? (
        <Dashboard clients={clients} onOpen={setOpenId} onAdd={() => setShowAdd(true)}
          onSave={upsert} onLogout={() => logout()} />
      ) : (
        <Detail client={openClient} onBack={() => setOpenId(null)} onSave={upsert}
          onDelete={(id) => { remove(id); setOpenId(null); }} />
      )}
      {showAdd && <AddModal onClose={() => setShowAdd(false)}
        onCreate={(c) => { upsert(c); setShowAdd(false); setOpenId(c.id); }} />}
    </>
  );
}

// ================= DASHBOARD =================
function Dashboard({ clients, onOpen, onAdd, onSave, onLogout }) {
  const [filter, setFilter] = useState("todos");
  const [view, setView] = useState("agenda"); // agenda | fichas
  const [query, setQuery] = useState("");
  if (!clients) return <div className="ts-loading">Cargando…</div>;

  // --- agenda (agrupada por límites de calendario) ---
  const withTask = clients.filter((c) => c.reminder && c.reminder.text && !c.reminder.done);
  const hoyISO = todayISO();
  const finSemana = endOfWeekISO();
  const finMes = endOfMonthISO();
  const groups = { atrasadas: [], hoy: [], semana: [], mes: [], despues: [], sinfecha: [] };
  withTask.forEach((c) => {
    const d = c.reminder.date;
    if (!d) groups.sinfecha.push(c);
    else if (d < hoyISO) groups.atrasadas.push(c);
    else if (d === hoyISO) groups.hoy.push(c);
    else if (d <= finSemana) groups.semana.push(c);
    else if (d <= finMes) groups.mes.push(c);
    else groups.despues.push(c);
  });
  const sortByDate = (a, b) => (a.reminder.date || "9").localeCompare(b.reminder.date || "9") ||
    (a.reminder.time || "").localeCompare(b.reminder.time || "");
  Object.values(groups).forEach((g) => g.sort(sortByDate));

  const onComplete = (c) => onSave(withCompletedReminder(c));

  // --- fichas ---
  const q = norm(query.trim());
  const filtered = clients.filter(
    (c) => (filter === "todos" || c.status === filter) && matchesQuery(c, q)
  );
  const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);

  const TaskRow = (c) => (
    <div key={c.id} className="ts-task">
      <button className="ts-check" onClick={() => onComplete(c)} aria-label="Marcar hecha" title="Marcar completada" />
      <div className="ts-task-body" onClick={() => onOpen(c.id)}>
        <div className="ts-task-head">
          <span className="ts-task-name">Follow-up {c.name}</span>
          <span className="ts-task-type">{c.eventType}</span>
        </div>
        <div className="ts-task-text">{c.reminder.text}</div>
        <div className="ts-task-when"><IconCalendar /> {prettyDate(c.reminder.date, c.reminder.time)}</div>
      </div>
      <a className="ts-task-cal" href={gcalUrl(c)} target="_blank" rel="noreferrer" title="Agendar en Google Calendar"><IconCalendar /></a>
    </div>
  );

  return (
    <div className="ts-dash">
      <header className="ts-header">
        <div className="ts-wordmark">TAKE<span>STUDIO</span></div>
        <div className="ts-header-actions">
          <button className="ts-btn-ghost" onClick={onLogout}>Salir</button>
          <SpecularButton size="sm" radius={999} tint="#1C1A17" tintOpacity={1}
            textColor="#F4F1EA" lineColor="#F5DE97" baseColor="#6a5a33" intensity={1.6}
            shineSize={16} autoAnimate proximity={280} onClick={onAdd}>
            <span className="ts-btn-ic"><IconPlus /> Nuevo cliente</span>
          </SpecularButton>
        </div>
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
          {groups.atrasadas.length > 0 && <><div className="ts-agenda-h atrasada">Atrasadas</div>{groups.atrasadas.map(TaskRow)}</>}
          {groups.hoy.length > 0 && <><div className="ts-agenda-h hoy">Hoy</div>{groups.hoy.map(TaskRow)}</>}
          {groups.semana.length > 0 && <><div className="ts-agenda-h">Esta semana</div>{groups.semana.map(TaskRow)}</>}
          {groups.mes.length > 0 && <><div className="ts-agenda-h">Este mes</div>{groups.mes.map(TaskRow)}</>}
          {groups.despues.length > 0 && <><div className="ts-agenda-h">Más adelante</div>{groups.despues.map(TaskRow)}</>}
          {groups.sinfecha.length > 0 && <><div className="ts-agenda-h">Sin fecha</div>{groups.sinfecha.map(TaskRow)}</>}
        </div>
      ) : (
        <>
          <div className="ts-searchbar">
            <span className="ts-search-icon"><IconSearch /></span>
            <input className="ts-search-input" placeholder="Buscar por nombre, teléfono, fecha de fiesta o reunión…"
              value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button className="ts-search-clear" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><IconX /></button>}
          </div>
          <div className="ts-pillbar">
            <button className={filter === "todos" ? "ts-pill on" : "ts-pill"} onClick={() => setFilter("todos")}>Todos</button>
            {STATUSES.map((s) => (
              <button key={s.id} className={filter === s.id ? "ts-pill on" : "ts-pill"} onClick={() => setFilter(s.id)}>{s.label}</button>
            ))}
          </div>
          <div className="ts-grid">
            {sorted.map((c) => (
              <SpotlightCard key={c.id} className="ts-lead-card" spotlightColor="rgba(255,255,255,0.22)" onClick={() => onOpen(c.id)}>
                <div className="ts-card-top">
                  <span className="ts-card-type">{c.eventType}</span>
                  {c.example && <span className="ts-tag-ej">ejemplo</span>}
                </div>
                <div className="ts-card-name">{c.name}</div>
                {c.fechaFiesta && <div className="ts-card-fiesta"><IconSparkle /> Fiesta: {prettyDate(c.fechaFiesta)}</div>}
                <div className="ts-card-ctx">{c.context ? c.context.slice(0, 110) : "Sin notas todavía"}{c.context && c.context.length > 110 ? "…" : ""}</div>
                <div className="ts-card-foot">
                  <span className="ts-status-chip" style={{ color: statusMeta(c.status).color }}>
                    <span className="ts-dot" style={{ background: statusMeta(c.status).color }} />
                    {statusMeta(c.status).label}
                  </span>
                </div>
              </SpotlightCard>
            ))}
            {sorted.length === 0 && <div className="ts-empty">{query ? "No se encontraron fichas con esa búsqueda." : "No hay fichas en este estado."}</div>}
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
  const [docUrl, setDocUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [docError, setDocError] = useState("");
  const [form, setForm] = useState({ name: "", celebrante: "", eventType: "Quince", phone: "", meetingDate: "", fechaFiesta: "", context: "" });

  const importDoc = async () => {
    if (!docUrl.trim() || importing) return;
    setImporting(true); setDocError("");
    try {
      const text = await fetchGoogleDoc(docUrl.trim());
      if (!text) { setDocError("El documento vino vacío."); return; }
      setPaste((prev) => (prev.trim() ? prev + "\n\n———\n\n" + text : text));
      setDocUrl("");
    } catch (e) {
      setDocError(e.message || "No se pudo traer el documento.");
    } finally {
      setImporting(false);
    }
  };

  const build = (extra = {}) => ({
    id: "c-" + Date.now(), name: "", celebrante: "", eventType: "Quince", phone: "",
    meetingDate: "", fechaFiesta: "", context: "", status: "nuevo", chat: [], whatsapp: "",
    reminder: emptyReminder(), tasks: [], createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  });

  const handleParse = async () => {
    if (!paste.trim()) return;
    setParsing(true);
    try {
      const out = await callGemini([{
        role: "user",
        content: `Hoy es ${todayISO()}. Extraé los datos de la nota/transcripción y devolvé SOLO un JSON válido, sin markdown, con esta forma exacta:
{"name": string, "celebrante": string, "eventType": ${EVENT_TYPES.map((t) => `"${t}"`).join("|")}, "phone": string, "meetingDate": string, "fechaFiesta": string, "context": string}

Reglas:
- "name": nombre del cliente / persona de contacto.
- "eventType": elegí la categoría que mejor encaje de la lista. Un cumpleaños de 50 (o cualquier edad que no sea 15 ni 18) es "Cumpleaños". Una producción de fotos es "Book". Si ninguna encaja, "Otro".
- "celebrante": nombre del/la festejado/a (la quinceañera, los novios, la homenajeada). Si es el mismo que el cliente, repetilo.
- "phone": solo dígitos si aparece, si no string vacío.
- "meetingDate": fecha de la reunión en formato YYYY-MM-DD. Convertí formatos como DD/MM/YYYY. Si no aparece, string vacío.
- "fechaFiesta": fecha del evento/fiesta en formato YYYY-MM-DD (convertí DD/MM/YYYY). Si no aparece, string vacío.
- "context": resumen limpio y breve de la reunión (objeciones, intereses, presupuesto, próximos pasos).
Si un dato no está, string vacío.

Nota:
${paste}`,
      }]);
      const parsed = JSON.parse(out.replace(/```json|```/g, "").trim());
      const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
      onCreate(build({
        name: parsed.name || "Sin nombre",
        celebrante: parsed.celebrante || "",
        eventType: EVENT_TYPES.includes(parsed.eventType) ? parsed.eventType : "Otro",
        phone: parsed.phone || "",
        meetingDate: isISO(parsed.meetingDate) ? parsed.meetingDate : "",
        fechaFiesta: isISO(parsed.fechaFiesta) ? parsed.fechaFiesta : "",
        context: parsed.context || paste,
      }));
    } catch { onCreate(build({ name: "Sin nombre", context: paste })); }
    finally { setParsing(false); }
  };

  return (
    <div className="ts-overlay" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-modal-head">
          <h2>Nuevo cliente</h2>
          <button className="ts-x" onClick={onClose} aria-label="Cerrar"><IconX /></button>
        </div>
        <div className="ts-seg">
          <button className={mode === "pegar" ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => setMode("pegar")}>Pegar nota</button>
          <button className={mode === "manual" ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => setMode("manual")}>Cargar a mano</button>
        </div>
        {mode === "pegar" ? (
          <div className="ts-modal-body">
            <label className="ts-label">Traer desde Google Docs (opcional)</label>
            <div className="ts-doc-row">
              <input className="ts-input" placeholder="Pegá el link del Google Doc…"
                value={docUrl} onChange={(e) => setDocUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); importDoc(); } }} />
              <button className="ts-btn-ghost" onClick={importDoc} disabled={importing || !docUrl.trim()}>
                {importing ? "Trayendo…" : "Traer texto"}
              </button>
            </div>
            {docError && <div className="ts-login-error">{docError}</div>}

            <label className="ts-label" style={{ marginTop: 16 }}>Pegá tu nota de la reunión — la IA arma la ficha sola</label>
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
            <label className="ts-label">{celebranteLabel(form.eventType)} (nombre)</label>
            <input className="ts-input" value={form.celebrante} onChange={(e) => setForm({ ...form, celebrante: e.target.value })} />
            <div className="ts-row">
              <div style={{ flex: 1 }}>
                <label className="ts-label">Fecha de reunión</label>
                <input className="ts-input" type="date" value={form.meetingDate} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="ts-label">Fecha de fiesta</label>
                <input className="ts-input" type="date" value={form.fechaFiesta} onChange={(e) => setForm({ ...form, fechaFiesta: e.target.value })} />
              </div>
            </div>
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
  const [showHistory, setShowHistory] = useState(false);
  const [histView, setHistView] = useState("completadas"); // completadas | pendientes
  const chatEnd = useRef(null);

  useEffect(() => setC({ ...client, reminder: client.reminder || emptyReminder() }), [client.id]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [c.chat, thinking]);

  const persist = (next) => { setC(next); onSave(next); };
  const setR = (patch) => persist({ ...c, reminder: { ...c.reminder, ...patch } });
  const completeReminder = () => persist(withCompletedReminder(c));

  const send = async () => {
    if (!input.trim() || thinking) return;
    const history = [...c.chat, { role: "user", content: input.trim() }];
    persist({ ...c, chat: history }); setInput(""); setThinking(true);
    try {
      const reply = await callGemini([
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
      const reply = await callGemini([{ role: "user", content: clientContextBlock(c) + "\n\nDame tu propuesta de seguimiento: cuándo contactarlo, qué objeción atacar y qué destacar. Después ofrecés redactar el WhatsApp." }]);
      persist({ ...c, chat: [...c.chat, { role: "assistant", content: reply }] });
    } catch {} finally { setThinking(false); }
  };

  const generateWhatsApp = async () => {
    setGenWA(true);
    try {
      const convo = c.chat.map((m) => (m.role === "user" ? "Nico: " : "Asistente: ") + m.content).join("\n");
      const reply = await callGemini([{
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
      const out = await callGemini([{
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

  // Historial de tareas
  const completadas = (c.tasks || []).filter((t) => t.done);
  const pendientes = c.reminder && c.reminder.text && !c.reminder.done ? [c.reminder] : [];
  const histList = histView === "completadas" ? completadas : pendientes;

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

          <label className="ts-label" style={{ marginTop: 18 }}>{celebranteLabel(c.eventType)} (nombre)</label>
          <input className="ts-input" value={c.celebrante || ""} placeholder="Nombre del/la festejado/a" onChange={(e) => persist({ ...c, celebrante: e.target.value })} />

          <div className="ts-row" style={{ marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <label className="ts-label">Teléfono</label>
              <input className="ts-input" value={c.phone || ""} onChange={(e) => persist({ ...c, phone: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="ts-label">Fecha de reunión</label>
              <input className="ts-input" type="date" value={c.meetingDate || ""} onChange={(e) => persist({ ...c, meetingDate: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="ts-label">Fecha de fiesta</label>
              <input className="ts-input" type="date" value={c.fechaFiesta || ""} onChange={(e) => persist({ ...c, fechaFiesta: e.target.value })} />
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
            <div className="ts-task-actions">
              <a className="ts-btn-ghost" href={gcalUrl(c)} target="_blank" rel="noreferrer"><IconCalendar /> Agendar en Google Calendar</a>
              <button className="ts-btn-ghost" onClick={completeReminder}><IconCheck /> Marcar completada</button>
            </div>
          )}

          {/* HISTORIAL DE TAREAS */}
          <div className="ts-wa-head ts-hist-head" onClick={() => setShowHistory((v) => !v)} role="button">
            <span>Historial de tareas{completadas.length ? ` (${completadas.length})` : ""}</span>
            <span className="ts-hist-arrow">{showHistory ? <IconChevronUp /> : <IconChevronDown />}</span>
          </div>
          {showHistory && (
            <div className="ts-hist">
              <div className="ts-seg" style={{ marginTop: 0 }}>
                <button className={histView === "completadas" ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => setHistView("completadas")}>Completadas</button>
                <button className={histView === "pendientes" ? "ts-seg-btn on" : "ts-seg-btn"} onClick={() => setHistView("pendientes")}>Pendientes</button>
              </div>
              {histList.length === 0 ? (
                <div className="ts-hist-empty">No hay tareas {histView === "completadas" ? "completadas todavía" : "pendientes"}.</div>
              ) : (
                histList.map((t, i) => (
                  <div key={t.id || i} className="ts-hist-item">
                    {histView === "completadas" ? (
                      <div className="ts-hist-check done"><IconCheck /></div>
                    ) : (
                      <button className="ts-hist-check ts-hist-check-btn" onClick={completeReminder} aria-label="Marcar completada" title="Marcar completada" />
                    )}
                    <div className="ts-hist-body">
                      <div className="ts-hist-text">{t.text}</div>
                      <div className="ts-hist-when">
                        {histView === "completadas" ? (
                          <><IconCheck /> Completada {prettyDate(new Date(t.completedAt).toISOString().slice(0, 10))}{t.date ? ` · era para ${prettyDate(t.date, t.time)}` : ""}</>
                        ) : (
                          <><IconCalendar /> {prettyDate(t.date, t.time)}</>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
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
  --bg:#0E0D12; --surface:#17161C; --glass:rgba(255,255,255,.055); --glass-strong:rgba(255,255,255,.09);
  --ink:#F1ECE3; --ink-soft:#9C958A;
  --gold:#D8B45E; --gold-deep:#EAC97C;
  --line:rgba(255,255,255,.10); --line-soft:rgba(255,255,255,.06); --input-bg:rgba(255,255,255,.04);
  --shadow:0 8px 30px rgba(0,0,0,.35); --shadow-hover:0 18px 50px rgba(0,0,0,.55);
  --glow:0 0 0 1px rgba(216,180,94,.55), 0 0 20px rgba(216,180,94,.30);
  --r:18px; --r-sm:12px;
  font-family:'Inter',system-ui,sans-serif;background:
    radial-gradient(1200px 800px at 15% -10%, rgba(216,180,94,.08), transparent 60%),
    radial-gradient(1000px 700px at 100% 0%, rgba(110,120,160,.06), transparent 55%),
    var(--bg);
  background-attachment:fixed;color:var(--ink);min-height:100vh;width:100%;
}
.ts-root *{box-sizing:border-box}
.ts-loading{padding:80px;text-align:center;color:var(--ink-soft)}

.ts-btn-primary{position:relative;background:linear-gradient(180deg,rgba(216,180,94,.26),rgba(216,180,94,.10));
  color:#FBF3DF;border:1px solid rgba(216,180,94,.5);border-radius:999px;
  padding:12px 22px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  transition:transform .15s,box-shadow .2s,border-color .2s,background .2s}
.ts-btn-primary:hover{transform:translateY(-1px);border-color:var(--gold);box-shadow:var(--glow);
  background:linear-gradient(180deg,rgba(216,180,94,.34),rgba(216,180,94,.14))}
.ts-btn-primary:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.ts-btn-primary.full{width:100%;margin-top:16px;padding:14px}
.ts-btn-ghost{background:var(--glass);color:var(--ink);border:1px solid var(--line);border-radius:999px;
  padding:11px 18px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;
  display:inline-flex;align-items:center;gap:7px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:all .18s}
.ts-btn-ghost:hover{border-color:var(--gold);color:var(--gold-deep);box-shadow:var(--glow)}
.ts-btn-ghost:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}
.ts-btn-primary svg,.ts-btn-ghost svg{width:16px;height:16px;flex:none}

.ts-dash{max-width:1120px;margin:0 auto;padding:32px 30px 90px}
.ts-header{display:flex;justify-content:space-between;align-items:center}
.ts-header-actions{display:flex;gap:10px;align-items:center}

/* ---- login ---- */
.ts-login{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden}
.ts-login-bg{position:absolute;inset:0;z-index:0}
.ts-login-card{position:relative;z-index:1;width:100%;max-width:400px;background:rgba(18,17,22,.55);
  backdrop-filter:blur(26px) saturate(1.3);-webkit-backdrop-filter:blur(26px) saturate(1.3);
  border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:40px 34px;
  box-shadow:0 24px 70px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);display:flex;flex-direction:column}
.ts-login-submit{width:100%;margin-top:18px}
.ts-login-mark{text-align:center;margin-bottom:22px}
.ts-login-card .ts-eyebrow{text-align:center}
.ts-login-title{font-family:'Poppins',sans-serif;font-weight:700;font-size:30px;line-height:1.05;
  letter-spacing:-.02em;margin:0 0 26px;text-align:center}
.ts-login-card .ts-label{margin-top:14px}
.ts-login-error{background:rgba(201,138,138,.14);border:1px solid rgba(201,138,138,.4);color:#EBB4B4;border-radius:var(--r-sm);
  padding:10px 13px;font-size:13px;margin:12px 0 2px}
.ts-wordmark{font-family:'Poppins',sans-serif;font-weight:700;font-size:22px;letter-spacing:.02em;line-height:1}
.ts-wordmark span{display:block;font-size:9px;font-weight:600;letter-spacing:.42em;color:var(--ink-soft);margin-top:1px}
.ts-hero{text-align:center;padding:48px 0 30px}
.ts-eyebrow{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold-deep);font-weight:600;margin-bottom:16px}
.ts-h1{font-family:'Poppins',sans-serif;font-weight:700;font-size:clamp(34px,6vw,56px);line-height:1.02;margin:0;letter-spacing:-.02em}
.ts-ital{font-family:'Playfair Display',serif;font-style:italic;font-weight:400;color:var(--gold-deep)}

.ts-pillbar{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:30px}
.ts-pill{background:var(--glass);border:1px solid var(--line);border-radius:999px;padding:9px 18px;
  font:inherit;font-size:13px;font-weight:500;color:var(--ink-soft);cursor:pointer;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:all .18s}
.ts-pill:hover{border-color:var(--gold);color:var(--ink);box-shadow:var(--glow)}
.ts-pill.on{background:linear-gradient(180deg,rgba(216,180,94,.9),rgba(216,180,94,.75));color:#1a1510;border-color:var(--gold);font-weight:600}

/* ---- buscador ---- */
.ts-searchbar{max-width:560px;margin:0 auto 16px;display:flex;align-items:center;gap:10px;
  background:var(--glass);border:1px solid var(--line);border-radius:999px;padding:11px 18px;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:var(--shadow)}
.ts-searchbar:focus-within{border-color:var(--gold);box-shadow:var(--glow)}
.ts-search-icon{display:flex;color:var(--ink-soft);flex:none}
.ts-search-icon svg{width:16px;height:16px}
.ts-search-input{flex:1;border:none;background:none;outline:none;font:inherit;font-size:14px;color:var(--ink)}
.ts-search-input::placeholder{color:var(--ink-soft)}
.ts-search-clear{border:none;background:var(--input-bg);color:var(--ink-soft);width:24px;height:24px;border-radius:999px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}
.ts-search-clear svg{width:12px;height:12px}
.ts-search-clear:hover{background:var(--glass-strong);color:var(--ink)}
.ts-card-fiesta{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--gold-deep);font-weight:600;margin-top:-4px}
.ts-card-fiesta svg{width:13px;height:13px}

/* ---- agenda ---- */
.ts-agenda{max-width:720px;margin:0 auto}
.ts-agenda-h{font-family:'Poppins',sans-serif;font-weight:600;font-size:13px;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-soft);margin:26px 0 12px}
.ts-agenda-h.hoy{color:var(--gold-deep)}
.ts-agenda-h.atrasada{color:#C05656}
.ts-task{display:flex;align-items:flex-start;gap:14px;background:var(--glass);border:1px solid var(--line);
  border-radius:var(--r);padding:16px 18px;margin-bottom:10px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:var(--shadow);transition:box-shadow .2s,border-color .2s}
.ts-task:hover{box-shadow:var(--shadow-hover);border-color:rgba(216,180,94,.4)}
.ts-check{flex:none;width:20px;height:20px;margin-top:2px;border-radius:50%;border:2px solid var(--line);
  background:var(--input-bg);cursor:pointer;transition:all .18s}
.ts-check:hover{border-color:var(--gold);background:rgba(216,180,94,.18);box-shadow:var(--glow)}
.ts-task-body{flex:1;cursor:pointer;min-width:0}
.ts-task-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.ts-task-name{font-family:'Poppins',sans-serif;font-weight:600;font-size:16px}
.ts-task-type{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);font-weight:600}
.ts-task-text{color:var(--ink-soft);font-size:13.5px;line-height:1.55;margin-bottom:6px}
.ts-task-when{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink);font-weight:500}
.ts-task-when svg{width:13px;height:13px;color:var(--ink-soft)}
.ts-task-cal{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--input-bg);
  display:flex;align-items:center;justify-content:center;color:var(--ink-soft);
  text-decoration:none;transition:all .18s}
.ts-task-cal svg{width:16px;height:16px}
.ts-task-cal:hover{border-color:var(--gold);color:var(--gold-deep);box-shadow:var(--glow)}

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
.ts-tag-ej{color:var(--gold-deep);background:rgba(232,201,121,.14);border-radius:999px;padding:3px 9px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:600}
.ts-empty{color:var(--ink-soft);padding:44px;text-align:center;border:1px dashed var(--line);border-radius:var(--r);background:var(--glass)}

/* ---- ficha (SpotlightCard glass) ---- */
.ts-root .ts-lead-card{text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:12px;min-height:200px;
  padding:24px;border-radius:var(--r);background:var(--glass);border:1px solid var(--line);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s,border-color .2s}
.ts-root .ts-lead-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover);border-color:rgba(216,180,94,.35)}
.ts-lead-card .ts-card-name{color:var(--ink)}
.ts-lead-card .ts-card-ctx{color:var(--ink-soft)}
.ts-lead-card .ts-card-type{color:var(--gold-deep)}
.ts-lead-card .ts-card-foot{border-top-color:var(--line)}
.ts-lead-card .ts-tag-ej{color:var(--gold-deep);background:rgba(232,201,121,.14)}

.ts-label{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);font-weight:600;margin:0 0 8px}
.ts-input,.ts-textarea{width:100%;background:var(--input-bg);border:1px solid var(--line);border-radius:var(--r-sm);
  color:var(--ink);font:inherit;font-size:14px;padding:12px 14px;margin-bottom:6px;outline:none;transition:border-color .18s,box-shadow .18s}
.ts-input::placeholder,.ts-textarea::placeholder{color:var(--ink-soft)}
.ts-input:focus,.ts-textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(216,180,94,.14)}
.ts-input[type=date],.ts-input[type=time]{color-scheme:dark}
.ts-textarea{resize:vertical;line-height:1.6}
.ts-row{display:flex;gap:14px}

.ts-seg{display:inline-flex;gap:4px;background:var(--input-bg);border:1px solid var(--line);border-radius:999px;padding:4px;margin:14px 0}
.ts-seg.center{display:flex;width:max-content;margin:0 auto 30px}
.ts-seg.wrap{display:flex;flex-wrap:wrap;border-radius:16px}
.ts-seg-btn{background:transparent;border:1px solid transparent;border-radius:999px;padding:8px 18px;font:inherit;font-size:13px;font-weight:500;color:var(--ink-soft);cursor:pointer;transition:all .18s}
.ts-seg-btn:hover{color:var(--ink);border-color:var(--line)}
.ts-seg-btn.on{background:linear-gradient(180deg,rgba(216,180,94,.9),rgba(216,180,94,.72));color:#1a1510;font-weight:600;box-shadow:0 0 14px rgba(216,180,94,.3)}

.ts-overlay{position:fixed;inset:0;background:rgba(6,6,9,.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50}
.ts-modal{background:rgba(23,22,28,.85);backdrop-filter:blur(30px) saturate(1.3);-webkit-backdrop-filter:blur(30px) saturate(1.3);
  border:1px solid rgba(255,255,255,.12);border-radius:24px;width:100%;max-width:540px;max-height:90vh;overflow:auto;
  box-shadow:0 30px 80px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08)}
.ts-modal-head{display:flex;justify-content:space-between;align-items:center;padding:24px 26px 0}
.ts-modal-head h2{font-family:'Poppins',sans-serif;font-weight:600;font-size:26px;margin:0}
.ts-x{background:var(--input-bg);border:1px solid var(--line);color:var(--ink-soft);width:32px;height:32px;border-radius:999px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.ts-x svg{width:14px;height:14px}
.ts-x:hover{background:var(--glass-strong);color:var(--ink)}
.ts-modal .ts-seg{margin:16px 26px 0;display:flex}
.ts-modal .ts-seg-btn{flex:1;text-align:center}
.ts-modal-body{padding:18px 26px 26px}
.ts-doc-row{display:flex;gap:10px;align-items:flex-start}
.ts-doc-row .ts-input{flex:1;margin-bottom:0}
.ts-doc-row .ts-btn-ghost{white-space:nowrap}

.ts-detail{max-width:1180px;margin:0 auto;padding:28px 30px 70px}
.ts-detail-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
.ts-back{background:none;border:none;color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.ts-back:hover{color:var(--gold-deep)}
.ts-del{background:none;border:none;color:var(--ink-soft);font:inherit;font-size:12.5px;cursor:pointer}
.ts-del:hover{color:#C05656}
.ts-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
.ts-panel{background:var(--glass);border:1px solid var(--line);border-radius:var(--r);padding:26px;
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:var(--shadow)}
.ts-name-edit{width:100%;background:none;border:none;color:var(--ink);font-family:'Poppins',sans-serif;font-size:40px;font-weight:600;letter-spacing:-.02em;padding:6px 0 14px;margin:6px 0 6px;outline:none;border-bottom:2px solid transparent}
.ts-name-edit:focus{border-color:var(--gold)}
.ts-wa-head{display:flex;justify-content:space-between;align-items:center;margin:26px 0 12px;padding-top:22px;border-top:1px solid var(--line-soft)}
.ts-wa-head span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);font-weight:600}
.ts-wa-actions{display:flex;gap:10px;margin-top:12px}
.ts-wa-empty{color:var(--ink-soft);font-size:13.5px;line-height:1.6;padding:16px;border:1px dashed var(--line);border-radius:var(--r-sm);background:var(--input-bg)}

/* ---- historial de tareas ---- */
.ts-task-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.ts-hist-head{cursor:pointer;user-select:none}
.ts-hist-head:hover .ts-hist-arrow{color:var(--gold-deep)}
.ts-hist-arrow{display:flex;color:var(--ink-soft)}
.ts-hist-arrow svg{width:18px;height:18px}
.ts-btn-ic{display:inline-flex;align-items:center;gap:7px}
.ts-btn-ic svg{width:16px;height:16px}
.ts-hist{margin-top:4px}
.ts-hist .ts-seg{display:flex;width:100%;margin:0 0 12px}
.ts-hist .ts-seg-btn{flex:1;text-align:center}
.ts-hist-empty{color:var(--ink-soft);font-size:13px;padding:14px;border:1px dashed var(--line);border-radius:var(--r-sm);background:var(--input-bg);text-align:center}
.ts-hist-item{display:flex;gap:12px;align-items:flex-start;background:var(--input-bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px}
.ts-hist-check{flex:none;width:20px;height:20px;border-radius:50%;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;color:transparent;margin-top:1px}
.ts-hist-check svg{width:12px;height:12px}
.ts-hist-check.done{background:rgba(127,176,122,.2);border-color:#7FB07A;color:#8FCB88}
.ts-hist-check-btn{cursor:pointer;background:var(--input-bg);padding:0;transition:all .18s}
.ts-hist-check-btn:hover{border-color:var(--gold);background:rgba(216,180,94,.18);box-shadow:var(--glow)}
.ts-hist-body{flex:1;min-width:0}
.ts-hist-text{font-size:13.5px;line-height:1.5;color:var(--ink)}
.ts-hist-when{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-soft);margin-top:4px}
.ts-hist-when svg{width:12px;height:12px;flex:none}

.ts-chat-panel{display:flex;flex-direction:column;height:720px}
.ts-chat-title{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);font-weight:600;padding-bottom:16px;border-bottom:1px solid var(--line-soft);margin-bottom:16px}
.ts-chat-scroll{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px}
.ts-chat-start{color:var(--ink-soft);font-size:14px;line-height:1.6;text-align:center;margin:auto;max-width:300px;display:flex;flex-direction:column;gap:18px;align-items:center}
.ts-msg{max-width:86%;padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.6;white-space:pre-wrap}
.ts-msg.user{align-self:flex-end;background:linear-gradient(180deg,rgba(216,180,94,.22),rgba(216,180,94,.12));border:1px solid rgba(216,180,94,.3);color:var(--ink);border-bottom-right-radius:5px}
.ts-msg.bot{align-self:flex-start;background:var(--input-bg);border:1px solid var(--line);color:var(--ink);border-bottom-left-radius:5px}
.ts-typing{color:var(--ink-soft);font-style:italic}
.ts-chat-input{display:flex;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line-soft)}
.ts-chat-input textarea{flex:1;background:var(--input-bg);border:1px solid var(--line);border-radius:14px;color:var(--ink);font:inherit;font-size:14px;padding:11px 14px;resize:none;outline:none;line-height:1.5}
.ts-chat-input textarea::placeholder{color:var(--ink-soft)}
.ts-chat-input textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(216,180,94,.14)}

@media(max-width:820px){.ts-detail-grid{grid-template-columns:1fr}.ts-chat-panel{height:520px}}
`;
