/**
 * Shera booking backend for a Google Sheet-bound Apps Script project.
 *
 * Public endpoints:
 *   GET  /exec -> upcoming classes
 *   POST /exec -> create or cancel a reservation
 */

const SHEET_NAMES = Object.freeze({
  TEMPLATES: "Templates",
  CLASSES: "Classes",
  BOOKINGS: "Bookings",
});

const HEADERS = Object.freeze({
  Templates: ["TemplateID", "Day", "Time", "ClassName", "Instructor", "Capacity"],
  Classes: ["ClassID", "TemplateID", "Date", "Capacity"],
  Bookings: [
    "BookingID",
    "ClassID",
    "FirstName",
    "LastName",
    "Email",
    "Timestamp",
    "Status",
    "CancelCode",
    "CancelledAt",
  ],
});

const DEFAULT_WEEKS_TO_GENERATE = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doGet() {
  try {
    return jsonResponse_({
      success: true,
      classes: getUpcomingClasses_(),
    });
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      success: false,
      code: "SERVER_ERROR",
      message: "The class schedule could not be loaded.",
    });
  }
}

function doPost(event) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const request = parseRequestBody_(event);
    const action = cleanValue_(request.action || "book", 20).toLowerCase();

    if (action === "cancel") return cancelBooking_(request);
    if (action.indexOf("admin") === 0) return handleAdminAction_(action, request);
    if (action !== "book") {
      return jsonResponse_({
        success: false,
        code: "INVALID_ACTION",
        message: "This booking action is not supported.",
      });
    }

    return createBooking_(request);
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      success: false,
      code: "SERVER_ERROR",
      message: "Your request could not be completed. Please try again.",
    });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function createBooking_(request) {
    const classId = cleanValue_(request.classId, 120);
    const firstName = cleanValue_(request.firstName, 80);
    const lastName = cleanValue_(request.lastName, 80);
    const email = cleanValue_(request.email, 200).toLowerCase();

    if (!classId || !firstName || !lastName || !email) {
      return jsonResponse_({
        success: false,
        code: "VALIDATION_ERROR",
        message: "First name, last name, email, and class are required.",
      });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return jsonResponse_({
        success: false,
        code: "INVALID_EMAIL",
        message: "Enter a valid email address.",
      });
    }

    const spreadsheet = getSpreadsheet_();
    validateBookingSheets_(spreadsheet);

    const classesSheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES);
    const bookingsSheet = spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS);
    const classRows = getRowsAsObjects_(classesSheet);
    const bookingRows = getRowsAsObjects_(bookingsSheet);
    const classRow = classRows.find(function (row) {
      return String(row.ClassID) === classId;
    });

    if (!classRow) {
      return jsonResponse_({
        success: false,
        code: "CLASS_NOT_FOUND",
        message: "This class is no longer available.",
      });
    }

    const classDate = normalizeDate_(classRow.Date);
    if (!classDate || classDate.getTime() < startOfToday_().getTime()) {
      return jsonResponse_({
        success: false,
        code: "CLASS_NOT_AVAILABLE",
        message: "This class is no longer open for booking.",
      });
    }

    const duplicate = bookingRows.some(function (booking) {
      return String(booking.ClassID) === classId &&
        String(booking.Email).trim().toLowerCase() === email &&
        isActiveBooking_(booking);
    });

    if (duplicate) {
      return jsonResponse_({
        success: false,
        code: "DUPLICATE_BOOKING",
        message: "This email already has a reservation for the selected class.",
      });
    }

    const bookedCount = bookingRows.filter(function (booking) {
      return String(booking.ClassID) === classId && isActiveBooking_(booking);
    }).length;
    const capacity = Number(classRow.Capacity);

    if (!Number.isFinite(capacity) || capacity < 1) {
      throw new Error("Invalid capacity for class " + classId);
    }

    if (bookedCount >= capacity) {
      return jsonResponse_({
        success: false,
        code: "CLASS_FULL",
        message: "This class is full. Please choose another session.",
      });
    }

    const bookingId = Utilities.getUuid();
    bookingsSheet.appendRow([
      bookingId,
      safeSheetText_(classId),
      safeSheetText_(firstName),
      safeSheetText_(lastName),
      safeSheetText_(email),
      new Date(),
      "Active",
      "",
      "",
    ]);

    return jsonResponse_({
      success: true,
      message: "Your reservation is confirmed.",
      booking: {
        bookingId: bookingId,
        classId: classId,
        remainingSpots: capacity - bookedCount - 1,
      },
    });
}

