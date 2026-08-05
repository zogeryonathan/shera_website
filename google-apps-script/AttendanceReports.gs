/** Builds an attendance report from past active bookings in a date range. */
function attendanceReport_(request, spreadsheet) {
  const start = date_(request.startDate);
  const end = date_(request.endDate);
  if (!start || !end || end.getTime() < start.getTime()) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a valid start and end date." });
  const classes = Array.from(classMap_(spreadsheet).values());
  const bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS));
  // Index bookings once. Filtering the complete Bookings sheet for every class
  // becomes noticeably slow as the studio grows and can hit Apps Script's
  // execution limit.
  const bookingsByClass = {};
  bookings.forEach(function (booking) {
    if (!active_(booking)) return;
    const classId = String(booking.ClassID || "");
    if (!classId) return;
    (bookingsByClass[classId] || (bookingsByClass[classId] = [])).push(booking);
  });
  const timezone = spreadsheet.getSpreadsheetTimeZone();
  const rows = [];
  const now = Date.now();
  classes.forEach(function (classData) {
    const classDate = date_(classData.date);
    if (!classDate || classDate < start || classDate > end || classData.status === "Cancelled" || classStart_(classData).getTime() > now) return;
    (bookingsByClass[classData.classId] || []).forEach(function (booking) {
      rows.push({
        clientName: String(booking.FirstName || "") + " " + String(booking.LastName || ""),
        email: String(booking.Email || ""),
        className: classData.className,
        date: iso_(classData.date, timezone),
        time: classData.time,
        attendanceType: attendance_(booking.AttendanceType) || "In person",
        classId: classData.classId,
      });
    });
  });
  rows.sort(function (a, b) { return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.clientName.localeCompare(b.clientName); });
  const uniqueClients = {};
  rows.forEach(function (row) { uniqueClients[(row.email || row.clientName).toLowerCase()] = true; });
  return response_({ success: true, report: { startDate: iso_(start, timezone), endDate: iso_(end, timezone), totalClients: Object.keys(uniqueClients).length, totalAttendanceRecords: rows.length, rows: rows } });
}
