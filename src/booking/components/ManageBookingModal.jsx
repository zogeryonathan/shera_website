import { useEffect, useState } from "react";
import { cancelBooking, getClientBookings } from "../bookingService.js";
import { useModalDialog } from "../hooks/useModalDialog.js";
import { ClientVerification } from "./ClientVerification.jsx";

export function ManageBookingModal({ clientSession, onVerified, onCancel, onCancelled }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { modalRef } = useModalDialog({ isBusy: busy, onClose: onCancel });
  useEffect(() => { if (!clientSession) return; setBusy(true); getClientBookings(clientSession.token).then(setData).catch((e) => setError(e.message)).finally(() => setBusy(false)); }, [clientSession]);
  const cancel = async (bookingId) => { if (!window.confirm("Cancel this reservation?")) return; setBusy(true); try { onCancelled(await cancelBooking({ bookingId, clientToken: clientSession.token })); } catch (e) { setError(e.message); setBusy(false); } };
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}><section ref={modalRef} className="booking-modal" role="dialog" aria-modal="true"><div className="booking-modal__head"><p className="eyebrow">Manage booking</p><h2>Your reservations</h2><p>Secure email verification protects your bookings.</p></div>{!clientSession ? <ClientVerification onVerified={onVerified} /> : <div className="booking-modal__form">{busy && <p>Loading your reservations…</p>}{error && <div className="booking-status booking-status--error">{error}</div>}{data && <><div className="booking-balance"><strong>Hi {data.client.firstName}</strong><span>{data.client.sessionsRemaining} sessions remaining</span></div>{data.bookings.length ? data.bookings.map((b) => <article className="client-booking-item" key={b.bookingId}><strong>{b.className}</strong><span>{b.date} · {b.time} · {b.attendanceType}</span>{b.canCancel ? <button className="button secondary" onClick={() => cancel(b.bookingId)} disabled={busy}>Cancel reservation</button> : <small>Cancellation window closed — please contact Shera.</small>}</article>) : <p>No upcoming reservations.</p>}</>}<button className="button secondary" type="button" onClick={onCancel}>Close</button></div>}</section></div>;
}
