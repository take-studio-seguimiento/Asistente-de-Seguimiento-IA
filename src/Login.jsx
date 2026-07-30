import React, { useState } from "react";
import { login, authErrorMessage } from "./auth";

// Pantalla de login. Se muestra mientras no haya sesión iniciada.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      // El listener de sesión en App se encarga de mostrar la app.
    } catch (err) {
      setError(authErrorMessage(err?.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ts-login">
      <form className="ts-login-card" onSubmit={submit}>
        <div className="ts-wordmark ts-login-mark">TAKE<span>STUDIO</span></div>
        <div className="ts-eyebrow">— Seguimiento de clientes —</div>
        <h1 className="ts-login-title">Ingresá a tu <span className="ts-ital">cuenta</span></h1>

        <label className="ts-label">Email</label>
        <input
          className="ts-input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ventas@takestudio.com.ar"
        />

        <label className="ts-label">Contraseña</label>
        <input
          className="ts-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && <div className="ts-login-error">{error}</div>}

        <button className="ts-btn-primary full" type="submit" disabled={busy || !email || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
