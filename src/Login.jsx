import React, { useState } from "react";
import { login, signup, authErrorMessage } from "./auth";
import Grainient from "./Grainient";
import SpecularButton from "./SpecularButton";

// Pantalla de login / registro. Se muestra mientras no haya sesión.
export default function Login() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (isSignup) {
        await signup(email, password);
        // Firebase inicia sesión con la cuenta nueva; App crea el perfil
        // pendiente y muestra la pantalla "cuenta pendiente".
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(authErrorMessage(err?.code));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setError("");
    setMode(isSignup ? "login" : "signup");
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
        <div className="ts-eyebrow">— Seguimiento de leads —</div>
        <h1 className="ts-login-title">
          {isSignup ? <>Creá tu <span className="ts-ital">cuenta</span></> : <>Ingresá a tu <span className="ts-ital">cuenta</span></>}
        </h1>

        <label className="ts-label">Email</label>
        <input
          className="ts-input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tuemail@takestudio.com.ar"
        />

        <label className="ts-label">Contraseña</label>
        <input
          className="ts-input"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isSignup ? "Mínimo 6 caracteres" : "••••••••"}
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
            <span className="ts-btn-ic"><span className="ts-spinner" /> {isSignup ? "Creando" : "Ingresando"}</span>
          ) : isSignup ? "Crear cuenta" : "Entrar"}
        </SpecularButton>

        <button type="button" className="ts-login-switch" onClick={switchMode}>
          {isSignup ? "¿Ya tenés cuenta? Iniciá sesión" : "¿Sos asesor nuevo? Creá tu cuenta"}
        </button>
      </form>
    </div>
  );
}
