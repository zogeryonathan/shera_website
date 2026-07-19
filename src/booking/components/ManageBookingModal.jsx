import { useState } from "react";
import { cancelBooking } from "../bookingService.js";
import { useModalDialog } from "../hooks/useModalDialog.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm(form) {
  const errors = {};
  if (!form.firstName.trim()) errors.firstName = "First name is required.";
  if (!form.lastName.trim()) errors.lastName = "Last name is required.";
  if (!form.email.trim()) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a valid email address.";
  return errors;
}

export function ManageBookingModal({ latestBooking, onCancel, onCancelled }) {
  const [form, setForm] = useState({
    firstName: latestBooking?.firstName || "",
    lastName: latestBooking?.lastName || "",
    email: latestBooking?.email || "",
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { modalRef, initialFocusRef } = useModalDialog({ isBusy: isSubmitting, onClose: onCancel });

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setSubmitError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const cancellation = await cancelBooking({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
      });
      onCancelled(cancellation);
    } catch (error) {
      setSubmitError(error.message);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSubmitting) onCancel();
    }}>
      <section
        ref={modalRef}
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-booking-title"
        aria-describedby="manage-booking-summary"
      >
        <div className="booking-modal__head">
          <p className="eyebrow">Manage booking</p>
          <h2 id="manage-booking-title">Cancel a reservation</h2>
          <p id="manage-booking-summary">Enter the same name and email used to reserve the class.</p>
        </div>

        <form className="booking-modal__form booking-modal__form--single" onSubmit={handleSubmit} noValidate>
          <label className="field">
            First Name
            <input ref={initialFocusRef} name="firstName" autoComplete="given-name" value={form.firstName} onChange={handleChange}
              aria-invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? "cancel-first-name-error" : undefined}
              disabled={isSubmitting} />
            {errors.firstName && <span className="field-error" id="cancel-first-name-error">{errors.firstName}</span>}
          </label>

          <label className="field">
            Last Name
            <input name="lastName" autoComplete="family-name" value={form.lastName} onChange={handleChange}
              aria-invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? "cancel-last-name-error" : undefined}
              disabled={isSubmitting} />
            {errors.lastName && <span className="field-error" id="cancel-last-name-error">{errors.lastName}</span>}
          </label>

          <label className="field">
            Email
            <input type="email" name="email" autoComplete="email" inputMode="email" value={form.email} onChange={handleChange}
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "cancel-email-error" : undefined}
              disabled={isSubmitting} />
            {errors.email && <span className="field-error" id="cancel-email-error">{errors.email}</span>}
          </label>

          {submitError && <div className="booking-status booking-status--error" role="alert">{submitError}</div>}

          <div className="booking-modal__actions">
            <button className="button gold" type="submit" disabled={isSubmitting}>
              {isSubmitting && <span className="loading-spinner" aria-hidden="true" />}
              {isSubmitting ? "Cancelling…" : "Cancel Reservation"}
            </button>
            <button className="button secondary" type="button" onClick={onCancel} disabled={isSubmitting}>Keep Reservation</button>
          </div>
        </form>
      </section>
    </div>
  );
}
