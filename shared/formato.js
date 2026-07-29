// Formato de PRESENTACIÓN para las apps en español (puerta, admin). Solo cambia
// cómo se ve un dato en pantalla — el valor guardado y con el que se cruza
// (fecha ISO `YYYY-MM-DD` para joins con barra/Revolut, euros como número puro)
// NUNCA pasa por acá para calcular ni se persiste transformado. El dashboard del
// dueño tiene su propio formato en inglés (`dashboard/format.js`) — no usa este.

// ISO 'YYYY-MM-DD' → 'DD/MM/YYYY'. Se parsea por componentes (no `new Date()`)
// para que el día no se corra según el huso horario del navegador.
export function fechaDMY(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}
