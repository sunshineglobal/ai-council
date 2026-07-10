export function currentMonthValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(value: string, fallbackDate = new Date()) {
  const [yearValue, monthValue] = value.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const start = Number.isFinite(year) && Number.isFinite(month)
    ? new Date(year, month - 1, 1)
    : new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

  return {
    from: start.toISOString(),
    to: end.toISOString()
  };
}

export function formatRange(from: string, to: string): string {
  const start = new Date(from);
  const end = new Date(new Date(to).getTime() - 1);
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${end.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  })}`;
}
