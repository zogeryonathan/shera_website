import { useState } from "react";

function localDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function AttendanceReport({ report, isBusy, onLoad }) {
  const today = new Date();
  const [range, setRange] = useState({ startDate: localDateInput(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: localDateInput(today) });

  function submit(event) {
    event.preventDefault();
    onLoad(range);
  }

  function exportCsv() {
    if (!report?.rows?.length) return;
    const header = ["Client Name", "Email", "Class Attended", "Attendance Date", "Time", "Attendance Type"];
    const lines = [header, ...report.rows.map((row) => [row.clientName, row.email, row.className, row.date, row.time, row.attendanceType])];
    const csv = "\ufeff" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `shera-attendance-${report.startDate}-to-${report.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section className="admin-panel attendance-report" aria-labelledby="attendance-report-title">
    <div className="admin-panel__head"><div><p className="eyebrow">Past active bookings</p><h2 id="attendance-report-title">Attendance report</h2></div></div>
    <p className="admin-help">Past active bookings count as attended because the client’s session was used when the booking was made. Cancelled and rescheduled bookings are excluded.</p>
    <form className="attendance-report__filters" onSubmit={submit}>
      <label>Start date<input type="date" value={range.startDate} onChange={(event) => setRange({ ...range, startDate: event.target.value })} required /></label>
      <label>End date<input type="date" value={range.endDate} onChange={(event) => setRange({ ...range, endDate: event.target.value })} required /></label>
      <button className="button gold" type="submit" disabled={isBusy}>Generate report</button>
    </form>
    {report && <>
      <div className="attendance-report__summary"><div><strong>{report.totalClients}</strong><span>Total clients</span></div><div><strong>{report.totalAttendanceRecords}</strong><span>Class attendances</span></div><button className="button secondary" type="button" onClick={exportCsv} disabled={!report.rows.length}>Export CSV for Excel</button></div>
      {report.rows.length ? <div className="attendance-report__table" role="table" aria-label="Attendance results"><div className="attendance-report__row attendance-report__row--head" role="row"><strong>Client</strong><strong>Class</strong><strong>Date</strong><strong>Attendance</strong></div>{report.rows.map((row, index) => <div className="attendance-report__row" role="row" key={`${row.classId}-${row.email}-${index}`}><span><strong>{row.clientName}</strong><small>{row.email}</small></span><span>{row.className}<small>{row.time}</small></span><span>{row.date}</span><span>{row.attendanceType}</span></div>)}</div> : <p className="admin-empty">No attended classes were found in this date range.</p>}
    </>}
  </section>;
}
