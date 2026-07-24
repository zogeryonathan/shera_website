import { useState } from "react";
import { sendVerification, verifyCode } from "../bookingService.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ClientVerification({ onVerified, onCancel, initial = {} }) {
  const [identity, setIdentity] = useState({ firstName: initial.firstName || "", lastName: initial.lastName || "", email: initial.email || "" });
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (event) => { setIdentity({ ...identity, [event.target.name]: event.target.value }); setError(""); };
  const valid = () => identity.firstName.trim() && identity.lastName.trim() && EMAIL.test(identity.email.trim());
  const useDifferentDetails = () => { setIdentity({ firstName: "", lastName: "", email: "" }); setCode(""); setSent(false); setError(""); };

  async function requestCode(event) {
    event.preventDefault();
    if (!valid()) return setError("Enter your first name, last name, and a valid email.");
    setBusy(true); setError("");
    try { await sendVerification({ ...identity, email: identity.email.trim().toLowerCase() }); setSent(true); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function confirmCode(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    setBusy(true); setError("");
    try { const result = await verifyCode({ ...identity, email: identity.email.trim().toLowerCase() }, code); onVerified({ token: result.clientToken, client: result.client, expiresAt: result.expiresAt }); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="client-verification">
      <p className="booking-modal__security">For your privacy, verify the email connected to your studio account. Your access stays active for 30 minutes.</p>
      {!sent ? <form onSubmit={requestCode} className="booking-modal__form">
        <label className="field">First Name<input name="firstName" autoComplete="given-name" value={identity.firstName} onChange={update} disabled={busy} /></label>
        <label className="field">Last Name<input name="lastName" autoComplete="family-name" value={identity.lastName} onChange={update} disabled={busy} /></label>
        <label className="field">Email<input name="email" type="email" autoComplete="email" value={identity.email} onChange={update} disabled={busy} /></label>
        {error && <div className="booking-status booking-status--error" role="alert">{error}</div>}
        <div className="booking-modal__actions">
          <button className="button gold" type="submit" disabled={busy}>{busy ? "Sending code…" : "Email Me a Code"}</button>
          <button className="button secondary" type="button" onClick={useDifferentDetails} disabled={busy}>Use Different Details</button>
          {onCancel && <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Close</button>}
        </div>
      </form> : <form onSubmit={confirmCode} className="booking-modal__form">
        <p className="booking-modal__security">We sent a 6-digit code to <strong>{identity.email}</strong>. It expires in 30 minutes.</p>
        <label className="field">Verification Code<input value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} inputMode="numeric" autoComplete="one-time-code" maxLength="6" disabled={busy} /></label>
        {error && <div className="booking-status booking-status--error" role="alert">{error}</div>}
        <div className="booking-modal__actions"><button className="button gold" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify & Continue"}</button><button className="button secondary" type="button" onClick={() => { setSent(false); setCode(""); }} disabled={busy}>Change Details</button>{onCancel && <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Close</button>}</div>
      </form>}
    </div>
  );
}
