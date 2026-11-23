import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, functions } from "./firebase";

function requireService(service, name) {
  if (!service) throw new Error(`Firebase ${name} is unavailable. Check the Firebase configuration.`);
  return service;
}

export function watchEquipment(onData, onError) {
  const database = requireService(db, "Firestore");
  return onSnapshot(
    query(collection(database, "equipment"), where("active", "==", true)),
    snapshot => onData(snapshot.docs.map(document => ({ id: document.id, ...document.data() }))),
    onError,
  );
}

export function watchBookings(user, role, onData, onError) {
  const database = requireService(db, "Firestore");
  const bookings = collection(database, "bookings");
  const bookingQuery = role === "faculty" || role === "admin"
    ? query(bookings)
    : query(bookings, where("studentUid", "==", user.uid));

  return onSnapshot(
    bookingQuery,
    snapshot => {
      const results = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
      results.sort((first, second) => (second.createdAt?.toMillis?.() || 0) - (first.createdAt?.toMillis?.() || 0));
      onData(results);
    },
    onError,
  );
}

function invoke(name, data = {}) {
  const service = requireService(functions, "Cloud Functions");
  return httpsCallable(service, name)(data).then(result => result.data);
}

export const ensureRole = () => invoke("ensureRole");
export const createBookingRequest = input => invoke("createBooking", input);
export const reviewBooking = (bookingId, decision) => invoke("reviewBooking", { bookingId, decision });
export const rescheduleBooking = (bookingId, date, time) => invoke("rescheduleBooking", { bookingId, date, time });
export const seedEquipment = () => invoke("seedEquipment");
export const setUserRole = (uid, role) => invoke("setUserRole", { uid, role });
