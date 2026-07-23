import { API_URL } from "../booking/config.js";

const REQUEST_TIMEOUT_MS = 20000;

export class AdminApiError extends Error {
  constructor(message, code = "ADMIN_API_ERROR") {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
  }
}

async function adminRequest(action, credential, data = {}) {
  if (!API_URL.trim()) throw new AdminApiError("Paste the Apps Script /exec URL into booking config.js.", "API_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, credential, ...data }),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new AdminApiError(payload.message || "The admin request failed.", payload.code);
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new AdminApiError("The admin service timed out.", "TIMEOUT");
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError("Could not reach the admin service. Check the connection and deployment.", "NETWORK_ERROR");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function getAdminDashboard(credential) {
  return (await adminRequest("adminDashboard", credential)).dashboard;
}

export function updateClass(credential, classItem) {
  return adminRequest("adminUpdateClass", credential, classItem);
}

export function createClass(credential, classItem) {
  return adminRequest("adminCreateClass", credential, classItem);
}

export function deleteClass(credential, classId) {
  return adminRequest("adminDeleteClass", credential, { classId });
}

export function cancelClientBooking(credential, bookingId) {
  return adminRequest("adminCancelBooking", credential, { bookingId });
}

export function updateTemplate(credential, template) {
  return adminRequest("adminUpdateTemplate", credential, template);
}

export function createTemplate(credential, template) {
  return adminRequest("adminCreateTemplate", credential, template);
}

export function generateClasses(credential) {
  return adminRequest("adminGenerateClasses", credential);
}

export function createClient(credential, client) { return adminRequest("adminCreateClient", credential, client); }
export function updateClient(credential, client) { return adminRequest("adminUpdateClient", credential, client); }
export function topUpClient(credential, clientId, sessions, note = "") { return adminRequest("adminTopUpClient", credential, { clientId, sessions, note }); }
export function bookClient(credential, booking) { return adminRequest("adminBookForClient", credential, booking); }
export function cancelClass(credential, classId) { return adminRequest("adminCancelClass", credential, { classId }); }
