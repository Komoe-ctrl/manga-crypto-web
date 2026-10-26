import { describe, expect, it } from "vitest";
import { formatDateTime, formatDay, formatShortDate, minutesToTime, timeToMinutes } from "./time";

describe("minutesToTime", () => {
  it.each([
    [0, "00:00"],
    [420, "07:00"],
    [480, "08:00"],
    [1320, "22:00"],
    [1439, "23:59"],
    [65, "01:05"],
  ])("%i → %s", (minutes, time) => expect(minutesToTime(minutes)).toBe(time));

  it("borne les valeurs absurdes au lieu d'afficher « 25:00 »", () => {
    expect(minutesToTime(-5)).toBe("00:00");
    expect(minutesToTime(5000)).toBe("23:59");
  });
});

describe("timeToMinutes", () => {
  it.each([
    ["22:00", 1320],
    ["07:00", 420],
    ["00:00", 0],
    ["23:59", 1439],
    ["7:05", 425],
    [" 08:30 ", 510],
  ])("%j → %i", (time, minutes) => expect(timeToMinutes(time)).toBe(minutes));

  it.each(["", "abc", "24:00", "12:60", "12", "12:5", "-1:00", "12:00:00"])("%j est refusé (null)", (time) => {
    expect(timeToMinutes(time)).toBeNull();
  });

  it("est l'inverse de minutesToTime sur toute la journée", () => {
    for (let m = 0; m < 1440; m += 7) expect(timeToMinutes(minutesToTime(m))).toBe(m);
  });
});

describe("formatage des dates", () => {
  const ISO = "2026-10-23T06:00:00Z";

  it("respecte le fuseau de l'utilisateur (08:00 à Paris en octobre)", () => {
    expect(formatDateTime(ISO, "Europe/Paris")).toContain("08:00");
    expect(formatDateTime(ISO, "UTC")).toContain("06:00");
  });

  it("un fuseau inconnu retombe sur celui du navigateur, sans planter", () => {
    expect(() => formatDateTime(ISO, "Pas/UnFuseau")).not.toThrow();
    expect(formatDateTime(ISO, "Pas/UnFuseau")).not.toBe("—");
  });

  it("une date invalide s'affiche « — »", () => {
    expect(formatDateTime("pas une date")).toBe("—");
    expect(formatDay("pas une date")).toBe("—");
    expect(formatShortDate("pas une date")).toBe("—");
  });

  it("jour de la semaine et date courte, à la française", () => {
    expect(formatDay(ISO, "Europe/Paris")).toMatch(/ven\./); // le 23 octobre 2026 est un vendredi
    expect(formatShortDate(ISO, "Europe/Paris")).toMatch(/23\s+oct/);
  });
});
