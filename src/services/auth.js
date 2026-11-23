import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";

function requireAuth() {
  if (!auth) throw new Error("Firebase is not configured. Continue in demo mode or configure the Firebase environment.");
  return auth;
}

export function observeAuth(next, error) {
  return onAuthStateChanged(requireAuth(), next, error);
}

export function registerWithEmail(email, password, displayName) {
  return createUserWithEmailAndPassword(requireAuth(), email.trim(), password).then(async result => {
    await updateProfile(result.user, { displayName: displayName.trim() });
    await sendEmailVerification(result.user);
    return result.user;
  });
}

export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(requireAuth(), email.trim(), password).then(result => result.user);
}

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(requireAuth(), provider).then(result => result.user);
}

export function signOutUser() {
  return signOut(requireAuth());
}
