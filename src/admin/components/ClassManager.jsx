import { useState } from "react";
import { BulkClassEditor } from "./BulkClassEditor.jsx";
import { ClassEditor } from "./ClassEditor.jsx";

export function ClassManager({ classes, templates, isBusy, classView, selectedDate, onClassView, onDate, onCreate, onDelete, onUpdate, onBulkUpdate, onCancelBooking, onCancelClass, dailyBookings = false }) {
  const [newClass, setNewClass] = useState({ templateId: templates[0]?.templateId || "", date: "", inPersonCapacity: 10, onlineCapacity: 0, zoomUrl: "" });

  function submitNewClass(event) {
    event.preventDefault();
    onCreate(newClass);
  }

  return (
    <section className="admin-panel" aria-labelledby="classes-admin-title">
      <div className="admin-panel__head"><div><p className="eyebrow">{dailyBookings ? "Daily booking list" : "Dated sessions"}</p><h2 id="classes-admin-title">{dailyBookings ? "Who is booked today?" : "Classes and clients"}</h2></div></div>
      <div className="admin-class-toolbar">
        {!dailyBookings && <div className="admin-segmented" role="group" aria-label="Class timeframe">
          <button className={classView === "upcoming" ? "active" : ""} type="button" onClick={() => onClassView("upcoming")}>Upcoming</button>
          <button className={classView === "history" ? "active" : ""} type="button" onClick={() => onClassView("history")}>Booking History</button>
        </div>}
        <label>{dailyBookings ? "Choose booking date" : "Choose an exact date"}<input type="date" value={selectedDate} onChange={(event) => onDate(event.target.value)} /></label>
        {selectedDate && <button className="button secondary" type="button" onClick={() => onDate("")}>Clear Date</button>}
      </div>
      {dailyBookings && !selectedDate && <p className="admin-empty">Choose a date above to see every class and the clients booked into it.</p>}
      {!dailyBookings && <form className="admin-add-class" onSubmit={submitNewClass}>
        <label>Class<select value={newClass.templateId} onChange={(event) => setNewClass({ ...newClass, templateId: event.target.value })} required>
          {templates.map((template) => <option value={template.templateId} key={template.templateId}>{template.className} — {template.day}</option>)}
        </select></label>
        <label>Date<input type="date" value={newClass.date} onChange={(event) => setNewClass({ ...newClass, date: event.target.value })} required /></label>
        <label>In-person capacity<input type="number" min="0" value={newClass.inPersonCapacity} onChange={(event) => setNewClass({ ...newClass, inPersonCapacity: event.target.value })} required /></label>
        <label>Online capacity<input type="number" min="0" value={newClass.onlineCapacity} onChange={(event) => setNewClass({ ...newClass, onlineCapacity: event.target.value })} required /></label>
        <label>Zoom link<input type="url" value={newClass.zoomUrl} onChange={(event) => setNewClass({ ...newClass, zoomUrl: event.target.value })} placeholder="https://zoom.us/..." /></label>
        <button className="button gold" type="submit" disabled={isBusy}>Add Class</button>
      </form>}

      {!dailyBookings && <BulkClassEditor templates={templates} isBusy={isBusy} onApply={onBulkUpdate} />}

      <div className="admin-class-list" hidden={dailyBookings && !selectedDate}>
        {classes.length === 0 && <p className="admin-empty">No {dailyBookings ? "classes" : classView === "history" ? "past" : "upcoming"} classes match this date.</p>}
        {classes.map((classItem) => (
          <ClassEditor classItem={classItem} isBusy={isBusy} key={`${classItem.classId}-${classItem.date}-${classItem.capacity}`}
            onUpdate={onUpdate} onDelete={onDelete} onCancelBooking={onCancelBooking} onCancelClass={onCancelClass} dailyBookings={dailyBookings} />
        ))}
      </div>
    </section>
  );
}
