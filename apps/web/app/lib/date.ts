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

export function formatEuropeanDate(
  dateInput: string | number | Date | null | undefined,
  lang: "fr" | "en" = "fr"
): string {
  if (dateInput === null || dateInput === undefined || dateInput === "") return "";

  if (typeof dateInput === "string") {
    const dateOnly = dateInput.split("T")[0];
    const parts = dateOnly.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      const year = parts[0];
      const month = parts[1].padStart(2, "0");
      const day = parts[2].padStart(2, "0");
      if (!isNaN(Number(year)) && !isNaN(Number(month)) && !isNaN(Number(day))) {
        return `${day}/${month}/${year}`;
      }
    }
  }

  const date =
    dateInput instanceof Date
      ? dateInput
      : typeof dateInput === "number"
      ? new Date(dateInput)
      : new Date(String(dateInput));

  if (isNaN(date.getTime())) return typeof dateInput === "string" ? dateInput : "";

  const locale = lang === "fr" ? "fr-BE" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}
