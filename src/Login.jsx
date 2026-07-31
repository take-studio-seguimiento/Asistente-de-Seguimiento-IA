import React, { useState } from "react";
import { login, authErrorMessage } from "./auth";
import Grainient from "./Grainient";
import SpecularButton from "./SpecularButton";

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
      {/* Fondo de gradiente animado (tonos dorados de Take Studio) */}
      <div className="ts-login-bg">
        <Grainient
          color1="#F0DFA8"
          color2="#C4A155"
          color3="#2E2A25"
          timeSpeed={0.45}
          zoom={0.9}
          grainAmount={0.08}
          contrast={1.35}
        />
      </div>

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

        <SpecularButton
          type="submit"
          size="lg"
          className="ts-login-submit"
          radius={999}
          tint="#141117"
          tintOpacity={0.5}
          blur={12}
          textColor="#FBF3DF"
          lineColor="#F7E4A0"
          baseColor="#7a672f"
          intensity={1.9}
          shineSize={18}
          autoAnimate={!!email && !!password}
          proximity={360}
          disabled={!email || !password}
        >
          {busy ? (
            <span className="ts-btn-ic"><span className="ts-spinner" /> Ingresando</span>
          ) : "Entrar"}
        </SpecularButton>
      </form>
    </div>
  );
}
