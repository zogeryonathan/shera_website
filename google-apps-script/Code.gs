/** Shera Studio secure booking backend. Bind this script to the studio Sheet. */
const SHEET_NAMES = Object.freeze({ TEMPLATES: "Templates", CLASSES: "Classes", BOOKINGS: "Bookings", CLIENTS: "Clients", HISTORY: "Session History", VERIFICATION: "Client Verification" });
const HEADERS = Object.freeze({
  Templates: ["TemplateID", "Day", "Time", "ClassName", "Instructor", "Capacity", "InPersonCapacity", "OnlineCapacity", "ZoomUrl", "IsOneTime"],
  Classes: ["ClassID", "TemplateID", "Date", "Capacity", "InPersonCapacity", "OnlineCapacity", "ZoomUrl", "Status", "ClassNameOverride", "TimeOverride", "InstructorOverride"],
  Bookings: ["BookingID", "ClassID", "FirstName", "LastName", "Email", "Timestamp", "Status", "CancelCode", "CancelledAt", "AttendanceType", "ClientNote", "ClientID", "SessionTransactionID", "CancellationSource", "EmailStatus"],
  Clients: ["ClientID", "FirstName", "LastName", "Email", "SessionsPurchased", "SessionsRemaining", "CreatedAt", "UpdatedAt"],
  "Session History": ["TransactionID", "ClientID", "Type", "Amount", "BalanceAfter", "ClassID", "Note", "CreatedAt", "AdminEmail", "ClientName"],
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
    if (action === "registerclient") return registerClient_(request, spreadsheet);
    if (action === "submitinquiry") return submitInquiry_(request, spreadsheet);
    if (action === "sendverification") return sendVerification_(request, spreadsheet);
    if (action === "verifycode") return verifyCode_(request, spreadsheet);
    if (action === "clientbookings") return clientBookings_(request, spreadsheet);
    if (action === "book") return book_(request, spreadsheet);
    if (action === "cancelbooking") return cancelForClient_(request, spreadsheet);
    if (action === "reschedulebooking") return rescheduleForClient_(request, spreadsheet);
    return response_({ success: false, code: "INVALID_ACTION", message: "This booking action is not supported." });
  } catch (error) { console.error(error); return response_({ success: false, code: "SERVER_ERROR", message: "Your request could not be completed. Please try again." }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

/** Run once after replacing the old Code.gs. It preserves existing data. */
function upgradeSecureBookingSystem() { const spreadsheet = getSpreadsheet_(); ensureSchema_(spreadsheet); styleHeaders_(spreadsheet); return "Secure booking sheets are ready."; }
function setupBookingSheets() { upgradeSecureBookingSystem(); }

function submitInquiry_(request, spreadsheet) {
  const identity = identity_(request); const phone = clean_(request.phone, 40); const message = clean_(request.message, 2000); const page = clean_(request.page, 100) || "website";
  if (clean_(request.website, 200)) return response_({ success: true, message: "Thank you for your inquiry." });
  if (!identity.ok || !phone || message.length < 3) return response_({ success: false, code: "VALIDATION_ERROR", message: "Please enter your name, email, phone number, and a short message." });
  const submittedAt = Utilities.formatDate(new Date(), spreadsheet.getSpreadsheetTimeZone(), "EEEE, MMMM d, yyyy h:mm a");
  const html = "<p>You have a new website inquiry.</p><p><strong>Name:</strong> " + escape_(identity.value.firstName + " " + identity.value.lastName) + "<br><strong>Email:</strong> <a href=\"mailto:" + escape_(identity.value.email) + "\">" + escape_(identity.value.email) + "</a><br><strong>Phone:</strong> " + escape_(phone) + "<br><strong>Page:</strong> " + escape_(page) + "<br><strong>Sent:</strong> " + escape_(submittedAt) + "</p><p><strong>Message:</strong><br>" + escape_(message).replace(/\n/g, "<br>") + "</p>";
  try { MailApp.sendEmail({ to: "sheraclasses@gmail.com", replyTo: identity.value.email, subject: "New Shera Studio inquiry — " + identity.value.firstName + " " + identity.value.lastName, htmlBody: html, body: "New website inquiry\n\nName: " + identity.value.firstName + " " + identity.value.lastName + "\nEmail: " + identity.value.email + "\nPhone: " + phone + "\nPage: " + page + "\nSent: " + submittedAt + "\n\nMessage:\n" + message, name: "Shera Studio" }); }
  catch (error) { console.error(error); return response_({ success: false, code: "EMAIL_FAILED", message: "We could not send your inquiry right now. Please try WhatsApp or text message." }); }
  return response_({ success: true, message: "Thank you — Shera will reply as soon as she can." });
}

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
  if (Number(client.SessionsRemaining) < 1) return response_({ success: false, code: "NO_SESSIONS", message: "Your class package is complete. Message Shera to renew your sessions, then you’ll be ready to book your next class." });
  const classData = classMap_(spreadsheet).get(classId); if (!classData || classData.status === "Cancelled" || classStart_(classData).getTime() <= Date.now()) return response_({ success: false, code: "CLASS_NOT_AVAILABLE", message: "This class is no longer available." });
  const bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS));
  if (bookings.some(function (row) { return String(row.ClassID) === classId && String(row.ClientID) === String(client.ClientID) && active_(row); })) return response_({ success: false, code: "DUPLICATE_BOOKING", message: "You already have a reservation for this class." });
  const capacity = attendance === "Online" ? classData.onlineCapacity : classData.inPersonCapacity;
  const count = bookings.filter(function (row) { return String(row.ClassID) === classId && active_(row) && attendance_(row.AttendanceType) === attendance; }).length;
  if (capacity < 1) return response_({ success: false, code: "ATTENDANCE_NOT_AVAILABLE", message: attendance + " attendance is not available for this class." });
  if (count >= capacity) return response_({ success: false, code: "CLASS_FULL", message: "The " + attendance.toLowerCase() + " spaces for this class are full." });
  const transaction = changeBalance_(spreadsheet, client, -1, "Booking", classId, "Class booking"); const bookingId = Utilities.getUuid();
  append_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS), HEADERS.Bookings, { BookingID: bookingId, ClassID: classId, FirstName: client.FirstName, LastName: client.LastName, Email: client.Email, Timestamp: new Date(), Status: "Active", CancelCode: "", CancelledAt: "", AttendanceType: attendance, ClientNote: note, ClientID: client.ClientID, SessionTransactionID: transaction, CancellationSource: "", EmailStatus: "" });
  const updated = clientById_(spreadsheet, client.ClientID); const sent = bookingEmail_(updated, classData, attendance, bookingId); setByKey_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS), "BookingID", bookingId, "EmailStatus", sent ? "Booking confirmation sent" : "Booking confirmation failed"); if (Number(updated.SessionsRemaining) === 0) zeroEmail_(updated);
  return response_({ success: true, message: "Your reservation is confirmed.", booking: { bookingId: bookingId, classId: classId, attendanceType: attendance, remainingSessions: Number(updated.SessionsRemaining), remainingSpots: capacity - count - 1 } });
}

