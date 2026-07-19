import { useEffect, useRef, useState } from "react";
import { ADMIN_GOOGLE_CLIENT_ID } from "../config.js";

export function GoogleAdminLogin({ onCredential }) {
  const buttonRef = useRef(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!ADMIN_GOOGLE_CLIENT_ID) return undefined;
    const script = document.getElementById("google-identity-script");

    function initialize() {
      if (!window.google?.accounts?.id || !buttonRef.current) return;
      buttonRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: ADMIN_GOOGLE_CLIENT_ID,
        callback: ({ credential }) => onCredential(credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: 280,
      });
    }

    if (window.google?.accounts?.id) initialize();
    else {
      script?.addEventListener("load", initialize, { once: true });
      script?.addEventListener("error", () => setLoadError("Google Sign-In could not be loaded."), { once: true });
    }
    return () => script?.removeEventListener("load", initialize);
  }, [onCredential]);

  return (
    <section className="admin-login" aria-labelledby="admin-login-title">
      <img src="/assets/images/sherazade-mami-logo.png" alt="Sherazade Mami" />
      <p className="eyebrow">Private studio access</p>
      <h1 id="admin-login-title">Owner dashboard</h1>
      <p>Sign in with the authorized studio Google account.</p>
      {!ADMIN_GOOGLE_CLIENT_ID ? (
        <div className="admin-alert admin-alert--error" role="alert">
          Add the Google OAuth Client ID to <code>src/admin/config.js</code>.
        </div>
      ) : <div ref={buttonRef} className="google-signin-button" />}
      {loadError && <div className="admin-alert admin-alert--error" role="alert">{loadError}</div>}
      <a href="booking.html">Return to booking page</a>
    </section>
  );
}
