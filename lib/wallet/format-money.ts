export function formatUsdFromCents(cents: number): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${(n / 100).toFixed(2)}`;
}