function clientBookings_(request, spreadsheet) {
  const auth = requireClient_(request, spreadsheet); if (!auth.ok) return response_(auth.error);
  const classes = classMap_(spreadsheet); const timezone = spreadsheet.getSpreadsheetTimeZone();
  const bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).filter(function (row) { return String(row.ClientID) === String(auth.client.ClientID) && active_(row); }).map(function (row) {
    const classData = classes.get(String(row.ClassID)); if (!classData || classData.status === "Cancelled" || classStart_(classData).getTime() <= Date.now()) return null;
    const cutoff = new Date(classStart_(classData).getTime() - 24 * 60 * 60 * 1000);
    return { bookingId: String(row.BookingID), classId: String(row.ClassID), className: classData.className, date: Utilities.formatDate(classData.date, timezone, "MMMM d"), dateIso: iso_(classData.date, timezone), time: classData.time, attendanceType: attendance_(row.AttendanceType), canCancel: cutoff.getTime() > Date.now(), cancellationCutoff: cutoff.toISOString() };
  }).filter(Boolean);
  return response_({ success: true, client: publicClient_(auth.client), bookings: bookings });
}

function cancelForClient_(request, spreadsheet) {
  const auth = requireClient_(request, spreadsheet); if (!auth.ok) return response_(auth.error);
  return response_(cancelRecord_(spreadsheet, clean_(request.bookingId, 120), "Client", auth.client, false));
}

function rescheduleForClient_(request, spreadsheet) {
  const auth = requireClient_(request, spreadsheet); if (!auth.ok) return response_(auth.error);
  return response_(rescheduleRecord_(spreadsheet, clean_(request.bookingId, 120), clean_(request.classId, 120), attendance_(request.attendanceType), "Client", auth.client, true));
}

function cancelRecord_(spreadsheet, bookingId, source, clientRequester, overrideCutoff) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS); const booking = objects_(sheet).find(function (row) { return String(row.BookingID) === bookingId; });
  if (!booking || !active_(booking)) return { success: false, code: "BOOKING_NOT_FOUND", message: "This active booking could not be found." };
  if (clientRequester && String(booking.ClientID) !== String(clientRequester.ClientID)) return { success: false, code: "BOOKING_NOT_FOUND", message: "This reservation is not linked to your account." };
  const classData = classMap_(spreadsheet).get(String(booking.ClassID)); if (!classData) return { success: false, code: "CLASS_NOT_FOUND", message: "The class could not be found." };
  if (!overrideCutoff && classStart_(classData).getTime() - Date.now() <= 24 * 60 * 60 * 1000) return { success: false, code: "CANCELLATION_CUTOFF", message: "Online cancellations close 24 hours before class. Please contact Shera if you need help." };
  setByKey_(sheet, "BookingID", bookingId, "Status", "Cancelled"); setByKey_(sheet, "BookingID", bookingId, "CancelledAt", new Date()); setByKey_(sheet, "BookingID", bookingId, "CancellationSource", source);
  let updated = null; if (booking.ClientID) { const client = clientById_(spreadsheet, booking.ClientID); if (client) { changeBalance_(spreadsheet, client, 1, "Refund", String(booking.ClassID), source + " cancellation refund"); updated = clientById_(spreadsheet, booking.ClientID); } }
  const sent = cancellationEmail_({ FirstName: booking.FirstName, Email: booking.Email }, classData, source, updated, bookingId); setByKey_(sheet, "BookingID", bookingId, "EmailStatus", sent ? "Cancellation email sent" : "Cancellation email failed");
  return { success: true, message: "The reservation is cancelled and the session has been returned.", cancellation: { bookingId: bookingId, classId: String(booking.ClassID), remainingSessions: updated ? Number(updated.SessionsRemaining) : null } };
}

function rescheduleRecord_(spreadsheet, bookingId, targetClassId, attendance, source, clientRequester, enforceCutoff) {
  const bookingsSheet = spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS);
  const booking = objects_(bookingsSheet).find(function (row) { return String(row.BookingID) === bookingId; });
  if (!booking || !active_(booking)) return { success: false, code: "BOOKING_NOT_FOUND", message: "This active booking could not be found." };
  if (clientRequester && String(booking.ClientID) !== String(clientRequester.ClientID)) return { success: false, code: "BOOKING_NOT_FOUND", message: "This reservation is not linked to your account." };
  if (!targetClassId || !attendance) return { success: false, code: "VALIDATION_ERROR", message: "Choose a new class and attendance type." };
  if (String(booking.ClassID) === String(targetClassId)) return { success: false, code: "SAME_CLASS", message: "Choose a different class to reschedule this booking." };
  const classes = classMap_(spreadsheet), oldClass = classes.get(String(booking.ClassID)), newClass = classes.get(String(targetClassId));
  if (!oldClass || !newClass) return { success: false, code: "CLASS_NOT_FOUND", message: "One of the class dates could not be found." };
  if (newClass.status === "Cancelled" || classStart_(newClass).getTime() <= Date.now()) return { success: false, code: "CLASS_NOT_AVAILABLE", message: "That new class is no longer available." };
  if (enforceCutoff && classStart_(oldClass).getTime() - Date.now() <= 24 * 60 * 60 * 1000) return { success: false, code: "RESCHEDULE_CUTOFF", message: "Online rescheduling closes 24 hours before class. Please message Shera if you need help." };
  const client = clientById_(spreadsheet, booking.ClientID);
  if (!client) return { success: false, code: "CLIENT_NOT_FOUND", message: "The client profile could not be found." };
  const allBookings = objects_(bookingsSheet);
  if (allBookings.some(function (row) { return String(row.ClientID) === String(client.ClientID) && String(row.ClassID) === String(targetClassId) && active_(row); })) return { success: false, code: "DUPLICATE_BOOKING", message: "This client already has a reservation for that class." };
  const capacity = attendance === "Online" ? newClass.onlineCapacity : newClass.inPersonCapacity;
  const booked = allBookings.filter(function (row) { return String(row.ClassID) === String(targetClassId) && active_(row) && attendance_(row.AttendanceType) === attendance; }).length;
  if (capacity < 1) return { success: false, code: "ATTENDANCE_NOT_AVAILABLE", message: attendance + " attendance is not available for that class." };
  if (booked >= capacity) return { success: false, code: "CLASS_FULL", message: "The " + attendance.toLowerCase() + " spaces for that class are full." };
  setValues_(bookingsSheet, findRow_(bookingsSheet, "BookingID", bookingId), { Status: "Rescheduled", CancelledAt: new Date(), CancellationSource: source + " rescheduled" });
  const newBookingId = Utilities.getUuid();
  append_(bookingsSheet, HEADERS.Bookings, { BookingID: newBookingId, ClassID: targetClassId, FirstName: client.FirstName, LastName: client.LastName, Email: client.Email, Timestamp: new Date(), Status: "Active", CancelCode: "", CancelledAt: "", AttendanceType: attendance, ClientNote: booking.ClientNote || "", ClientID: client.ClientID, SessionTransactionID: booking.SessionTransactionID || "", CancellationSource: "Rescheduled from " + bookingId, EmailStatus: "" });
  const sent = rescheduleCalendarEmail_(client, oldClass, newClass, attendance, String(booking.BookingID), newBookingId, attendance_(booking.AttendanceType));
  setByKey_(bookingsSheet, "BookingID", bookingId, "EmailStatus", sent ? "Reschedule cancellation sent" : "Reschedule cancellation email failed");
  setByKey_(bookingsSheet, "BookingID", newBookingId, "EmailStatus", sent ? "Reschedule email sent" : "Reschedule email failed");
  return { success: true, message: "The reservation has been moved. The session balance is unchanged.", reschedule: { bookingId: newBookingId, classId: targetClassId, className: newClass.className, date: classText_(newClass), time: newClass.time, attendanceType: attendance, remainingSessions: Number(client.SessionsRemaining) } };
}

