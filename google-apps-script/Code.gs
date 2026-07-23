/** Shera Studio secure booking backend. Bind this script to the studio Sheet. */
const SHEET_NAMES = Object.freeze({ TEMPLATES: "Templates", CLASSES: "Classes", BOOKINGS: "Bookings", CLIENTS: "Clients", HISTORY: "Session History", VERIFICATION: "Client Verification" });
const HEADERS = Object.freeze({
  Templates: ["TemplateID", "Day", "Time", "ClassName", "Instructor", "Capacity", "InPersonCapacity", "OnlineCapacity", "ZoomUrl"],
  Classes: ["ClassID", "TemplateID", "Date", "Capacity", "InPersonCapacity", "OnlineCapacity", "ZoomUrl", "Status", "ClassNameOverride", "TimeOverride", "InstructorOverride"],
  Bookings: ["BookingID", "ClassID", "FirstName", "LastName", "Email", "Timestamp", "Status", "CancelCode", "CancelledAt", "AttendanceType", "ClientNote", "ClientID", "SessionTransactionID", "CancellationSource", "EmailStatus"],
  Clients: ["ClientID", "FirstName", "LastName", "Email", "SessionsPurchased", "SessionsRemaining", "CreatedAt", "UpdatedAt"],
  "Session History": ["TransactionID", "ClientID", "Type", "Amount", "BalanceAfter", "ClassID", "Note", "CreatedAt", "AdminEmail"],
  "Client Verification": ["VerificationID", "ClientID", "RecordType", "SecretHash", "ExpiresAt", "Attempts", "UsedAt", "CreatedAt"]
});
const DEFAULT_WEEKS_TO_GENERATE = 12;
const VERIFICATION_MINUTES = 30;
const MAX_CODE_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doGet() {
  try { const spreadsheet = getSpreadsheet_(); ensureSchema_(spreadsheet); return response_({ success: true, classes: getUpcomingClasses_(spreadsheet) }); }
  catch (error) { console.error(error); return response_({ success: false, code: "SERVER_ERROR", message: "The class schedule could not be loaded." }); }
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const request = requestBody_(event); const action = clean_(request.action, 50).toLowerCase();
    const spreadsheet = getSpreadsheet_(); ensureSchema_(spreadsheet);
    if (action.indexOf("admin") === 0) return adminAction_(action, request, spreadsheet);
    if (action === "sendverification") return sendVerification_(request, spreadsheet);
    if (action === "verifycode") return verifyCode_(request, spreadsheet);
    if (action === "clientbookings") return clientBookings_(request, spreadsheet);
    if (action === "book") return book_(request, spreadsheet);
    if (action === "cancelbooking") return cancelForClient_(request, spreadsheet);
    return response_({ success: false, code: "INVALID_ACTION", message: "This booking action is not supported." });
  } catch (error) { console.error(error); return response_({ success: false, code: "SERVER_ERROR", message: "Your request could not be completed. Please try again." }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

/** Run once after replacing the old Code.gs. It preserves existing data. */
function upgradeSecureBookingSystem() { const spreadsheet = getSpreadsheet_(); ensureSchema_(spreadsheet); migrateCapacities_(spreadsheet); styleSheets_(spreadsheet); generateClassesForNextWeeks(DEFAULT_WEEKS_TO_GENERATE); }
function setupBookingSheets() { upgradeSecureBookingSystem(); }

function sendVerification_(request, spreadsheet) {
  const identity = identity_(request); if (!identity.ok) return response_(identity.error);
  const client = findClient_(spreadsheet, identity.value); if (!client) return response_({ success: false, code: "CLIENT_NOT_FOUND", message: "We could not find a studio client with those details. Please contact Shera to register." });
  const code = String(Math.floor(100000 + Math.random() * 900000)); const expires = new Date(Date.now() + VERIFICATION_MINUTES * 60000);
  append_(spreadsheet.getSheetByName(SHEET_NAMES.VERIFICATION), HEADERS["Client Verification"], { VerificationID: Utilities.getUuid(), ClientID: client.ClientID, RecordType: "Code", SecretHash: hash_(code), ExpiresAt: expires, Attempts: 0, UsedAt: "", CreatedAt: new Date() });
  if (!email_(client.Email, "Your Shera Studio verification code", "<p>Your verification code is <strong>" + code + "</strong>.</p><p>It is valid for 30 minutes. Do not share it with anyone.</p>", "Your Shera Studio verification code is " + code + ". It is valid for 30 minutes.")) return response_({ success: false, code: "EMAIL_FAILED", message: "We could not send your code. Please try again or contact Shera." });
  return response_({ success: true, message: "A 6-digit code was sent to your email.", expiresInMinutes: VERIFICATION_MINUTES });
}

function verifyCode_(request, spreadsheet) {
  const identity = identity_(request); const code = clean_(request.code, 6); if (!identity.ok) return response_(identity.error);
  if (!/^\d{6}$/.test(code)) return response_({ success: false, code: "INVALID_CODE", message: "Enter the 6-digit code from your email." });
  const client = findClient_(spreadsheet, identity.value); if (!client) return response_({ success: false, code: "CLIENT_NOT_FOUND", message: "Client not found." });
  const rows = objects_(spreadsheet.getSheetByName(SHEET_NAMES.VERIFICATION)).filter(function (row) { return String(row.ClientID) === String(client.ClientID) && row.RecordType === "Code" && !row.UsedAt; }).sort(function (a, b) { return new Date(b.CreatedAt) - new Date(a.CreatedAt); });
  const record = rows[0]; if (!record || new Date(record.ExpiresAt).getTime() < Date.now()) return response_({ success: false, code: "CODE_EXPIRED", message: "This code has expired. Please request a new one." });
  if (Number(record.Attempts || 0) >= MAX_CODE_ATTEMPTS) return response_({ success: false, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please request a new code." });
  if (String(record.SecretHash) !== hash_(code)) { setByKey_(spreadsheet.getSheetByName(SHEET_NAMES.VERIFICATION), "VerificationID", record.VerificationID, "Attempts", Number(record.Attempts || 0) + 1); return response_({ success: false, code: "INVALID_CODE", message: "That code is not correct. Please try again." }); }
  setByKey_(spreadsheet.getSheetByName(SHEET_NAMES.VERIFICATION), "VerificationID", record.VerificationID, "UsedAt", new Date());
  const token = Utilities.getUuid() + Utilities.getUuid(); const expires = new Date(Date.now() + VERIFICATION_MINUTES * 60000);
  append_(spreadsheet.getSheetByName(SHEET_NAMES.VERIFICATION), HEADERS["Client Verification"], { VerificationID: Utilities.getUuid(), ClientID: client.ClientID, RecordType: "Session", SecretHash: hash_(token), ExpiresAt: expires, Attempts: 0, UsedAt: "", CreatedAt: new Date() });
  return response_({ success: true, message: "You are verified for 30 minutes.", client: publicClient_(client), clientToken: token, expiresAt: expires.toISOString() });
}

function requireClient_(request, spreadsheet) {
  const token = clean_(request.clientToken, 200); if (!token) return { ok: false, error: { success: false, code: "CLIENT_VERIFICATION_REQUIRED", message: "Please verify your email before continuing." } };
  const session = objects_(spreadsheet.getSheetByName(SHEET_NAMES.VERIFICATION)).find(function (row) { return row.RecordType === "Session" && String(row.SecretHash) === hash_(token) && !row.UsedAt && new Date(row.ExpiresAt).getTime() > Date.now(); });
  if (!session) return { ok: false, error: { success: false, code: "CLIENT_SESSION_EXPIRED", message: "Your 30-minute verification has expired. Please verify your email again." } };
  const client = clientById_(spreadsheet, session.ClientID); return client ? { ok: true, client: client } : { ok: false, error: { success: false, code: "CLIENT_NOT_FOUND", message: "Your client profile could not be found." } };
}

function book_(request, spreadsheet) {
  const auth = requireClient_(request, spreadsheet); if (!auth.ok) return response_(auth.error); const client = auth.client;
  const classId = clean_(request.classId, 120); const attendance = attendance_(request.attendanceType); const note = clean_(request.clientNote, 800);
  if (!classId || !attendance) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a class and attendance type." });
  if (Number(client.SessionsRemaining) < 1) return response_({ success: false, code: "NO_SESSIONS", message: "You have no sessions remaining. Please contact Shera to purchase more classes." });
  const classData = classMap_(spreadsheet).get(classId); if (!classData || classData.status === "Cancelled" || classStart_(classData).getTime() <= Date.now()) return response_({ success: false, code: "CLASS_NOT_AVAILABLE", message: "This class is no longer available." });
  const bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS));
  if (bookings.some(function (row) { return String(row.ClassID) === classId && String(row.ClientID) === String(client.ClientID) && active_(row); })) return response_({ success: false, code: "DUPLICATE_BOOKING", message: "You already have a reservation for this class." });
  const capacity = attendance === "Online" ? classData.onlineCapacity : classData.inPersonCapacity;
  const count = bookings.filter(function (row) { return String(row.ClassID) === classId && active_(row) && attendance_(row.AttendanceType) === attendance; }).length;
  if (capacity < 1) return response_({ success: false, code: "ATTENDANCE_NOT_AVAILABLE", message: attendance + " attendance is not available for this class." });
  if (count >= capacity) return response_({ success: false, code: "CLASS_FULL", message: "The " + attendance.toLowerCase() + " spaces for this class are full." });
  const transaction = changeBalance_(spreadsheet, client, -1, "Booking", classId, "Class booking"); const bookingId = Utilities.getUuid();
  append_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS), HEADERS.Bookings, { BookingID: bookingId, ClassID: classId, FirstName: client.FirstName, LastName: client.LastName, Email: client.Email, Timestamp: new Date(), Status: "Active", CancelCode: "", CancelledAt: "", AttendanceType: attendance, ClientNote: note, ClientID: client.ClientID, SessionTransactionID: transaction, CancellationSource: "", EmailStatus: "" });
  const updated = clientById_(spreadsheet, client.ClientID); const sent = bookingEmail_(updated, classData, attendance); setByKey_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS), "BookingID", bookingId, "EmailStatus", sent ? "Booking confirmation sent" : "Booking confirmation failed"); if (Number(updated.SessionsRemaining) === 0) zeroEmail_(updated);
  return response_({ success: true, message: "Your reservation is confirmed.", booking: { bookingId: bookingId, classId: classId, attendanceType: attendance, remainingSessions: Number(updated.SessionsRemaining), remainingSpots: capacity - count - 1 } });
}

