export const HOURS = ["09:00", "11:00", "13:00", "15:00"];
export const CAMPUS_TIME_ZONE = import.meta.env.VITE_CAMPUS_TIME_ZONE || "UTC";

export function dateKey(date) {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function today() {
  return dateKey(new Date());
}

export function currentTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CAMPUS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function addDays(days, from = today()) {
  const value = new Date(`${dateKey(from)}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isSlotOccupied(equipmentId, date, time, bookings) {
  return bookings.some(booking =>
    booking.equipmentId === equipmentId &&
    booking.date === date &&
    booking.time === time &&
    booking.status === "approved"
  );
}

export function overlaps(first, second) {
  return first.equipmentId === second.equipmentId &&
    first.date === second.date &&
    first.time === second.time;
}

export function recommend(request, bookings, now = new Date()) {
  const occupied = bookings.filter(booking =>
    booking.equipmentId === request.equipmentId &&
    booking.status === "approved"
  );
  const conflict = isSlotOccupied(request.equipmentId, request.date, request.time, bookings);
  const alternatives = [];
  const start = new Date(`${request.date}T12:00:00.000Z`);
  const currentDate = dateKey(now);
  const nowTime = currentTime(now);

  for (let day = 0; day < 7 && alternatives.length < 3; day++) {
    const date = addDays(day, start);
    if (date > request.deadline) continue;

    for (const time of HOURS) {
      if (date === request.date && time === request.time) continue;
      if (date < currentDate || (date === currentDate && time <= nowTime)) continue;
      if (!occupied.some(booking => booking.date === date && booking.time === time)) {
        alternatives.push({ date, time });
      }
      if (alternatives.length >= 3) break;
    }
  }

  return { conflict, alternatives };
}

export function recommendEquipment(project, equipment) {
  const query = project.trim().toLowerCase();
  if (!query) return [];
  const genericTerms = new Set(["model", "project", "system", "device", "prototype", "research", "build", "building", "using"]);

  return equipment
    .map(item => {
      const keywords = (item.keywords || []).map(keyword => keyword.toLowerCase());
      const name = item.name.toLowerCase();
      const category = item.category.toLowerCase();
      const description = item.description.toLowerCase();
      const score = keywords.reduce((total, keyword) => total + (query.includes(keyword) ? 3 : 0), 0) +
        (name.split(/\W+/).filter(word => word.length > 2 && query.includes(word)).length * 2) +
        (category.split(/\W+/).filter(word => word.length > 2 && query.includes(word)).length * 2) +
        (description.split(/\W+/).filter(word => word.length > 3 && !genericTerms.has(word) && query.includes(word)).length);
      return { item, score };
    })
    .filter(result => result.score > 0)
    .sort((first, second) => second.score - first.score || first.item.name.localeCompare(second.item.name))
    .slice(0, 3)
    .map(result => result.item);
}