function adminAction_(action, request, spreadsheet) {
  try { verifyAdmin_(request.credential); } catch (error) { return response_({ success: false, code: "ADMIN_UNAUTHORIZED", message: error.message }); }
  if (action === "admindashboard") return response_({ success: true, dashboard: adminDashboard_(spreadsheet) });
  if (action === "admincreateclient") return createClient_(request, spreadsheet);
  if (action === "adminupdateclient") return updateClient_(request, spreadsheet);
  if (action === "admindeleteclient") return deleteClient_(request, spreadsheet);
  if (action === "admintopupclient") return topUpClient_(request, spreadsheet);
  if (action === "adminbookforclient") return bookForClientFromAdmin_(request, spreadsheet);
  if (action === "adminupdateclass") return updateClass_(request, spreadsheet);
  if (action === "adminbulkupdateclasses") return bulkUpdateClasses_(request, spreadsheet);
  if (action === "admincreateclass") return createClass_(request, spreadsheet);
  if (action === "admindeleteclass") return deleteClass_(request, spreadsheet);
  if (action === "admincancelclass") return cancelClass_(request, spreadsheet);
  if (action === "admincancelbooking") return response_(cancelRecord_(spreadsheet, clean_(request.bookingId, 120), "Admin", null, true));
  if (action === "adminreschedulebooking") return response_(rescheduleRecord_(spreadsheet, clean_(request.bookingId, 120), clean_(request.classId, 120), attendance_(request.attendanceType), "Admin", null, false));
  if (action === "adminupdatetemplate") return updateTemplate_(request, spreadsheet);
  if (action === "admincreatetemplate") return createTemplate_(request, spreadsheet);
  if (action === "admindeletetemplate") return deleteTemplate_(request, spreadsheet);
  if (action === "admingenerateclasses") return generateClassesForRange_(request, spreadsheet);
  if (action === "adminduplicateweek") return duplicateWeek_(request, spreadsheet);
  if (action === "admincreatemanyclasses") return createManyClasses_(request, spreadsheet);
  if (action === "adminbulkremoveclasses") return bulkRemoveClasses_(request, spreadsheet);
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
  const history = objects_(spreadsheet.getSheetByName(SHEET_NAMES.HISTORY)).sort(function (a, b) { return new Date(b.CreatedAt) - new Date(a.CreatedAt); }).slice(0, 500).map(function (row) { const client = clientMap.get(String(row.ClientID)); return { transactionId: String(row.TransactionID), clientId: String(row.ClientID), clientName: String(row.ClientName || (client ? client.FirstName + " " + client.LastName : "Unknown client")), type: String(row.Type), amount: Number(row.Amount), balanceAfter: Number(row.BalanceAfter), classId: String(row.ClassID || ""), note: String(row.Note || ""), createdAt: dateTime_(row.CreatedAt, timezone) }; });
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

/** Public, zero-session signup used only by the unlisted welcome page. */
function registerClient_(request, spreadsheet) {
  const identity = identity_(request);
  if (!identity.ok) return response_(identity.error);
  if (clean_(request.website, 200)) {
    return response_({ success: false, code: "REGISTRATION_NOT_ACCEPTED", message: "We could not complete your registration. Please contact Shera for help." });
  }
  if (clientByEmail_(spreadsheet, identity.value.email)) {
    return response_({ success: false, code: "CLIENT_EXISTS", message: "A profile with this email already exists. Please contact Shera if you need help with your account." });
  }

  const clientId = Utilities.getUuid();
  const now = new Date();
  append_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS), HEADERS.Clients, {
    ClientID: clientId,
    FirstName: identity.value.firstName,
    LastName: identity.value.lastName,
    Email: identity.value.email,
    SessionsPurchased: 0,
    SessionsRemaining: 0,
    CreatedAt: now,
    UpdatedAt: now,
  });
  history_(spreadsheet, clientId, "Registration", 0, 0, "", "Client self-registration");
  return response_({ success: true, message: "Your client profile is ready. Shera will help you choose a class package before you book." });
}

function updateClient_(request, spreadsheet) {
  const clientId = clean_(request.clientId, 120); const identity = identity_(request); if (!clientId || !identity.ok) return response_({ success: false, code: "VALIDATION_ERROR", message: "Enter the client name and email." });
  const client = clientById_(spreadsheet, clientId); if (!client) return response_({ success: false, code: "CLIENT_NOT_FOUND", message: "Client not found." }); const other = clientByEmail_(spreadsheet, identity.value.email);
  if (other && String(other.ClientID) !== clientId) return response_({ success: false, code: "CLIENT_EXISTS", message: "Another client already uses this email." });
  setValues_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS), findRow_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS), "ClientID", clientId), { FirstName: identity.value.firstName, LastName: identity.value.lastName, Email: identity.value.email, UpdatedAt: new Date() });
  return response_({ success: true, message: "Client details updated." });
}

function deleteClient_(request, spreadsheet) {
  const clientId = clean_(request.clientId, 120);
  const client = clientById_(spreadsheet, clientId);
  if (!client) return response_({ success: false, code: "CLIENT_NOT_FOUND", message: "Client not found." });
  const hasActiveBookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).some(function (booking) {
    return String(booking.ClientID) === clientId && active_(booking);
  });
  if (hasActiveBookings) return response_({ success: false, code: "CLIENT_HAS_BOOKINGS", message: "This client has an active booking. Cancel the booking first so the space and session are handled correctly." });

  const clientSheet = spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS);
  const row = findRow_(clientSheet, "ClientID", clientId);
  if (!row) return response_({ success: false, code: "CLIENT_NOT_FOUND", message: "Client not found." });
  clientSheet.deleteRow(row);
  deleteMatchingRows_(spreadsheet.getSheetByName(SHEET_NAMES.VERIFICATION), "ClientID", clientId);
  return response_({ success: true, message: client.FirstName + " " + client.LastName + " was deleted. Past booking and session records are retained for studio history." });
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
  const updated = clientById_(spreadsheet, client.ClientID); const sent = bookingEmail_(updated, classData, attendance, bookingId); setByKey_(sheet, "BookingID", bookingId, "EmailStatus", sent ? "Booking confirmation sent" : "Booking confirmation failed"); if (Number(updated.SessionsRemaining) === 0) zeroEmail_(updated);
  return response_({ success: true, message: client.FirstName + " is booked and their balance is now " + updated.SessionsRemaining + "." });
}