function cancelBooking_(request) {
  const firstName = cleanValue_(request.firstName, 80).toLowerCase();
  const lastName = cleanValue_(request.lastName, 80).toLowerCase();
  const email = cleanValue_(request.email, 200).toLowerCase();

  if (!firstName || !lastName || !email) {
    return jsonResponse_({
      success: false,
      code: "VALIDATION_ERROR",
      message: "First name, last name, and email are required.",
    });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return jsonResponse_({
      success: false,
      code: "INVALID_EMAIL",
      message: "Enter a valid email address.",
    });
  }

  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);
  const bookingsSheet = spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS);
  const bookingRows = getRowsAsObjects_(bookingsSheet);
  const upcomingClassIds = new Set(
    getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES))
      .filter(function (classRow) {
        const date = normalizeDate_(classRow.Date);
        return date && date.getTime() >= startOfToday_().getTime();
      })
      .map(function (classRow) { return String(classRow.ClassID); }),
  );
  const matchingBookings = bookingRows.filter(function (booking) {
    return String(booking.FirstName).trim().toLowerCase() === firstName &&
      String(booking.LastName).trim().toLowerCase() === lastName &&
      String(booking.Email).trim().toLowerCase() === email &&
      upcomingClassIds.has(String(booking.ClassID)) &&
      isActiveBooking_(booking);
  });

  if (matchingBookings.length === 0) {
    return jsonResponse_({
      success: false,
      code: "BOOKING_NOT_FOUND",
      message: "We could not find an active reservation with those details.",
    });
  }

  if (matchingBookings.length > 1) {
    return jsonResponse_({
      success: false,
      code: "MULTIPLE_BOOKINGS",
      message: "More than one active reservation matches these details. Please call the studio so we cancel the correct class.",
    });
  }

  const booking = matchingBookings[0];
  const bookingId = String(booking.BookingID).trim();
  // getRowsAsObjects_ filters blank rows, so locate the physical row by BookingID.
  const bookingIds = bookingsSheet.getRange(2, 1, bookingsSheet.getLastRow() - 1, 1).getValues();
  const physicalIndex = bookingIds.findIndex(function (row) {
    return String(row[0]).trim() === bookingId;
  });
  if (physicalIndex === -1) throw new Error("Booking row disappeared during cancellation.");

  const sheetRow = physicalIndex + 2;
  bookingsSheet.getRange(sheetRow, 7).setValue("Cancelled");
  bookingsSheet.getRange(sheetRow, 9).setValue(new Date());

  return jsonResponse_({
    success: true,
    message: "Your reservation has been cancelled.",
    cancellation: {
      bookingId: bookingId,
      classId: String(booking.ClassID),
    },
  });
}

/**
 * Run once from the Apps Script editor. It creates the required tabs and
 * fills Templates with the studio's weekly schedule.
 */
