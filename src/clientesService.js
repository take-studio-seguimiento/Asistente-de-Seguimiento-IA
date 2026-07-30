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
  getDocs,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";

const COL = "clientes";
const colRef = collection(db, COL);

// Escucha en tiempo real. Cada vez que algo cambia en la colección,
// llama a `cb` con el listado completo de clientes.
// Devuelve la función para des-suscribirse.
export function subscribeClientes(cb, onError) {
  return onSnapshot(
    colRef,
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

// Si la colección está vacía, carga los datos de ejemplo una sola vez.
export async function seedIfEmpty(seed) {
  const snap = await getDocs(colRef);
  if (!snap.empty) return false;
  const batch = writeBatch(db);
  seed.forEach((c) => {
    const { id, ...data } = c;
    batch.set(doc(db, COL, id), data);
  });
  await batch.commit();
  return true;
}