function clientBookings_(request, spreadsheet) {
  const auth = requireClient_(request, spreadsheet); if (!auth.ok) return response_(auth.error);
  const classes = classMap_(spreadsheet); const timezone = spreadsheet.getSpreadsheetTimeZone();
  const bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).filter(function (row) { return String(row.ClientID) === String(auth.client.ClientID) && active_(row); }).map(function (row) {
    const classData = classes.get(String(row.ClassID)); if (!classData || classData.status === "Cancelled" || classStart_(classData).getTime() <= Date.now()) return null;
    const cutoff = new Date(classStart_(classData).getTime() - 24 * 60 * 60 * 1000);
    return { bookingId: String(row.BookingID), className: classData.className, date: Utilities.formatDate(classData.date, timezone, "MMMM d"), dateIso: iso_(classData.date, timezone), time: classData.time, attendanceType: attendance_(row.AttendanceType), canCancel: cutoff.getTime() > Date.now(), cancellationCutoff: cutoff.toISOString() };
  }).filter(Boolean);
  return response_({ success: true, client: publicClient_(auth.client), bookings: bookings });
}

function cancelForClient_(request, spreadsheet) {
  const auth = requireClient_(request, spreadsheet); if (!auth.ok) return response_(auth.error);
  return response_(cancelRecord_(spreadsheet, clean_(request.bookingId, 120), "Client", auth.client, false));
}

