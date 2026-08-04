import { useEffect, useState } from "react";
import { cancelBooking, getClientBookings, rescheduleBooking } from "../bookingService.js";
import { useModalDialog } from "../hooks/useModalDialog.js";
import { ClientVerification } from "./ClientVerification.jsx";

export function ManageBookingModal({ clientSession, classes, onVerified, onCancel, onCancelled, onRescheduled }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState({});
  const { modalRef } = useModalDialog({ isBusy: busy, onClose: onCancel });

  useEffect(() => {
    if (!clientSession) return;
    setBusy(true);
    getClientBookings(clientSession.token).then(setData).catch((reason) => setError(reason.message)).finally(() => setBusy(false));
  }, [clientSession]);

  const changeChoice = (bookingId, field, value) => setChoices((current) => ({
    ...current,
    [bookingId]: { attendanceType: "In person", ...current[bookingId], [field]: value },
  }));

  const cancel = async (bookingId) => {
    if (!window.confirm("Cancel this reservation?")) return;
    setBusy(true);
    try { onCancelled(await cancelBooking({ bookingId, clientToken: clientSession.token })); }
    catch (reason) { setError(reason.message); setBusy(false); }
  };

  const reschedule = async (booking) => {
    const choice = choices[booking.bookingId] || {};
    if (!choice.classId) { setError("Choose a new class before rescheduling."); return; }
    if (!window.confirm("Move this reservation to the selected class?")) return;
    setBusy(true); setError("");
    try {
      onRescheduled(await rescheduleBooking({
        bookingId: booking.bookingId,
        classId: choice.classId,
        attendanceType: choice.attendanceType || booking.attendanceType,
        clientToken: clientSession.token,
      }));
    } catch (reason) { setError(reason.message); setBusy(false); }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section ref={modalRef} className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="manage-booking-title">
      <div className="booking-modal__head"><p className="eyebrow">Manage booking</p><h2 id="manage-booking-title">Your reservations</h2><p>Secure email verification protects your bookings.</p></div>
      {!clientSession ? <ClientVerification onVerified={onVerified} onCancel={onCancel} /> : <div className="booking-modal__form">
        {busy && <p>Loading your reservations...</p>}
        {error && <div className="booking-status booking-status--error" role="alert">{error}</div>}
        {data && <>
          <div className="booking-balance"><strong>Hi {data.client.firstName}</strong><span>{data.client.sessionsRemaining} sessions remaining</span></div>
          {data.bookings.length ? data.bookings.map((booking) => {
            const choice = choices[booking.bookingId] || { attendanceType: booking.attendanceType };
            const options = classes.filter((item) => item.classId !== booking.classId && (Number(item.inPersonRemaining) > 0 || Number(item.onlineRemaining) > 0));
            const target = options.find((item) => item.classId === choice.classId);
            return <article className="client-booking-item" key={booking.bookingId}>
              <strong>{booking.className}</strong>
              <span>{booking.date} - {booking.time} - {booking.attendanceType}</span>
              {booking.canCancel ? <>
                <button className="button secondary" type="button" onClick={() => cancel(booking.bookingId)} disabled={busy}>Cancel reservation</button>
                <details className="client-booking-item__reschedule">
                  <summary>Reschedule this class</summary>
                  <label className="field">New class<select value={choice.classId || ""} onChange={(event) => changeChoice(booking.bookingId, "classId", event.target.value)} disabled={busy}><option value="">Choose a new class</option>{options.map((item) => <option key={item.classId} value={item.classId}>{item.day} - {item.date} - {item.time} - {item.className}</option>)}</select></label>
                  <label className="field">Attendance<select value={choice.attendanceType || booking.attendanceType} onChange={(event) => changeChoice(booking.bookingId, "attendanceType", event.target.value)} disabled={busy || !target}><option value="In person" disabled={target && Number(target.inPersonRemaining) < 1}>In person{target ? ` (${target.inPersonRemaining} left)` : ""}</option><option value="Online" disabled={target && Number(target.onlineRemaining) < 1}>Online{target ? ` (${target.onlineRemaining} left)` : ""}</option></select></label>
                  <button className="button gold" type="button" disabled={busy || !choice.classId} onClick={() => reschedule(booking)}>Confirm Reschedule</button>
                </details>
              </> : <small>Rescheduling and cancellation close 24 hours before class. Please message Shera if you need help.</small>}
            </article>;
          }) : <p>No upcoming reservations.</p>}
        </>}
        <button className="button secondary" type="button" onClick={onCancel}>Close</button>
      </div>}
    </section>
  </div>;
}
