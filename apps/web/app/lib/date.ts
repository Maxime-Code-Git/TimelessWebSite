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
