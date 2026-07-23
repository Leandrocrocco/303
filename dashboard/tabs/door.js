import { recapUltimaSemana, nochesCronologicas, ultimasNoches, curvaHorariaUltimasNoches } from '../data.js';
import { money, shortDate } from '../format.js';
import { COLOR_FREE, COLOR_PAID, COLOR_RA, createNightlyEntriesChart, createHourlyOverlayChart, renderFixedYAxis } from '../charts.js';

let nightChart = null;
let hourChart = null;
let diaSeleccionado = null;

export function render(turnos) {
  const recap = recapUltimaSemana(turnos);
  const ultimas = ultimasNoches(turnos, 8);

  const diasDisponibles = [...new Set(turnos.map((t) => t.dia))];
  if (!diaSeleccionado || !diasDisponibles.includes(diaSeleccionado)) {
    const conteo = {};
    for (const t of turnos) conteo[t.dia] = (conteo[t.dia] ?? 0) + 1;
    diaSeleccionado = diasDisponibles.sort((a, b) => (conteo[b] ?? 0) - (conteo[a] ?? 0))[0] ?? 'Saturday';
  }

  return `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-t">Entries by night</div>
          <div class="card-d">One bar per closed night, stacked free / paid / RA — click a bar to see whose event it was</div>
        </div>
        <div class="legend">
          <span class="leg-item"><span class="dot" style="background:${COLOR_FREE}"></span>Free</span>
          <span class="leg-item"><span class="dot" style="background:${COLOR_PAID}"></span>Paid</span>
          <span class="leg-item"><span class="dot" style="background:${COLOR_RA}"></span>RA</span>
        </div>
      </div>
      <div class="chart-box chart-with-axis">
        <div class="chart-yaxis" id="door-night-yaxis"></div>
        <div class="chart-scroll" id="door-chart-scroll"><canvas id="door-night-canvas"></canvas></div>
        <div class="scroll-hint" id="door-night-caption">↔ scroll through the year · click a bar for the producer</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-t">Recent nights</div>
          <div class="card-d">Last ${ultimas.length} closed, most recent first</div>
        </div>
        ${recap.deltaPct === null ? '' : `<div class="kpi-badge ${recap.deltaPct >= 0 ? 'good' : 'risk'}">${recap.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(recap.deltaPct)}% entries vs. the week before</div>`}
      </div>
      <div class="twrap">
      <table class="sticky-1">
        <thead><tr><th>Date</th><th>Producer</th><th class="n">People</th><th class="n">Free</th><th class="n">Paid</th><th class="n">RA</th><th class="n">Coat check</th><th class="n">Door revenue</th></tr></thead>
        <tbody>
          ${[...ultimas].reverse().map((n) => `
            <tr>
              <td class="tnum">${shortDate(n.fecha)}</td>
              <td>${n.productora}</td>
              <td class="n">${n.personas}</td>
              <td class="n">${n.freePersonas}</td>
              <td class="n">${n.cashPersonas}</td>
              <td class="n">${n.raPersonas}</td>
              <td class="n">${n.guardarropaCount} · ${money(n.guardarropaRevenue)}</td>
              <td class="n">${money(n.doorRevenue)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-t" id="hour-chart-title">By hour</div>
          <div class="card-d">Thin lines are real nights, the bold line is the average — useful for staffing the door.</div>
        </div>
        <label class="range-pill">📅
          <select id="dia-select">
            ${diasDisponibles.map((d) => `<option value="${d}" ${d === diaSeleccionado ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="chart-box" style="height:240px" id="hour-chart-box">
        <canvas id="door-hour-canvas"></canvas>
      </div>
      <div class="scroll-hint" id="hour-chart-caption"></div>
    </div>
  `;
}

async function dibujarCurva(root, turnos) {
  const box = root.querySelector('#hour-chart-box');
  const caption = root.querySelector('#hour-chart-caption');
  const curva = await curvaHorariaUltimasNoches(turnos, diaSeleccionado, 4);
  if (curva.noches.length === 0) {
    box.innerHTML = `<div class="vacio-inline">Not enough closed ${diaSeleccionado}s yet to overlay.</div>`;
    caption.textContent = '';
    return;
  }
  box.innerHTML = `<canvas id="door-hour-canvas"></canvas>`;
  root.querySelector('#hour-chart-title').textContent = `${diaSeleccionado}, by hour — last ${curva.noches.length} ${diaSeleccionado}s`;
  hourChart = createHourlyOverlayChart(root.querySelector('#door-hour-canvas'), curva, hourChart);
  caption.textContent = `Nights shown: ${curva.fechas.map((f) => shortDate(f)).join(' · ')} — average in bold`;
}

export async function wire(root, turnos) {
  const noches = nochesCronologicas(turnos);
  const caption = root.querySelector('#door-night-caption');
  nightChart = createNightlyEntriesChart(root.querySelector('#door-night-canvas'), noches, (n) => {
    caption.textContent = `${shortDate(n.fecha)} · ${n.dia} — ${n.productora}: ${n.personas} people (${n.freePersonas} free / ${n.cashPersonas} paid / ${n.raPersonas} RA) · ${n.guardarropaCount} coat check`;
  }, nightChart);
  renderFixedYAxis(root.querySelector('#door-night-yaxis'), nightChart);

  root.querySelector('#dia-select').addEventListener('change', (e) => {
    diaSeleccionado = e.target.value;
    dibujarCurva(root, turnos);
  });
  await dibujarCurva(root, turnos);
}
