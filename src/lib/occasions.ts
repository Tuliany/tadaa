import type { Language } from "./types";

/**
 * Seasonal moments small businesses post about, per market (picked from the brand's language:
 * sv → Sweden, es → Spain, de → Germany, fr → France, en → international).
 * Dates are approximate where they move (e.g. back to school); the AI uses them as inspiration.
 */

export interface Occasion {
  date: string; // YYYY-MM-DD
  name: string;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Easter Sunday (Anonymous Gregorian algorithm). */
function easter(y: number) {
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86400_000);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
/** The n-th weekday (0 = Sunday) of a month; n = -1 for the last. */
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(y, m - 1, 1 + offset + (n - 1) * 7));
  }
  const last = new Date(Date.UTC(y, m, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(y, m - 1, last.getUTCDate() - offset));
}
/** First `weekday` on or after a date. */
function weekdayFrom(y: number, m: number, d: number, weekday: number) {
  const start = new Date(Date.UTC(y, m - 1, d));
  return shift(start, (weekday - start.getUTCDay() + 7) % 7);
}

function forYear(y: number, lang: Language): Occasion[] {
  const e = easter(y);
  const common: Occasion[] = [
    { date: iso(y, 1, 1), name: "New Year" },
    { date: iso(y, 2, 14), name: "Valentine's Day" },
    { date: iso(y, 10, 31), name: "Halloween" },
    { date: fmt(shift(nthWeekday(y, 11, 4, 4), 1)), name: "Black Friday" },
    { date: iso(y, 12, 24), name: "Christmas Eve" },
    { date: iso(y, 12, 31), name: "New Year's Eve" },
    { date: fmt(e), name: "Easter" },
  ];
  switch (lang) {
    case "sv":
      return [
        ...common,
        { date: fmt(shift(e, -47)), name: "Fettisdagen (semla day)" },
        { date: iso(y, 3, 25), name: "Våffeldagen" },
        { date: iso(y, 4, 30), name: "Valborg" },
        { date: fmt(nthWeekday(y, 5, 0, -1)), name: "Mother's Day (Mors dag)" },
        { date: iso(y, 6, 6), name: "National Day of Sweden" },
        { date: fmt(weekdayFrom(y, 6, 19, 5)), name: "Midsommar" },
        { date: iso(y, 8, 18), name: "Back to school (skolstart)" },
        { date: iso(y, 10, 4), name: "Kanelbullens dag" },
        { date: fmt(nthWeekday(y, 11, 0, 2)), name: "Father's Day (Fars dag)" },
        { date: fmt(weekdayFrom(y, 11, 27, 0)), name: "First of Advent" },
        { date: iso(y, 12, 13), name: "Lucia" },
      ];
    case "es":
      return [
        ...common.filter((o) => o.name !== "Christmas Eve"),
        { date: iso(y, 1, 6), name: "Día de Reyes" },
        { date: iso(y, 3, 19), name: "Día del Padre" },
        { date: fmt(shift(e, -7)), name: "Semana Santa" },
        { date: iso(y, 4, 23), name: "Día del Libro / Sant Jordi" },
        { date: fmt(nthWeekday(y, 5, 0, 1)), name: "Día de la Madre" },
        { date: iso(y, 6, 23), name: "Noche de San Juan" },
        { date: iso(y, 7, 1), name: "Summer season starts" },
        { date: iso(y, 9, 8), name: "Back to school (vuelta al cole)" },
        { date: iso(y, 10, 12), name: "Fiesta Nacional" },
        { date: iso(y, 12, 22), name: "Lotería de Navidad" },
        { date: iso(y, 12, 24), name: "Nochebuena" },
      ];
    case "de":
      return [
        ...common,
        { date: fmt(nthWeekday(y, 5, 0, 2)), name: "Muttertag" },
        { date: fmt(shift(e, 39)), name: "Vatertag" },
        { date: iso(y, 9, 1), name: "Back to school" },
        { date: fmt(weekdayFrom(y, 9, 16, 6)), name: "Oktoberfest" },
        { date: fmt(weekdayFrom(y, 11, 27, 0)), name: "First of Advent" },
        { date: iso(y, 12, 6), name: "Nikolaus" },
      ];
    case "fr":
      return [
        ...common,
        { date: iso(y, 1, 6), name: "Épiphanie (galette des rois)" },
        { date: fmt(nthWeekday(y, 5, 0, -1)), name: "Fête des mères" },
        { date: fmt(nthWeekday(y, 6, 0, 3)), name: "Fête des pères" },
        { date: iso(y, 6, 21), name: "Fête de la musique" },
        { date: iso(y, 7, 14), name: "Fête nationale" },
        { date: iso(y, 9, 2), name: "Rentrée" },
      ];
    default:
      return [
        ...common,
        { date: fmt(nthWeekday(y, 5, 0, 2)), name: "Mother's Day" },
        { date: fmt(nthWeekday(y, 6, 0, 3)), name: "Father's Day" },
        { date: iso(y, 9, 1), name: "Back to school" },
        { date: fmt(shift(nthWeekday(y, 11, 4, 4), 4)), name: "Cyber Monday" },
      ];
  }
}

/** Occasions between two dates (inclusive), sorted. */
export function occasionsBetween(lang: Language, from: string, to: string): Occasion[] {
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const all: Occasion[] = [];
  for (let y = y1; y <= y2; y++) all.push(...forYear(y, lang));
  return all.filter((o) => o.date >= from && o.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}
