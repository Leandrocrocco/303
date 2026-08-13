// Chart builders shared by every tab. One place for palette, gradients and
// scroll-sizing so the five tabs don't each reinvent their own chart config.

// Paleta categórica confirmada 13 ago 2026 (ver memoria de proyecto "rediseño
// visual 2026"). Cada dimensión tiene su propio hue, sin reusar entre sí — el
// tema navy anterior reusaba el mismo BRAND_GRADIENT para días de la semana Y
// para door/RA/bar en revenue mix, lo cual confundía dos cosas distintas.
export const DAY_THU = '#8FC7E8';
export const DAY_FRI = '#4E9BD1';
export const DAY_SAT = '#1F5C96';

// Free hoy es un solo número agregado en turno_totales (no separa 23h/lista
// todavía — ver memoria de proyecto), así que se usa el tono más fuerte de la
// familia teal como color único. free-l/free-d quedan listos para cuando la
// vista separe los dos sub-tipos.
export const COLOR_FREE = '#1B8F7B';
export const COLOR_FREE_L = '#8FE1D2';
export const COLOR_FREE_D = '#1B8F7B';
export const COLOR_PAID = '#E07B39'; // paid / door cash — misma categoría en todos los gráficos
export const COLOR_RA = '#DD4A3D'; // distinto del rojo de riesgo (--risk) y del rojo de marca
export const COLOR_BAR = '#7B5FC7';
export const COLOR_MUTED_LINE = 'rgba(21,22,27,.18)';

// Paleta categórica fija (8 slots, validada) — la misma que ya se usaba en
// el diseño anterior. Más allá de 8 productoras, se agrupan en gris: mejor
// que generar más tonos que dejen de distinguirse (ver memoria de diseño).
// Verde y rojo puros quedan afuera a propósito: son los mismos tonos que
// "good"/"risk" en los status tags, y confundían identidad de productora
// con estado (una productora roja podía leerse como "mal" sin serlo).
const FIXED_PALETTE = ['#3987e5', '#199e70', '#c98500', '#a67c52', '#9085e9', '#7a8bb5', '#d55181', '#d95926'];
const OVERFLOW_COLOR = '#6b6a82';

// `ranking` = lista de productoras con `.nombre` y `.nights` (la que devuelve
// rankingProductoras). Se les da color a las 8 con más noches; el resto
// comparte el gris "Other" — siguen siendo seleccionables, solo no tienen
// un color propio.
export function assignProducerColors(ranking) {
  const porNights = [...ranking].sort((a, b) => b.nights - a.nights);
  const colorPorNombre = new Map();
  porNights.forEach((p, i) => {
    colorPorNombre.set(p.nombre, i < FIXED_PALETTE.length ? FIXED_PALETTE[i] : OVERFLOW_COLOR);
  });
  return colorPorNombre;
}

function brandGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, DAY_THU);
  g.addColorStop(0.55, DAY_FRI);
  g.addColorStop(1, DAY_SAT);
  return g;
}

