const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { canReviewRole, dateKeyInZone, reservationLockId, roleOrStudent, timeKeyInZone, validateBookingInput } = require("./domain.cjs");

initializeApp();

const auth = getAuth();
const db = getFirestore();
const CAMPUS_TIME_ZONE = process.env.LABLINK_TIME_ZONE || "UTC";

function campusClock() {
  const now = new Date();
  return {
    date: dateKeyInZone(now, CAMPUS_TIME_ZONE),
    time: timeKeyInZone(now, CAMPUS_TIME_ZONE),
  };
}

const EQUIPMENT_SEED = [
  { id: "jetson", name: "NVIDIA Jetson Nano", dept: "AI & Robotics", category: "AI Computing", location: "Innovation Lab · A-204", description: "Edge AI development, computer vision and autonomous systems.", specs: ["4 GB edge compute", "CUDA-enabled", "On-site induction"], keywords: ["edge ai", "computer vision", "robotics", "autonomous", "machine learning"] },
  { id: "printer", name: "Ultimaker 3D Printer", dept: "Mechanical", category: "Fabrication", location: "Maker Space · B-102", description: "High-precision prototyping and additive manufacturing.", specs: ["Dual extrusion", "Build volume 215 mm", "PLA / PETG"], keywords: ["3d printing", "prototyping", "fabrication", "mechanical"] },
  { id: "pi", name: "Raspberry Pi 5 Kit", dept: "Computer Science", category: "IoT & Embedded", location: "IoT Studio · C-301", description: "Embedded systems, sensors and connected device projects.", specs: ["8 GB RAM", "GPIO sensor pack", "Power supply included"], keywords: ["iot", "embedded", "sensors", "connected device", "raspberry pi"] },
  { id: "gpu", name: "RTX GPU Workstation", dept: "AI & Robotics", category: "AI Computing", location: "Compute Lab · A-208", description: "Deep learning experiments and accelerated model training.", specs: ["24 GB VRAM", "CUDA toolkit", "Linux workstation"], keywords: ["deep learning", "computer vision", "model training", "gpu", "machine learning", "ai"] },
  { id: "scope", name: "Digital Oscilloscope", dept: "Electronics", category: "Measurement", location: "Electronics Lab · D-105", description: "Electronic signal analysis, testing and circuit debugging.", specs: ["4-channel, 100 MHz", "Probe set included", "Electronics induction"], keywords: ["electronics", "signal", "circuit", "measurement", "debugging"] },
  { id: "arduino", name: "Arduino Sensor Kit", dept: "Electronics", category: "IoT & Embedded", location: "Innovation Lab · C-303", description: "Sensor integration, microcontrollers and rapid IoT prototyping.", specs: ["Arduino-compatible", "12 sensor modules", "USB-C connection"], keywords: ["sensors", "microcontroller", "iot", "embedded", "prototyping"] },
].map(({ id, ...equipment }) => ({ id, ...equipment, active: true }));

function requireSignedIn(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return request.auth;
}

function requireAdmin(request) {
  const identity = requireSignedIn(request);
  if (identity.token.role !== "admin") {
    throw new HttpsError("permission-denied", "Only an administrator can manage roles or seed equipment.");
  }
  return identity;
}

exports.ensureRole = onCall(async request => {
  const identity = requireSignedIn(request);
  const user = await auth.getUser(identity.uid);
  const role = roleOrStudent(user.customClaims?.role);
  if (user.customClaims?.role !== role) {
    await auth.setCustomUserClaims(identity.uid, { ...user.customClaims, role });
  }
  return { role };
});

exports.setUserRole = onCall(async request => {
  requireAdmin(request);
  const { uid, role } = request.data || {};
  if (typeof uid !== "string" || !uid || !["student", "faculty"].includes(role)) {
    throw new HttpsError("invalid-argument", "Provide a user ID and the student or faculty role.");
  }
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "Administrators cannot change their own role.");
  }
  const user = await auth.getUser(uid);
  if (role === "faculty" && !user.emailVerified) {
    throw new HttpsError("failed-precondition", "The faculty member must verify their email before receiving faculty access.");
  }
  await auth.setCustomUserClaims(uid, { ...user.customClaims, role });
  return { uid, role };
});

exports.seedEquipment = onCall(async request => {
  requireAdmin(request);
  const refs = EQUIPMENT_SEED.map(item => db.collection("equipment").doc(item.id));
  const existing = await db.getAll(...refs);
  const batch = db.batch();
  let created = 0;
  existing.forEach((snapshot, index) => {
    if (!snapshot.exists) {
      batch.create(refs[index], { ...EQUIPMENT_SEED[index], createdAt: FieldValue.serverTimestamp() });
      created += 1;
    }
  });
  if (created) await batch.commit();
  return { created, total: EQUIPMENT_SEED.length };
});

