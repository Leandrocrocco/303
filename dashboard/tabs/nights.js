import { rankingProductoras, nochesOrdenadasPorRevenue, nochesPorDebajoDelPropioPromedio, attendancePromedio } from '../data.js';
import { money, shortDate } from '../format.js';
import { assignProducerColors, createNightsScatterChart, setNightsProducerVisibility } from '../charts.js';

let chart = null;
let selected = null; // Set<string> — nombres de productora visibles; null hasta el primer render
let documentListenersAttached = false;
let limite = 5;

function tablaNoches(titulo, noches) {
  return `
    <div class="card">
      <div class="card-t">${titulo}</div>
      <div class="twrap">
      <table>
        <thead><tr><th>Date</th><th>Producer</th><th class="n">People</th><th class="n">Door revenue</th></tr></thead>
        <tbody>${noches.map((n) => `<tr><td class="tnum">${shortDate(n.fecha)} · ${n.dia.slice(0, 3)}</td><td>${n.productora}</td><td class="n">${n.personas}</td><td class="n">${money(n.doorRevenue)}</td></tr>`).join('')}</tbody>
      </table>
      </div>
    </div>`;
}

function renderTablas(ordenadas, n) {
  const top = ordenadas.slice(0, n);
  const bottom = [...ordenadas].slice(-n).reverse();
  return `<div class="grid2">${tablaNoches(`Top ${n} nights`, top)}${tablaNoches(`Bottom ${n} nights`, bottom)}</div>`;
}

export function render(turnos) {
  if (turnos.length === 0) {
    return `<div class="card"><div class="vacio-inline">No closed nights yet.</div></div>`;
  }
  const ranking = rankingProductoras(turnos);
  const colorPorNombre = assignProducerColors(ranking);
  const ordenadas = nochesOrdenadasPorRevenue(turnos);
  const best = ordenadas[0];
  const worst = ordenadas[ordenadas.length - 1];
  const belowOwn = nochesPorDebajoDelPropioPromedio(turnos);
  const avgAttendance = Math.round(attendancePromedio(turnos));
  if (limite > ordenadas.length) limite = 5;

  // Reset de selección solo si cambió el conjunto de productoras (cliente distinto,
  // o nuevo turno con una productora nunca vista) — si no, se respeta lo que el
  // usuario ya había elegido al cambiar de rango/tab.
  const nombresActuales = new Set(ranking.map((p) => p.nombre));
  if (!selected || [...nombresActuales].some((n) => !selected.has(n)) || selected.size !== nombresActuales.size) {
    selected = nombresActuales;
  }

  return `
    <div class="kpi-row aligned">
      <div class="card"><div class="kpi-lbl">Best night</div><div class="kpi-hero tnum">${money(best.doorRevenue)}</div><div class="kpi-s">${best.productora} · ${shortDate(best.fecha)} · ${best.personas} people</div></div>
      <div class="card"><div class="kpi-lbl">Worst night</div><div class="kpi-hero risk tnum">${money(worst.doorRevenue)}</div><div class="kpi-s">${worst.productora} · ${shortDate(worst.fecha)} · ${worst.personas} people</div></div>
      <div class="card"><div class="kpi-lbl">Below their own average</div><div class="kpi-hero tnum">${belowOwn}<span style="font-size:14px;color:var(--ink-mute);font-weight:600"> / ${turnos.length}</span></div><div class="kpi-s">nights underperformed</div></div>
      <div class="card"><div class="kpi-lbl">Avg. attendance</div><div class="kpi-hero tnum">${avgAttendance}</div><div class="kpi-s">people / night</div></div>
    </div>

    <div class="card">
      <div class="card-t">Attendance vs. revenue — every closed night</div>
      <div class="card-d">Each dot is one night. Up-and-right is the goal: a full room that also spends.</div>
      <div class="prod-select" id="prod-select" style="margin-bottom:4px">
        <button type="button" class="prod-select-btn" id="prod-select-btn" aria-haspopup="listbox" aria-expanded="false">
          <span id="prod-select-label">All producers</span>
          <span class="prod-select-count" id="prod-select-count">${ranking.length}</span>
          <span class="chev">▾</span>
        </button>
        <div class="prod-select-panel" id="prod-select-panel" hidden>
          <input type="text" class="prod-search" id="prod-search" placeholder="Search producer…">
          <div class="prod-actions">
            <button type="button" data-action="all">Select all</button>
            <button type="button" data-action="none">Clear</button>
          </div>
          <div class="prod-list" id="prod-list">
            ${ranking.map((p) => `
              <label class="prod-item" data-name="${p.nombre.toLowerCase()}">
                <input type="checkbox" data-prod="${p.nombre}" ${selected.has(p.nombre) ? 'checked' : ''}>
                <span class="sw" style="background:${colorPorNombre.get(p.nombre)}"></span>${p.nombre}
              </label>`).join('')}
          </div>
        </div>
      </div>
      <div class="chart-box" style="height:360px">
        <canvas id="nights-scatter-canvas"></canvas>
      </div>
    </div>

    <div class="card-head" style="padding:0 2px;align-items:center">
      <div style="font-size:12px;color:var(--ink-dim)">Best and worst nights, side by side</div>
      <label class="range-pill">Show
        <select id="nights-limit">
          ${[5, 10, 25].filter((n) => n <= ordenadas.length).map((n) => `<option value="${n}" ${n === limite ? 'selected' : ''}>${n} each side</option>`).join('')}
          <option value="${ordenadas.length}" ${limite === ordenadas.length ? 'selected' : ''}>All (${ordenadas.length})</option>
        </select>
      </label>
    </div>
    <div id="nights-tablas">${renderTablas(ordenadas, limite)}</div>
  `;
}

