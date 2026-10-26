/** Heures et dates pour l'affichage. L'API manipule l'heure en minutes depuis minuit, dans le fuseau de l'utilisateur. */

const LOCALE = "fr-FR";

/** 1320 devient « 22:00 » (valeur d'un champ `<input type="time">`). */
export function minutesToTime(minutes: number): string {
  const clamped = Math.min(Math.max(Math.trunc(minutes), 0), 1439);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** « 22:00 » devient 1320. Renvoie `null` si la saisie n'est pas une heure valide (champ vidé, texte). */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Date et heure dans le fuseau de l'utilisateur : « 23 oct., 08:00 ». Un fuseau inconnu retombe sur celui du navigateur. */
export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  try {
    return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(LOCALE, options).format(date);
  }
}

/** « jeu. 23 oct. » : jour de la semaine, jour et mois. */
export function formatDay(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  try {
    return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(LOCALE, options).format(date);
  }
}

/** « 23 oct. » : jour et mois, pour une période (« du 16 au 23 oct. »). */
export function formatShortDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  try {
    return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(LOCALE, options).format(date);
  }
}
