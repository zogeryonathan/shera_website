// Create a Google OAuth Web Client and paste its Client ID here.
// The same value must be saved as ADMIN_GOOGLE_CLIENT_ID in Apps Script Script properties.
const GOOGLE_CLIENT_ID = "437013423750-b649n27umu0lqe13cgmn6hide6446nub.apps.googleusercontent.com";

export const ADMIN_GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID || import.meta.env.VITE_ADMIN_GOOGLE_CLIENT_ID || "";
