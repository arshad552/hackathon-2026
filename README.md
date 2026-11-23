# LabLink AI

LabLink AI is a React + Vite campus laboratory resource-sharing app. It supports a local, no-login demo and an authenticated Firebase mode with real-time equipment/booking data, faculty approval, and server-enforced scheduling.

## Local development and tests

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
npm ci --prefix functions
npm run test --prefix functions
```

The browser app reads Firebase's public web-app configuration from the existing root `.env.local` using `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`. Optional storage-bucket and messaging-sender fields remain optional. Set `VITE_CAMPUS_TIME_ZONE` in the local frontend environment and `LABLINK_TIME_ZONE` in `functions/.env.<project-id>` to the same IANA time zone (for example, `Asia/Kolkata`); both default to UTC. Never place service-account credentials or private keys in a `VITE_` variable or inside `public/`.

`public/.env.local` was removed so Vite cannot copy it into `dist`. Root `.env.local` was not modified. The `.gitignore` rules already ignore local environment files.

## Demo and authenticated modes

Without a signed-in Firebase account, LabLink stays in **Demo mode**. Demo bookings and approvals use the `lablink-demo-v1` browser-local storage key and never call Firestore. Signing in switches equipment discovery and booking history to Firestore; student history is filtered to the signed-in UID, while faculty/admin views are permitted by custom role claims and Firestore rules.

Email/password and Google popup authentication use Firebase Auth. New or unclaimed accounts receive the server-assigned `student` role. Only a user whose Firebase custom claim is `role: "admin"` can assign `student` or `faculty`; no client request can assign the admin role. Live approvals and rescheduling go through authenticated callable Cloud Functions. A reservation-lock document and the booking status are written in one Firestore transaction, so concurrent approvals for the same equipment/date/two-hour slot cannot both succeed.

Bookings use 09:00, 11:00, 13:00, or 15:00 slots in the configured campus time zone, represented by `YYYY-MM-DD` dates. Equipment documents live in `equipment/{equipmentId}`, requests in `bookings/{bookingId}`, and private occupancy locks in `reservationLocks/{equipmentId_date_time}`. Students can read only their own bookings; verified faculty and admins can read the approval queue. Client writes to bookings and locks are denied.

## Firebase Console and first-admin setup

These are preparation steps; nothing was deployed and no live security rules were changed.

1. In Firebase Console, create/select the intended project, register a web app, enable **Email/Password** and **Google** under Authentication providers, and add the local development/production domains to Authorized domains.
2. Enable Cloud Firestore in the project. Verify that the root Firebase web-app configuration points to this project. Keep the existing root `.env.local` private and local.
3. Use a staging Firebase project first. Inspect any existing deployed rules and data before replacing them. The repository's `firestore.rules` is deny-by-default except for signed-in reads of active equipment and owner/faculty booking reads. Booking/lock writes are callable-only. Deploy rules only after reviewing the diff and obtaining approval:

   ```sh
   firebase use <staging-project-id>
   firebase deploy --only firestore:rules
   ```

4. Cloud Functions deployment requires the Firebase project's billing/Blaze plan. Install Firebase CLI if needed, authenticate the CLI and Application Default Credentials, and select the same staging project. Set `LABLINK_TIME_ZONE` in `functions/.env.<project-id>` to the same IANA zone as `VITE_CAMPUS_TIME_ZONE` in the local frontend environment (both default to UTC). Install Functions dependencies, then deploy the callable backend:

   ```sh
   firebase login
   gcloud auth application-default login
   firebase use <staging-project-id>
   npm ci --prefix functions
   firebase deploy --only functions
   ```

5. Create the first account through LabLink. Find its Firebase Auth UID in Console, then grant the initial admin role from a trusted operator machine with Application Default Credentials:

   ```sh
   # PowerShell
   $env:GCLOUD_PROJECT = "<staging-project-id>"
   gcloud auth application-default login
   node functions/scripts/grant-admin.cjs <firebase-auth-uid>
   ```

   This script accepts a UID, does not include credentials, and merges the server-managed custom claim. The user must sign out and back in. Admins can then assign `faculty` or `student` roles by UID in the Faculty Console and initialize missing starter equipment. Existing equipment documents are never overwritten by the seed operation.
6. After confirming the staged app and rules behave as expected, obtain approval before deploying rules or Functions to the live project. Never grant the `admin` custom claim through the client UI or an untrusted process.

## Security and operations notes

- The root Firebase web API key is a client identifier, not a server secret; restrict it in Google Cloud to the intended APIs and web origins. Firebase Admin credentials must remain outside the repository and browser bundle.
- `ensureRole`, role assignment, equipment seeding, booking creation, approval/rejection, and rescheduling are Firebase callable functions in `functions/src/index.js`. Faculty checks use the verified Firebase ID-token custom claim on the server, not just the React UI.
- `firestore.rules` is a new proposed ruleset. It was not deployed. There was no pre-existing rules file or Firebase deployment configuration in the repository to compare against.
- This project intentionally does not include Gemini credentials or a GenAI endpoint. Project matching remains transparent and deterministic.
- Backend unit tests validate booking input, fixed slots, role authorization policy, and reservation lock IDs. Firestore transaction concurrency and rules should additionally be exercised against the Firebase Emulator Suite in staging before production use.
