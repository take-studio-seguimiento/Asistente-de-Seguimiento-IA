// ============================================================
// auth — autenticación con Firebase (email + contraseña)
// ============================================================
import { auth } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

// Escucha el estado de sesión. Llama a `cb(user)` con el usuario
// logueado, o `cb(null)` si no hay sesión. Devuelve la des-suscripción.
export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

// Inicia sesión. Lanza error si las credenciales son inválidas.
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

// Crea una cuenta nueva (queda pendiente de aprobación del admin).
export async function signup(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

// Cierra la sesión.
export async function logout() {
  await signOut(auth);
}

// Traduce los códigos de error de Firebase a mensajes en español.
export function authErrorMessage(code) {
  const map = {
    "auth/invalid-email": "El email no tiene un formato válido.",
    "auth/user-disabled": "Este usuario está deshabilitado.",
    "auth/user-not-found": "No existe un usuario con ese email.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Esperá un momento e intentá de nuevo.",
    "auth/network-request-failed": "Error de red. Revisá tu conexión.",
    "auth/operation-not-allowed":
      "El login por email/contraseña no está habilitado en Firebase (Console → Authentication → Sign-in method).",
    "auth/email-already-in-use": "Ya existe una cuenta con ese email.",
    "auth/weak-password": "La contraseña es muy corta (mínimo 6 caracteres).",
    "auth/missing-password": "Ingresá una contraseña.",
  };
  return map[code] || "No se pudo completar la operación. Probá de nuevo.";
}