function cancelRecord_(spreadsheet, bookingId, source, clientRequester, overrideCutoff) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS); const booking = objects_(sheet).find(function (row) { return String(row.BookingID) === bookingId; });
  if (!booking || !active_(booking)) return { success: false, code: "BOOKING_NOT_FOUND", message: "This active booking could not be found." };
  if (clientRequester && String(booking.ClientID) !== String(clientRequester.ClientID)) return { success: false, code: "BOOKING_NOT_FOUND", message: "This reservation is not linked to your account." };
  const classData = classMap_(spreadsheet).get(String(booking.ClassID)); if (!classData) return { success: false, code: "CLASS_NOT_FOUND", message: "The class could not be found." };
  if (!overrideCutoff && classStart_(classData).getTime() - Date.now() <= 24 * 60 * 60 * 1000) return { success: false, code: "CANCELLATION_CUTOFF", message: "Online cancellations close 24 hours before class. Please contact Shera if you need help." };
  setByKey_(sheet, "BookingID", bookingId, "Status", "Cancelled"); setByKey_(sheet, "BookingID", bookingId, "CancelledAt", new Date()); setByKey_(sheet, "BookingID", bookingId, "CancellationSource", source);
  let updated = null; if (booking.ClientID) { const client = clientById_(spreadsheet, booking.ClientID); if (client) { changeBalance_(spreadsheet, client, 1, "Refund", String(booking.ClassID), source + " cancellation refund"); updated = clientById_(spreadsheet, booking.ClientID); } }
  const sent = cancellationEmail_({ FirstName: booking.FirstName, Email: booking.Email }, classData, source, updated); setByKey_(sheet, "BookingID", bookingId, "EmailStatus", sent ? "Cancellation email sent" : "Cancellation email failed");
  return { success: true, message: "The reservation is cancelled and the session has been returned.", cancellation: { bookingId: bookingId, classId: String(booking.ClassID), remainingSessions: updated ? Number(updated.SessionsRemaining) : null } };
}

function adminAction_(action, request, spreadsheet) {
  try { verifyAdmin_(request.credential); } catch (error) { return response_({ success: false, code: "ADMIN_UNAUTHORIZED", message: error.message }); }
  if (action === "admindashboard") return response_({ success: true, dashboard: adminDashboard_(spreadsheet) });
  if (action === "admincreateclient") return createClient_(request, spreadsheet);
  if (action === "adminupdateclient") return updateClient_(request, spreadsheet);
  if (action === "admintopupclient") return topUpClient_(request, spreadsheet);
  if (action === "adminbookforclient") return bookForClientFromAdmin_(request, spreadsheet);
  if (action === "adminupdateclass") return updateClass_(request, spreadsheet);
  if (action === "admincreateclass") return createClass_(request, spreadsheet);
  if (action === "admindeleteclass") return deleteClass_(request, spreadsheet);
  if (action === "admincancelclass") return cancelClass_(request, spreadsheet);
  if (action === "admincancelbooking") return response_(cancelRecord_(spreadsheet, clean_(request.bookingId, 120), "Admin", null, true));
  if (action === "adminupdatetemplate") return updateTemplate_(request, spreadsheet);
  if (action === "admincreatetemplate") return createTemplate_(request, spreadsheet);
  if (action === "admingenerateclasses") return response_({ success: true, message: generateClassesForNextWeeks(DEFAULT_WEEKS_TO_GENERATE) + " class rows were created." });
  return response_({ success: false, code: "INVALID_ACTION", message: "Unknown admin action." });
}

function adminDashboard_(spreadsheet) {
  const timezone = spreadsheet.getSpreadsheetTimeZone(); const clients = objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS)); const clientMap = new Map(clients.map(function (row) { return [String(row.ClientID), row]; })); const bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS));
  const classes = Array.from(classMap_(spreadsheet).values()).map(function (classData) {
    const classBookings = bookings.filter(function (row) { return String(row.ClassID) === classData.classId; }).map(function (row) { const client = clientMap.get(String(row.ClientID)); return { bookingId: String(row.BookingID), firstName: String(row.FirstName), lastName: String(row.LastName), email: String(row.Email), attendanceType: attendance_(row.AttendanceType) || "In person", clientNote: String(row.ClientNote || ""), timestamp: dateTime_(row.Timestamp, timezone), status: active_(row) ? "Active" : String(row.Status || "Cancelled"), remainingSessions: client ? Number(client.SessionsRemaining) : null }; });
    const activeBookings = classBookings.filter(function (row) { return row.status === "Active"; }); const inPersonBooked = activeBookings.filter(function (row) { return row.attendanceType === "In person"; }).length; const onlineBooked = activeBookings.filter(function (row) { return row.attendanceType === "Online"; }).length;
    return { classId: classData.classId, templateId: classData.templateId, className: classData.className, day: Utilities.formatDate(classData.date, timezone, "EEEE"), date: iso_(classData.date, timezone), time: classData.time, instructor: classData.instructor, inPersonCapacity: classData.inPersonCapacity, onlineCapacity: classData.onlineCapacity, inPersonBooked: inPersonBooked, onlineBooked: onlineBooked, capacity: classData.inPersonCapacity, bookedCount: inPersonBooked + onlineBooked, remainingSpots: Math.max(0, classData.inPersonCapacity - inPersonBooked), zoomUrl: classData.zoomUrl, status: classData.status, isPast: classStart_(classData).getTime() < Date.now(), bookings: classBookings };
  }).sort(function (a, b) { return a.date.localeCompare(b.date) || minutes_(a.time) - minutes_(b.time); });
  const templates = objects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES)).map(publicTemplate_);
  const history = objects_(spreadsheet.getSheetByName(SHEET_NAMES.HISTORY)).sort(function (a, b) { return new Date(b.CreatedAt) - new Date(a.CreatedAt); }).slice(0, 500).map(function (row) { return { transactionId: String(row.TransactionID), clientId: String(row.ClientID), type: String(row.Type), amount: Number(row.Amount), balanceAfter: Number(row.BalanceAfter), classId: String(row.ClassID || ""), note: String(row.Note || ""), createdAt: dateTime_(row.CreatedAt, timezone) }; });
  return { classes: classes, templates: templates, clients: clients.map(publicClient_), sessionHistory: history, summary: { upcomingClasses: classes.filter(function (row) { return !row.isPast && row.status !== "Cancelled"; }).length, activeBookings: classes.filter(function (row) { return !row.isPast; }).reduce(function (sum, row) { return sum + row.bookedCount; }, 0), fullClasses: classes.filter(function (row) { return !row.isPast && row.inPersonCapacity && row.inPersonBooked >= row.inPersonCapacity; }).length } };
}

