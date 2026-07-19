// Paste the Google Apps Script Web App /exec URL between the quotes.
// Example: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwLqN15blrfTqxCQiONR-USbciL27yaW20o3APbPdbCiJyXtHW_vjwHTIZ9KeNbb8numg/exec";

// The environment fallback is useful for local/preview testing and does not
// need to be configured in Vercel when the URL above is filled in.
export const API_URL = GOOGLE_APPS_SCRIPT_URL || import.meta.env.VITE_BOOKING_API_URL || "";
