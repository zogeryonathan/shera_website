import { useState } from "react";
import { submitBooking } from "../bookingService.js";
import { useModalDialog } from "../hooks/useModalDialog.js";

const INITIAL_FORM = Object.freeze({
  firstName: "",
  lastName: "",
  email: "",
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm(form) {
  const errors = {};

  if (!form.firstName.trim()) errors.firstName = "First name is required.";
  if (!form.lastName.trim()) errors.lastName = "Last name is required.";
  if (!form.email.trim()) {
    errors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  return errors;
}

export function BookingModal({ classItem, onCancel, onBooked }) {
  const [form, setForm] = useState(INITIAL_FORM);
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
      const booking = await submitBooking({
        classId: classItem.classId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
      });
      onBooked(classItem, booking, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
      });
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
        aria-labelledby="booking-modal-title"
        aria-describedby="booking-modal-summary"
      >
        <div className="booking-modal__head">
          <p className="eyebrow">Reserve your spot</p>
          <h2 id="booking-modal-title">{classItem.className}</h2>
          <p id="booking-modal-summary">
            {classItem.day}, {classItem.date} · {classItem.time}
          </p>
        </div>

        <form className="booking-modal__form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            First Name
            <input
              ref={initialFocusRef}
              data-testid="booking-first-name"
              name="firstName"
              autoComplete="given-name"
              value={form.firstName}
              onChange={handleChange}
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={errors.firstName ? "first-name-error" : undefined}
              disabled={isSubmitting}
            />
            {errors.firstName && <span className="field-error" id="first-name-error">{errors.firstName}</span>}
          </label>

          <label className="field">
            Last Name
            <input
              data-testid="booking-last-name"
              name="lastName"
              autoComplete="family-name"
              value={form.lastName}
              onChange={handleChange}
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={errors.lastName ? "last-name-error" : undefined}
              disabled={isSubmitting}
            />
            {errors.lastName && <span className="field-error" id="last-name-error">{errors.lastName}</span>}
          </label>

          <label className="field booking-modal__email">
            Email
            <input
              type="email"
              data-testid="booking-email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={handleChange}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              disabled={isSubmitting}
            />
            {errors.email && <span className="field-error" id="email-error">{errors.email}</span>}
          </label>

          {submitError && <div className="booking-status booking-status--error" role="alert">{submitError}</div>}

          <div className="booking-modal__actions">
            <button className="button gold" data-testid="booking-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting && <span className="loading-spinner" aria-hidden="true" />}
              {isSubmitting ? "Reserving…" : "Reserve Spot"}
            </button>
            <button className="button secondary" type="button" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
