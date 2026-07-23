import { rankingProductoras } from '../data.js';
import { money, money2, pct, shortDate } from '../format.js';

// Estado de ordenamiento de la tabla (persiste entre re-renders de la pestaña).
let sortKey = 'avgPerPerson';
let sortDir = 'desc';

// Columnas: clave de dato + etiqueta + si es numérica (alinea a la derecha).
const COLS = [
  { key: 'nombre', label: 'Producer', num: false },
  { key: 'nights', label: 'Nights', num: true },
  { key: 'free', label: 'Free', num: true },
  { key: 'paid', label: 'Paid', num: true },
  { key: 'personas', label: 'Total people', num: true },
  { key: 'doorRevenue', label: 'Door', num: true },
  { key: 'barraRevenue', label: 'Bar', num: true },
  { key: 'netToVenue', label: 'Net to venue', num: true },
  { key: 'avgPerPerson', label: '€ / person', num: true },
  { key: 'swing', label: 'Swing', num: true },
  { key: 'status', label: 'Status', num: false },
];

function ordenar(ranking) {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...ranking].sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];
    // swing puede ser null (1 sola noche) — siempre al fondo, sin importar dir.
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'string') return va.localeCompare(vb) * dir;
    return (va - vb) * dir;
  });
}

function celda(p, col) {
  switch (col.key) {
    case 'nombre': return `<td class="prodname">${p.nombre}</td>`;
    case 'doorRevenue': return `<td class="n">${money(p.doorRevenue)}</td>`;
    case 'barraRevenue': return `<td class="n">${money(p.barraRevenue)}</td>`;
    case 'netToVenue': return `<td class="n">${money(p.netToVenue)}</td>`;
    case 'avgPerPerson': return `<td class="n">${money2(p.avgPerPerson)}</td>`;
    case 'swing': return `<td class="n">${p.swing === null ? '—' : pct(p.swing)}</td>`;
    case 'status': return `<td><tag class="${p.status === 'underperforming' ? 'risk' : p.status}">${p.status}</tag></td>`;
    default: return `<td class="n">${p[col.key]}</td>`;
  }
}

function cuerpoTabla(ranking) {
  return ordenar(ranking).map((p) => `<tr>${COLS.map((c) => celda(p, c)).join('')}</tr>`).join('');
}

function encabezados() {
  return COLS.map((c) => {
    const activa = c.key === sortKey;
    const flecha = activa ? (sortDir === 'desc' ? ' ▾' : ' ▴') : '';
    return `<th class="${c.num ? 'n' : ''} sortable${activa ? ' active' : ''}" data-key="${c.key}">${c.label}${flecha}</th>`;
  }).join('');
}

// Detalle noche por noche de una productora (para analizar en profundidad,
// no solo por el promedio general de la tabla de arriba).
function detalleProductora(turnos, nombre) {
  const noches = turnos
    .filter((t) => t.productora === nombre)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  if (noches.length === 0) return '<div class="vacio-inline">No nights for this producer.</div>';
  return `
    <div class="twrap">
    <table class="sticky-1">
      <thead><tr>
        <th>Date</th><th>Day</th><th class="n">People</th><th class="n">Free</th><th class="n">Paid</th><th class="n">RA</th>
        <th class="n">Door</th><th class="n">Bar</th><th class="n">Net</th><th class="n">€ / person</th>
      </tr></thead>
      <tbody>
        ${noches.map((n) => `
          <tr>
            <td class="tnum">${shortDate(n.fecha)}</td>
            <td>${n.dia}</td>
            <td class="n">${n.personas}</td>
            <td class="n">${n.freePersonas}</td>
            <td class="n">${n.cashPersonas}</td>
            <td class="n">${n.raPersonas}</td>
            <td class="n">${money(n.doorRevenue)}</td>
            <td class="n">${money(n.barraRevenue)}</td>
            <td class="n">${money(n.netToVenue)}</td>
            <td class="n">${n.personas ? money2(n.avgPerPerson) : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

export function render(turnos) {
  const ranking = rankingProductoras(turnos);
  if (ranking.length === 0) {
    return `<div class="card"><div class="vacio-inline">No closed nights yet — producer comparison needs at least one.</div></div>`;
  }

  const bestReturn = [...ranking].sort((a, b) => b.avgPerPerson - a.avgPerPerson)[0];
  const worstReturn = [...ranking].sort((a, b) => a.avgPerPerson - b.avgPerPerson)[0];
  const conSwing = ranking.filter((p) => p.swing !== null);
  const mostInconsistent = conSwing.length ? [...conSwing].sort((a, b) => b.swing - a.swing)[0] : null;
  const mostNights = [...ranking].sort((a, b) => b.nights - a.nights)[0];
  const nombres = [...ranking].map((p) => p.nombre).sort((a, b) => a.localeCompare(b));

  return `
    <div class="kpi-row aligned">
      <div class="card"><div class="kpi-lbl">Best return</div><div class="kpi-hero name">${bestReturn.nombre}</div><div class="kpi-s">${money2(bestReturn.avgPerPerson)} / person</div></div>
      <div class="card"><div class="kpi-lbl">Worst return</div><div class="kpi-hero name risk">${worstReturn.nombre}</div><div class="kpi-s">${money2(worstReturn.avgPerPerson)} / person</div></div>
      <div class="card"><div class="kpi-lbl">Most inconsistent</div><div class="kpi-hero name risk">${mostInconsistent ? mostInconsistent.nombre : '—'}</div><div class="kpi-s">${mostInconsistent ? `${pct(mostInconsistent.swing)} night-to-night swing` : 'Not enough nights yet'}</div></div>
      <div class="card"><div class="kpi-lbl">Most nights booked</div><div class="kpi-hero name">${mostNights.nombre}</div><div class="kpi-s">${mostNights.nights} night${mostNights.nights === 1 ? '' : 's'} recorded</div></div>
    </div>

    <div class="card">
      <div class="card-t">Producer comparison</div>
      <div class="card-d">Click any column header to sort by it. Net to venue = door × (1 − door %) + bar × (1 − bar %), using each producer's agreed split.</div>
      <div class="twrap">
      <table id="prod-table" class="sticky-1">
        <thead><tr>${encabezados()}</tr></thead>
        <tbody id="prod-tbody">${cuerpoTabla(ranking)}</tbody>
      </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-t">Producer detail</div>
          <div class="card-d">Every night a producer did — the numbers behind their average</div>
        </div>
        <label class="range-pill">🎧
          <select id="prod-detail-select">
            ${nombres.map((n) => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </label>
      </div>
      <div id="prod-detail">${detalleProductora(turnos, nombres[0])}</div>
    </div>
  `;
}

export function wire(root, turnos) {
  const ranking = rankingProductoras(turnos);

  // Delegación en la tabla: sobrevive a regenerar el thead al reordenar,
  // sin apilar listeners (un solo handler, no uno por header).
  root.querySelector('#prod-table')?.addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const key = th.dataset.key;
    if (key === sortKey) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortKey = key;
      sortDir = 'desc';
    }
    root.querySelector('#prod-table thead tr').innerHTML = encabezados();
    root.querySelector('#prod-tbody').innerHTML = cuerpoTabla(ranking);
  });

  root.querySelector('#prod-detail-select')?.addEventListener('change', (e) => {
    root.querySelector('#prod-detail').innerHTML = detalleProductora(turnos, e.target.value);
  });
}