function updateClass_(request, spreadsheet) {
  const classId = clean_(request.classId, 120); const date = date_(request.date); const inPerson = capacity_(request.inPersonCapacity, request.capacity); const online = capacity_(request.onlineCapacity, 0);
  if (!classId || !date || inPerson === null || online === null) return response_({ success: false, code: "VALIDATION_ERROR", message: "Enter a date and valid capacities." });
  const classData = classMap_(spreadsheet).get(classId); if (!classData) return response_({ success: false, code: "CLASS_NOT_FOUND", message: "Class not found." }); const active = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).filter(function (row) { return String(row.ClassID) === classId && active_(row); });
  if (inPerson < active.filter(function (row) { return attendance_(row.AttendanceType) === "In person"; }).length || online < active.filter(function (row) { return attendance_(row.AttendanceType) === "Online"; }).length) return response_({ success: false, code: "CAPACITY_TOO_LOW", message: "Capacity cannot be lower than active bookings." });
  const updates = { Date: date, Capacity: inPerson, InPersonCapacity: inPerson, OnlineCapacity: online, ZoomUrl: clean_(request.zoomUrl, 500), ClassNameOverride: clean_(request.className, 120), TimeOverride: clean_(request.time, 80), InstructorOverride: clean_(request.instructor, 120) };
  const updatedClass = Object.assign({}, classData, { date: date, className: updates.ClassNameOverride || classData.className, time: updates.TimeOverride || classData.time, instructor: updates.InstructorOverride || classData.instructor, zoomUrl: updates.ZoomUrl, inPersonCapacity: inPerson, onlineCapacity: online });
  const changedSchedule = iso_(classData.date, spreadsheet.getSpreadsheetTimeZone()) !== iso_(date, spreadsheet.getSpreadsheetTimeZone()) || classData.time !== updatedClass.time;
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES); setValues_(sheet, findRow_(sheet, "ClassID", classId), updates);
  if (changedSchedule) notifyScheduleChange_(spreadsheet, active, classData, updatedClass);
  return response_({ success: true, message: "Class updated." + (changedSchedule && active.length ? " Booked clients were notified." : "") });
}

function bulkUpdateClasses_(request, spreadsheet) {
  const start = date_(request.startDate), end = date_(request.endDate), timezone = spreadsheet.getSpreadsheetTimeZone();
  const templateId = clean_(request.templateId, 120), changeInPerson = provided_(request.inPersonCapacity), changeOnline = provided_(request.onlineCapacity), changeZoom = request.updateZoom === true || request.updateZoom === "true", changeName = provided_(request.className), changeTime = provided_(request.time), changeInstructor = provided_(request.instructor);
  const inPerson = changeInPerson ? capacity_(request.inPersonCapacity, null) : null, online = changeOnline ? capacity_(request.onlineCapacity, null) : null, zoomUrl = clean_(request.zoomUrl, 500), className = clean_(request.className, 120), time = clean_(request.time, 80), instructor = clean_(request.instructor, 120);
  if (!start || !end || end.getTime() < start.getTime()) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a valid start date and end date." });
  if (!changeInPerson && !changeOnline && !changeZoom && !changeName && !changeTime && !changeInstructor) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose at least one value to update." });
  if ((changeInPerson && inPerson === null) || (changeOnline && online === null) || (changeZoom && !zoomUrl) || (changeName && !className) || (changeTime && !time) || (changeInstructor && !instructor)) return response_({ success: false, code: "VALIDATION_ERROR", message: "Enter valid values for every change you selected." });

  const startIso = iso_(start, timezone), endIso = iso_(end, timezone), sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES), headers = headers_(sheet), values = sheet.getDataRange().getValues();
  const classDataMap = classMap_(spreadsheet), bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS));
  const selected = [];
  for (let index = 1; index < values.length; index += 1) {
    const classId = String(values[index][headers.ClassID - 1] || ""), classData = classDataMap.get(classId); if (!classData || classData.status === "Cancelled" || classStart_(classData).getTime() <= Date.now()) continue;
    const dateIso = iso_(classData.date, timezone); if (dateIso < startIso || dateIso > endIso || (templateId && classData.templateId !== templateId)) continue;
    selected.push({ index: index, classData: classData });
  }
  if (!selected.length) return response_({ success: true, message: "No future active classes matched that selection." });

  for (let itemIndex = 0; itemIndex < selected.length; itemIndex += 1) {
    const item = selected[itemIndex], activeBookings = bookings.filter(function (row) { return String(row.ClassID) === item.classData.classId && active_(row); });
    const inPersonBooked = activeBookings.filter(function (row) { return attendance_(row.AttendanceType) === "In person"; }).length, onlineBooked = activeBookings.filter(function (row) { return attendance_(row.AttendanceType) === "Online"; }).length;
    if (changeInPerson && inPerson < inPersonBooked) return response_({ success: false, code: "CAPACITY_TOO_LOW", message: item.classData.className + " on " + iso_(item.classData.date, timezone) + " already has " + inPersonBooked + " in-person booking(s)." });
    if (changeOnline && online < onlineBooked) return response_({ success: false, code: "CAPACITY_TOO_LOW", message: item.classData.className + " on " + iso_(item.classData.date, timezone) + " already has " + onlineBooked + " online booking(s)." });
  }

  const notifications = [];
  selected.forEach(function (item) { const row = values[item.index]; if (changeInPerson) { row[headers.Capacity - 1] = inPerson; row[headers.InPersonCapacity - 1] = inPerson; } if (changeOnline) row[headers.OnlineCapacity - 1] = online; if (changeZoom) row[headers.ZoomUrl - 1] = zoomUrl; if (changeName) row[headers.ClassNameOverride - 1] = className; if (changeTime) row[headers.TimeOverride - 1] = time; if (changeInstructor) row[headers.InstructorOverride - 1] = instructor; if (changeTime) notifications.push({ oldClass: item.classData, newClass: Object.assign({}, item.classData, { time: time, className: changeName ? className : item.classData.className, instructor: changeInstructor ? instructor : item.classData.instructor, zoomUrl: changeZoom ? zoomUrl : item.classData.zoomUrl }), bookings: bookings.filter(function (row) { return String(row.ClassID) === item.classData.classId && active_(row); }) }); });
  sheet.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
  notifications.forEach(function (item) { notifyScheduleChange_(spreadsheet, item.bookings, item.oldClass, item.newClass); });
  return response_({ success: true, message: selected.length + " future class(es) updated." + (changeTime && notifications.length ? " Booked clients were notified." : "") });
}

function createClass_(request, spreadsheet) {
  let templateId = clean_(request.templateId, 120); const date = date_(request.date); let template = objects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES)).find(function (row) { return String(row.TemplateID) === templateId; }); const inPerson = capacity_(request.inPersonCapacity, request.capacity); const online = capacity_(request.onlineCapacity, 0);
  if (request.oneTime === true || request.oneTime === "true") { const schedule = scheduleValues_(Object.assign({}, request, { day: dayName_(date) })); if (!date || !schedule.ok) return response_({ success: false, code: "VALIDATION_ERROR", message: "Enter the one-time class details, date, and valid capacities." }); templateId = createOneTimeRule_(spreadsheet, schedule.value); template = objects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES)).find(function (row) { return String(row.TemplateID) === templateId; }); }
  if (!template || !date || inPerson === null || online === null) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a schedule rule, date, and valid capacities." });
  const timezone = spreadsheet.getSpreadsheetTimeZone(); const classId = templateId + "-" + iso_(date, timezone).replace(/-/g, "") + "-" + Utilities.getUuid().slice(0, 6);
  append_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES), HEADERS.Classes, { ClassID: classId, TemplateID: templateId, Date: date, Capacity: inPerson, InPersonCapacity: inPerson, OnlineCapacity: online, ZoomUrl: clean_(request.zoomUrl, 500) || String(template.ZoomUrl || ""), Status: "Scheduled", ClassNameOverride: clean_(request.className, 120), TimeOverride: clean_(request.time, 80), InstructorOverride: clean_(request.instructor, 120) });
  return response_({ success: true, message: "Class added." });
}