function setupBookingSheets() {
  const spreadsheet = getSpreadsheet_();

  const templates = prepareSheet_(spreadsheet, SHEET_NAMES.TEMPLATES, HEADERS.Templates);
  prepareSheet_(spreadsheet, SHEET_NAMES.CLASSES, HEADERS.Classes);
  prepareBookingSheet_(spreadsheet);

  const scheduleRows = [
    ["TPL-MON-1200", "Monday", "12:00 PM – 1:00 PM", "Pilates Core & Strength", "Sherazade", 10],
    ["TPL-MON-1810", "Monday", "6:10 PM – 7:10 PM", "Cardio Pilates", "Sherazade", 10],
    ["TPL-TUE-1830", "Tuesday", "6:30 PM – 7:30 PM", "Pilates & Mobility", "Sherazade", 10],
    ["TPL-WED-1200", "Wednesday", "12:00 PM – 1:00 PM", "Pilates Core & Strength", "Sherazade", 10],
    ["TPL-WED-1800", "Wednesday", "6:00 PM – 7:00 PM", "Cardio Pilates", "Sherazade", 10],
    ["TPL-FRI-1200", "Friday", "12:00 PM – 1:00 PM", "Stretching", "Sherazade", 10],
    ["TPL-FRI-1715", "Friday", "5:15 PM – 6:15 PM", "Stretching", "Sherazade", 10],
    ["TPL-SAT-1000", "Saturday", "10:00 AM – 11:00 AM", "Strength & Stretching", "Sherazade", 10],
  ];

  if (templates.getLastRow() < 2) {
    templates.getRange(2, 1, scheduleRows.length, HEADERS.Templates.length).setValues(scheduleRows);
  }
  styleSheet_(templates, HEADERS.Templates.length);
  styleSheet_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES), HEADERS.Classes.length);
  styleSheet_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS), HEADERS.Bookings.length);

  generateClassesForNextWeeks(DEFAULT_WEEKS_TO_GENERATE);
}

/**
 * Creates dated class rows from Templates without duplicating existing rows.
 * Run manually after template changes, or use createClassGenerationTrigger().
 */
function generateClassesForNextWeeks(weeks) {
  const numberOfWeeks = Number(weeks) > 0 ? Number(weeks) : DEFAULT_WEEKS_TO_GENERATE;
  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);

  const templatesSheet = spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES);
  const classesSheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES);
  const templates = getRowsAsObjects_(templatesSheet);
  const existingClasses = getRowsAsObjects_(classesSheet);
  const timezone = spreadsheet.getSpreadsheetTimeZone();
  const existingKeys = new Set(existingClasses.map(function (item) {
    const date = normalizeDate_(item.Date);
    return String(item.TemplateID) + "|" + formatIsoDate_(date, timezone);
  }));
  const dayNumbers = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const rowsToAdd = [];
  const today = startOfToday_();

  for (let offset = 0; offset < numberOfWeeks * 7; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    templates.forEach(function (template) {
      if (dayNumbers[String(template.Day)] !== date.getDay()) return;

      const isoDate = formatIsoDate_(date, timezone);
      const key = String(template.TemplateID) + "|" + isoDate;
      if (existingKeys.has(key)) return;

      const capacity = Number(template.Capacity);
      if (!template.TemplateID || !Number.isFinite(capacity) || capacity < 1) return;

      rowsToAdd.push([
        String(template.TemplateID) + "-" + isoDate.replace(/-/g, ""),
        template.TemplateID,
        new Date(date),
        capacity,
      ]);
      existingKeys.add(key);
    });
  }

  if (rowsToAdd.length > 0) {
    classesSheet.getRange(classesSheet.getLastRow() + 1, 1, rowsToAdd.length, HEADERS.Classes.length)
      .setValues(rowsToAdd);
    classesSheet.getRange(2, 3, classesSheet.getLastRow() - 1, 1).setNumberFormat("yyyy-mm-dd");
  }

  return rowsToAdd.length;
}

/** Keeps a 12-week rolling calendar filled automatically once per day. */
function refreshClassCalendar() {
  generateClassesForNextWeeks(DEFAULT_WEEKS_TO_GENERATE);
}

function createClassGenerationTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) { return trigger.getHandlerFunction() === "refreshClassCalendar"; })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });

  ScriptApp.newTrigger("refreshClassCalendar")
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
}

/** Run after upgrading an existing booking sheet to add cancellation columns. */
function migrateBookingSheetForCancellation() {
  const sheet = prepareBookingSheet_(getSpreadsheet_());
  styleSheet_(sheet, HEADERS.Bookings.length);
}

/** Optional for a standalone script. Bound Sheet scripts do not need this. */
function setSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId) throw new Error("A spreadsheet ID is required.");
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", String(spreadsheetId).trim());
}

