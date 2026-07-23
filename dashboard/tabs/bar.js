import { resumenBarra, rankingProductoras } from '../data.js';
import { money, money2 } from '../format.js';
import { assignProducerColors } from '../charts.js';

export function render(turnos) {
  if (turnos.length === 0) {
    return `<div class="card"><div class="vacio-inline">No closed nights yet.</div></div>`;
  }
  const resumen = resumenBarra(turnos);
  const ranking = rankingProductoras(turnos);
  const colorPorNombre = assignProducerColors(ranking);
  const byBarDesc = [...ranking].sort((a, b) => b.barraRevenue - a.barraRevenue);
  const maxBar = Math.max(...ranking.map((p) => p.barraRevenue), 1);

  return `
    <div class="insight">
      <span class="mark">→</span>
      <span><b>Entered manually today</b>, not from a live Revolut feed yet — someone types the night's bar total in after close.
      Once a real CSV/API import lands, these same numbers just start filling in on their own; nothing else here changes.</span>
    </div>

    <div class="kpi-row aligned">
      <div class="card"><div class="kpi-lbl">Total bar revenue</div><div class="kpi-hero tnum">${money(resumen.totalBarra)}</div><div class="kpi-s">across all closed nights</div></div>
      <div class="card"><div class="kpi-lbl">Avg. spend / person at bar</div><div class="kpi-hero tnum">${money2(resumen.avgPerPersonBarra)}</div><div class="kpi-s">bar revenue ÷ attendance</div></div>
      <div class="card"><div class="kpi-lbl">True spend / person</div><div class="kpi-hero tnum">${money2(resumen.trueSpendPerPerson)}</div><div class="kpi-s">door + bar combined</div></div>
    </div>

    <div class="card">
      <div class="card-t">Bar revenue by producer</div>
      <div class="card-d">Ranked — worth reading next to the € per person on Producers to see who drinks, not just who pays at the door</div>
      <div class="barlist">
        ${byBarDesc.map((p) => `
          <div class="bar-row">
            <div class="bar-name">${p.nombre}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max((p.barraRevenue / maxBar) * 100, 4)}%;background:${colorPorNombre.get(p.nombre)}"></div></div>
            <div class="bar-val tnum">${money(p.barraRevenue)}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-t">Still locked behind a real POS import</div>
      <div class="card-d">What a Revolut export unlocks beyond the totals above</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="locked-row"><span class="lk">🔒</span><div><div class="locked-t">Bar revenue by hour</div><div class="locked-d">Cross-referenced against the door arrival curve on the Door tab</div></div></div>
        <div class="locked-row"><span class="lk">🔒</span><div><div class="locked-t">Revenue by category</div><div class="locked-d">Drinks vs. bottles vs. food, if the export breaks it down that way</div></div></div>
      </div>
    </div>
  `;
}

export function wire() {
  // Sin charts que dibujar en esta pestaña — todo es tabla/HTML.
}