function createClient_(request, spreadsheet) {
  const identity = identity_(request); const sessions = Number(request.sessions);
  if (!identity.ok || !Number.isInteger(sessions) || sessions < 0) return response_({ success: false, code: "VALIDATION_ERROR", message: "Enter client name, email, and a whole number of paid sessions." });
  if (clientByEmail_(spreadsheet, identity.value.email)) return response_({ success: false, code: "CLIENT_EXISTS", message: "A client with this email already exists. Use Add Sessions instead." });
  const clientId = Utilities.getUuid(); const now = new Date(); append_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS), HEADERS.Clients, { ClientID: clientId, FirstName: identity.value.firstName, LastName: identity.value.lastName, Email: identity.value.email, SessionsPurchased: sessions, SessionsRemaining: sessions, CreatedAt: now, UpdatedAt: now });
  if (sessions > 0) history_(spreadsheet, clientId, "Top-up", sessions, sessions, "", "Initial client sessions");
  return response_({ success: true, message: "Client profile created." });
}

function updateClient_(request, spreadsheet) {
  const clientId = clean_(request.clientId, 120); const identity = identity_(request); if (!clientId || !identity.ok) return response_({ success: false, code: "VALIDATION_ERROR", message: "Enter the client name and email." });
  const client = clientById_(spreadsheet, clientId); if (!client) return response_({ success: false, code: "CLIENT_NOT_FOUND", message: "Client not found." }); const other = clientByEmail_(spreadsheet, identity.value.email);
  if (other && String(other.ClientID) !== clientId) return response_({ success: false, code: "CLIENT_EXISTS", message: "Another client already uses this email." });
  setValues_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS), findRow_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS), "ClientID", clientId), { FirstName: identity.value.firstName, LastName: identity.value.lastName, Email: identity.value.email, UpdatedAt: new Date() });
  return response_({ success: true, message: "Client details updated." });
}

function topUpClient_(request, spreadsheet) {
  const client = clientById_(spreadsheet, clean_(request.clientId, 120)); const sessions = Number(request.sessions); if (!client || !Number.isInteger(sessions) || sessions < 1) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a client and enter at least one session." });
  changeBalance_(spreadsheet, client, sessions, "Top-up", "", clean_(request.note, 300) || "Admin session top-up");
  return response_({ success: true, message: sessions + " sessions added to " + client.FirstName + "'s balance." });
}

function bookForClientFromAdmin_(request, spreadsheet) {
  const client = clientById_(spreadsheet, clean_(request.clientId, 120));
  const classId = clean_(request.classId, 120); const attendance = attendance_(request.attendanceType); const note = clean_(request.clientNote, 800);
  if (!client || !classId || !attendance) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a client, class, and attendance type." });
  if (Number(client.SessionsRemaining) < 1) return response_({ success: false, code: "NO_SESSIONS", message: client.FirstName + " has no sessions remaining. Add paid sessions first." });
  const classData = classMap_(spreadsheet).get(classId);
  if (!classData || classData.status === "Cancelled" || classStart_(classData).getTime() <= Date.now()) return response_({ success: false, code: "CLASS_NOT_AVAILABLE", message: "This class is no longer available." });
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS); const bookings = objects_(sheet);
  if (bookings.some(function (row) { return String(row.ClassID) === classId && String(row.ClientID) === String(client.ClientID) && active_(row); })) return response_({ success: false, code: "DUPLICATE_BOOKING", message: "This client already has a reservation for that class." });
  const capacity = attendance === "Online" ? classData.onlineCapacity : classData.inPersonCapacity;
  const booked = bookings.filter(function (row) { return String(row.ClassID) === classId && active_(row) && attendance_(row.AttendanceType) === attendance; }).length;
  if (capacity < 1) return response_({ success: false, code: "ATTENDANCE_NOT_AVAILABLE", message: attendance + " attendance is not available for this class." });
  if (booked >= capacity) return response_({ success: false, code: "CLASS_FULL", message: "The " + attendance.toLowerCase() + " spaces for this class are full." });
  const transaction = changeBalance_(spreadsheet, client, -1, "Admin booking", classId, "Booked by studio owner"); const bookingId = Utilities.getUuid();
  append_(sheet, HEADERS.Bookings, { BookingID: bookingId, ClassID: classId, FirstName: client.FirstName, LastName: client.LastName, Email: client.Email, Timestamp: new Date(), Status: "Active", CancelCode: "", CancelledAt: "", AttendanceType: attendance, ClientNote: note, ClientID: client.ClientID, SessionTransactionID: transaction, CancellationSource: "", EmailStatus: "" });
  const updated = clientById_(spreadsheet, client.ClientID); const sent = bookingEmail_(updated, classData, attendance); setByKey_(sheet, "BookingID", bookingId, "EmailStatus", sent ? "Booking confirmation sent" : "Booking confirmation failed"); if (Number(updated.SessionsRemaining) === 0) zeroEmail_(updated);
  return response_({ success: true, message: client.FirstName + " is booked and their balance is now " + updated.SessionsRemaining + "." });
}

