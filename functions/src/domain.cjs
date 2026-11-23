const HOURS = ["09:00", "11:00", "13:00", "15:00"];
const ROLES = new Set(["student", "faculty", "admin"]);

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateKeyInZone(date, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function timeKeyInZone(date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function validateBookingInput(
  data,
  currentDate = dateKeyInZone(new Date()),
  currentTime = timeKeyInZone(new Date()),
) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Booking details are required.");
  }

  const equipmentId = typeof data.equipmentId === "string" ? data.equipmentId.trim() : "";
  const project = typeof data.project === "string" ? data.project.trim() : "";
  const date = data.date;
  const time = data.time;
  const deadline = data.deadline;

  if (!/^[\w-]{1,64}$/.test(equipmentId)) throw new TypeError("Choose valid equipment.");
  if (!project || project.length > 120) throw new TypeError("Project title must be between 1 and 120 characters.");
  if (!isDateKey(date) || date < currentDate) throw new TypeError("Choose a valid future booking date.");
  if (!isDateKey(deadline) || deadline < date) throw new TypeError("Project deadline must be on or after the booking date.");
  if (!HOURS.includes(time)) throw new TypeError("Choose a valid two-hour time slot.");
  if (date === currentDate && time <= currentTime) throw new TypeError("Choose a time slot that has not passed.");

  return { equipmentId, project, date, time, deadline };
}

function reservationLockId(equipmentId, date, time) {
  return `${equipmentId}_${date}_${time.replace(":", "")}`;
}

function roleOrStudent(role) {
  return ROLES.has(role) ? role : "student";
}

function canReviewRole(role, emailVerified = false) {
  return role === "admin" || (role === "faculty" && emailVerified === true);
}

module.exports = {
  HOURS,
  canReviewRole,
  dateKeyInZone,
  isDateKey,
  reservationLockId,
  roleOrStudent,
  timeKeyInZone,
  validateBookingInput,
};
