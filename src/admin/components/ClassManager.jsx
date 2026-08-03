import { useState } from "react";
import { BulkClassEditor } from "./BulkClassEditor.jsx";
import { ClassEditor } from "./ClassEditor.jsx";

const blankOneTime = { className: "", date: "", time: "", instructor: "Sherazade", inPersonCapacity: 10, onlineCapacity: 0, zoomUrl: "", oneTime: true };

export function ClassManager({ classes, templates, isBusy, classView, selectedDate, onClassView, onDate, onCreate, onDelete, onUpdate, onBulkUpdate, onCancelBooking, onCancelClass, dailyBookings = false }) {
  const rules = templates.filter((item) => !item.isOneTime);
  const [mode, setMode] = useState("scheduled");
  const [newClass, setNewClass] = useState({ templateId: rules[0]?.templateId || "", date: "", inPersonCapacity: 10, onlineCapacity: 0, zoomUrl: "", oneTime: false });
  const change = (field, value) => setNewClass((current) => ({ ...current, [field]: value }));
  function chooseMode(next) { setMode(next); setNewClass(next === "oneTime" ? blankOneTime : { templateId: rules[0]?.templateId || "", date: "", inPersonCapacity: 10, onlineCapacity: 0, zoomUrl: "", oneTime: false }); }
  function submitNewClass(event) { event.preventDefault(); onCreate(newClass); }
  return <section className="admin-panel" aria-labelledby="classes-admin-title">
    <div className="admin-panel__head"><div><p className="eyebrow">{dailyBookings ? "Daily booking list" : "Dated sessions"}</p><h2 id="classes-admin-title">{dailyBookings ? "Who is booked today?" : "Classes and clients"}</h2></div></div>
    <div className="admin-class-toolbar">{!dailyBookings && <div className="admin-segmented"><button className={classView === "upcoming" ? "active" : ""} type="button" onClick={() => onClassView("upcoming")}>Upcoming</button><button className={classView === "history" ? "active" : ""} type="button" onClick={() => onClassView("history")}>Booking History</button></div>}<label>{dailyBookings ? "Choose booking date" : "Choose an exact date"}<input type="date" value={selectedDate} onChange={(event) => onDate(event.target.value)} /></label>{selectedDate && <button className="button secondary" type="button" onClick={() => onDate("")}>Clear Date</button>}</div>
    {dailyBookings && !selectedDate && <p className="admin-empty">Choose a date above to see every class and the clients booked into it.</p>}
    {!dailyBookings && <><div className="admin-add-choice"><button type="button" className={mode === "scheduled" ? "active" : ""} onClick={() => chooseMode("scheduled")}>Add from weekly schedule</button><button type="button" className={mode === "oneTime" ? "active" : ""} onClick={() => chooseMode("oneTime")}>Add one-time class</button></div><form className="admin-add-class admin-add-class--wide" onSubmit={submitNewClass}>
      {mode === "scheduled" ? <label>Weekly schedule rule<select value={newClass.templateId} onChange={(event) => change("templateId", event.target.value)} required>{rules.map((rule) => <option value={rule.templateId} key={rule.templateId}>{rule.className} — {rule.day} · {rule.time}</option>)}</select></label> : <><label>Class name<input value={newClass.className} onChange={(event) => change("className", event.target.value)} required /></label><label>Time<input value={newClass.time} onChange={(event) => change("time", event.target.value)} placeholder="6:00 PM – 7:00 PM" required /></label><label>Instructor<input value={newClass.instructor} onChange={(event) => change("instructor", event.target.value)} required /></label></>}
      <label>Date<input type="date" value={newClass.date} onChange={(event) => change("date", event.target.value)} required /></label><label>In-person capacity<input type="number" min="0" value={newClass.inPersonCapacity} onChange={(event) => change("inPersonCapacity", event.target.value)} required /></label><label>Online capacity<input type="number" min="0" value={newClass.onlineCapacity} onChange={(event) => change("onlineCapacity", event.target.value)} required /></label><label>Zoom link<input type="url" value={newClass.zoomUrl} onChange={(event) => change("zoomUrl", event.target.value)} placeholder="https://zoom.us/..." /></label><button className="button gold" type="submit" disabled={isBusy}>Add Class</button>
    </form><BulkClassEditor rules={rules} isBusy={isBusy} onApply={onBulkUpdate} /></>}
    <div className="admin-class-list" hidden={dailyBookings && !selectedDate}>{classes.length === 0 && <p className="admin-empty">No {dailyBookings ? "classes" : classView === "history" ? "past" : "upcoming"} classes match this date.</p>}{classes.map((classItem) => <ClassEditor classItem={classItem} isBusy={isBusy} key={classItem.classId} onUpdate={onUpdate} onDelete={onDelete} onCancelBooking={onCancelBooking} onCancelClass={onCancelClass} dailyBookings={dailyBookings} />)}</div>
  </section>;
}
