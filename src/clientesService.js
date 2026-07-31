// ============================================================
// clientesService — persistencia de clientes en Firestore
// Colección: "clientes" (un documento por cliente, id = client.id)
// Reemplaza al viejo window.storage del prototipo.
// ============================================================
import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

const COL = "clientes";
const colRef = collection(db, COL);

// Escucha en tiempo real los leads que corresponden al usuario:
// - admin: todos.
// - asesor: solo los suyos (ownerId == uid).
export function subscribeClientes({ uid, isAdmin }, cb, onError) {
  const ref = isAdmin ? colRef : query(colRef, where("ownerId", "==", uid));
  return onSnapshot(
    ref,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cb(list);
    },
    (err) => {
      console.error("[Firestore] error al escuchar clientes:", err);
      onError && onError(err);
    }
  );
}

// Crea o actualiza un cliente. Usa client.id como id del documento.
export async function upsertCliente(client) {
  const next = { ...client, updatedAt: Date.now() };
  const { id, ...data } = next;
  await setDoc(doc(db, COL, id), data, { merge: true });
  return next;
}

// Borra un cliente por id.
export async function removeCliente(id) {
  await deleteDoc(doc(db, COL, id));
}
