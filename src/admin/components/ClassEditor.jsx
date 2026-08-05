import { useState } from "react";

export function ClassEditor({ classItem, rescheduleClasses = [], isBusy, onUpdate, onDelete, onCancelBooking, onCancelClass, onRescheduleBooking, onSendAnnouncement, dailyBookings = false }) {
  const [date, setDate] = useState(classItem.date);
  const [className, setClassName] = useState(classItem.className);
  const [time, setTime] = useState(classItem.time);
  const [instructor, setInstructor] = useState(classItem.instructor);
  const [inPersonCapacity, setInPersonCapacity] = useState(classItem.inPersonCapacity ?? classItem.capacity);
  const [onlineCapacity, setOnlineCapacity] = useState(classItem.onlineCapacity ?? 0);
  const [zoomUrl, setZoomUrl] = useState(classItem.zoomUrl ?? "");
  const [moves, setMoves] = useState({});
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [announcement, setAnnouncement] = useState({ subject: "", message: "" });
  const activeBookings = classItem.bookings.filter((booking) => booking.status === "Active");
  const cancelledCount = classItem.bookings.length - activeBookings.length;
  const setMove = (bookingId, field, value) => setMoves((current) => ({ ...current, [bookingId]: { attendanceType: "In person", ...current[bookingId], [field]: value } }));
  function sendAnnouncement(event) {
    event.preventDefault();
    const subject = announcement.subject.trim();
    const message = announcement.message.trim();
    if (!subject || !message || activeBookings.length === 0) return;
    if (!window.confirm(`Send this email to ${activeBookings.length} active participant${activeBookings.length === 1 ? "" : "s"}?`)) return;
    onSendAnnouncement({ classId: classItem.classId, subject, message });
    setAnnouncement({ subject: "", message: "" });
    setShowAnnouncement(false);
  }

  return (
    <article className="admin-class-card">
      <div className="admin-class-card__title">
        <div><h3>{classItem.className}</h3><p>{classItem.day} - {classItem.time} - {classItem.instructor}</p></div>
        <strong>{classItem.inPersonBooked}/{classItem.inPersonCapacity} in person - {classItem.onlineBooked}/{classItem.onlineCapacity} online</strong>
      </div>
      <div className="admin-class-card__controls">
        <label>Class name<input value={className} onChange={(event) => setClassName(event.target.value)} /></label>
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Time<input value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label>Instructor<input value={instructor} onChange={(event) => setInstructor(event.target.value)} /></label>
        <label>In-person capacity<input type="number" min={classItem.inPersonBooked || 0} value={inPersonCapacity} onChange={(event) => setInPersonCapacity(event.target.value)} /></label>
        <label>Online capacity<input type="number" min={classItem.onlineBooked || 0} value={onlineCapacity} onChange={(event) => setOnlineCapacity(event.target.value)} /></label>
        <label>Zoom link<input type="url" value={zoomUrl} onChange={(event) => setZoomUrl(event.target.value)} placeholder="https://zoom.us/..." /></label>
        <button className="button secondary" type="button" disabled={isBusy} onClick={() => onUpdate({ classId: classItem.classId, date, inPersonCapacity, onlineCapacity, zoomUrl, className, time, instructor })}>Save Changes</button>
        {classItem.status !== "Cancelled" && <button className="admin-danger" type="button" disabled={isBusy} onClick={() => onCancelClass(classItem.classId)}>Cancel Class</button>}
        <button className="admin-danger" type="button" disabled={isBusy || activeBookings.length > 0} onClick={() => onDelete(classItem.classId)}>Delete Class</button>
      </div>
      <section className="admin-announcement" aria-label={`Announcement for ${classItem.className}`}>
        <div className="admin-announcement__head"><div><strong>Class announcement</strong><span>{activeBookings.length} active participant{activeBookings.length === 1 ? "" : "s"} will receive an individual email.</span></div><button className="button secondary" type="button" disabled={isBusy || activeBookings.length === 0} onClick={() => setShowAnnouncement((current) => !current)}>{showAnnouncement ? "Close announcement" : "Send announcement"}</button></div>
        {activeBookings.length === 0 && <p>No active participants are currently booked into this class.</p>}
        {showAnnouncement && <form className="admin-announcement__form" onSubmit={sendAnnouncement}><p><strong>{classItem.className}</strong><br />{classItem.date} · {classItem.time}</p><label>Email subject<input value={announcement.subject} onChange={(event) => setAnnouncement((current) => ({ ...current, subject: event.target.value }))} maxLength="160" required disabled={isBusy} placeholder="Important update about your class" /></label><label>Message<textarea value={announcement.message} onChange={(event) => setAnnouncement((current) => ({ ...current, message: event.target.value }))} maxLength="2500" required disabled={isBusy} placeholder="Write the message for everyone booked into this class." /></label><div className="admin-announcement__actions"><button className="button secondary" type="button" disabled={isBusy} onClick={() => setShowAnnouncement(false)}>Cancel</button><button className="button gold" type="submit" disabled={isBusy}>Send to {activeBookings.length} participant{activeBookings.length === 1 ? "" : "s"}</button></div></form>}
      </section>
      <details className="admin-bookings" open={dailyBookings}>
        <summary>{activeBookings.length} active - {cancelledCount} cancelled</summary>
        {classItem.bookings.length === 0 ? <p>No bookings.</p> : (
          <div className="admin-booking-table" role="table" aria-label={`Bookings for ${classItem.className} on ${classItem.date}`}>
            {classItem.bookings.map((booking) => {
              const move = moves[booking.bookingId] || { attendanceType: booking.attendanceType };
              const options = rescheduleClasses.filter((item) => !item.isPast && item.status !== "Cancelled" && item.classId !== classItem.classId && (Number(item.inPersonCapacity) > Number(item.inPersonBooked) || Number(item.onlineCapacity) > Number(item.onlineBooked)));
              const target = options.find((item) => item.classId === move.classId);
              return <div className="admin-booking-row" role="row" key={booking.bookingId}>
                <span role="cell"><strong>{booking.firstName} {booking.lastName}</strong><small>{booking.email} - {booking.attendanceType}</small>{booking.clientNote && <small>Note: {booking.clientNote}</small>}</span>
                <span role="cell"><small>{booking.status} - Booked {booking.timestamp}{booking.remainingSessions !== null && ` - ${booking.remainingSessions} sessions left`}</small></span>
                {booking.status === "Active" ? <span className="admin-booking-row__actions" role="cell"><button className="admin-danger" type="button" disabled={isBusy} onClick={() => onCancelBooking(booking.bookingId)}>Cancel Booking</button><details className="admin-reschedule"><summary>Reschedule</summary><label>New class<select value={move.classId || ""} onChange={(event) => setMove(booking.bookingId, "classId", event.target.value)} disabled={isBusy}><option value="">Choose a new class</option>{options.map((item) => <option key={item.classId} value={item.classId}>{item.date} - {item.time} - {item.className}</option>)}</select></label><label>Attendance<select value={move.attendanceType || booking.attendanceType} onChange={(event) => setMove(booking.bookingId, "attendanceType", event.target.value)} disabled={isBusy || !target}><option value="In person" disabled={target && Number(target.inPersonCapacity) <= Number(target.inPersonBooked)}>In person{target ? ` (${Number(target.inPersonCapacity) - Number(target.inPersonBooked)} left)` : ""}</option><option value="Online" disabled={target && Number(target.onlineCapacity) <= Number(target.onlineBooked)}>Online{target ? ` (${Number(target.onlineCapacity) - Number(target.onlineBooked)} left)` : ""}</option></select></label><button className="button gold" type="button" disabled={isBusy || !move.classId} onClick={() => onRescheduleBooking({ bookingId: booking.bookingId, classId: move.classId, attendanceType: move.attendanceType || booking.attendanceType })}>Confirm Reschedule</button></details></span> : <span className="admin-cancelled" role="cell">{booking.status}</span>}
              </div>;
            })}
          </div>
        )}
      </details>
    </article>
  );
}