/** Run once to authorize the private dashboard for one Google account. */
function setAdminConfiguration(adminEmail, googleClientId) {
  if (!adminEmail || !googleClientId) throw new Error("Admin email and Google OAuth client ID are required.");
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_EMAIL: String(adminEmail).trim().toLowerCase(),
    ADMIN_GOOGLE_CLIENT_ID: String(googleClientId).trim(),
  });
}

function handleAdminAction_(action, request) {
  try {
    verifyAdminCredential_(request.credential);
  } catch (error) {
    return jsonResponse_({ success: false, code: "ADMIN_UNAUTHORIZED", message: error.message });
  }

  if (action === "admindashboard") {
    return jsonResponse_({ success: true, dashboard: getAdminDashboard_() });
  }
  if (action === "adminupdateclass") return updateClassFromAdmin_(request);
  if (action === "admincreateclass") return createClassFromAdmin_(request);
  if (action === "admindeleteclass") return deleteClassFromAdmin_(request);
  if (action === "admincancelbooking") return cancelBookingFromAdmin_(request);
  if (action === "adminupdatetemplate") return updateTemplateFromAdmin_(request);
  if (action === "admincreatetemplate") return createTemplateFromAdmin_(request);
  if (action === "admingenerateclasses") {
    const createdCount = generateClassesForNextWeeks(DEFAULT_WEEKS_TO_GENERATE);
    return jsonResponse_({ success: true, message: createdCount + " class rows were created." });
  }

  return jsonResponse_({ success: false, code: "INVALID_ACTION", message: "Unknown admin action." });
}

function verifyAdminCredential_(credential) {
  const token = cleanValue_(credential, 5000);
  const properties = PropertiesService.getScriptProperties();
  const adminEmail = String(properties.getProperty("ADMIN_EMAIL") || "").trim().toLowerCase();
  const clientId = String(properties.getProperty("ADMIN_GOOGLE_CLIENT_ID") || "").trim();
  if (!adminEmail || !clientId) throw new Error("Admin access has not been configured.");
  if (!token) throw new Error("Admin sign-in is required.");

  const response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token),
    { muteHttpExceptions: true },
  );
  if (response.getResponseCode() !== 200) throw new Error("The Google sign-in has expired or is invalid.");

  const identity = JSON.parse(response.getContentText());
  const verified = identity.email_verified === true || identity.email_verified === "true";
  if (!verified || String(identity.aud) !== clientId || String(identity.email).toLowerCase() !== adminEmail) {
    throw new Error("This Google account is not authorized to manage the studio.");
  }
}

function getAdminDashboard_() {
  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);
  const timezone = spreadsheet.getSpreadsheetTimeZone();
  const templates = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES));
  const classes = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES));
  const bookings = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS));
  const templateMap = new Map(templates.map(function (template) {
    return [String(template.TemplateID), template];
  }));

  const dashboardClasses = classes
    .map(function (classRow) {
      const date = normalizeDate_(classRow.Date);
      const template = templateMap.get(String(classRow.TemplateID));
      if (!date || !template) return null;
      const classId = String(classRow.ClassID);
      const classBookings = bookings
        .filter(function (booking) { return String(booking.ClassID) === classId; })
        .map(function (booking) {
          return {
            bookingId: String(booking.BookingID),
            firstName: String(booking.FirstName),
            lastName: String(booking.LastName),
            email: String(booking.Email),
            timestamp: formatDateTime_(booking.Timestamp, timezone),
            status: isActiveBooking_(booking) ? "Active" : String(booking.Status || "Cancelled"),
          };
        });
      const activeCount = classBookings.filter(function (booking) { return booking.status === "Active"; }).length;
      const capacity = Number(classRow.Capacity);
      return {
        classId: classId,
        templateId: String(classRow.TemplateID),
        className: String(template.ClassName),
        day: Utilities.formatDate(date, timezone, "EEEE"),
        date: formatIsoDate_(date, timezone),
        time: String(template.Time),
        instructor: String(template.Instructor),
        capacity: capacity,
        bookedCount: activeCount,
        remainingSpots: Math.max(0, capacity - activeCount),
        isPast: date.getTime() < startOfToday_().getTime(),
        bookings: classBookings,
        rawDate: date,
      };
    })
    .filter(Boolean)
    .sort(function (a, b) { return a.rawDate.getTime() - b.rawDate.getTime(); })
    .map(function (classItem) { delete classItem.rawDate; return classItem; });

  return {
    classes: dashboardClasses,
    templates: templates.map(function (template) {
      return {
        templateId: String(template.TemplateID),
        day: String(template.Day),
        time: String(template.Time),
        className: String(template.ClassName),
        instructor: String(template.Instructor),
        capacity: Number(template.Capacity),
      };
    }),
    summary: {
      upcomingClasses: dashboardClasses.filter(function (item) { return !item.isPast; }).length,
      activeBookings: dashboardClasses.filter(function (item) { return !item.isPast; }).reduce(function (total, item) { return total + item.bookedCount; }, 0),
      fullClasses: dashboardClasses.filter(function (item) { return !item.isPast && item.remainingSpots === 0; }).length,
    },
  };
}

