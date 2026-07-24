import { useState } from "react";
import { submitBooking } from "../bookingService.js";
import { useModalDialog } from "../hooks/useModalDialog.js";
import { ClientVerification } from "./ClientVerification.jsx";

export function BookingModal({ classItem, clientSession, onVerified, onCancel, onBooked }) {
  const [attendanceType, setAttendanceType] = useState("In person");
  const [clientNote, setClientNote] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { modalRef } = useModalDialog({ isBusy: isSubmitting, onClose: onCancel });

  const inPersonAvailable = Number(classItem.inPersonRemaining) > 0;
  const onlineAvailable = Number(classItem.onlineRemaining) > 0;
  const hasAvailability = inPersonAvailable || onlineAvailable;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!clientSession) return;
    if ((attendanceType === "In person" && !inPersonAvailable) || (attendanceType === "Online" && !onlineAvailable)) {
      setSubmitError("That attendance option is no longer available. Please choose the other option or refresh the schedule.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const booking = await submitBooking({
        classId: classItem.classId,
        attendanceType,
        clientNote: clientNote.trim(),
        clientToken: clientSession.token,
      });
      onBooked(classItem, booking);
    } catch (error) {
      setSubmitError(error.message);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSubmitting) onCancel();
    }}>
      <section ref={modalRef} className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
        <div className="booking-modal__head">
          <p className="eyebrow">Reserve your spot</p>
          <h2 id="booking-modal-title">{classItem.className}</h2>
          <p>{classItem.day}, {classItem.date} · {classItem.time}</p>
        </div>

        {!clientSession ? (
          <ClientVerification onVerified={onVerified} onCancel={onCancel} />
        ) : (
          <form className="booking-modal__form booking-modal__form--single" onSubmit={handleSubmit}>
            <div className="booking-balance" role="status">
              <strong>Hi {clientSession.client.firstName}</strong>
              <span>{clientSession.client.sessionsRemaining} paid session{Number(clientSession.client.sessionsRemaining) === 1 ? "" : "s"} remaining</span>
            </div>

            {!hasAvailability ? (
              <div className="booking-status booking-status--error" role="alert">This class is now full. Please choose another class.</div>
            ) : (
              <fieldset className="attendance-choice" disabled={isSubmitting}>
                <legend>How will you attend?</legend>
                <label>
                  <input type="radio" name="attendance" value="In person" checked={attendanceType === "In person"} onChange={() => { setAttendanceType("In person"); setSubmitError(""); }} disabled={!inPersonAvailable} />
                  <span>In person <small>{inPersonAvailable ? `${classItem.inPersonRemaining} spot${Number(classItem.inPersonRemaining) === 1 ? "" : "s"} left` : "Full"}</small></span>
                </label>
                <label>
                  <input type="radio" name="attendance" value="Online" checked={attendanceType === "Online"} onChange={() => { setAttendanceType("Online"); setSubmitError(""); }} disabled={!onlineAvailable} />
                  <span>Online <small>{onlineAvailable ? `${classItem.onlineRemaining} spot${Number(classItem.onlineRemaining) === 1 ? "" : "s"} left` : "Not available"}</small></span>
                </label>
              </fieldset>
            )}

            <label className="field">
              Note for Shera <span className="field-optional">(optional)</span>
              <textarea value={clientNote} onChange={(event) => setClientNote(event.target.value)} maxLength="500" placeholder="Goals, an injury consideration, or anything helpful for Shera to know." disabled={isSubmitting || !hasAvailability} />
            </label>

            {submitError && <div className="booking-status booking-status--error" role="alert">{submitError}</div>}
            <p className="booking-modal__security">Cancellations are available online until 24 hours before the class starts.</p>
            <div className="booking-modal__actions">
              <button className="button gold" type="submit" disabled={isSubmitting || !hasAvailability}>
                {isSubmitting && <span className="loading-spinner" aria-hidden="true" />}
                {isSubmitting ? "Reserving…" : "Reserve Spot"}
              </button>
              <button className="button secondary" type="button" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