function updateClass_(request, spreadsheet) {
  const classId = clean_(request.classId, 120); const date = date_(request.date); const inPerson = capacity_(request.inPersonCapacity, request.capacity); const online = capacity_(request.onlineCapacity, 0);
  if (!classId || !date || inPerson === null || online === null) return response_({ success: false, code: "VALIDATION_ERROR", message: "Enter a date and valid capacities." });
  const classData = classMap_(spreadsheet).get(classId); if (!classData) return response_({ success: false, code: "CLASS_NOT_FOUND", message: "Class not found." }); const active = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).filter(function (row) { return String(row.ClassID) === classId && active_(row); });
  if (inPerson < active.filter(function (row) { return attendance_(row.AttendanceType) === "In person"; }).length || online < active.filter(function (row) { return attendance_(row.AttendanceType) === "Online"; }).length) return response_({ success: false, code: "CAPACITY_TOO_LOW", message: "Capacity cannot be lower than active bookings." });
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES); setValues_(sheet, findRow_(sheet, "ClassID", classId), { Date: date, Capacity: inPerson, InPersonCapacity: inPerson, OnlineCapacity: online, ZoomUrl: clean_(request.zoomUrl, 500), ClassNameOverride: clean_(request.className, 120), TimeOverride: clean_(request.time, 80), InstructorOverride: clean_(request.instructor, 120) });
  return response_({ success: true, message: "Class updated." });
}

function createClass_(request, spreadsheet) {
  const templateId = clean_(request.templateId, 120); const date = date_(request.date); const template = objects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES)).find(function (row) { return String(row.TemplateID) === templateId; }); const inPerson = capacity_(request.inPersonCapacity, request.capacity); const online = capacity_(request.onlineCapacity, 0);
  if (!template || !date || inPerson === null || online === null) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a template, date, and valid capacities." });
  const timezone = spreadsheet.getSpreadsheetTimeZone(); const classId = templateId + "-" + iso_(date, timezone).replace(/-/g, "") + "-" + Utilities.getUuid().slice(0, 6);
  append_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES), HEADERS.Classes, { ClassID: classId, TemplateID: templateId, Date: date, Capacity: inPerson, InPersonCapacity: inPerson, OnlineCapacity: online, ZoomUrl: clean_(request.zoomUrl, 500) || String(template.ZoomUrl || ""), Status: "Scheduled", ClassNameOverride: clean_(request.className, 120), TimeOverride: clean_(request.time, 80), InstructorOverride: clean_(request.instructor, 120) });
  return response_({ success: true, message: "Class added." });
}

function deleteClass_(request, spreadsheet) { const classId = clean_(request.classId, 120); if (objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).some(function (row) { return String(row.ClassID) === classId && active_(row); })) return response_({ success: false, code: "CLASS_HAS_BOOKINGS", message: "Use Cancel Class so booked clients are notified and refunded." }); const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES); const row = findRow_(sheet, "ClassID", classId); if (!row) return response_({ success: false, code: "CLASS_NOT_FOUND", message: "Class not found." }); sheet.deleteRow(row); return response_({ success: true, message: "Class deleted." }); }
function cancelClass_(request, spreadsheet) { const classId = clean_(request.classId, 120); const classData = classMap_(spreadsheet).get(classId); if (!classData) return response_({ success: false, code: "CLASS_NOT_FOUND", message: "Class not found." }); if (classData.status === "Cancelled") return response_({ success: false, code: "CLASS_CANCELLED", message: "This class is already cancelled." }); setByKey_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES), "ClassID", classId, "Status", "Cancelled"); const activeBookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).filter(function (row) { return String(row.ClassID) === classId && active_(row); }); activeBookings.forEach(function (row) { cancelRecord_(spreadsheet, String(row.BookingID), "Class cancelled by studio", null, true); }); return response_({ success: true, message: "Class cancelled. " + activeBookings.length + " client(s) were refunded and notified." }); }

