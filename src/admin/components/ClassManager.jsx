import { useState } from "react";
import { ClassEditor } from "./ClassEditor.jsx";

export function ClassManager({ classes, templates, isBusy, onCreate, onDelete, onUpdate, onCancelBooking }) {
  const [newClass, setNewClass] = useState({ templateId: templates[0]?.templateId || "", date: "", capacity: 10 });

  function submitNewClass(event) {
    event.preventDefault();
    onCreate(newClass);
  }

  return (
    <section className="admin-panel" aria-labelledby="classes-admin-title">
      <div className="admin-panel__head"><div><p className="eyebrow">Dated sessions</p><h2 id="classes-admin-title">Classes and clients</h2></div></div>
      <form className="admin-add-class" onSubmit={submitNewClass}>
        <label>Class<select value={newClass.templateId} onChange={(event) => setNewClass({ ...newClass, templateId: event.target.value })} required>
          {templates.map((template) => <option value={template.templateId} key={template.templateId}>{template.className} — {template.day}</option>)}
        </select></label>
        <label>Date<input type="date" value={newClass.date} onChange={(event) => setNewClass({ ...newClass, date: event.target.value })} required /></label>
        <label>Capacity<input type="number" min="1" value={newClass.capacity} onChange={(event) => setNewClass({ ...newClass, capacity: event.target.value })} required /></label>
        <button className="button gold" type="submit" disabled={isBusy}>Add Class</button>
      </form>

      <div className="admin-class-list">
        {classes.map((classItem) => (
          <ClassEditor classItem={classItem} isBusy={isBusy} key={`${classItem.classId}-${classItem.date}-${classItem.capacity}`}
            onUpdate={onUpdate} onDelete={onDelete} onCancelBooking={onCancelBooking} />
        ))}
      </div>
    </section>
  );
}
