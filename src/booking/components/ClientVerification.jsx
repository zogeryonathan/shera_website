import { useState } from "react";
import { sendVerification, verifyCode } from "../bookingService.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ClientVerification({ onVerified, onCancel, initial = {} }) {
  const [identity, setIdentity] = useState({ firstName: initial.firstName || "", lastName: initial.lastName || "", email: initial.email || "" });
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const notRegistered = error?.code === "CLIENT_NOT_FOUND";

  const update = (event) => { setIdentity({ ...identity, [event.target.name]: event.target.value }); setError(null); };
  const valid = () => identity.firstName.trim() && identity.lastName.trim() && EMAIL.test(identity.email.trim());
  const showError = (requestError) => setError({ code: requestError.code || "REQUEST_FAILED", message: requestError.message });

  async function requestCode(event) {
    event.preventDefault();
    if (!valid()) return setError({ code: "VALIDATION_ERROR", message: "Enter your first name, last name, and a valid email." });
    setBusy(true); setError(null);
    try { await sendVerification({ ...identity, email: identity.email.trim().toLowerCase() }); setSent(true); }
    catch (requestError) { showError(requestError); }
    finally { setBusy(false); }
  }

  async function confirmCode(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError({ code: "INVALID_CODE", message: "Enter the 6-digit code from your email." });
    setBusy(true); setError(null);
    try { const result = await verifyCode({ ...identity, email: identity.email.trim().toLowerCase() }, code); onVerified({ token: result.clientToken, client: result.client, expiresAt: result.expiresAt }); }
    catch (requestError) { showError(requestError); }
    finally { setBusy(false); }
  }

  return (
    <div className="client-verification">
      {!sent ? <form onSubmit={requestCode} className="booking-modal__form booking-modal__form--single">
        <div className="verification-intro">
          <p className="eyebrow">Step 1 of 2</p>
          <h3>Confirm your studio account</h3>
          <p>Enter the details you registered with Shera. We will send a one-time 6-digit code to your email, then you will enter it on the next screen.</p>
        </div>
        <label className="field">First Name<input name="firstName" autoComplete="given-name" value={identity.firstName} onChange={update} disabled={busy} /></label>
        <label className="field">Last Name<input name="lastName" autoComplete="family-name" value={identity.lastName} onChange={update} disabled={busy} /></label>
        <label className="field">Email Address<input name="email" type="email" autoComplete="email" value={identity.email} onChange={update} disabled={busy} /></label>
        {notRegistered ? <div className="verification-registration" role="alert"><strong>New client? Please register first.</strong><p>Call Shera to create your client profile and add your class package. Once that is complete, you can return here and book online.</p><a className="button secondary" href="tel:+13439872421">Call Shera to Register</a></div> : error && <div className="booking-status booking-status--error" role="alert">{error.message}</div>}
        <div className="booking-modal__actions">
          {!notRegistered && <button className="button gold" type="submit" disabled={busy}>{busy ? "Sending your code…" : "Send My 6-Digit Code"}</button>}
          {onCancel && <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Close</button>}
        </div>
      </form> : <form onSubmit={confirmCode} className="booking-modal__form booking-modal__form--single">
        <div className="verification-intro">
          <p className="eyebrow">Step 2 of 2</p>
          <h3>Enter your email code</h3>
          <p>Check <strong>{identity.email}</strong> for the 6-digit code we just sent. It is valid for 30 minutes.</p>
        </div>
        <label className="field">6-Digit Code<input value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }} inputMode="numeric" autoComplete="one-time-code" maxLength="6" disabled={busy} /></label>
        {error && <div className="booking-status booking-status--error" role="alert">{error.message}</div>}
        <div className="booking-modal__actions"><button className="button gold" type="submit" disabled={busy}>{busy ? "Checking code…" : "Continue to Booking"}</button>{onCancel && <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Close</button>}</div>
      </form>}
    </div>
  );
}