function updateClassFromAdmin_(request) {
  const classId = cleanValue_(request.classId, 120);
  const date = normalizeDate_(request.date);
  const capacity = Number(request.capacity);
  if (!classId || !date || !Number.isFinite(capacity) || capacity < 1) {
    return jsonResponse_({ success: false, code: "VALIDATION_ERROR", message: "Valid class, date, and capacity are required." });
  }

  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES);
  const row = findSheetRow_(sheet, "ClassID", classId);
  if (!row) return jsonResponse_({ success: false, code: "CLASS_NOT_FOUND", message: "Class not found." });
  const activeCount = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS))
    .filter(function (booking) { return String(booking.ClassID) === classId && isActiveBooking_(booking); }).length;
  if (capacity < activeCount) {
    return jsonResponse_({ success: false, code: "CAPACITY_TOO_LOW", message: "Capacity cannot be lower than the active booking count." });
  }
  sheet.getRange(row, 3, 1, 2).setValues([[date, capacity]]);
  return jsonResponse_({ success: true, message: "Class updated." });
}

function createClassFromAdmin_(request) {
  const templateId = cleanValue_(request.templateId, 120);
  const date = normalizeDate_(request.date);
  const capacity = Number(request.capacity);
  if (!templateId || !date || !Number.isFinite(capacity) || capacity < 1) {
    return jsonResponse_({ success: false, code: "VALIDATION_ERROR", message: "Template, date, and capacity are required." });
  }
  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);
  const templateExists = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES))
    .some(function (template) { return String(template.TemplateID) === templateId; });
  if (!templateExists) return jsonResponse_({ success: false, code: "TEMPLATE_NOT_FOUND", message: "Template not found." });
  const timezone = spreadsheet.getSpreadsheetTimeZone();
  const classId = templateId + "-" + formatIsoDate_(date, timezone).replace(/-/g, "") + "-" + Utilities.getUuid().slice(0, 6);
  spreadsheet.getSheetByName(SHEET_NAMES.CLASSES).appendRow([classId, safeSheetText_(templateId), date, capacity]);
  return jsonResponse_({ success: true, message: "Class added." });
}

function deleteClassFromAdmin_(request) {
  const classId = cleanValue_(request.classId, 120);
  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);
  const activeBookings = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS))
    .filter(function (booking) { return String(booking.ClassID) === classId && isActiveBooking_(booking); }).length;
  if (activeBookings > 0) {
    return jsonResponse_({ success: false, code: "CLASS_HAS_BOOKINGS", message: "Cancel active bookings before deleting this class." });
  }
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.CLASSES);
  const row = findSheetRow_(sheet, "ClassID", classId);
  if (!row) return jsonResponse_({ success: false, code: "CLASS_NOT_FOUND", message: "Class not found." });
  sheet.deleteRow(row);
  return jsonResponse_({ success: true, message: "Class deleted." });
}

