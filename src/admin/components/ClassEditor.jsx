import { useState } from "react";

export function ClassEditor({ classItem, isBusy, onUpdate, onDelete, onCancelBooking, onCancelClass, dailyBookings = false }) {
  const [date, setDate] = useState(classItem.date);
  const [inPersonCapacity, setInPersonCapacity] = useState(classItem.inPersonCapacity ?? classItem.capacity);
  const [onlineCapacity, setOnlineCapacity] = useState(classItem.onlineCapacity ?? 0);
  const [zoomUrl, setZoomUrl] = useState(classItem.zoomUrl ?? "");
  const activeBookings = classItem.bookings.filter((booking) => booking.status === "Active");
  const cancelledCount = classItem.bookings.length - activeBookings.length;

  return (
    <article className="admin-class-card">
      <div className="admin-class-card__title">
        <div><h3>{classItem.className}</h3><p>{classItem.day} · {classItem.time} · {classItem.instructor}</p></div>
        <strong>{classItem.inPersonBooked}/{classItem.inPersonCapacity} in person · {classItem.onlineBooked}/{classItem.onlineCapacity} online</strong>
      </div>
      <div className="admin-class-card__controls">
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>In-person capacity<input type="number" min={classItem.inPersonBooked || 0} value={inPersonCapacity} onChange={(event) => setInPersonCapacity(event.target.value)} /></label>
        <label>Online capacity<input type="number" min={classItem.onlineBooked || 0} value={onlineCapacity} onChange={(event) => setOnlineCapacity(event.target.value)} /></label>
        <label>Zoom link<input type="url" value={zoomUrl} onChange={(event) => setZoomUrl(event.target.value)} placeholder="https://zoom.us/..." /></label>
        <button className="button secondary" type="button" disabled={isBusy} onClick={() => onUpdate({ classId: classItem.classId, date, inPersonCapacity, onlineCapacity, zoomUrl, className: classItem.className, time: classItem.time, instructor: classItem.instructor })}>Save Changes</button>
        {classItem.status !== "Cancelled" && <button className="admin-danger" type="button" disabled={isBusy} onClick={() => onCancelClass(classItem.classId)}>Cancel Class</button>}
        <button className="admin-danger" type="button" disabled={isBusy || activeBookings.length > 0} onClick={() => onDelete(classItem.classId)}>Delete Class</button>
      </div>
      <details className="admin-bookings" open={dailyBookings}>
        <summary>{activeBookings.length} active · {cancelledCount} cancelled</summary>
        {classItem.bookings.length === 0 ? <p>No bookings.</p> : (
          <div className="admin-booking-table" role="table" aria-label={`Bookings for ${classItem.className} on ${classItem.date}`}>
            {classItem.bookings.map((booking) => (
              <div className="admin-booking-row" role="row" key={booking.bookingId}>
                <span role="cell"><strong>{booking.firstName} {booking.lastName}</strong><small>{booking.email} · {booking.attendanceType}</small>{booking.clientNote && <small>Note: {booking.clientNote}</small>}</span>
                <span role="cell"><small>{booking.status} · Booked {booking.timestamp}{booking.remainingSessions !== null && ` · ${booking.remainingSessions} sessions left`}</small></span>
                {booking.status === "Active" ? (
                  <button className="admin-danger" type="button" disabled={isBusy} onClick={() => onCancelBooking(booking.bookingId)}>Cancel Booking</button>
                ) : <span className="admin-cancelled" role="cell">Cancelled</span>}
              </div>
            ))}
          </div>
        )}
      </details>
    </article>
  );
}
