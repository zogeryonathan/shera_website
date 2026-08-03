import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { submitInquiry } from "../booking/bookingService.js";
import "./contact.css";

const INITIAL_FORM = { firstName: "", lastName: "", email: "", phone: "", message: "", website: "" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_NUMBER = "13439872421";

function topicMessage(topic) {
  const messages = { registration: "Hello Shera, I would like to register and choose a class package.", private: "Hello Shera, I would like to ask about private Pilates sessions.", massage: "Hello Shera, I would like to ask about massage therapy.", booking: "Hello Shera, I have a question about booking a class." };
  return messages[topic] || "Hello Shera, I would like to learn more about Shera Studio.";
}

function ContactPage() {
  const topic = useMemo(() => new URLSearchParams(window.location.search).get("topic") || "general", []);
  const starterMessage = useMemo(() => topicMessage(topic), [topic]);
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM, message: topic === "general" ? "" : starterMessage }));
  const [status, setStatus] = useState({ type: "", text: "" });
  const [sending, setSending] = useState(false);

  const change = (event) => { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); setStatus({ type: "", text: "" }); };
  const submit = async (event) => {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !EMAIL.test(form.email.trim()) || !form.phone.trim() || form.message.trim().length < 3) {
      setStatus({ type: "error", text: "Please enter your name, email, phone number, and a short message." });
      return;
    }
    setSending(true); setStatus({ type: "", text: "" });
    try {
      await submitInquiry({ ...form, page: topic });
      setStatus({ type: "success", text: "Thank you — Shera will reply as soon as she can." });
      setForm({ ...INITIAL_FORM });
    } catch (error) { setStatus({ type: "error", text: error.message }); }
    finally { setSending(false); }
  };

  const encodedMessage = encodeURIComponent(starterMessage);
  return <>
    <section className="contact-hero"><div className="wrap"><p className="eyebrow">Contact Shera</p><h1>Send a message when it suits you.</h1><p className="lede">Shera may be teaching or with a client. Send a message and she will reply as soon as she can.</p></div></section>
    <section className="section contact-section"><div className="wrap contact-layout">
      <div className="contact-options"><p className="eyebrow">Message directly</p><h2>Choose the easiest way to reach Shera.</h2><p>For a quick question, WhatsApp is best. Text messaging is also available on your phone.</p>
        <a className="contact-method contact-method--whatsapp" href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`} target="_blank" rel="noopener noreferrer"><strong>Message Shera on WhatsApp</strong><span>Open a private chat and send a message when you are ready.</span></a>
        <a className="contact-method" href={`sms:+${WHATSAPP_NUMBER}?body=${encodedMessage}`}><strong>Send a Text Message</strong><span>Opens your phone’s Messages app.</span></a>
      </div>
      <form className="contact-form" onSubmit={submit} noValidate><p className="eyebrow">Send an inquiry</p><h2>Prefer an email reply?</h2><p>Send the details below. Shera receives your message directly by email.</p>
        <div className="contact-form__grid"><label>First name<input name="firstName" autoComplete="given-name" maxLength="80" value={form.firstName} onChange={change} disabled={sending} /></label><label>Last name<input name="lastName" autoComplete="family-name" maxLength="80" value={form.lastName} onChange={change} disabled={sending} /></label></div>
        <div className="contact-form__grid"><label>Email address<input name="email" type="email" autoComplete="email" maxLength="200" value={form.email} onChange={change} disabled={sending} /></label><label>Phone number<input name="phone" type="tel" autoComplete="tel" maxLength="40" value={form.phone} onChange={change} disabled={sending} /></label></div>
        <label>How can Shera help?<textarea name="message" maxLength="2000" value={form.message} onChange={change} disabled={sending} placeholder="Tell Shera what you are interested in or any questions you have." /></label>
        <label className="contact-form__honeypot" aria-hidden="true">Website<input name="website" tabIndex="-1" autoComplete="off" value={form.website} onChange={change} /></label>
        {status.text && <p className={`contact-form__status contact-form__status--${status.type}`} role="status">{status.text}</p>}
        <button className="button gold" type="submit" disabled={sending}>{sending ? "Sending your inquiry…" : "Send Inquiry"}</button>
      </form>
    </div></section>
  </>;
}

const root = document.getElementById("contact-root");
if (!root) throw new Error("Contact page root was not found.");
createRoot(root).render(<StrictMode><ContactPage /></StrictMode>);
