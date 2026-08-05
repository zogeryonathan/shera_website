/**
 * Calendar-aware rescheduling emails.
 *
 * The cancellation file deliberately uses the original booking ID. That is
 * the UID used by the original .ics file, allowing calendar apps to match the
 * old event instead of treating the cancellation as a separate event.
 */
function rescheduleCalendarEmail_(client, oldClass, newClass, attendance, oldBookingId, newBookingId, oldAttendance) {
  const zoom = attendance === "Online" && newClass.zoomUrl
    ? "<p><strong>Zoom meeting:</strong> <a href=\"" + escape_(newClass.zoomUrl) + "\">Join your online class</a></p>"
    : "";
  const cancellation = calendarAttachment_(oldClass, oldBookingId, oldAttendance, true);
  const replacement = calendarAttachment_(newClass, newBookingId, attendance, false);
  const subject = "Booking rescheduled: " + newClass.className;
  const htmlBody = "<p>Hi " + escape_(client.FirstName) + ",</p>"
    + "<p>Your Shera Studio reservation has been moved.</p>"
    + "<p><strong>Previous:</strong> " + escape_(classText_(oldClass))
    + "<br><strong>New:</strong> " + escape_(classText_(newClass))
    + "<br><strong>Attendance:</strong> " + attendance
    + "<br><strong>Sessions remaining:</strong> " + client.SessionsRemaining + "</p>"
    + zoom
    + "<p>Your session balance has not changed.</p>"
    + "<p><strong>Calendar updates:</strong> Two calendar files are attached. The file beginning <em>Cancelled</em> updates your previous class using the same calendar event ID, so supported calendar apps can remove the old event. The other file adds the new class.</p>"
    + "<p>— Shera Studio</p>";
  const body = "Hi " + client.FirstName + ", your reservation has been moved from " + classText_(oldClass)
    + " to " + classText_(newClass) + ". Attendance: " + attendance
    + ". Sessions remaining: " + client.SessionsRemaining
    + ". Your session balance has not changed. Two calendar files are attached: a cancellation update for the old class and an Add to Calendar file for the new class.";
  return emailWithAttachments_(client.Email, subject, htmlBody, body, [cancellation, replacement]);
}

function emailWithAttachments_(to, subject, htmlBody, body, attachments) {
  try {
    MailApp.sendEmail({ to: String(to), subject: subject, htmlBody: htmlBody, body: body, name: "Shera Studio", attachments: attachments });
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
