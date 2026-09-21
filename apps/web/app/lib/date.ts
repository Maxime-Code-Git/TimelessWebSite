export function addCalendarMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const expectedMonth = (d.getMonth() + months) % 12;
  d.setMonth(d.getMonth() + months);

  const targetMonth = expectedMonth < 0 ? expectedMonth + 12 : expectedMonth;
  if (d.getMonth() !== targetMonth) {
    d.setDate(0);
  }
  return d;
}

export function formatEuropeanDate(dateString: string, lang: "fr" | "en"): string {
  if (!dateString) return "";

  const parts = dateString.split("T")[0].split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const locale = lang === "fr" ? "fr-BE" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}