// Anillo circular con trazo degradado para métricas de porcentaje (swing,
// % del objetivo del mes). Función pura -> string SVG, sin dependencias.
export function gradientRingSVG(pctValue, { size = 112, stroke = 10, label, sublabel } = {}) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pctValue ?? 0));
  const offset = circumference * (1 - clamped / 100);
  const uid = `ring${Math.round(Math.random() * 1e9)}`;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${DAY_THU}"/>
          <stop offset="55%" stop-color="${DAY_FRI}"/>
          <stop offset="100%" stop-color="${DAY_SAT}"/>
        </linearGradient>
      </defs>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(21,22,27,.08)" stroke-width="${stroke}"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#${uid})" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>
      <text x="${c}" y="${c - 4}" text-anchor="middle" font-size="${size * 0.18}" font-weight="800" fill="#15161B" font-family="-apple-system,'Segoe UI',sans-serif">${label}</text>
      ${sublabel ? `<text x="${c}" y="${c + size * 0.13}" text-anchor="middle" font-size="${size * 0.08}" fill="#9296A0">${sublabel}</text>` : ''}
    </svg>`;
}

// Da al canvas un ancho explícito según cuántos items tiene que mostrar, para
// que el wrapper con overflow-x:auto pueda scrollear en vez de aplastar las
// barras. Devuelve el ancho final en px.
export function sizeCanvasForScroll(canvas, itemCount, perItem, minWidth, height) {
  const width = Math.max(minWidth, itemCount * perItem);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return width;
}

const AXIS_FONT = { size: 10, family: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };
const MUTE = '#9296A0';
const GRID = 'rgba(21,22,27,.08)';

export function destroyIfAny(chart) {
  if (chart) chart.destroy();
  return null;
}

// General: revenue de puerta por semana, scrolleable, relleno degradado.
export function createRevenueByWeekChart(canvas, weeks, prevChart) {
  destroyIfAny(prevChart);
  sizeCanvasForScroll(canvas, weeks.length, 46, canvas.parentElement.clientWidth || 600, 220);
  const ctx = canvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeks.map((w) => w.label),
      datasets: [
        { label: 'Door', data: weeks.map((w) => w.doorRevenue), backgroundColor: COLOR_PAID, stack: 's', borderRadius: 3, maxBarThickness: 22 },
        { label: 'Bar', data: weeks.map((w) => w.barraRevenue), backgroundColor: COLOR_BAR, stack: 's', borderRadius: 3, maxBarThickness: 22 },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: €${c.parsed.y.toLocaleString('en-US')}` } },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: MUTE, font: AXIS_FONT, maxRotation: 0, autoSkip: true } },
        y: { stacked: true, grid: { color: GRID }, ticks: { color: MUTE, font: AXIS_FONT, callback: (v) => `€${v}` }, beginAtZero: true },
      },
    },
  });
  requestAnimationFrame(() => { canvas.parentElement.scrollLeft = canvas.parentElement.scrollWidth; });
  return chart;
}

// General (Overview): rendimiento por finde — barras AGRUPADAS (no apiladas),
// una por día (Thu/Fri/Sat), un grupo por finde. `onBarClick(day, weekend, value)`
// se llama al clickear una barra para poblar el readout de abajo. Thu=azul,
// Fri=violeta, Sat=rosa (mismo orden que el degradado de marca).
export function createWeekendChart(canvas, weekends, onBarClick, prevChart) {
  destroyIfAny(prevChart);
  sizeCanvasForScroll(canvas, weekends.length, 70, canvas.parentElement.clientWidth || 600, 200);
  const ctx = canvas.getContext('2d');
  const dayKeys = [['Thu', 'thu', DAY_THU], ['Fri', 'fri', DAY_FRI], ['Sat', 'sat', DAY_SAT]];
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weekends.map((w) => w.label),
      datasets: dayKeys.map(([label, key, color]) => ({
        label, data: weekends.map((w) => w[key]), backgroundColor: color, borderRadius: 3, maxBarThickness: 15,
      })),
    },
    options: {
      responsive: false,
      animation: false,
      onClick: (evt, els) => {
        if (els.length && onBarClick) {
          const e = els[0];
          onBarClick(chart.data.datasets[e.datasetIndex].label, weekends[e.index], chart.data.datasets[e.datasetIndex].data[e.index]);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: €${c.parsed.y.toLocaleString('en-US')}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: MUTE, font: AXIS_FONT, maxRotation: 0, autoSkip: false } },
        y: { grid: { color: GRID }, beginAtZero: true, ticks: { color: MUTE, font: AXIS_FONT, callback: (v) => (v >= 1000 ? `€${v / 1000}k` : `€${v}`) } },
      },
    },
  });
  return chart;
}

