const LATEST_BOOKING_KEY = "shera-latest-booking";

export function getLatestBooking() {
  try {
    const value = window.localStorage.getItem(LATEST_BOOKING_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function saveLatestBooking(booking) {
  try {
    window.localStorage.setItem(LATEST_BOOKING_KEY, JSON.stringify(booking));
  } catch {
    // The cancellation form still works if browser storage is unavailable.
  }
}

export function clearLatestBooking(bookingId) {
  const current = getLatestBooking();
  if (!current || current.bookingId === bookingId) {
    try {
      window.localStorage.removeItem(LATEST_BOOKING_KEY);
    } catch {
      // Storage can be blocked in private browsing; the cancellation still succeeded.
    }
  }
}