function deleteClass_(request, spreadsheet) { const classId = clean_(request.classId, 120); if (objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).some(function (row) { return String(row.ClassID) === classId && active_(row); })) return response_({ success: false, code: "CLASS_HAS_BOOKINGS", message: "Use Cancel Class so booked clients are notified and refunded." }); const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES); const row = findRow_(sheet, "ClassID", classId); if (!row) return response_({ success: false, code: "CLASS_NOT_FOUND", message: "Class not found." }); sheet.deleteRow(row); return response_({ success: true, message: "Class deleted." }); }
function cancelClass_(request, spreadsheet) { const classId = clean_(request.classId, 120); const classData = classMap_(spreadsheet).get(classId); if (!classData) return response_({ success: false, code: "CLASS_NOT_FOUND", message: "Class not found." }); if (classData.status === "Cancelled") return response_({ success: false, code: "CLASS_CANCELLED", message: "This class is already cancelled." }); setByKey_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES), "ClassID", classId, "Status", "Cancelled"); const activeBookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).filter(function (row) { return String(row.ClassID) === classId && active_(row); }); activeBookings.forEach(function (row) { cancelRecord_(spreadsheet, String(row.BookingID), "Class cancelled by studio", null, true); }); return response_({ success: true, message: "Class cancelled. " + activeBookings.length + " client(s) were refunded and notified." }); }

function updateTemplate_(request, spreadsheet) { const templateId = clean_(request.templateId, 120); const identity = scheduleValues_(request); if (!templateId || !identity.ok) return response_(identity.error); const sheet = spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES); const row = findRow_(sheet, "TemplateID", templateId); if (!row) return response_({ success: false, code: "TEMPLATE_NOT_FOUND", message: "Schedule rule not found." }); const previous = objects_(sheet).find(function (item) { return String(item.TemplateID) === templateId; }); setValues_(sheet, row, identity.value); const notified = updateFutureRuleClasses_(spreadsheet, templateId, previous, identity.value); return response_({ success: true, message: "Weekly schedule updated." + (notified ? " Booked clients were notified." : "") }); }
function updateFutureRuleClasses_(spreadsheet, templateId, previous, next) { const timezone = spreadsheet.getSpreadsheetTimeZone(), classes = Array.from(classMap_(spreadsheet).values()).filter(function (item) { return item.templateId === templateId && item.status !== "Cancelled" && item.date.getTime() > Date.now(); }), bookings = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)), sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES); let notified = false; classes.forEach(function (item) { const active = bookings.filter(function (row) { return String(row.ClassID) === item.classId && active_(row); }), newDate = String(previous.Day) === String(next.Day) ? item.date : rescheduleForDay_(item.date, String(next.Day)), updated = Object.assign({}, item, { date: newDate, className: String(next.ClassName), time: String(next.Time), instructor: String(next.Instructor), inPersonCapacity: Number(next.InPersonCapacity), onlineCapacity: Number(next.OnlineCapacity), zoomUrl: String(next.ZoomUrl || "") }); if (updated.inPersonCapacity < active.filter(function (row) { return attendance_(row.AttendanceType) === "In person"; }).length || updated.onlineCapacity < active.filter(function (row) { return attendance_(row.AttendanceType) === "Online"; }).length) throw new Error("A schedule rule capacity cannot be lower than an existing booking."); setValues_(sheet, findRow_(sheet, "ClassID", item.classId), { Date: newDate, Capacity: updated.inPersonCapacity, InPersonCapacity: updated.inPersonCapacity, OnlineCapacity: updated.onlineCapacity, ZoomUrl: updated.zoomUrl, ClassNameOverride: updated.className, TimeOverride: updated.time, InstructorOverride: updated.instructor }); if ((item.time !== updated.time || item.date.getTime() !== updated.date.getTime()) && active.length) { notifyScheduleChange_(spreadsheet, active, item, updated); notified = true; } }); return notified; }
function rescheduleForDay_(date, day) { const target = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day), updated = new Date(date); updated.setDate(updated.getDate() + target - updated.getDay()); while (updated.getTime() <= Date.now()) updated.setDate(updated.getDate() + 7); return updated; }
function createTemplate_(request, spreadsheet) { const schedule = scheduleValues_(request); if (!schedule.ok) return response_(schedule.error); append_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES), HEADERS.Templates, Object.assign({ TemplateID: "TPL-" + Utilities.getUuid().slice(0, 8).toUpperCase() }, schedule.value)); return response_({ success: true, message: "Weekly class added." }); }
function scheduleValues_(request) { const day = clean_(request.day, 20), time = clean_(request.time, 80), className = clean_(request.className, 120), instructor = clean_(request.instructor, 120), inPerson = capacity_(request.inPersonCapacity, request.capacity), online = capacity_(request.onlineCapacity, 0); if (["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].indexOf(day) < 0 || !time || !className || !instructor || inPerson === null || online === null) return { ok: false, error: { success: false, code: "VALIDATION_ERROR", message: "Complete every schedule field." } }; return { ok: true, value: { Day: day, Time: time, ClassName: className, Instructor: instructor, Capacity: inPerson, InPersonCapacity: inPerson, OnlineCapacity: online, ZoomUrl: clean_(request.zoomUrl, 500) } }; }

function deleteTemplate_(request, spreadsheet) { const templateId = clean_(request.templateId, 120); const classes = objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES)); if (classes.some(function (row) { return String(row.TemplateID) === templateId && classStart_(classMap_(spreadsheet).get(String(row.ClassID))).getTime() > Date.now(); })) return response_({ success: false, code: "RULE_HAS_CLASSES", message: "This schedule rule still has future classes. Remove or cancel those dates first." }); const sheet = spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES); const row = findRow_(sheet, "TemplateID", templateId); if (!row) return response_({ success: false, code: "RULE_NOT_FOUND", message: "Schedule rule not found." }); sheet.deleteRow(row); return response_({ success: true, message: "Schedule rule deleted." }); }

