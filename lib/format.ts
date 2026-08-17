export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return formatUsd(0, 6);
  return formatUsd(value, 6);
}

export function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) return formatUsd(0, 6);
  return formatUsd(value, 6);
}

export function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) return formatUsd(0, 2);
  return formatUsd(value, 2);
}

function formatUsd(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

export function compactText(value: string, maxLength = 80): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
