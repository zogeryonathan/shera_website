# Shera Booking System Setup

This booking system uses only Google Sheets, Google Apps Script, and the browser Fetch API. No database service is required.

## 1. Create the Google Sheet

1. Create a blank Google Sheet in the studio owner's Google account.
2. Name it something clear, such as `Shera Class Bookings`.
3. In the Sheet, open **Extensions → Apps Script**.
4. Replace the editor's default code with the complete contents of [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
5. In Apps Script, open **Project Settings**, enable **Show "appsscript.json" manifest file in editor**, and replace that file with [`google-apps-script/appsscript.json`](google-apps-script/appsscript.json).
6. Save the Apps Script project.

Because the script is created from inside the Sheet, it is automatically connected to that Sheet. Do not put the Sheet ID in the website.

## 2. Create the tabs and weekly schedule

1. Select `setupBookingSheets` in the Apps Script function menu.
2. Click **Run**.
3. Approve the Google authorization prompts.

The function safely creates these three tabs without deleting existing rows when rerun:

### Templates

| TemplateID | Day | Time | ClassName | Instructor | Capacity |
| --- | --- | --- | --- | --- | --- |

The exact weekly schedule is added here. Capacity defaults to `10`; the owner can change any template's capacity, instructor, name, or time directly in this tab.

### Classes

| ClassID | TemplateID | Date | Capacity |
| --- | --- | --- | --- |

Every row is one actual dated class. The setup function generates the next 12 weeks. The owner can:

- change a class date or capacity;
- delete a class row to remove that session from the website;
- add a one-off class by copying a row, assigning a unique `ClassID`, and choosing a valid `TemplateID`.

### Bookings

| BookingID | ClassID | FirstName | LastName | Email | Timestamp | Status | CancelCode | CancelledAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Every successful reservation is added here with `Status` set to `Active`. A client cancellation changes the status to `Cancelled` and records `CancelledAt`; the row remains available for the owner’s records, but no longer consumes a spot. `CancelCode` is retained only for compatibility with the earlier version and is not required from clients.

If this Sheet was created with the earlier six-column Bookings layout, run `migrateBookingSheetForCancellation` once after pasting the updated `Code.gs`. It adds the cancellation tracking columns without deleting existing bookings.

## 3. Keep future classes generated

Run `createClassGenerationTrigger` once from the Apps Script editor and approve authorization. It creates one daily trigger that keeps a rolling 12-week class calendar populated.

After changing the Templates schedule, run `generateClassesForNextWeeks` manually. Existing dated classes and bookings are preserved; only missing class rows are added.

## 4. Deploy the Google Apps Script API

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon and choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Click **Deploy** and approve any prompt.
6. Copy the Web App URL ending in `/exec`. Do not use the `/dev` testing URL.

If `Anyone` is unavailable, the Google Workspace administrator must allow public Apps Script web apps. The website cannot call a deployment that requires visitors to sign in.

## 5. Connect the website

Open [`src/booking/config.js`](src/booking/config.js) and paste the `/exec` URL between the quotes:

```js
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
```

This is the only website file where the Apps Script URL belongs. Do not paste it into `bookingService.js` or a React component.

Commit and push the config change to GitHub. Vercel will rebuild automatically from the pushed commit.

## 6. Updating the Apps Script later

Saving `Code.gs` does not update the live Web App deployment by itself.

1. Open **Deploy → Manage deployments**.
2. Edit the active deployment.
3. Choose **New version**.
4. Click **Deploy**.

The `/exec` URL normally stays the same, so `config.js` does not need to change.

## How booking works

- `GET` returns every upcoming row from Classes joined with its Templates row, plus live booking counts.
- `POST` accepts `classId`, `firstName`, `lastName`, and `email`.
- A cancellation `POST` accepts the same `firstName`, `lastName`, and `email` used to book.
- Apps Script validates all fields and the email address.
- A script lock prevents simultaneous requests from overbooking the final spot.
- Email plus ClassID prevents duplicate active reservations. A client may reserve again after cancelling.
- Only active booking rows count toward capacity.
- User-entered text is protected against spreadsheet formula injection.
- The frontend sends POST data as JSON with a `text/plain` content type to avoid a browser CORS preflight that Apps Script cannot handle reliably.
- Open booking pages refresh availability every 30 seconds and when a visitor returns to the browser tab.

## Client cancellation flow

1. The client opens **Manage Booking** and enters the same first name, last name, and email used to reserve.
2. The latest booking details are saved in that browser to prefill the form.
3. Apps Script looks for one matching active upcoming reservation under a script lock.
4. It marks that row `Cancelled` and releases the spot.
5. The schedule refreshes immediately for that client; other open pages update within 30 seconds.

If the same client has more than one active upcoming reservation, the website will not guess which class to cancel. It asks the client to call the studio so the owner can cancel the correct row safely.

## Studio owner workflow

- Edit the repeating schedule and default capacity in **Templates**.
- Manage actual dates and exceptions in **Classes**.
- View and search reservations in **Bookings**. Filter `Status` to see active or cancelled clients.
- To cancel for a client, set `Status` to `Cancelled` and enter a date/time in `CancelledAt`. Deleting a row also releases its spot but removes the history.
- Never rename or reorder the required columns.
- Never publish the Sheet itself; only the Apps Script Web App needs public access.

## Local development

```bash
npm install
npm run dev
```

Production build check:

```bash
npm run build
```
