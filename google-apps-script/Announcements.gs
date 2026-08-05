/** Sends a private class announcement to every currently active participant. */
function sendClassAnnouncement_(request, spreadsheet) {
  const classId = clean_(request.classId, 120);
  const subject = clean_(request.subject, 160);
  const message = clean_(request.message, 2500);
  if (!classId || !subject || !message) return response_({ success: false, code: "VALIDATION_ERROR", message: "Enter an email subject and message before sending." });

  const classData = classMap_(spreadsheet).get(classId);
  if (!classData || classData.status === "Cancelled") return response_({ success: false, code: "CLASS_NOT_FOUND", message: "This active class could not be found." });

  const recipients = objects_(spreadsheet.getSheetByName(SHEET_NAMES.BOOKINGS)).filter(function (booking) {
    return String(booking.ClassID) === classId && active_(booking);
  });
  if (recipients.length === 0) return response_({ success: false, code: "NO_ACTIVE_PARTICIPANTS", message: "There are no active participants to email for this class." });

  const classDetails = classText_(classData);
  let sentCount = 0;
  let failedCount = 0;
  recipients.forEach(function (booking) {
    const htmlBody = "<p>Hi " + escape_(booking.FirstName) + ",</p>"
      + "<p><strong>Class:</strong> " + escape_(classData.className) + "<br><strong>When:</strong> " + escape_(classDetails) + "</p>"
      + "<p>" + escape_(message).replace(/\n/g, "<br>") + "</p><p>— Shera Studio</p>";
    const textBody = "Hi " + booking.FirstName + ",\n\nClass: " + classData.className + "\nWhen: " + classDetails + "\n\n" + message + "\n\n— Shera Studio";
    if (email_(booking.Email, subject, htmlBody, textBody)) sentCount += 1;
    else failedCount += 1;
  });

  const summary = "Announcement sent to " + sentCount + " participant" + (sentCount === 1 ? "" : "s") + (failedCount ? ". " + failedCount + " email" + (failedCount === 1 ? "" : "s") + " could not be delivered." : ".");
  return response_({ success: true, message: summary, sentCount: sentCount, failedCount: failedCount });
}