function updateTemplate_(request, spreadsheet) { const templateId = clean_(request.templateId, 120); const identity = scheduleValues_(request); if (!templateId || !identity.ok) return response_(identity.error); const sheet = spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES); const row = findRow_(sheet, "TemplateID", templateId); if (!row) return response_({ success: false, code: "TEMPLATE_NOT_FOUND", message: "Template not found." }); setValues_(sheet, row, identity.value); return response_({ success: true, message: "Weekly schedule updated." }); }
function createTemplate_(request, spreadsheet) { const schedule = scheduleValues_(request); if (!schedule.ok) return response_(schedule.error); append_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES), HEADERS.Templates, Object.assign({ TemplateID: "TPL-" + Utilities.getUuid().slice(0, 8).toUpperCase() }, schedule.value)); return response_({ success: true, message: "Weekly class added." }); }
function scheduleValues_(request) { const day = clean_(request.day, 20), time = clean_(request.time, 80), className = clean_(request.className, 120), instructor = clean_(request.instructor, 120), inPerson = capacity_(request.inPersonCapacity, request.capacity), online = capacity_(request.onlineCapacity, 0); if (["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].indexOf(day) < 0 || !time || !className || !instructor || inPerson === null || online === null) return { ok: false, error: { success: false, code: "VALIDATION_ERROR", message: "Complete every schedule field." } }; return { ok: true, value: { Day: day, Time: time, ClassName: className, Instructor: instructor, Capacity: inPerson, InPersonCapacity: inPerson, OnlineCapacity: online, ZoomUrl: clean_(request.zoomUrl, 500) } }; }

function generateClassesForNextWeeks(weeks) {
  const spreadsheet = getSpreadsheet_(); ensureSchema_(spreadsheet); const numberOfWeeks = Number(weeks) > 0 ? Number(weeks) : DEFAULT_WEEKS_TO_GENERATE; const timezone = spreadsheet.getSpreadsheetTimeZone(); const templates = objects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES)); const existing = new Set(objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES)).map(function (row) { return String(row.TemplateID) + "|" + iso_(date_(row.Date), timezone); })); const dayNumbers = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 }; const rows = []; const today = today_();
  for (let offset = 0; offset < numberOfWeeks * 7; offset += 1) { const date = new Date(today); date.setDate(today.getDate() + offset); templates.forEach(function (template) { if (dayNumbers[template.Day] !== date.getDay()) return; const isoDate = iso_(date, timezone), key = String(template.TemplateID) + "|" + isoDate; if (existing.has(key)) return; const inPerson = capacity_(template.InPersonCapacity, template.Capacity), online = capacity_(template.OnlineCapacity, 0); if (inPerson === null || online === null) return; rows.push(row_(HEADERS.Classes, { ClassID: String(template.TemplateID) + "-" + isoDate.replace(/-/g, ""), TemplateID: template.TemplateID, Date: date, Capacity: inPerson, InPersonCapacity: inPerson, OnlineCapacity: online, ZoomUrl: template.ZoomUrl || "", Status: "Scheduled" })); existing.add(key); }); }
  if (rows.length) { const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES); sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.Classes.length).setValues(rows); } return rows.length;
}
function refreshClassCalendar() { generateClassesForNextWeeks(DEFAULT_WEEKS_TO_GENERATE); }
function createClassGenerationTrigger() { ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === "refreshClassCalendar"; }).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); }); ScriptApp.newTrigger("refreshClassCalendar").timeBased().everyDays(1).atHour(3).create(); }

function getUpcomingClasses_(spreadsheet) {
  const timezone = spreadsheet.getSpreadsheetTimeZone(); const bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS));
  return Array.from(classMap_(spreadsheet).values()).filter(function (classData) { return classData.status !== "Cancelled" && classStart_(classData).getTime() > Date.now(); }).map(function (classData) {
    const activeBookings = bookings.filter(function (row) { return String(row.ClassID) === classData.classId && active_(row); }); const inPersonBooked = activeBookings.filter(function (row) { return attendance_(row.AttendanceType) === "In person"; }).length; const onlineBooked = activeBookings.filter(function (row) { return attendance_(row.AttendanceType) === "Online"; }).length;
    return { classId: classData.classId, className: classData.className, day: Utilities.formatDate(classData.date, timezone, "EEEE"), date: Utilities.formatDate(classData.date, timezone, "MMMM d"), dateIso: iso_(classData.date, timezone), time: classData.time, instructor: classData.instructor, inPersonCapacity: classData.inPersonCapacity, onlineCapacity: classData.onlineCapacity, inPersonBooked: inPersonBooked, onlineBooked: onlineBooked, inPersonRemaining: Math.max(0, classData.inPersonCapacity - inPersonBooked), onlineRemaining: Math.max(0, classData.onlineCapacity - onlineBooked), capacity: classData.inPersonCapacity, bookedCount: inPersonBooked + onlineBooked, remainingSpots: Math.max(0, classData.inPersonCapacity - inPersonBooked) };
  }).sort(function (a, b) { return a.dateIso.localeCompare(b.dateIso) || minutes_(a.time) - minutes_(b.time); });
}

function classMap_(spreadsheet) {
  const templates = objects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES)); const templateMap = new Map(templates.map(function (row) { return [String(row.TemplateID), row]; }));
  return new Map(objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES)).map(function (row) { const template = templateMap.get(String(row.TemplateID)); const date = date_(row.Date); if (!template || !date) return null; return [String(row.ClassID), { classId: String(row.ClassID), templateId: String(row.TemplateID), date: date, className: String(row.ClassNameOverride || template.ClassName), time: String(row.TimeOverride || template.Time), instructor: String(row.InstructorOverride || template.Instructor), inPersonCapacity: capacity_(row.InPersonCapacity, row.Capacity) || 0, onlineCapacity: capacity_(row.OnlineCapacity, 0) || 0, zoomUrl: String(row.ZoomUrl || template.ZoomUrl || ""), status: String(row.Status || "Scheduled") }]; }).filter(Boolean));
}

function changeBalance_(spreadsheet, client, amount, type, classId, note) {
  const current = Number(client.SessionsRemaining), purchased = Number(client.SessionsPurchased); const next = Math.max(0, Math.min(purchased + Math.max(0, amount), current + amount)); if (amount < 0 && next !== current + amount) throw new Error("Client has no sessions remaining.");
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS); const row = findRow_(sheet, "ClientID", client.ClientID); const updates = { SessionsRemaining: next, UpdatedAt: new Date() }; if (amount > 0 && type === "Top-up") updates.SessionsPurchased = purchased + amount; setValues_(sheet, row, updates);
  const transactionId = Utilities.getUuid(); history_(spreadsheet, client.ClientID, type, amount, next, classId, note, transactionId); return transactionId;
}
function history_(spreadsheet, clientId, type, amount, balanceAfter, classId, note, transactionId) { append_(spreadsheet.getSheetByName(SHEET_NAMES.HISTORY), HEADERS["Session History"], { TransactionID: transactionId || Utilities.getUuid(), ClientID: clientId, Type: type, Amount: amount, BalanceAfter: balanceAfter, ClassID: classId || "", Note: note || "", CreatedAt: new Date(), AdminEmail: "" }); }

