import { useState } from "react";

export function ClassEditor({ classItem, isBusy, onUpdate, onDelete, onCancelBooking, dailyBookings = false }) {
  const [date, setDate] = useState(classItem.date);
  const [capacity, setCapacity] = useState(classItem.capacity);
  const activeBookings = classItem.bookings.filter((booking) => booking.status === "Active");
  const cancelledCount = classItem.bookings.length - activeBookings.length;

  return (
    <article className="admin-class-card">
      <div className="admin-class-card__title">
        <div><h3>{classItem.className}</h3><p>{classItem.day} · {classItem.time} · {classItem.instructor}</p></div>
        <strong>{classItem.bookedCount}/{classItem.capacity} booked</strong>
      </div>
      <div className="admin-class-card__controls">
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Capacity<input type="number" min={classItem.bookedCount || 1} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
        <button className="button secondary" type="button" disabled={isBusy} onClick={() => onUpdate({ classId: classItem.classId, date, capacity })}>Save Changes</button>
        <button className="admin-danger" type="button" disabled={isBusy || activeBookings.length > 0} onClick={() => onDelete(classItem.classId)}>Delete Class</button>
      </div>
      <details className="admin-bookings" open={dailyBookings}>
        <summary>{activeBookings.length} active · {cancelledCount} cancelled</summary>
        {classItem.bookings.length === 0 ? <p>No bookings.</p> : (
          <div className="admin-booking-table" role="table" aria-label={`Bookings for ${classItem.className} on ${classItem.date}`}>
            {classItem.bookings.map((booking) => (
              <div className="admin-booking-row" role="row" key={booking.bookingId}>
                <span role="cell"><strong>{booking.firstName} {booking.lastName}</strong><small>{booking.email}</small></span>
                <span role="cell"><small>{booking.status} · Booked {booking.timestamp}</small></span>
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
