const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const ROAM_DATE = /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/;

export function parseDate(title: string | undefined | null): string | null {
  if (!title) return null;
  const match = ROAM_DATE.exec(title.trim());
  if (!match) return null;
  const [, monthName, dayStr, yearStr] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  const day = Number(dayStr);
  const year = Number(yearStr);
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
