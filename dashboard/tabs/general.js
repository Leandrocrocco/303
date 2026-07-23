import { overviewMes, weekendPerformance, nochesUltimaSemana, producerDeals, cashIntegrity } from '../data.js';
import { money, money2, shortDate, monthYearNow } from '../format.js';
import { createWeekendChart, BRAND_GRADIENT, COLOR_FREE, COLOR_PAID, COLOR_RA } from '../charts.js';

let wkChart = null;
let dealSort = 'value'; // 'value' (por barra/persona) | 'pay' (por lo que pagás)

const signMoney = (v) => (v < 0 ? '−' + money(-v) : (v > 0 ? '+' + money(v) : money(0)));
const varCell = (v) =>
  v < 0 ? `<span style="color:var(--risk)">−${money(-v)}</span>`
        : `<span style="color:var(--good)">${v === 0 ? '€0' : money(v)}</span>`;

function dealTag(deal) {
  if (deal === 'earns') return '<tag class="top">earns it</tag>';
  if (deal === 'expensive') return '<tag class="risk">expensive</tag>';
  if (deal === 'none') return '<tag class="neutral">house</tag>';
  return '<tag class="watch">ok</tag>';
}

function dealsRows(deals, sort) {
  const sorted = sort === 'pay'
    ? [...deals].sort((a, b) => b.youPay - a.youPay)
    : [...deals].sort((a, b) => b.barPerPers - a.barPerPers);
  return sorted.slice(0, 6).map((p) => `
    <tr>
      <td class="prodname">${p.nombre}</td>
      <td class="n">${p.nights}</td>
      <td class="n">${p.personas ? money2(p.barPerPers) : '—'}</td>
      <td class="n">${money(p.youPay)}</td>
      <td>${dealTag(p.deal)}</td>
    </tr>`).join('');
}