function generateClassesForRange_(request, spreadsheet) { const start = date_(request.startDate), end = date_(request.endDate), selectedIds = Array.isArray(request.templateIds) ? request.templateIds.map(String) : []; if (!start || !end || end < start) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a valid start date and end date." }); const rules = objects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES)).filter(function (row) { return String(row.IsOneTime || "").toLowerCase() !== "true" && (!selectedIds.length || selectedIds.indexOf(String(row.TemplateID)) >= 0); }); const created = createRuleDates_(spreadsheet, rules, start, end); return response_({ success: true, message: created + " missing future class date(s) created." }); }

function duplicateWeek_(request, spreadsheet) { const source = date_(request.sourceDate), start = date_(request.startDate), end = date_(request.endDate); if (!source || !start || !end || end < start) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a source week and a valid future date range." }); const timezone = spreadsheet.getSpreadsheetTimeZone(), sourceStart = new Date(source); sourceStart.setDate(source.getDate() - source.getDay()); const sourceEnd = new Date(sourceStart); sourceEnd.setDate(sourceStart.getDate() + 6); const classes = Array.from(classMap_(spreadsheet).values()).filter(function (item) { return item.status !== "Cancelled" && item.date >= sourceStart && item.date <= sourceEnd; }); if (!classes.length) return response_({ success: false, code: "SOURCE_WEEK_EMPTY", message: "No scheduled classes were found in that source week." }); let created = 0; for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) { classes.forEach(function (item) { if (date.getDay() !== item.date.getDay()) return; if (date.getTime() <= Date.now()) return; const keyExists = objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES)).some(function (row) { return String(row.TemplateID) === item.templateId && iso_(date_(row.Date), timezone) === iso_(date, timezone); }); if (keyExists) return; appendClassRow_(spreadsheet, item.templateId, date, item); created += 1; }); } return response_({ success: true, message: created + " class date(s) copied from the selected week." }); }

function createManyClasses_(request, spreadsheet) { const start = date_(request.startDate), end = date_(request.endDate), days = Array.isArray(request.days) ? request.days.map(String) : [], schedule = scheduleValues_(Object.assign({}, request, { day: days[0] || "" })); if (!start || !end || end < start || !days.length || !schedule.ok) return response_({ success: false, code: "VALIDATION_ERROR", message: "Complete class details, a valid date range, and at least one weekday." }); let templateId; if (request.saveRule === true || request.saveRule === "true") { templateId = "TPL-" + Utilities.getUuid().slice(0, 8).toUpperCase(); append_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES), HEADERS.Templates, Object.assign({ TemplateID: templateId, IsOneTime: false }, schedule.value)); } else templateId = createOneTimeRule_(spreadsheet, schedule.value); const rule = Object.assign({}, schedule.value, { TemplateID: templateId }); let created = 0; for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) { if (days.indexOf(dayName_(date)) < 0 || date.getTime() <= Date.now()) continue; const exists = objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES)).some(function (row) { return String(row.TemplateID) === templateId && iso_(date_(row.Date), spreadsheet.getSpreadsheetTimeZone()) === iso_(date, spreadsheet.getSpreadsheetTimeZone()); }); if (!exists) { appendClassRow_(spreadsheet, templateId, date, { className: rule.ClassName, time: rule.Time, instructor: rule.Instructor, inPersonCapacity: rule.InPersonCapacity, onlineCapacity: rule.OnlineCapacity, zoomUrl: rule.ZoomUrl }); created += 1; } } return response_({ success: true, message: created + " class date(s) created." }); }

function bulkRemoveClasses_(request, spreadsheet) { const start = date_(request.startDate), end = date_(request.endDate), templateId = clean_(request.templateId, 120); if (!start || !end || end < start) return response_({ success: false, code: "VALIDATION_ERROR", message: "Choose a valid start date and end date." }); const timezone = spreadsheet.getSpreadsheetTimeZone(), classes = Array.from(classMap_(spreadsheet).values()).filter(function (item) { const date = iso_(item.date, timezone); return item.status !== "Cancelled" && item.date.getTime() > Date.now() && date >= iso_(start, timezone) && date <= iso_(end, timezone) && (!templateId || item.templateId === templateId); }); let deleted = 0, cancelled = 0; classes.forEach(function (item) { const active = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).filter(function (row) { return String(row.ClassID) === item.classId && active_(row); }); if (active.length) { cancelClass_({ classId: item.classId }, spreadsheet); cancelled += 1; } else { const row = findRow_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES), "ClassID", item.classId); if (row) { spreadsheet.getSheetByName(SHEET_NAMES.CLASSES).deleteRow(row); deleted += 1; } } }); return response_({ success: true, message: deleted + " empty class(es) deleted and " + cancelled + " booked class(es) cancelled." }); }

function createOneTimeRule_(spreadsheet, schedule) { const templateId = "ONE-" + Utilities.getUuid().slice(0, 8).toUpperCase(); append_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES), HEADERS.Templates, Object.assign({ TemplateID: templateId, IsOneTime: true }, schedule)); return templateId; }
function appendClassRow_(spreadsheet, templateId, date, details) { const timezone = spreadsheet.getSpreadsheetTimeZone(); append_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES), HEADERS.Classes, { ClassID: templateId + "-" + iso_(date, timezone).replace(/-/g, "") + "-" + Utilities.getUuid().slice(0, 6), TemplateID: templateId, Date: date, Capacity: details.inPersonCapacity, InPersonCapacity: details.inPersonCapacity, OnlineCapacity: details.onlineCapacity, ZoomUrl: details.zoomUrl || "", Status: "Scheduled", ClassNameOverride: details.className || "", TimeOverride: details.time || "", InstructorOverride: details.instructor || "" }); }
function createRuleDates_(spreadsheet, rules, start, end) { const timezone = spreadsheet.getSpreadsheetTimeZone(), existing = new Set(objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES)).map(function (row) { return String(row.TemplateID) + "|" + iso_(date_(row.Date), timezone); })); let created = 0; for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) { rules.forEach(function (rule) { if (String(rule.Day) !== dayName_(date)) return; const key = String(rule.TemplateID) + "|" + iso_(date, timezone); if (existing.has(key) || date.getTime() <= Date.now()) return; appendClassRow_(spreadsheet, String(rule.TemplateID), date, { className: String(rule.ClassName), time: String(rule.Time), instructor: String(rule.Instructor), inPersonCapacity: capacity_(rule.InPersonCapacity, rule.Capacity), onlineCapacity: capacity_(rule.OnlineCapacity, 0), zoomUrl: String(rule.ZoomUrl || "") }); existing.add(key); created += 1; }); } return created; }
function dayName_(date) { return date ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()] : ""; }

function generateClassesForNextWeeks(weeks) {
  const spreadsheet = getSpreadsheet_(); ensureSchema_(spreadsheet); const numberOfWeeks = Number(weeks) > 0 ? Number(weeks) : DEFAULT_WEEKS_TO_GENERATE; const timezone = spreadsheet.getSpreadsheetTimeZone(); const templates = objects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES)); const existing = new Set(objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES)).map(function (row) { return String(row.TemplateID) + "|" + iso_(date_(row.Date), timezone); })); const dayNumbers = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 }; const rows = []; const today = today_();
  for (let offset = 0; offset < numberOfWeeks * 7; offset += 1) { const date = new Date(today); date.setDate(today.getDate() + offset); templates.forEach(function (template) { if (dayNumbers[template.Day] !== date.getDay()) return; const isoDate = iso_(date, timezone), key = String(template.TemplateID) + "|" + isoDate; if (existing.has(key)) return; const inPerson = capacity_(template.InPersonCapacity, template.Capacity), online = capacity_(template.OnlineCapacity, 0); if (inPerson === null || online === null) return; rows.push(row_(HEADERS.Classes, { ClassID: String(template.TemplateID) + "-" + isoDate.replace(/-/g, ""), TemplateID: template.TemplateID, Date: date, Capacity: inPerson, InPersonCapacity: inPerson, OnlineCapacity: online, ZoomUrl: template.ZoomUrl || "", Status: "Scheduled" })); existing.add(key); }); }
  if (rows.length) { const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES); sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.Classes.length).setValues(rows); } return rows.length;
}
function refreshClassCalendar() { return 0; }
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
function history_(spreadsheet, clientId, type, amount, balanceAfter, classId, note, transactionId) { const client = clientById_(spreadsheet, clientId); append_(spreadsheet.getSheetByName(SHEET_NAMES.HISTORY), HEADERS["Session History"], { TransactionID: transactionId || Utilities.getUuid(), ClientID: clientId, Type: type, Amount: amount, BalanceAfter: balanceAfter, ClassID: classId || "", Note: note || "", CreatedAt: new Date(), AdminEmail: "", ClientName: client ? client.FirstName + " " + client.LastName : "Unknown client" }); }

