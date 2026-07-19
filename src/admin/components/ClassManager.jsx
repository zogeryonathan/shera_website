import { useState } from "react";
import { ClassEditor } from "./ClassEditor.jsx";

export function ClassManager({ classes, templates, isBusy, classView, selectedDate, onClassView, onDate, onCreate, onDelete, onUpdate, onCancelBooking, dailyBookings = false }) {
  const [newClass, setNewClass] = useState({ templateId: templates[0]?.templateId || "", date: "", capacity: 10 });

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
        <label>Capacity<input type="number" min="1" value={newClass.capacity} onChange={(event) => setNewClass({ ...newClass, capacity: event.target.value })} required /></label>
        <button className="button gold" type="submit" disabled={isBusy}>Add Class</button>
      </form>}

      <div className="admin-class-list" hidden={dailyBookings && !selectedDate}>
        {classes.length === 0 && <p className="admin-empty">No {dailyBookings ? "classes" : classView === "history" ? "past" : "upcoming"} classes match this date.</p>}
        {classes.map((classItem) => (
          <ClassEditor classItem={classItem} isBusy={isBusy} key={`${classItem.classId}-${classItem.date}-${classItem.capacity}`}
            onUpdate={onUpdate} onDelete={onDelete} onCancelBooking={onCancelBooking} dailyBookings={dailyBookings} />
        ))}
      </div>
    </section>
  );
}
