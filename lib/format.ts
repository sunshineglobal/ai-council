export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.000000";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 6,
    maximumFractionDigits: 6
  }).format(value);
}

export function compactText(value: string, maxLength = 80): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