function bookingEmail_(client, classData, attendance, bookingId) { const zoom = attendance === "Online" && classData.zoomUrl ? "<p><strong>Zoom meeting:</strong> <a href=\"" + escape_(classData.zoomUrl) + "\">Join your online class</a></p>" : ""; const calendar = calendarAttachment_(classData, bookingId, attendance, false); return email_(client.Email, "Booking confirmed: " + classData.className, "<p>Hi " + escape_(client.FirstName) + ",</p><p>Your <strong>" + escape_(classData.className) + "</strong> booking is confirmed for " + classText_(classData) + ".</p><p><strong>Attendance:</strong> " + attendance + "<br><strong>Sessions remaining:</strong> " + client.SessionsRemaining + "</p>" + zoom + "<p><strong>Add it to your calendar:</strong> Open the attached calendar file to add this class to Google Calendar, Outlook, Apple Calendar, or another calendar app.</p><p><strong>Cancellation policy:</strong> Online cancellations are available until 24 hours before class starts.</p><p>— Shera Studio</p>", "Hi " + client.FirstName + ", your booking is confirmed for " + classText_(classData) + ". Attendance: " + attendance + ". Sessions remaining: " + client.SessionsRemaining + ". An Add to Calendar file is attached. Online cancellations close 24 hours before class.", calendar); }
function rescheduleEmail_(client, oldClass, newClass, attendance, bookingId) { const zoom = attendance === "Online" && newClass.zoomUrl ? "<p><strong>Zoom meeting:</strong> <a href=\"" + escape_(newClass.zoomUrl) + "\">Join your online class</a></p>" : ""; const calendar = calendarAttachment_(newClass, bookingId, attendance, false); return email_(client.Email, "Booking rescheduled: " + newClass.className, "<p>Hi " + escape_(client.FirstName) + ",</p><p>Your Shera Studio reservation has been moved.</p><p><strong>Previous:</strong> " + escape_(classText_(oldClass)) + "<br><strong>New:</strong> " + escape_(classText_(newClass)) + "<br><strong>Attendance:</strong> " + attendance + "<br><strong>Sessions remaining:</strong> " + client.SessionsRemaining + "</p>" + zoom + "<p>Your session balance has not changed.</p><p><strong>Add it to your calendar:</strong> Open the attached calendar file to add your new class to Google Calendar, Outlook, Apple Calendar, or another calendar app.</p><p>— Shera Studio</p>", "Hi " + client.FirstName + ", your reservation has been moved from " + classText_(oldClass) + " to " + classText_(newClass) + ". Attendance: " + attendance + ". Sessions remaining: " + client.SessionsRemaining + ". Your session balance has not changed. An Add to Calendar file is attached.", calendar); }
function notifyScheduleChange_(spreadsheet, bookings, oldClass, newClass) { bookings.forEach(function (booking) { const attendance = attendance_(booking.AttendanceType) || "In person", zoom = attendance === "Online" && newClass.zoomUrl ? "<p><strong>Zoom meeting:</strong> <a href=\"" + escape_(newClass.zoomUrl) + "\">Join your online class</a></p>" : ""; const sent = email_(String(booking.Email), "Class time changed: " + newClass.className, "<p>Hi " + escape_(booking.FirstName) + ",</p><p>Your Shera Studio class has been updated.</p><p><strong>Previous:</strong> " + escape_(classText_(oldClass)) + "<br><strong>New:</strong> " + escape_(classText_(newClass)) + "</p>" + zoom + "<p>Your booking is still confirmed.</p><p>— Shera Studio</p>", "Hi " + booking.FirstName + ", your class has changed from " + classText_(oldClass) + " to " + classText_(newClass) + ". Your booking is still confirmed."); setByKey_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS), "BookingID", String(booking.BookingID), "EmailStatus", sent ? "Schedule change email sent" : "Schedule change email failed"); }); }
function cancellationEmail_(person, classData, source, client, bookingId) { const studio = source === "Class cancelled by studio"; const balance = client ? "<p><strong>Sessions remaining:</strong> " + client.SessionsRemaining + "</p>" : ""; const calendar = calendarAttachment_(classData, bookingId, "", true); return email_(person.Email, (studio ? "Class cancelled: " : "Booking cancelled: ") + classData.className, "<p>Hi " + escape_(person.FirstName) + ",</p><p>" + (studio ? "The studio has cancelled" : "Your reservation has been cancelled for") + " <strong>" + escape_(classData.className) + "</strong> on " + classText_(classData) + ".</p>" + balance + "<p>An updated calendar cancellation file is attached. Open it to remove the class from your calendar.</p><p>— Shera Studio</p>", "Hi " + person.FirstName + ", " + (studio ? "the studio has cancelled " : "your reservation has been cancelled for ") + classData.className + " on " + classText_(classData) + "." + (client ? " Sessions remaining: " + client.SessionsRemaining + "." : "") + " A calendar cancellation file is attached.", calendar); }
function zeroEmail_(client) { return email_(client.Email, "Your Shera Studio sessions are finished", "<p>Hi " + escape_(client.FirstName) + ",</p><p>You have used your final available session. Please contact Shera to purchase more classes.</p><p>— Shera Studio</p>", "Hi " + client.FirstName + ", you have used your final available session. Please contact Shera to purchase more classes."); }
function email_(to, subject, htmlBody, body, attachment) { try { const message = { to: String(to), subject: subject, htmlBody: htmlBody, body: body, name: "Shera Studio" }; if (attachment) message.attachments = [attachment]; MailApp.sendEmail(message); return true; } catch (error) { console.error(error); return false; } }

function calendarAttachment_(classData, bookingId, attendance, cancelled) { const start = classStart_(classData); const end = new Date(start.getTime() + (endMinutes_(classData.time) - minutes_(classData.time)) * 60 * 1000); const uid = "shera-studio-" + String(bookingId).replace(/[^a-zA-Z0-9-]/g, "") + "@shera-booking"; const now = new Date(); const description = cancelled ? "This Shera Studio reservation has been cancelled." : "Shera Studio class\nAttendance: " + attendance + (attendance === "Online" && classData.zoomUrl ? "\nZoom: " + classData.zoomUrl : ""); const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "CALSCALE:GREGORIAN", "PRODID:-//Shera Studio//Booking Calendar//EN", "METHOD:" + (cancelled ? "CANCEL" : "PUBLISH"), "BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + icsDate_(now), "DTSTART:" + icsDate_(start), "DTEND:" + icsDate_(end), "SUMMARY:" + icsEscape_(cancelled ? "Cancelled: " + classData.className : classData.className), "DESCRIPTION:" + icsEscape_(description), "LOCATION:" + icsEscape_(attendance === "Online" ? "Online class" : "Shera Studio, 265 Finsbury Avenue, Stittsville, ON"), "STATUS:" + (cancelled ? "CANCELLED" : "CONFIRMED"), "SEQUENCE:" + (cancelled ? "1" : "0"), "END:VEVENT", "END:VCALENDAR", ""]; const filename = (cancelled ? "Cancelled - " : "") + String(classData.className).replace(/[\\\\/:*?\"<>|]/g, "-") + ".ics"; return Utilities.newBlob(lines.join("\r\n"), "text/calendar", filename); }
function endMinutes_(time) { const matches = String(time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/ig); if (!matches || matches.length < 2) return minutes_(time) + 60; return minutes_(matches[1]); }
function icsDate_(date) { return Utilities.formatDate(date, "GMT", "yyyyMMdd'T'HHmmss'Z'"); }
function icsEscape_(text) { return String(text || "").replace(/\\\\/g, "\\\\\\\\").replace(/\r\n|\r|\n/g, "\\\\n").replace(/;/g, "\\\\;").replace(/,/g, "\\\\,"); }

function ensureSchema_(spreadsheet) { Object.keys(HEADERS).forEach(function (name) { ensureSheet_(spreadsheet, name, HEADERS[name]); }); }
function ensureSheet_(spreadsheet, name, headers) { let sheet = spreadsheet.getSheetByName(name); if (!sheet) { sheet = spreadsheet.insertSheet(name); sheet.getRange(1, 1, 1, headers.length).setValues([headers]); return; } if (sheet.getLastRow() === 0) { sheet.getRange(1, 1, 1, headers.length).setValues([headers]); return; } const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]; headers.forEach(function (header, index) { const current = String(existing[index] || "").trim(); if (!current) sheet.getRange(1, index + 1).setValue(header); else if (current !== header) throw new Error(name + " column " + (index + 1) + " must be named " + header); }); }
function styleHeaders_(spreadsheet) { Object.keys(HEADERS).forEach(function (name) { const sheet = spreadsheet.getSheetByName(name); sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, HEADERS[name].length).setBackground("#557b72").setFontColor("#fff").setFontWeight("bold"); }); }

