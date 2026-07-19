import { useState } from "react";
import { TemplateEditor } from "./TemplateEditor.jsx";

const emptyTemplate = { className: "", day: "Monday", time: "", instructor: "Sherazade", capacity: 10 };

export function ScheduleManager({ templates, isBusy, onUpdate, onCreate, onGenerate }) {
  const [newTemplate, setNewTemplate] = useState(emptyTemplate);
  const change = (event) => setNewTemplate({ ...newTemplate, [event.target.name]: event.target.value });
  function submit(event) { event.preventDefault(); onCreate(newTemplate); setNewTemplate(emptyTemplate); }
  return (
    <section className="admin-panel" aria-labelledby="schedule-admin-title">
      <div className="admin-panel__head">
        <div><p className="eyebrow">Repeating templates</p><h2 id="schedule-admin-title">Weekly schedule</h2></div>
        <button className="button secondary" type="button" disabled={isBusy} onClick={onGenerate}>Generate Missing Classes</button>
      </div>
      <p className="admin-help">Use this area for your repeating weekly schedule. Change a class name, day, time, instructor, or capacity here. Then choose “Generate Missing Classes” to add future dates automatically.</p>
      <form className="admin-template-card admin-template-card--new" onSubmit={submit}>
        <label>New class name<input name="className" value={newTemplate.className} onChange={change} placeholder="Example: Gentle Pilates" required /></label>
        <label>Day<select name="day" value={newTemplate.day} onChange={change}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => <option key={day}>{day}</option>)}</select></label>
        <label>Time<input name="time" value={newTemplate.time} onChange={change} placeholder="6:00 PM – 7:00 PM" required /></label>
        <label>Instructor<input name="instructor" value={newTemplate.instructor} onChange={change} required /></label>
        <label>Capacity<input name="capacity" type="number" min="1" value={newTemplate.capacity} onChange={change} required /></label>
        <button className="button gold" type="submit" disabled={isBusy}>Add Weekly Class</button>
      </form>
      <div className="admin-template-list">
        {templates.map((template) => <TemplateEditor template={template} isBusy={isBusy} onUpdate={onUpdate}
          key={`${template.templateId}-${template.day}-${template.time}-${template.capacity}`} />)}
      </div>
    </section>
  );
}