// Door: una barra por NOCHE (no por semana), apiladas free/paid/RA, en orden
// cronológico. Así el gráfico se llena con noches reales en vez de dejar
// semanas vacías. `onNightClick(noche)` se llama al clickear una barra para
// mostrar de quién fue el evento. Cada noche lleva su objeto turno completo.
export function createNightlyEntriesChart(canvas, noches, onNightClick, prevChart) {
  destroyIfAny(prevChart);
  sizeCanvasForScroll(canvas, noches.length, 22, canvas.parentElement.clientWidth || 600, 210);
  const ctx = canvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: noches.map((n) => n.label),
      datasets: [
        { label: 'Free', data: noches.map((n) => n.freePersonas), backgroundColor: COLOR_FREE, stack: 's' },
        { label: 'Paid', data: noches.map((n) => n.cashPersonas), backgroundColor: COLOR_PAID, stack: 's' },
        { label: 'RA', data: noches.map((n) => n.raPersonas), backgroundColor: COLOR_RA, stack: 's' },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      onClick: (evt, elements) => {
        if (elements.length && onNightClick) onNightClick(noches[elements[0].index]);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `${noches[items[0].dataIndex].productora} · ${noches[items[0].dataIndex].label}`,
            afterBody: (items) => {
              const n = noches[items[0].dataIndex];
              return `${n.personas} people · ${n.guardarropaCount} coat check`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: MUTE, font: AXIS_FONT, maxRotation: 0, autoSkip: true, maxTicksLimit: 20 } },
        // Ticks ocultos acá a propósito: el eje Y se dibuja fijo aparte con
        // renderFixedYAxis (si no, se iría scrolleando con las barras).
        y: { stacked: true, grid: { color: GRID }, ticks: { display: false }, beginAtZero: true },
      },
    },
  });
  requestAnimationFrame(() => { canvas.parentElement.scrollLeft = canvas.parentElement.scrollWidth; });
  return chart;
}

// Dibuja un eje Y fijo (fuera del canvas scrolleable) leyendo la geometría real
// del chart: getPixelForValue da la posición exacta de cada tick, así el eje
// queda alineado con las barras sin depender del padding interno de Chart.js.
export function renderFixedYAxis(overlayEl, chart) {
  if (!overlayEl || !chart) return;
  const y = chart.scales.y;
  overlayEl.style.height = `${chart.height}px`;
  overlayEl.innerHTML = y.ticks
    .map((t) => `<span class="yaxis-tick" style="top:${y.getPixelForValue(t.value)}px">${t.value}</span>`)
    .join('');
}

// Door: curva horaria, varias noches reales finas + un promedio marcado.
export function createHourlyOverlayChart(canvas, curva, prevChart) {
  destroyIfAny(prevChart);
  const ctx = canvas.getContext('2d');
  const nightDatasets = curva.noches.map((serie, i) => ({
    label: `${curva.fechas[i]} (real)`,
    data: serie,
    borderColor: COLOR_MUTED_LINE,
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.3,
  }));
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: curva.labels,
      datasets: [
        ...nightDatasets,
        {
          label: 'Average',
          data: curva.promedio,
          borderColor: brandGradient(ctx, 0, 0, canvas.width || 400, 0),
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${Math.round(c.parsed.y)} arrivals`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: MUTE, font: AXIS_FONT, maxTicksLimit: 8 } },
        y: {
          grid: { color: GRID }, beginAtZero: true,
          title: { display: true, text: 'arrivals / 30min', color: MUTE, font: AXIS_FONT },
          ticks: { color: MUTE, font: AXIS_FONT },
        },
      },
    },
  });
  return chart;
}

// Nights: scatter asistencia vs revenue, un dataset por productora para que
// el desplegable pueda mostrar/ocultar sin volver a pedir datos.
export function createNightsScatterChart(canvas, turnos, colorPorNombre, prevChart) {
  destroyIfAny(prevChart);
  const porProductora = new Map();
  for (const t of turnos) {
    if (!porProductora.has(t.productora)) porProductora.set(t.productora, []);
    porProductora.get(t.productora).push({ x: t.personas, y: t.doorRevenue, fecha: t.fecha });
  }
  const datasets = [...porProductora.entries()].map(([nombre, puntos]) => ({
    label: nombre,
    data: puntos,
    backgroundColor: colorPorNombre.get(nombre) ?? '#6b6a82',
    pointRadius: 6,
    pointHoverRadius: 8,
  }));
  const ctx = canvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label} · ${c.parsed.x} people · €${c.parsed.y}`,
          },
        },
      },
      scales: {
        x: { title: { display: true, text: 'people', color: MUTE, font: AXIS_FONT }, grid: { color: GRID }, ticks: { color: MUTE, font: AXIS_FONT } },
        y: { title: { display: true, text: 'door revenue (€)', color: MUTE, font: AXIS_FONT }, grid: { color: GRID }, ticks: { color: MUTE, font: AXIS_FONT } },
      },
    },
  });
  return chart;
}

export function setNightsProducerVisibility(chart, visibleNombres) {
  chart.data.datasets.forEach((ds, i) => {
    chart.setDatasetVisibility(i, visibleNombres.has(ds.label));
  });
  chart.update();
}
