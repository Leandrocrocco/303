// Shared formatting helpers — every tab module formats through these, never
// hand-rolls its own money/percent/date string. Keeps the currency in one
// place (this is where the old $-instead-of-€ bug lived).

export function money(n) {
  return `€${Math.round(n).toLocaleString('en-US')}`;
}

export function money2(n) {
  return `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(n, digits = 0) {
  return `${n.toFixed(digits)}%`;
}

export function shortDate(fechaStr) {
  return new Date(fechaStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Mes y año de "hoy" en hora local — nunca toISOString().slice(0,10) para
// esto: correría la fecha a las primeras horas de la madrugada en Barcelona.
export function monthYearNow() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
