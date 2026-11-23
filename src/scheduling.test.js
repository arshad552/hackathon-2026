import { describe, expect, it } from "vitest";
import { isSlotOccupied, overlaps, recommend, recommendEquipment } from "./scheduling";

const request = {
  equipmentId: "scope",
  date: "2026-11-24",
  time: "09:00",
  deadline: "2026-11-26",
};

describe("deterministic booking recommendations", () => {
  it("only treats approved bookings as occupied", () => {
    const bookings = [
      { ...request, status: "pending" },
      { ...request, status: "conflict" },
    ];

    expect(isSlotOccupied("scope", request.date, request.time, bookings)).toBe(false);
    expect(recommend(request, bookings, new Date("2026-11-23T08:00:00")).conflict).toBe(false);
  });

  it("detects an approval candidate colliding with an approved slot", () => {
    expect(overlaps(
      { ...request, status: "pending" },
      { ...request, status: "approved" },
    )).toBe(true);
    expect(overlaps(request, { ...request, equipmentId: "gpu" })).toBe(false);
  });

  it("finds alternatives before the deadline and skips approved slots", () => {
    const bookings = [
      { ...request, status: "approved" },
      { ...request, date: "2026-11-24", time: "11:00", status: "approved" },
      { ...request, date: "2026-11-24", time: "13:00", status: "approved" },
    ];

    expect(recommend(request, bookings, new Date("2026-11-23T08:00:00"))).toEqual({
      conflict: true,
      alternatives: [
        { date: "2026-11-24", time: "15:00" },
        { date: "2026-11-25", time: "09:00" },
        { date: "2026-11-25", time: "11:00" },
      ],
    });
  });

  it("ranks project resources by matching capabilities deterministically", () => {
    const equipment = [
      { id: "gpu", name: "GPU workstation", category: "AI Computing", description: "Model training", keywords: ["deep learning", "computer vision"] },
      { id: "pi", name: "Raspberry Pi", category: "IoT", description: "Embedded sensors", keywords: ["sensors", "embedded"] },
      { id: "scope", name: "Oscilloscope", category: "Measurement", description: "Circuit testing", keywords: ["electronics"] },
    ];

    expect(recommendEquipment("computer vision model", equipment).map(item => item.id)).toEqual(["gpu"]);
    expect(recommendEquipment("an unrelated literature review", equipment)).toEqual([]);
    expect(recommendEquipment("model", equipment)).toEqual([]);
  });
});
