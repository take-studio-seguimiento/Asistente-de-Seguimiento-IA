// ============================================================
// usersService — perfiles de cuenta (users) y aprobación de asesores
// Colección: "users" (id = uid de Firebase Auth)
// Campos: email, name, role ("admin"|"asesor"), status ("pending"|"approved"|"rejected"), createdAt
// ============================================================
import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
} from "firebase/firestore";

// El admin/dueño. Debe coincidir con el email de las reglas de Firestore.
const ADMIN_EMAILS = ["nicolas@takestudio.com.ar"];
export const isAdminEmail = (email) => ADMIN_EMAILS.includes((email || "").toLowerCase());

// Crea el perfil del usuario si no existe. El admin queda aprobado;
// cualquier otro queda "pending" hasta que el admin lo apruebe.
// Si se pasa `name` y el doc no lo tiene todavía, lo completa (evita
// que se pierda el nombre por la carrera entre el alta y el listener).
export async function ensureUserDoc(user, name = "") {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const clean = (name || "").trim();
  if (!snap.exists()) {
    const admin = isAdminEmail(user.email);
    await setDoc(ref, {
      email: user.email || "",
      name: clean,
      role: admin ? "admin" : "asesor",
      status: admin ? "approved" : "pending",
      createdAt: Date.now(),
    });
  } else if (clean && !snap.data().name) {
    await updateDoc(ref, { name: clean });
  }
}

// Edita el nombre de un perfil. Sirve para el usuario sobre sí mismo
// y para el admin sobre cualquier asesor (las reglas lo permiten).
export async function updateUserName(uid, name) {
  await updateDoc(doc(db, "users", uid), { name: (name || "").trim() });
}

// Escucha en vivo el perfil propio (para que la pantalla de "pendiente"
// se actualice sola cuando el admin aprueba).
export function subscribeUserProfile(uid, cb, onError) {
  return onSnapshot(
    doc(db, "users", uid),
    (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null),
    (err) => { console.error("[users] perfil:", err); onError && onError(err); }
  );
}

// (Admin) escucha todos los perfiles para el panel de asesores.
export function subscribeAllUsers(cb, onError) {
  return onSnapshot(
    collection(db, "users"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.error("[users] listado:", err); onError && onError(err); }
  );
}

// (Admin) cambia el estado de una cuenta.
export async function setUserStatus(uid, status) {
  await updateDoc(doc(db, "users", uid), { status });
}
