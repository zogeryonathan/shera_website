import { useMemo, useState } from "react";

export function BulkClassEditor({ templates, isBusy, onApply }) {
  const [form, setForm] = useState({ templateId: "", startDate: "", endDate: "", inPersonCapacity: "", onlineCapacity: "", updateZoom: false, zoomUrl: "" });
  const [error, setError] = useState("");
  const templateOptions = useMemo(() => templates.slice().sort((a, b) => a.className.localeCompare(b.className)), [templates]);
  const update = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setError(""); };

  function submit(event) {
    event.preventDefault();
    if (!form.startDate || !form.endDate) return setError("Choose a start date and end date.");
    if (form.endDate < form.startDate) return setError("The end date must be after the start date.");
    if (form.inPersonCapacity === "" && form.onlineCapacity === "" && !form.updateZoom) return setError("Enter a capacity or choose Replace Zoom link.");
    if (form.updateZoom && !form.zoomUrl.trim()) return setError("Paste the Zoom link you want to use.");
    if (!window.confirm("Apply these changes to every matching future class? This cannot be undone automatically.")) return;
    onApply({ ...form, zoomUrl: form.zoomUrl.trim() });
  }

  return (
    <form className="admin-bulk-editor" onSubmit={submit}>
      <div className="admin-bulk-editor__head">
        <div><p className="eyebrow">Bulk update</p><h3>Update existing future classes</h3></div>
        <p>Leave a capacity blank to keep its current value. Existing bookings are always protected.</p>
      </div>
      <label>Apply to<select value={form.templateId} onChange={(event) => update("templateId", event.target.value)}><option value="">All class types</option>{templateOptions.map((template) => <option key={template.templateId} value={template.templateId}>{template.className} — {template.day} · {template.time}</option>)}</select></label>
      <label>From date<input type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} required /></label>
      <label>To date<input type="date" value={form.endDate} onChange={(event) => update("endDate", event.target.value)} required /></label>
      <label>In-person capacity <small>Optional</small><input type="number" min="0" value={form.inPersonCapacity} onChange={(event) => update("inPersonCapacity", event.target.value)} placeholder="Keep current" /></label>
      <label>Online capacity <small>Optional</small><input type="number" min="0" value={form.onlineCapacity} onChange={(event) => update("onlineCapacity", event.target.value)} placeholder="Keep current" /></label>
      <label className="admin-bulk-editor__zoom-toggle"><input type="checkbox" checked={form.updateZoom} onChange={(event) => update("updateZoom", event.target.checked)} /> Replace Zoom link</label>
      {form.updateZoom && <label>New Zoom link<input type="url" value={form.zoomUrl} onChange={(event) => update("zoomUrl", event.target.value)} placeholder="https://zoom.us/..." required /></label>}
      {error && <p className="admin-bulk-editor__error" role="alert">{error}</p>}
      <button className="button gold" type="submit" disabled={isBusy}>Apply Bulk Changes</button>
    </form>
  );
}