function bookingEmail_(client, classData, attendance) { const zoom = attendance === "Online" && classData.zoomUrl ? "<p><strong>Zoom meeting:</strong> <a href=\"" + escape_(classData.zoomUrl) + "\">Join your online class</a></p>" : ""; return email_(client.Email, "Booking confirmed: " + classData.className, "<p>Hi " + escape_(client.FirstName) + ",</p><p>Your <strong>" + escape_(classData.className) + "</strong> booking is confirmed for " + classText_(classData) + ".</p><p><strong>Attendance:</strong> " + attendance + "<br><strong>Sessions remaining:</strong> " + client.SessionsRemaining + "</p>" + zoom + "<p><strong>Cancellation policy:</strong> Online cancellations are available until 24 hours before class starts.</p><p>— Shera Studio</p>", "Hi " + client.FirstName + ", your booking is confirmed for " + classText_(classData) + ". Attendance: " + attendance + ". Sessions remaining: " + client.SessionsRemaining + ". Online cancellations close 24 hours before class."); }
function cancellationEmail_(person, classData, source, client) { const studio = source === "Class cancelled by studio"; const balance = client ? "<p><strong>Sessions remaining:</strong> " + client.SessionsRemaining + "</p>" : ""; return email_(person.Email, (studio ? "Class cancelled: " : "Booking cancelled: ") + classData.className, "<p>Hi " + escape_(person.FirstName) + ",</p><p>" + (studio ? "The studio has cancelled" : "Your reservation has been cancelled for") + " <strong>" + escape_(classData.className) + "</strong> on " + classText_(classData) + ".</p>" + balance + "<p>— Shera Studio</p>", "Hi " + person.FirstName + ", " + (studio ? "the studio has cancelled " : "your reservation has been cancelled for ") + classData.className + " on " + classText_(classData) + "." + (client ? " Sessions remaining: " + client.SessionsRemaining + "." : "")); }
function zeroEmail_(client) { return email_(client.Email, "Your Shera Studio sessions are finished", "<p>Hi " + escape_(client.FirstName) + ",</p><p>You have used your final available session. Please contact Shera to purchase more classes.</p><p>— Shera Studio</p>", "Hi " + client.FirstName + ", you have used your final available session. Please contact Shera to purchase more classes."); }
function email_(to, subject, htmlBody, body) { try { MailApp.sendEmail({ to: String(to), subject: subject, htmlBody: htmlBody, body: body, name: "Shera Studio" }); return true; } catch (error) { console.error(error); return false; } }

function ensureSchema_(spreadsheet) { Object.keys(HEADERS).forEach(function (name) { ensureSheet_(spreadsheet, name, HEADERS[name]); }); migrateCapacities_(spreadsheet); }
function ensureSheet_(spreadsheet, name, headers) { let sheet = spreadsheet.getSheetByName(name); if (!sheet) { sheet = spreadsheet.insertSheet(name); sheet.getRange(1, 1, 1, headers.length).setValues([headers]); return; } if (sheet.getLastRow() === 0) { sheet.getRange(1, 1, 1, headers.length).setValues([headers]); return; } const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]; headers.forEach(function (header, index) { const current = String(existing[index] || "").trim(); if (!current) sheet.getRange(1, index + 1).setValue(header); else if (current !== header) throw new Error(name + " column " + (index + 1) + " must be named " + header); }); }
function migrateCapacities_(spreadsheet) { [SHEET_NAMES.TEMPLATES, SHEET_NAMES.CLASSES].forEach(function (name) { const sheet = spreadsheet.getSheetByName(name); if (!sheet || sheet.getLastRow() < 2) return; const map = headers_(sheet), data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues(); let changed = false; data.forEach(function (row) { if (row[map.InPersonCapacity - 1] === "") { row[map.InPersonCapacity - 1] = Number(row[map.Capacity - 1]) || 0; changed = true; } if (row[map.OnlineCapacity - 1] === "") { row[map.OnlineCapacity - 1] = 0; changed = true; } if (map.Status && !row[map.Status - 1]) { row[map.Status - 1] = "Scheduled"; changed = true; } }); if (changed) sheet.getRange(2, 1, data.length, sheet.getLastColumn()).setValues(data); }); }
function styleSheets_(spreadsheet) { Object.keys(HEADERS).forEach(function (name) { const sheet = spreadsheet.getSheetByName(name); sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, HEADERS[name].length).setBackground("#557b72").setFontColor("#fff").setFontWeight("bold"); sheet.autoResizeColumns(1, HEADERS[name].length); }); }

function setSpreadsheetId(spreadsheetId) { if (!spreadsheetId) throw new Error("A spreadsheet ID is required."); PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", String(spreadsheetId).trim()); }
function setAdminConfiguration(adminEmail, googleClientId) { if (!adminEmail || !googleClientId) throw new Error("Admin email and Google OAuth client ID are required."); PropertiesService.getScriptProperties().setProperties({ ADMIN_EMAIL: String(adminEmail).trim().toLowerCase(), ADMIN_GOOGLE_CLIENT_ID: String(googleClientId).trim() }); }
function verifyAdmin_(credential) { const token = clean_(credential, 5000), properties = PropertiesService.getScriptProperties(), adminEmail = String(properties.getProperty("ADMIN_EMAIL") || "").trim().toLowerCase(), clientId = String(properties.getProperty("ADMIN_GOOGLE_CLIENT_ID") || "").trim(); if (!adminEmail || !clientId) throw new Error("Admin access has not been configured."); if (!token) throw new Error("Admin sign-in is required."); const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true }); if (response.getResponseCode() !== 200) throw new Error("The Google sign-in has expired or is invalid."); const identity = JSON.parse(response.getContentText()); if (!(identity.email_verified === true || identity.email_verified === "true") || String(identity.aud) !== clientId || String(identity.email).toLowerCase() !== adminEmail) throw new Error("This Google account is not authorized to manage the studio."); }

