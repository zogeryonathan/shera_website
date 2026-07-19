import { TemplateEditor } from "./TemplateEditor.jsx";

export function ScheduleManager({ templates, isBusy, onUpdate, onGenerate }) {
  return (
    <section className="admin-panel" aria-labelledby="schedule-admin-title">
      <div className="admin-panel__head">
        <div><p className="eyebrow">Repeating templates</p><h2 id="schedule-admin-title">Weekly schedule</h2></div>
        <button className="button secondary" type="button" disabled={isBusy} onClick={onGenerate}>Generate Missing Classes</button>
      </div>
      <p className="admin-help">Template name, time and instructor changes appear on linked classes. After changing a weekday, generate missing classes and review old dated sessions in the Classes tab.</p>
      <div className="admin-template-list">
        {templates.map((template) => <TemplateEditor template={template} isBusy={isBusy} onUpdate={onUpdate}
          key={`${template.templateId}-${template.day}-${template.time}-${template.capacity}`} />)}
      </div>
    </section>
  );
}
