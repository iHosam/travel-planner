const formatters = new Map();

export function formatMoney(amount, currency = 'USD') {
  const whole = Number.isInteger(amount);
  const key = `${currency}:${whole}`;
  if (!formatters.has(key)) {
    let formatter;
    try {
      formatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: whole ? 0 : undefined,
        maximumFractionDigits: whole ? 0 : undefined,
      });
    } catch {
      formatter = { format: (value) => `${value} ${currency}` };
    }
    formatters.set(key, formatter);
  }
  return formatters.get(key).format(amount);
}