function identity_(request) { const firstName = clean_(request.firstName, 80), lastName = clean_(request.lastName, 80), email = clean_(request.email, 200).toLowerCase(); return firstName && lastName && EMAIL_PATTERN.test(email) ? { ok: true, value: { firstName: firstName, lastName: lastName, email: email } } : { ok: false, error: { success: false, code: "VALIDATION_ERROR", message: "Enter your first name, last name, and a valid email address." } }; }
function findClient_(spreadsheet, identity) { return objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS)).find(function (row) { return String(row.Email).trim().toLowerCase() === identity.email && String(row.FirstName).trim().toLowerCase() === identity.firstName.toLowerCase() && String(row.LastName).trim().toLowerCase() === identity.lastName.toLowerCase(); }); }
function clientByEmail_(spreadsheet, email) { return objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS)).find(function (row) { return String(row.Email).trim().toLowerCase() === String(email).toLowerCase(); }); }
function clientById_(spreadsheet, clientId) { return objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS)).find(function (row) { return String(row.ClientID) === String(clientId); }); }
function publicClient_(client) { return { clientId: String(client.ClientID), firstName: String(client.FirstName), lastName: String(client.LastName), email: String(client.Email), sessionsPurchased: Number(client.SessionsPurchased), sessionsRemaining: Number(client.SessionsRemaining), createdAt: client.CreatedAt instanceof Date ? client.CreatedAt.toISOString() : String(client.CreatedAt || ""), updatedAt: client.UpdatedAt instanceof Date ? client.UpdatedAt.toISOString() : String(client.UpdatedAt || "") }; }
function publicTemplate_(row) { const inPerson = capacity_(row.InPersonCapacity, row.Capacity) || 0, online = capacity_(row.OnlineCapacity, 0) || 0; return { templateId: String(row.TemplateID), day: String(row.Day), time: String(row.Time), className: String(row.ClassName), instructor: String(row.Instructor), capacity: inPerson, inPersonCapacity: inPerson, onlineCapacity: online, zoomUrl: String(row.ZoomUrl || "") }; }
function attendance_(value) { const normalized = String(value || "").trim().toLowerCase(); if (["in person", "in-person", "inperson"].indexOf(normalized) >= 0) return "In person"; if (normalized === "online") return "Online"; return ""; }
function capacity_(value, fallback) { const raw = value === "" || value === undefined || value === null ? fallback : value, number = Number(raw); return Number.isInteger(number) && number >= 0 ? number : null; }
function classStart_(classData) { const date = new Date(classData.date); const minutes = minutes_(classData.time); date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0); return date; }
function classText_(classData) { return Utilities.formatDate(classData.date, getSpreadsheet_().getSpreadsheetTimeZone(), "EEEE, MMMM d") + " · " + classData.time; }
function getSpreadsheet_() { const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"); if (id) return SpreadsheetApp.openById(id); const active = SpreadsheetApp.getActiveSpreadsheet(); if (!active) throw new Error("No spreadsheet is connected. Bind this script to a Google Sheet or run setSpreadsheetId()."); return active; }
function objects_(sheet) { const lastRow = sheet.getLastRow(), lastColumn = sheet.getLastColumn(); if (lastRow < 2 || lastColumn < 1) return []; const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues(), headers = values.shift().map(function (header) { return String(header).trim(); }); return values.filter(function (row) { return row.some(function (cell) { return cell !== ""; }); }).map(function (row) { return headers.reduce(function (object, header, index) { object[header] = row[index]; return object; }, {}); }); }
function headers_(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].reduce(function (result, header, index) { result[String(header).trim()] = index + 1; return result; }, {}); }
function findRow_(sheet, header, value) { const index = headers_(sheet)[header]; if (!index || sheet.getLastRow() < 2) return 0; const values = sheet.getRange(2, index, sheet.getLastRow() - 1, 1).getValues(), found = values.findIndex(function (row) { return String(row[0]) === String(value); }); return found < 0 ? 0 : found + 2; }
function setByKey_(sheet, keyHeader, key, targetHeader, value) { const row = findRow_(sheet, keyHeader, key), column = headers_(sheet)[targetHeader]; if (!row || !column) throw new Error("Sheet row or column not found."); sheet.getRange(row, column).setValue(value); }
function setValues_(sheet, row, values) { const map = headers_(sheet); Object.keys(values).forEach(function (header) { if (map[header]) sheet.getRange(row, map[header]).setValue(values[header]); }); }
function row_(headers, object) { return headers.map(function (header) { return safe_(object[header] === undefined ? "" : object[header]); }); }
function append_(sheet, headers, object) { sheet.appendRow(row_(headers, object)); }
function requestBody_(event) { if (!event || !event.postData || !event.postData.contents) throw new Error("Missing request body."); return JSON.parse(event.postData.contents); }
function clean_(value, max) { return String(value == null ? "" : value).trim().slice(0, max); }
function safe_(value) { const text = String(value); return /^[=+\-@]/.test(text) ? "'" + text : text; }
function hash_(value) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)); }
function active_(booking) { const status = String(booking.Status || "").trim().toLowerCase(); return status === "" || status === "active"; }
function date_(value) { const date = value instanceof Date ? new Date(value) : new Date(value); if (Number.isNaN(date.getTime())) return null; date.setHours(0, 0, 0, 0); return date; }
function today_() { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }
function iso_(date, timezone) { return date ? Utilities.formatDate(date, timezone, "yyyy-MM-dd") : ""; }
function dateTime_(value, timezone) { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? "" : Utilities.formatDate(date, timezone, "yyyy-MM-dd h:mm a"); }
function minutes_(time) { const match = String(time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i); if (!match) return 0; let hours = Number(match[1]) % 12; if (match[3].toUpperCase() === "PM") hours += 12; return hours * 60 + Number(match[2]); }
function escape_(text) { return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }
function response_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
