export function StatusMessage({ status }) {
  if (!status) {
    return null;
  }

  return (
    <div className={`booking-status booking-status--${status.type}`} role="status" aria-live="polite">
      {status.message}
    </div>
  );
}

