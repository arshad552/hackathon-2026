const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    throw new Error("Usage: node functions/scripts/grant-admin.cjs <firebase-auth-uid>");
  }

  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("Set GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT to the Firebase project ID first.");
  }

  initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...user.customClaims, role: "admin" });
  console.log("Admin role granted. The user must sign in again to refresh their token.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