exports.createBooking = onCall(async request => {
  const identity = requireSignedIn(request);
  const clock = campusClock();
  const input = validateBookingInput(request.data, clock.date, clock.time);
  const user = await auth.getUser(identity.uid);
  const equipmentRef = db.collection("equipment").doc(input.equipmentId);
  const bookingRef = db.collection("bookings").doc();
  const lockRef = db.collection("reservationLocks").doc(
    reservationLockId(input.equipmentId, input.date, input.time),
  );
  const equipmentSnapshot = await equipmentRef.get();

  if (!equipmentSnapshot.exists || equipmentSnapshot.data().active !== true) {
    throw new HttpsError("not-found", "This equipment is not currently available for booking.");
  }

  const status = await db.runTransaction(async transaction => {
    const lock = await transaction.get(lockRef);
    const nextStatus = lock.exists ? "conflict" : "pending";
    transaction.create(bookingRef, {
      ...input,
      equipmentName: equipmentSnapshot.data().name,
      student: user.displayName || "Student",
      studentUid: identity.uid,
      status: nextStatus,
      createdAt: FieldValue.serverTimestamp(),
    });
    return nextStatus;
  });

  return { bookingId: bookingRef.id, status };
});

exports.reviewBooking = onCall(async request => {
  const identity = requireSignedIn(request);
  if (!canReviewRole(identity.token.role, identity.token.email_verified === true)) {
    throw new HttpsError("permission-denied", "A faculty role and verified email are required to review bookings.");
  }

  const { bookingId, decision } = request.data || {};
  if (typeof bookingId !== "string" || !bookingId || !["approved", "rejected"].includes(decision)) {
    throw new HttpsError("invalid-argument", "Provide a booking ID and an approve or reject decision.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  return db.runTransaction(async transaction => {
    const bookingSnapshot = await transaction.get(bookingRef);
    if (!bookingSnapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
    const booking = bookingSnapshot.data();
    if (!["pending", "conflict"].includes(booking.status)) {
      throw new HttpsError("failed-precondition", "This request has already been reviewed.");
    }

    const updates = {
      status: decision,
      reviewedBy: identity.uid,
      reviewedAt: FieldValue.serverTimestamp(),
    };

    if (decision === "approved") {
      const clock = campusClock();
      if (booking.date < clock.date || (booking.date === clock.date && booking.time <= clock.time)) {
        throw new HttpsError("failed-precondition", "Past booking slots cannot be approved.");
      }
      const lockRef = db.collection("reservationLocks").doc(
        reservationLockId(booking.equipmentId, booking.date, booking.time),
      );
      const lockSnapshot = await transaction.get(lockRef);
      if (lockSnapshot.exists) {
        transaction.update(bookingRef, {
          status: "conflict",
          conflictReason: "slot_already_reserved",
          reviewedBy: identity.uid,
          reviewedAt: FieldValue.serverTimestamp(),
        });
        return { bookingId, status: "conflict" };
      }
      transaction.create(lockRef, {
        bookingId,
        equipmentId: booking.equipmentId,
        date: booking.date,
        time: booking.time,
        studentUid: booking.studentUid,
        approvedBy: identity.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    transaction.update(bookingRef, updates);
    return { bookingId, status: decision };
  });
});

exports.rescheduleBooking = onCall(async request => {
  const identity = requireSignedIn(request);
  const { bookingId, date, time } = request.data || {};
  if (typeof bookingId !== "string" || !bookingId) {
    throw new HttpsError("invalid-argument", "A booking ID is required.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  return db.runTransaction(async transaction => {
    const bookingSnapshot = await transaction.get(bookingRef);
    if (!bookingSnapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
    const booking = bookingSnapshot.data();
    if (booking.studentUid !== identity.uid && !canReviewRole(identity.token.role, identity.token.email_verified === true)) {
      throw new HttpsError("permission-denied", "Only the requester or verified faculty can reschedule this request.");
    }
    if (!["pending", "conflict"].includes(booking.status)) {
      throw new HttpsError("failed-precondition", "Only unresolved requests can be rescheduled.");
    }

    let updated;
    try {
      const clock = campusClock();
      updated = validateBookingInput({
        equipmentId: booking.equipmentId,
        project: booking.project,
        date,
        time,
        deadline: booking.deadline,
      }, clock.date, clock.time);
    } catch (error) {
      throw new HttpsError("invalid-argument", error.message);
    }

    const lockRef = db.collection("reservationLocks").doc(
      reservationLockId(updated.equipmentId, updated.date, updated.time),
    );
    const lockSnapshot = await transaction.get(lockRef);
    const status = lockSnapshot.exists ? "conflict" : "pending";
    transaction.update(bookingRef, { date: updated.date, time: updated.time, status });
    return { bookingId, status };
  });
});
