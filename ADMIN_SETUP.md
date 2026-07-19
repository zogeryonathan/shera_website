# Shera Owner Dashboard Setup

The private dashboard is available at `/admin.html`. It uses the existing Google Sheet and Apps Script API. Google Sign-In protects all client names, emails, bookings, and schedule changes.

## 1. Create the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a standard Google Cloud project you control.
2. Configure the **OAuth consent screen** in that project. For a personal Google account, choose External and add the studio owner as a test user while the app is in testing.
3. Open **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Choose **Web application**.
5. Add these **Authorized JavaScript origins**:
   - the production website origin, for example `https://your-domain.com`;
   - the Vercel production origin if it is different;
   - `http://localhost:5173` for local testing.
6. Copy the generated Client ID ending in `.apps.googleusercontent.com`.

The OAuth client may be in a separate Cloud project; the Apps Script only verifies the resulting Google token and its Client ID.

Do not add paths such as `/admin.html` to Authorized JavaScript origins. Use only the origin.

## 2. Configure the website

Open `src/admin/config.js` and paste the Client ID:

```js
const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";
```

The Client ID identifies the website and is safe to include in frontend code. It is not a client secret.

The Apps Script `/exec` URL remains configured in `src/booking/config.js`; both public booking and private administration use that deployment.

## 3. Authorize the owner in Apps Script

1. Open **Apps Script → Project Settings**.
2. Scroll to **Script properties**.
3. Add these two properties exactly:

| Property | Value |
| --- | --- |
| `ADMIN_EMAIL` | The studio owner’s Google-account email, in lowercase |
| `ADMIN_GOOGLE_CLIENT_ID` | The same OAuth Client ID entered in `src/admin/config.js` |

These properties stay on the Apps Script server and are not returned to website visitors.

## 4. Deploy the updated Apps Script

1. Replace `Code.gs` with the updated repository version.
2. Open **Deploy → Manage deployments**.
3. Edit the current Web App deployment.
4. Select **New version** and deploy.
5. Keep **Execute as: Me** and public access enabled because clients still need the booking endpoints.

The admin endpoints remain protected even though the Web App is public: every admin request verifies the Google ID token, OAuth Client ID, verified email, and exact authorized owner email before accessing private data.

## Owner workflow

Visit `https://your-domain.com/admin.html` and sign in with the authorized Google account.

### Classes & Bookings

- View upcoming classes and live booking totals.
- Expand a class to view client names, email addresses, and booking times.
- Cancel an individual booking.
- Change a dated class’s date or capacity.
- Add a one-time dated class using an existing weekly template.
- Delete an empty class. A class with active bookings cannot be deleted until those bookings are cancelled.

### Weekly Schedule

- Change the repeating class name, weekday, time, instructor, or default capacity.
- Click **Generate Missing Classes** after schedule changes.

Template name, time, and instructor changes apply to all dated classes linked to that template. Changing a template weekday does not automatically delete old dated rows; generate missing classes, then review and delete any obsolete empty classes from **Classes & Bookings**. Existing booked classes are protected from deletion.

## Security notes

- Never create an unprotected admin-data GET endpoint.
- Never put the owner’s Google password, OAuth client secret, or Sheet ID in the website.
- The dashboard keeps the short-lived Google credential only in React memory; reloading or signing out requires another Google sign-in.
- If the owner email changes, update the `ADMIN_EMAIL` Script property.