function setSpreadsheetId(spreadsheetId) { if (!spreadsheetId) throw new Error("A spreadsheet ID is required."); PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", String(spreadsheetId).trim()); }
function setAdminConfiguration(adminEmail, googleClientId) { if (!adminEmail || !googleClientId) throw new Error("Admin email and Google OAuth client ID are required."); PropertiesService.getScriptProperties().setProperties({ ADMIN_EMAIL: String(adminEmail).trim().toLowerCase(), ADMIN_GOOGLE_CLIENT_ID: String(googleClientId).trim() }); }
function verifyAdmin_(credential) { const token = clean_(credential, 5000), properties = PropertiesService.getScriptProperties(), adminEmail = String(properties.getProperty("ADMIN_EMAIL") || "").trim().toLowerCase(), clientId = String(properties.getProperty("ADMIN_GOOGLE_CLIENT_ID") || "").trim(); if (!adminEmail || !clientId) throw new Error("Admin access has not been configured."); if (!token) throw new Error("Admin sign-in is required."); const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true }); if (response.getResponseCode() !== 200) throw new Error("The Google sign-in has expired or is invalid."); const identity = JSON.parse(response.getContentText()); if (!(identity.email_verified === true || identity.email_verified === "true") || String(identity.aud) !== clientId || String(identity.email).toLowerCase() !== adminEmail) throw new Error("This Google account is not authorized to manage the studio."); }

function identity_(request) { const firstName = clean_(request.firstName, 80), lastName = clean_(request.lastName, 80), email = clean_(request.email, 200).toLowerCase(); return firstName && lastName && EMAIL_PATTERN.test(email) ? { ok: true, value: { firstName: firstName, lastName: lastName, email: email } } : { ok: false, error: { success: false, code: "VALIDATION_ERROR", message: "Enter your first name, last name, and a valid email address." } }; }
function findClient_(spreadsheet, identity) { return objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS)).find(function (row) { return String(row.Email).trim().toLowerCase() === identity.email && String(row.FirstName).trim().toLowerCase() === identity.firstName.toLowerCase() && String(row.LastName).trim().toLowerCase() === identity.lastName.toLowerCase(); }); }
function clientByEmail_(spreadsheet, email) { return objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS)).find(function (row) { return String(row.Email).trim().toLowerCase() === String(email).toLowerCase(); }); }
function clientById_(spreadsheet, clientId) { return objects_(spreadsheet.getSheetByName(SHEET_NAMES.CLIENTS)).find(function (row) { return String(row.ClientID) === String(clientId); }); }
function publicClient_(client) { return { clientId: String(client.ClientID), firstName: String(client.FirstName), lastName: String(client.LastName), email: String(client.Email), sessionsPurchased: Number(client.SessionsPurchased), sessionsRemaining: Number(client.SessionsRemaining), createdAt: client.CreatedAt instanceof Date ? client.CreatedAt.toISOString() : String(client.CreatedAt || ""), updatedAt: client.UpdatedAt instanceof Date ? client.UpdatedAt.toISOString() : String(client.UpdatedAt || "") }; }
function publicTemplate_(row) { const inPerson = capacity_(row.InPersonCapacity, row.Capacity) || 0, online = capacity_(row.OnlineCapacity, 0) || 0; return { templateId: String(row.TemplateID), day: String(row.Day), time: String(row.Time), className: String(row.ClassName), instructor: String(row.Instructor), capacity: inPerson, inPersonCapacity: inPerson, onlineCapacity: online, zoomUrl: String(row.ZoomUrl || ""), isOneTime: String(row.IsOneTime || "").toLowerCase() === "true" }; }
function attendance_(value) { const normalized = String(value || "").trim().toLowerCase(); if (["in person", "in-person", "inperson"].indexOf(normalized) >= 0) return "In person"; if (normalized === "online") return "Online"; return ""; }
function capacity_(value, fallback) { const raw = value === "" || value === undefined || value === null ? fallback : value, number = Number(raw); return Number.isInteger(number) && number >= 0 ? number : null; }
function provided_(value) { return value !== undefined && value !== null && String(value).trim() !== ""; }
function classStart_(classData) { const date = new Date(classData.date); const minutes = minutes_(classData.time); date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0); return date; }
function classText_(classData) { return Utilities.formatDate(classData.date, getSpreadsheet_().getSpreadsheetTimeZone(), "EEEE, MMMM d") + " · " + classData.time; }
function getSpreadsheet_() { const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"); if (id) return SpreadsheetApp.openById(id); const active = SpreadsheetApp.getActiveSpreadsheet(); if (!active) throw new Error("No spreadsheet is connected. Bind this script to a Google Sheet or run setSpreadsheetId()."); return active; }
function objects_(sheet) { const lastRow = sheet.getLastRow(), lastColumn = sheet.getLastColumn(); if (lastRow < 2 || lastColumn < 1) return []; const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues(), headers = values.shift().map(function (header) { return String(header).trim(); }); return values.filter(function (row) { return row.some(function (cell) { return cell !== ""; }); }).map(function (row) { return headers.reduce(function (object, header, index) { object[header] = row[index]; return object; }, {}); }); }
function headers_(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].reduce(function (result, header, index) { result[String(header).trim()] = index + 1; return result; }, {}); }
function findRow_(sheet, header, value) { const index = headers_(sheet)[header]; if (!index || sheet.getLastRow() < 2) return 0; const values = sheet.getRange(2, index, sheet.getLastRow() - 1, 1).getValues(), found = values.findIndex(function (row) { return String(row[0]) === String(value); }); return found < 0 ? 0 : found + 2; }
function deleteMatchingRows_(sheet, header, value) { const index = headers_(sheet)[header]; if (!index || sheet.getLastRow() < 2) return; for (let row = sheet.getLastRow(); row >= 2; row -= 1) { if (String(sheet.getRange(row, index).getValue()) === String(value)) sheet.deleteRow(row); } }
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
