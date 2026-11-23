import { useState } from "react";
import { ArrowUpRight, Globe2, X } from "lucide-react";
import { registerWithEmail, signInWithEmail, signInWithGoogle } from "../services/auth";
import { firebaseConfigured } from "../services/firebase";

function friendlyAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "An account already uses this email. Try signing in instead.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/operation-not-allowed": "Enable this sign-in provider in Firebase Authentication first.",
    "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
    "auth/weak-password": "Choose a password with at least six characters.",
  };
  return messages[error.code] || error.message || "Sign-in failed. Please try again.";
}

export default function AuthDialog({ onClose, onNotice }) {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function completeSignIn(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (mode === "signup" && action === submitEmailSignup) {
        onNotice("Account created. Check your email to verify your address before a campus administrator can grant faculty access.");
      }
      onClose();
    } catch (reason) {
      setError(friendlyAuthError(reason));
    } finally {
      setBusy(false);
    }
  }

  function submitEmailSignup() {
    return registerWithEmail(email, password, name);
  }

  function submit(event) {
    event.preventDefault();
    const action = mode === "signup"
      ? submitEmailSignup
      : () => signInWithEmail(email, password);
    return completeSignIn(action);
  }

  return (
    <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={onClose} aria-label="Close sign-in"><X size={20}/></button>
        <div className="eyebrow">LABLINK IDENTITY</div>
        <h2 id="auth-title">{mode === "signup" ? "Create your student account" : "Welcome back"}</h2>
        <p className="modal-subtitle">Sign in to sync your bookings with the campus network.</p>
        {!firebaseConfigured ? (
          <div className="auth-unavailable" role="status">Firebase is not configured in this environment. Demo mode remains available.</div>
        ) : <>
          <button className="google-btn" disabled={busy} onClick={() => completeSignIn(signInWithGoogle)}><Globe2 size={17}/> Continue with Google</button>
          <div className="auth-divider"><span>or use email</span></div>
          <form onSubmit={submit}>
            {mode === "signup" && <label>Full name<input required autoComplete="name" maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Your full name"/></label>}
            <label>Email address<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@campus.edu"/></label>
            <label>Password<input required type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 6 characters"/></label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button type="submit" className="primary-btn full" disabled={busy}>{busy ? "Connecting..." : mode === "signup" ? "Create student account" : "Sign in"} <ArrowUpRight size={17}/></button>
          </form>
          <button className="auth-mode-toggle" disabled={busy} onClick={() => { setError(""); setMode(mode === "signup" ? "signin" : "signup"); }}>
            {mode === "signup" ? "Already registered? Sign in" : "New to LabLink? Create a student account"}
          </button>
        </>}
      </section>
    </div>
  );
}
