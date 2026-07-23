import { API_URL } from "./config.js";

export class BookingApiError extends Error {
  constructor(message, code = "REQUEST_FAILED") { super(message); this.name = "BookingApiError"; this.code = code; }
}

function endpoint() {
  if (!API_URL.trim()) throw new BookingApiError("Online booking is not connected yet. Please call the studio to reserve your spot.", "API_NOT_CONFIGURED");
  return API_URL.trim();
}

async function request(payload, method = "POST") {
  let response;
  try {
    response = method === "GET" ? await fetch(payload) : await fetch(endpoint(), {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload),
    });
  } catch {
    throw new BookingApiError("We could not reach the booking service. Check your connection and try again.", "NETWORK_ERROR");
  }
  let body;
  try { body = await response.json(); } catch { throw new BookingApiError("The booking service is unavailable. Please try again."); }
  if (!response.ok || !body.success) throw new BookingApiError(body.message || "The booking request could not be completed.", body.code);
  return body;
}

export async function getClasses() {
  const url = new URL(endpoint());
  url.searchParams.set("action", "classes");
  return (await request(url.toString(), "GET")).classes || [];
}
export function sendVerification(identity) { return request({ action: "sendVerification", ...identity }); }
export function verifyCode(identity, code) { return request({ action: "verifyCode", ...identity, code }); }
export async function submitBooking({ classId, attendanceType, clientNote, clientToken }) { return (await request({ action: "book", classId, attendanceType, clientNote, clientToken })).booking; }
export function getClientBookings(clientToken) { return request({ action: "clientBookings", clientToken }); }
export async function cancelBooking({ bookingId, clientToken }) { return (await request({ action: "cancelBooking", bookingId, clientToken })).cancellation; }