export function render(turnos) {
  const m = overviewMes(turnos);
  const weekend = nochesUltimaSemana(turnos);
  const deals = producerDeals(turnos);
  const cash = cashIntegrity(turnos);
  const weekends = weekendPerformance(turnos);

  const mixTotal = m.doorCash + m.raOnline + m.bar;
  const mp = (v) => (mixTotal ? Math.round((v / mixTotal) * 100) : 0);

  return `
    <!-- 1 · Lo que se queda vs lo que regala -->
    <div class="grid2">
      <div class="card">
        <div class="kpi-lbl">Net to venue · this month</div>
        <div class="kpi-hero tnum">${money(m.net)}</div>
        <div class="kpi-s">what 303 keeps after paying producers${m.netPrevPct == null ? ''
          : ` · <span style="color:var(--${m.netPrevPct >= 0 ? 'good' : 'risk'})">${m.netPrevPct >= 0 ? '+' : ''}${m.netPrevPct}% vs last month</span>`}</div>
        <div class="ov-mini">
          <div><div class="kpi-lbl mini">Gross</div><div class="ov-mini-v tnum">${money(m.gross)}</div></div>
          <div><div class="kpi-lbl mini">Nights</div><div class="ov-mini-v tnum">${m.nights}</div></div>
          <div><div class="kpi-lbl mini">People</div><div class="ov-mini-v tnum">${m.people.toLocaleString('en-US')}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="kpi-lbl">Paid to producers · this month</div>
        <div class="kpi-hero plain tnum">${money(m.paid)}</div>
        <div class="kpi-s">door + bar cut · by each producer's %</div>
        <div class="ov-mini">
          <div><div class="kpi-lbl mini">From door</div><div class="ov-mini-v tnum">${money(m.paidFromDoor)}</div></div>
          <div><div class="kpi-lbl mini">From bar</div><div class="ov-mini-v tnum">${money(m.paidFromBar)}</div></div>
          <div><div class="kpi-lbl mini">% of gross</div><div class="ov-mini-v tnum">${m.paidPctOfGross}%</div></div>
        </div>
      </div>
    </div>

    <!-- 2 · Rendimiento por finde -->
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-t">Weekend performance</div>
          <div class="card-d">Revenue per night (door + bar) — tap a bar to see that night</div>
        </div>
        <div class="legend">
          <span class="leg-item"><span class="sw" style="background:${BRAND_GRADIENT[0]}"></span>Thu</span>
          <span class="leg-item"><span class="sw" style="background:${BRAND_GRADIENT[1]}"></span>Fri</span>
          <span class="leg-item"><span class="sw" style="background:${BRAND_GRADIENT[2]}"></span>Sat</span>
        </div>
      </div>
      ${weekends.length === 0 ? '<div class="pending" style="padding:14px 2px">No closed weekends yet.</div>' : `
      <div class="chart-box"><div class="chart-scroll" id="gen-wk-scroll"><canvas id="gen-wk-canvas"></canvas></div></div>
      <div class="gen-readout" id="gen-wk-readout">Tap a bar to see that night's revenue.</div>`}
    </div>

    ${weekend.length === 0 ? '' : `
    <!-- 3 · Last week -->
    <div class="card">
      <div class="card-t">Last week</div>
      <div class="card-d">The most recent weekend — revenue and who was in the room</div>
      <div class="wk-row">
        ${weekend.map((n) => `
          <div class="wk-card">
            <div class="wk-day"><span class="wk-dot" style="background:var(--acc3)"></span>${n.dia} · ${shortDate(n.fecha)}</div>
            <div class="wk-v tnum">${money(n.doorRevenue + n.barraRevenue)}</div>
            <div class="wk-s" style="border-top:none;padding-top:0;margin-top:6px">${n.personas} people · ${n.productora} · ${money(n.doorRevenue)} door / ${money(n.barraRevenue)} bar</div>
            <div class="mix-track" style="margin-top:10px">
              <div style="width:${n.personas ? (n.freePersonas / n.personas) * 100 : 0}%;background:${COLOR_FREE}"></div>
              <div style="width:${n.personas ? (n.cashPersonas / n.personas) * 100 : 0}%;background:${COLOR_PAID}"></div>
              <div style="width:${n.personas ? (n.raPersonas / n.personas) * 100 : 0}%;background:${COLOR_RA}"></div>
            </div>
            <div class="mix-counts" style="margin-top:6px">${n.freePersonas} free · ${n.cashPersonas} paid · ${n.raPersonas} RA</div>
          </div>`).join('')}
      </div>
    </div>`}

    <!-- 4 · Revenue mix -->
    <div class="card">
      <div class="card-t">Revenue mix</div>
      <div class="card-d">Where the money comes from — door (cash + RA online) vs bar · ${monthYearNow()}</div>
      <div class="mixbar">
        <span style="width:${mp(m.doorCash)}%;background:${BRAND_GRADIENT[2]}"></span>
        <span style="width:${mp(m.raOnline)}%;background:${BRAND_GRADIENT[1]}"></span>
        <span style="width:${mp(m.bar)}%;background:${BRAND_GRADIENT[0]}"></span>
      </div>
      <div class="legend">
        <span class="leg-item"><span class="sw" style="background:${BRAND_GRADIENT[2]}"></span>Door cash ${money(m.doorCash)} · ${mp(m.doorCash)}%</span>
        <span class="leg-item"><span class="sw" style="background:${BRAND_GRADIENT[1]}"></span>RA online ${money(m.raOnline)} · ${mp(m.raOnline)}%</span>
        <span class="leg-item"><span class="sw" style="background:${BRAND_GRADIENT[0]}"></span>Bar ${money(m.bar)} · ${mp(m.bar)}%</span>
      </div>
    </div>

    <!-- 5 · Lo que vale un invitado -->
    <div class="card" style="display:flex;align-items:center;gap:28px;flex-wrap:wrap">
      <div>
        <div class="card-t" style="margin:0">What a guest is worth</div>
        <div class="card-d" style="margin:0">Average value of one person in the room</div>
      </div>
      <div class="guest-strip" style="flex:1;justify-content:flex-end">
        <div>
          <div class="kpi-lbl">Guest spends</div>
          <div class="tnum ov-guest">${m.people ? money2(m.spendPerGuest) : '—'}</div>
          <div class="kpi-s" style="margin-top:2px">door + bar, per head</div>
        </div>
        <div>
          <div class="kpi-lbl">Venue keeps</div>
          <div class="tnum ov-guest">${m.people ? money2(m.netPerGuest) : '—'}</div>
          <div class="kpi-s" style="margin-top:2px">after the producer's cut</div>
        </div>
      </div>
    </div>

    <!-- 6 · Integridad de caja | Deals de productora -->
    <div class="grid2">
      <div class="card">
        <div class="card-head" style="min-height:48px">
          <div>
            <div class="card-t">Cash integrity</div>
            <div class="card-d">Counted vs expected at close</div>
          </div>
          ${cash.hasData ? `<tag class="${cash.monthVariance < 0 ? 'risk' : 'top'}">${signMoney(cash.monthVariance)} this month</tag>` : ''}
        </div>
        ${cash.hasData ? `
        <div class="twrap"><table>
          <thead><tr><th>Night</th><th>Doorman</th><th class="n">Expected</th><th class="n">Counted</th><th class="n">Variance</th></tr></thead>
          <tbody>
            ${cash.rows.slice(0, 6).map((r) => `
              <tr><td>${(r.dia ?? '').slice(0, 3)} ${shortDate(r.fecha)}</td><td>${r.portero}</td><td class="n">${money(r.esperado)}</td><td class="n">${money(r.contado)}</td><td class="n">${varCell(r.variance)}</td></tr>`).join('')}
          </tbody>
        </table></div>` : `
        <div class="pending" style="padding:14px 2px">No cash counts yet. Enter the cash counted at close in the Puerta app and the variance shows up here — per night and per doorman.</div>`}
      </div>

      <div class="card">
        <div class="card-head" style="min-height:48px">
          <div>
            <div class="card-t">Producer deals</div>
            <div class="card-d">Is the 30% bar cut earned?</div>
          </div>
          <div class="lens-toggle">
            <button data-lens="pay" class="${dealSort === 'pay' ? 'on' : ''}">Pay</button>
            <button data-lens="value" class="${dealSort === 'value' ? 'on' : ''}">Value</button>
          </div>
        </div>
        <div class="twrap"><table>
          <thead><tr><th>Producer</th><th class="n">Nights</th><th class="n">Bar / pers</th><th class="n">You pay</th><th>Deal</th></tr></thead>
          <tbody id="gen-deals-body">${dealsRows(deals, dealSort)}</tbody>
        </table></div>
      </div>
    </div>
  `;
}

export function wire(root, turnos) {
  const weekends = weekendPerformance(turnos);
  const canvas = root.querySelector('#gen-wk-canvas');
  const readout = root.querySelector('#gen-wk-readout');
  if (canvas && weekends.length) {
    const dayColor = { Thu: BRAND_GRADIENT[0], Fri: BRAND_GRADIENT[1], Sat: BRAND_GRADIENT[2] };
    const showBar = (day, wk, val) => {
      readout.innerHTML = `<span class="rw" style="background:${dayColor[day]}"></span><span><b>${day}, ${wk.label}</b> · €${Math.round(val).toLocaleString('en-US')} · door + bar that night</span>`;
    };
    wkChart = createWeekendChart(canvas, weekends, showBar, wkChart);
    // Prefill con la mejor noche del finde actual, para que el readout no arranque vacío.
    const cur = weekends[weekends.length - 1];
    const best = [['Thu', cur.thu], ['Fri', cur.fri], ['Sat', cur.sat]].sort((a, b) => b[1] - a[1])[0];
    if (best[1] > 0) showBar(best[0], cur, best[1]);
  }

  root.querySelectorAll('[data-lens]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dealSort = btn.dataset.lens;
      const body = root.querySelector('#gen-deals-body');
      if (body) body.innerHTML = dealsRows(producerDeals(turnos), dealSort);
      root.querySelectorAll('[data-lens]').forEach((b) => b.classList.toggle('on', b.dataset.lens === dealSort));
    });
  });
}
