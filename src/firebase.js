// ============================================================
// Firebase — inicialización
// ============================================================
// Nota: la config de una app web de Firebase es pública por diseño
// (no es un secreto). La seguridad real se controla con las
// "Reglas de seguridad" de Firestore, no ocultando estas claves.
// ============================================================
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCIJQebfnnONOElTuuL7VC_VKKGaqzLeAA",
  authDomain: "asistente-de-seguimiento-ia.firebaseapp.com",
  projectId: "asistente-de-seguimiento-ia",
  storageBucket: "asistente-de-seguimiento-ia.firebasestorage.app",
  messagingSenderId: "573288916854",
  appId: "1:573288916854:web:189a36c0bf2e79f734fc57",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
