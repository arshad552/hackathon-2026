const test = require("node:test");
const assert = require("node:assert/strict");
const { canReviewRole, dateKeyInZone, isDateKey, reservationLockId, roleOrStudent, timeKeyInZone, validateBookingInput } = require("../src/domain.cjs");

test("booking input accepts valid fixed two-hour slots", () => {
  assert.deepEqual(validateBookingInput({
    equipmentId: "jetson",
    project: "Plant disease classifier",
    date: "2026-11-24",
    time: "11:00",
    deadline: "2026-11-30",
  }, "2026-11-23"), {
    equipmentId: "jetson",
    project: "Plant disease classifier",
    date: "2026-11-24",
    time: "11:00",
    deadline: "2026-11-30",
  });
});

test("booking validation rejects malformed dates, expired requests, and unsupported slots", () => {
  const base = { equipmentId: "jetson", project: "Project", date: "2026-11-24", time: "09:00", deadline: "2026-11-25" };
  assert.throws(() => validateBookingInput({ ...base, date: "2026-02-30" }, "2026-11-23"));
  assert.throws(() => validateBookingInput({ ...base, date: "2026-11-22" }, "2026-11-23"));
  assert.throws(() => validateBookingInput({ ...base, time: "10:00" }, "2026-11-23"));
  assert.throws(() => validateBookingInput({ ...base, deadline: "2026-11-23" }, "2026-11-23"));
  assert.throws(() => validateBookingInput({ ...base, date: "2026-11-23", deadline: "2026-11-23", time: "09:00" }, "2026-11-23", "10:00"));
});

test("reservation locks identify each fixed slot uniquely", () => {
  assert.equal(reservationLockId("jetson", "2026-11-24", "09:00"), "jetson_2026-11-24_0900");
  assert.notEqual(reservationLockId("jetson", "2026-11-24", "09:00"), reservationLockId("jetson", "2026-11-24", "11:00"));
});

test("only trusted faculty and administrators can review bookings", () => {
  assert.equal(canReviewRole("student"), false);
  assert.equal(canReviewRole("faculty"), false);
  assert.equal(canReviewRole("faculty", true), true);
  assert.equal(canReviewRole("admin"), true);
  assert.equal(roleOrStudent("unexpected"), "student");
  assert.equal(isDateKey("2026-02-30"), false);
  assert.equal(dateKeyInZone(new Date("2026-11-23T20:00:00Z"), "Asia/Kolkata"), "2026-11-24");
  assert.equal(timeKeyInZone(new Date("2026-11-23T20:00:00Z"), "Asia/Kolkata"), "01:30");
});
