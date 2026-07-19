import { useState } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function TemplateEditor({ template, isBusy, onUpdate }) {
  const [form, setForm] = useState(template);
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  return (
    <form className="admin-template-card" onSubmit={(event) => { event.preventDefault(); onUpdate(form); }}>
      <label>Class Name<input name="className" value={form.className} onChange={change} required /></label>
      <label>Day<select name="day" value={form.day} onChange={change}>{DAYS.map((day) => <option key={day}>{day}</option>)}</select></label>
      <label>Time<input name="time" value={form.time} onChange={change} required /></label>
      <label>Instructor<input name="instructor" value={form.instructor} onChange={change} required /></label>
      <label>Default Capacity<input name="capacity" type="number" min="1" value={form.capacity} onChange={change} required /></label>
      <button className="button secondary" type="submit" disabled={isBusy}>Save Template</button>
    </form>
  );
}