function cancelBookingFromAdmin_(request) {
  const bookingId = cleanValue_(request.bookingId, 120);
  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS);
  const row = findSheetRow_(sheet, "BookingID", bookingId);
  if (!row) return jsonResponse_({ success: false, code: "BOOKING_NOT_FOUND", message: "Booking not found." });
  sheet.getRange(row, 7).setValue("Cancelled");
  sheet.getRange(row, 9).setValue(new Date());
  return jsonResponse_({ success: true, message: "Booking cancelled." });
}

function updateTemplateFromAdmin_(request) {
  const templateId = cleanValue_(request.templateId, 120);
  const day = cleanValue_(request.day, 20);
  const time = cleanValue_(request.time, 80);
  const className = cleanValue_(request.className, 120);
  const instructor = cleanValue_(request.instructor, 120);
  const capacity = Number(request.capacity);
  if (!templateId || !day || !time || !className || !instructor || !Number.isFinite(capacity) || capacity < 1) {
    return jsonResponse_({ success: false, code: "VALIDATION_ERROR", message: "Complete every schedule field." });
  }
  if (["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day) === -1) {
    return jsonResponse_({ success: false, code: "INVALID_DAY", message: "Choose a valid weekday." });
  }
  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES);
  const row = findSheetRow_(sheet, "TemplateID", templateId);
  if (!row) return jsonResponse_({ success: false, code: "TEMPLATE_NOT_FOUND", message: "Template not found." });
  sheet.getRange(row, 2, 1, 5).setValues([[
    day, safeSheetText_(time), safeSheetText_(className), safeSheetText_(instructor), capacity,
  ]]);
  return jsonResponse_({ success: true, message: "Weekly schedule updated." });
}

function createTemplateFromAdmin_(request) {
  const day = cleanValue_(request.day, 20);
  const time = cleanValue_(request.time, 80);
  const className = cleanValue_(request.className, 120);
  const instructor = cleanValue_(request.instructor, 120);
  const capacity = Number(request.capacity);
  if (!day || !time || !className || !instructor || !Number.isFinite(capacity) || capacity < 1) {
    return jsonResponse_({ success: false, code: "VALIDATION_ERROR", message: "Complete every new weekly class field." });
  }
  if (["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day) === -1) {
    return jsonResponse_({ success: false, code: "INVALID_DAY", message: "Choose a valid weekday." });
  }
  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);
  const templateId = "TPL-" + Utilities.getUuid().slice(0, 8).toUpperCase();
  spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES).appendRow([
    templateId, day, safeSheetText_(time), safeSheetText_(className), safeSheetText_(instructor), capacity,
  ]);
  return jsonResponse_({ success: true, message: "Weekly class added." });
}

function findSheetRow_(sheet, headerName, value) {
  const rows = getRowsAsObjects_(sheet);
  const index = rows.findIndex(function (row) { return String(row[headerName]) === String(value); });
  if (index === -1) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const physicalIndex = ids.findIndex(function (row) { return String(row[0]) === String(value); });
  return physicalIndex === -1 ? 0 : physicalIndex + 2;
}

function formatDateTime_(value, timezone) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : Utilities.formatDate(date, timezone, "yyyy-MM-dd h:mm a");
}

function getUpcomingClasses_() {
  const spreadsheet = getSpreadsheet_();
  validateBookingSheets_(spreadsheet);

  const timezone = spreadsheet.getSpreadsheetTimeZone();
  const templates = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.TEMPLATES));
  const classes = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.CLASSES));
  const bookings = getRowsAsObjects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS));
  const templateMap = new Map(templates.map(function (template) {
    return [String(template.TemplateID), template];
  }));
  const bookingCounts = new Map();

  bookings.forEach(function (booking) {
    if (!isActiveBooking_(booking)) return;
    const classId = String(booking.ClassID);
    bookingCounts.set(classId, (bookingCounts.get(classId) || 0) + 1);
  });

  return classes
    .map(function (classRow) {
      const classId = String(classRow.ClassID);
      const template = templateMap.get(String(classRow.TemplateID));
      const date = normalizeDate_(classRow.Date);
      const capacity = Number(classRow.Capacity);
      const bookedCount = bookingCounts.get(classId) || 0;

      if (!template || !date || !Number.isFinite(capacity)) return null;

      return {
        classId: classId,
        className: String(template.ClassName),
        day: Utilities.formatDate(date, timezone, "EEEE"),
        date: Utilities.formatDate(date, timezone, "MMMM d"),
        dateIso: formatIsoDate_(date, timezone),
        time: String(template.Time),
        capacity: capacity,
        bookedCount: bookedCount,
        remainingSpots: Math.max(0, capacity - bookedCount),
        instructor: String(template.Instructor),
        sortTime: getStartMinutes_(String(template.Time)),
        rawDate: date,
      };
    })
    .filter(function (item) {
      return item && item.rawDate.getTime() >= startOfToday_().getTime();
    })
    .sort(function (a, b) {
      return a.rawDate.getTime() - b.rawDate.getTime() || a.sortTime - b.sortTime;
    })
    .map(function (item) {
      delete item.rawDate;
      delete item.sortTime;
      return item;
    });
}

