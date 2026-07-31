import { BookingApiError, registerClient } from "../booking/bookingService.js";

const form = document.getElementById("welcome-registration-form");
const status = document.getElementById("welcome-registration-status");

function showStatus(message, type = "") {
  status.textContent = message;
  status.className = `welcome-form__status${type ? ` welcome-form__status--${type}` : ""}`;
}

if (form && status) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const identity = {
      firstName: String(values.get("firstName") || "").trim(),
      lastName: String(values.get("lastName") || "").trim(),
      email: String(values.get("email") || "").trim().toLowerCase(),
      website: String(values.get("website") || "").trim(),
    };
    button.disabled = true;
    showStatus("Creating your client profile…");
    try {
      const result = await registerClient(identity);
      form.reset();
      showStatus(result.message, "success");
    } catch (error) {
      const message = error instanceof BookingApiError ? error.message : "We could not create your profile. Please try again or call Shera.";
      showStatus(message, "error");
    } finally {
      button.disabled = false;
    }
  });
}
