import { API_URL } from "./config.js";

const REQUEST_TIMEOUT_MS = 15000;

export class BookingApiError extends Error {
  constructor(message, code = "BOOKING_API_ERROR") {
    super(message);
    this.name = "BookingApiError";
    this.code = code;
  }
}

function getApiUrl() {
  const url = API_URL.trim();

  if (!url) {
    throw new BookingApiError(
      "Online booking is not connected yet. Please call the studio to reserve your spot.",
      "API_NOT_CONFIGURED",
    );
  }

  return url;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new BookingApiError("The booking service is unavailable. Please try again.");
    }

    const payload = await response.json();

    if (!payload.success) {
      throw new BookingApiError(
        payload.message || "The booking request could not be completed.",
        payload.code,
      );
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new BookingApiError("The booking service took too long to respond. Please try again.", "TIMEOUT");
    }

    if (error instanceof BookingApiError) {
      throw error;
    }

    throw new BookingApiError(
      "We could not reach the booking service. Check your connection and try again.",
      "NETWORK_ERROR",
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function getClasses() {
  const url = new URL(getApiUrl());
  url.searchParams.set("action", "classes");
  url.searchParams.set("_", Date.now().toString());

  const payload = await request(url.toString(), { method: "GET" });
  return Array.isArray(payload.classes) ? payload.classes : [];
}

export async function submitBooking({ classId, firstName, lastName, email }) {
  const payload = await request(getApiUrl(), {
    method: "POST",
    // text/plain prevents an unnecessary CORS preflight with Apps Script.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "book", classId, firstName, lastName, email }),
  });

  return payload.booking;
}

export async function cancelBooking({ firstName, lastName, email }) {
  const payload = await request(getApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "cancel", firstName, lastName, email }),
  });

  return payload.cancellation;
}