function getSpreadsheet_() {
  const configuredId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (configuredId) return SpreadsheetApp.openById(configuredId);

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSpreadsheet) {
    throw new Error("No spreadsheet is connected. Bind this script to a Google Sheet or run setSpreadsheetId().");
  }
  return activeSpreadsheet;
}

function validateBookingSheets_(spreadsheet) {
  prepareBookingSheet_(spreadsheet);

  Object.keys(HEADERS).forEach(function (sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error("Missing required sheet: " + sheetName);

    const actualHeaders = sheet.getRange(1, 1, 1, HEADERS[sheetName].length).getValues()[0];
    HEADERS[sheetName].forEach(function (expected, index) {
      if (String(actualHeaders[index]).trim() !== expected) {
        throw new Error(sheetName + " column " + (index + 1) + " must be named " + expected);
      }
    });
  });
}

function prepareBookingSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAMES.BOOKINGS);
    sheet.getRange(1, 1, 1, HEADERS.Bookings.length).setValues([HEADERS.Bookings]);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.Bookings.length).setValues([HEADERS.Bookings]);
    return sheet;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.Bookings.length).getValues()[0];
  HEADERS.Bookings.forEach(function (header, index) {
    const current = String(currentHeaders[index]).trim();
    if (!current && index >= 6) {
      sheet.getRange(1, index + 1).setValue(header);
    } else if (current !== header) {
      throw new Error(SHEET_NAMES.BOOKINGS + " column " + (index + 1) + " must be named " + header);
    }
  });

  if (sheet.getLastRow() >= 2) {
    const rowCount = sheet.getLastRow() - 1;
    const statusValues = sheet.getRange(2, 7, rowCount, 1).getValues();
    let statusesChanged = false;

    statusValues.forEach(function (row) {
      if (!String(row[0]).trim()) {
        row[0] = "Active";
        statusesChanged = true;
      }
    });

    if (statusesChanged) sheet.getRange(2, 7, rowCount, 1).setValues(statusValues);
  }

  return sheet;
}

function prepareSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (header, index) {
    if (String(currentHeaders[index]).trim() !== header) {
      throw new Error(sheetName + " column " + (index + 1) + " must be named " + header);
    }
  });
  return sheet;
}

function styleSheet_(sheet, columnCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground("#557b72")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.autoResizeColumns(1, columnCount);
}

function getRowsAsObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values.shift().map(function (header) { return String(header).trim(); });

  return values
    .filter(function (row) { return row.some(function (cell) { return cell !== ""; }); })
    .map(function (row) {
      return headers.reduce(function (record, header, index) {
        record[header] = row[index];
        return record;
      }, {});
    });
}

function parseRequestBody_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("Missing request body.");
  }
  return JSON.parse(event.postData.contents);
}

function cleanValue_(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function safeSheetText_(value) {
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function isActiveStatus_(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "" || normalized === "active";
}

function isActiveBooking_(booking) {
  return isActiveStatus_(booking.Status);
}

function normalizeDate_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function startOfToday_() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatIsoDate_(date, timezone) {
  return date ? Utilities.formatDate(date, timezone, "yyyy-MM-dd") : "";
}

function getStartMinutes_(timeRange) {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 0;

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  if (match[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + minutes;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