export function wire(root, turnos) {
  const ordenadas = nochesOrdenadasPorRevenue(turnos);
  root.querySelector('#nights-limit')?.addEventListener('change', (e) => {
    limite = Number(e.target.value);
    root.querySelector('#nights-tablas').innerHTML = renderTablas(ordenadas, limite);
  });

  const ranking = rankingProductoras(turnos);
  const colorPorNombre = assignProducerColors(ranking);
  chart = createNightsScatterChart(root.querySelector('#nights-scatter-canvas'), turnos, colorPorNombre, chart);
  setNightsProducerVisibility(chart, selected);

  const btn = root.querySelector('#prod-select-btn');
  const panel = root.querySelector('#prod-select-panel');
  const list = root.querySelector('#prod-list');
  const label = root.querySelector('#prod-select-label');
  const count = root.querySelector('#prod-select-count');
  const search = root.querySelector('#prod-search');

  function refreshLabel() {
    count.textContent = selected.size;
    label.textContent = selected.size === ranking.length ? 'All producers' : selected.size === 0 ? 'No producers' : `${selected.size} selected`;
  }

  btn.addEventListener('click', () => {
    const opening = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden', !opening);
    btn.setAttribute('aria-expanded', String(opening));
    if (opening) search.focus();
  });
  // Los listeners de document se atan UNA sola vez (module-level), no en cada
  // wire(): re-renderizar la pestaña no debe ir apilando handlers duplicados.
  // Buscan el panel/botón vigentes en el momento del click, no closures viejas.
  if (!documentListenersAttached) {
    documentListenersAttached = true;
    document.addEventListener('click', (e) => {
      const wrap = document.querySelector('#prod-select');
      if (wrap && !wrap.contains(e.target)) {
        document.querySelector('#prod-select-panel')?.setAttribute('hidden', '');
        document.querySelector('#prod-select-btn')?.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelector('#prod-select-panel')?.setAttribute('hidden', '');
        document.querySelector('#prod-select-btn')?.setAttribute('aria-expanded', 'false');
      }
    });
  }
  list.addEventListener('change', (e) => {
    const nombre = e.target.dataset.prod;
    if (!nombre) return;
    if (e.target.checked) selected.add(nombre); else selected.delete(nombre);
    refreshLabel();
    setNightsProducerVisibility(chart, selected);
  });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    list.querySelectorAll('.prod-item').forEach((row) => {
      row.classList.toggle('no-match', q.length > 0 && !row.dataset.name.includes(q));
    });
  });
  root.querySelectorAll('.prod-actions [data-action]').forEach((b) => {
    b.addEventListener('click', () => {
      const on = b.dataset.action === 'all';
      list.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.checked = on;
        if (on) selected.add(cb.dataset.prod); else selected.delete(cb.dataset.prod);
      });
      refreshLabel();
      setNightsProducerVisibility(chart, selected);
    });
  });
  refreshLabel();
}
