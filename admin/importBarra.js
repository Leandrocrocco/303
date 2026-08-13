// Parseo y preview del export de transacciones de Revolut POS. Formato
// confirmado sobre un export real (ago 2026):
// Location name, Date (UTC), Receipt#, Order discount, Subtotal (excl. tax),
// Total taxes, Service charge, Tip, Total, Payment method, Status
//
// El matching real de cada transacción a un turno lo hace un trigger en la
// base (migración 013, _asignar_turno_barra — mismo corte que noche_303:
// 06:00 Europe/Madrid). Acá se REPLICA esa misma regla, pero solo para
// poder mostrar un preview ANTES de guardar nada — nada se escribe hasta
// que el admin confirma. Si el corte de noche_303() cambiara algún día,
// hay que actualizar `nocheAproximada()` acá también (están a propósito
// una al lado de la otra en los comentarios de cada archivo para que no
// se pierdan de vista).
//
// Pendiente a propósito: el CSV de bebidas desglosadas todavía no se vio.
// Esto solo entiende el de transacciones (cash/card). Cuando llegue el
// otro export, se suma un parser aparte — no tocar este hasta verlo.

import Papa from 'https://esm.sh/papaparse@5';

function parseMonto(s) {
  if (!s || s.trim() === '-') return 0;
  return Number(s.replace('€', '').replace(',', '').trim()) || 0;
}

// "26 Jul 2026, 01:25" — el export ya viene en UTC (lo dice la columna).
function parseFechaRevolut(s) {
  return new Date(s.trim() + ' UTC');
}

// Aproximación del corte de noche_303() (resta 6hs en hora de Barcelona y
// se queda con la fecha) usando UTC+2 fijo — correcto en temporada de
// verano (horario en el que opera el venue). Es SOLO para el preview; el
// trigger en la base usa la zona horaria real con cambio de horario.
function nocheAproximada(fechaUtc) {
  const local = new Date(fechaUtc.getTime() + 2 * 3600 * 1000);
  local.setHours(local.getHours() - 6);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Lee el texto crudo del CSV y devuelve las filas ya limpias (sin las
// canceladas, con los montos como número). No decide todavía a qué noche
// pertenece cada una — eso lo hace armarPreview() con la lista de turnos.
export function parsearCsvRevolut(texto) {
  const { data, errors } = Papa.parse(texto, { header: true, skipEmptyLines: true });
  if (errors.length) throw new Error('No se pudo leer el CSV: ' + errors[0].message);

  const filas = [];
  let canceladas = 0;
  for (const r of data) {
    if ((r['Status'] || '').trim() !== 'Completed') { canceladas++; continue; }
    const metodo = (r['Payment method'] || '').trim().toLowerCase();
    if (metodo !== 'cash' && metodo !== 'card') continue; // fila con un método que no reconocemos, se ignora
    const fechaUtc = parseFechaRevolut(r['Date (UTC)']);
    filas.push({
      receipt_ref: (r['Receipt#'] || '').trim(),
      timestamp_utc: fechaUtc.toISOString(),
      metodo_pago: metodo,
      subtotal: parseMonto(r['Subtotal (excl. tax)']),
      impuestos: parseMonto(r['Total taxes']),
      propina: parseMonto(r['Tip']),
      total: parseMonto(r['Total']),
      estado_pos: (r['Status'] || '').trim(),
      origen: 'revolut_pos',
      _nocheAprox: nocheAproximada(fechaUtc),
    });
  }
  return { filas, canceladas, totalFilas: data.length };
}

// Agrupa las filas por noche aproximada y separa las que no matchean contra
// ningún turno ya cargado (programado no cuenta — todavía no hay noche real
// operándose ese día). El admin ve esto ANTES de confirmar el import.
export function armarPreview(filas, turnos) {
  const fechasConTurno = new Set(turnos.filter((t) => t.estado !== 'programado').map((t) => t.fecha));
  const porNoche = new Map();
  const sinMatch = [];
  for (const f of filas) {
    if (!fechasConTurno.has(f._nocheAprox)) { sinMatch.push(f); continue; }
    if (!porNoche.has(f._nocheAprox)) porNoche.set(f._nocheAprox, { fecha: f._nocheAprox, cash: 0, card: 0, n: 0 });
    const g = porNoche.get(f._nocheAprox);
    g.n++;
    g[f.metodo_pago] += f.total;
  }
  return {
    noches: [...porNoche.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    sinMatch,
  };
}
