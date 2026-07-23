// Data layer for the owner's dashboard. Every cross-night aggregate is
// derived, in JS, from ONE array of closed turnos (each already carrying its
// pre-aggregated totals) — never a fresh Supabase call per widget. The only
// extra round-trip is the raw ingresos fetch for the hourly arrival curve,
// which is scoped to a handful of turno ids (see curvaHorariaUltimasNoches).

import { supabase } from '../shared/supabaseClient.js';

export async function listarClientes() {
  const { data, error } = await supabase.from('clientes').select('id_cliente, nombre').order('nombre');
  if (error) throw error;
  return data ?? [];
}

const DIAS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nombreDia(fechaStr) {
  // fecha es un DATE plano (YYYY-MM-DD), sin hora — parsear como local, no UTC,
  // para que el día de semana no se corra según el huso horario del navegador.
  const [y, m, d] = fechaStr.split('-').map(Number);
  return DIAS[new Date(y, m - 1, d).getDay()];
}

function mesLocalHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Lunes de la semana ISO que contiene esa fecha, en componentes locales.
function weekStartLocal(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diffToMonday = (dt.getDay() + 6) % 7; // domingo=0 -> 6 días atrás al lunes
  dt.setDate(dt.getDate() - diffToMonday);
  return dt;
}

function weekLabel(dt) {
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Todos los turnos cerrados de un cliente, con sus totales agregados. Se
// pide UNA vez por carga de página — todas las pestañas se derivan de este
// mismo array, no cada una con su propio fetch.
//
// Los totales salen de `turno_totales` (vista que agrega DENTRO de Postgres,
// una fila por turno) — nunca se traen las filas de `ingresos` una por una:
// la API REST corta en 1000 filas por default, y eso trunca la suma en
// silencio apenas el venue acumula unos meses de uso real.
export async function turnosCerradosConTotales(idCliente) {
  const { data: turnos, error } = await supabase
    .from('turnos')
    .select('id_turno, fecha, hora_apertura, hora_cierre, barra_revenue, portero, fondo_caja, efectivo_contado, productoras(nombre, pct_puerta, pct_barra)')
    .eq('id_cliente', idCliente)
    .eq('estado', 'cerrado')
    .order('fecha', { ascending: false });
  if (error) throw error;
  if (!turnos || turnos.length === 0) return [];

  const ids = turnos.map((t) => t.id_turno);
  const { data: totales, error: e2 } = await supabase
    .from('turno_totales')
    .select('id_turno, personas, door_revenue, ra_revenue, cash_revenue, ra_personas, cash_personas, free_personas, guardarropa_count, guardarropa_revenue')
    .in('id_turno', ids);
  if (e2) throw e2;

  const porTurno = {};
  for (const t of totales ?? []) porTurno[t.id_turno] = t;

  return turnos.map((t) => {
    const tot = porTurno[t.id_turno] ?? {
      personas: 0, door_revenue: 0, ra_revenue: 0, cash_revenue: 0,
      ra_personas: 0, cash_personas: 0, free_personas: 0, guardarropa_count: 0, guardarropa_revenue: 0,
    };
    return {
      id_turno: t.id_turno,
      fecha: t.fecha,
      dia: nombreDia(t.fecha),
      hora_apertura: t.hora_apertura,
      hora_cierre: t.hora_cierre,
      productora: t.productoras?.nombre ?? '—',
      portero: t.portero ?? null,
      fondoCaja: Number(t.fondo_caja ?? 0),
      efectivoContado: t.efectivo_contado == null ? null : Number(t.efectivo_contado),
      personas: tot.personas,
      doorRevenue: Number(tot.door_revenue),
      raRevenue: Number(tot.ra_revenue),
      cashRevenue: Number(tot.cash_revenue),
      raPersonas: tot.ra_personas,
      cashPersonas: tot.cash_personas,
      freePersonas: tot.free_personas,
      guardarropaCount: tot.guardarropa_count,
      guardarropaRevenue: Number(tot.guardarropa_revenue),
      avgPerPerson: tot.personas ? Number(tot.door_revenue) / tot.personas : 0,
      barraRevenue: Number(t.barra_revenue ?? 0),
      pctPuerta: Number(t.productoras?.pct_puerta ?? 20),
      pctBarra: Number(t.productoras?.pct_barra ?? 30),
      netToVenue: Number(tot.door_revenue) * (1 - Number(t.productoras?.pct_puerta ?? 20) / 100)
        + Number(t.barra_revenue ?? 0) * (1 - Number(t.productoras?.pct_barra ?? 30) / 100),
    };
  });
}

// ── General ──────────────────────────────────────────────────────────────

export function resumenDelMes(turnos) {
  const mes = mesLocalHoy();
  const delMes = turnos.filter((t) => t.fecha.startsWith(mes));
  const personas = delMes.reduce((s, t) => s + t.personas, 0);
  const doorRevenue = delMes.reduce((s, t) => s + t.doorRevenue, 0);
  const barraRevenue = delMes.reduce((s, t) => s + t.barraRevenue, 0);
  return {
    noches: delMes.length,
    personas,
    doorRevenue,
    barraRevenue,
    avgPerPerson: personas ? doorRevenue / personas : 0,
    trueAvgPerPerson: personas ? (doorRevenue + barraRevenue) / personas : 0,
  };
}

// Comparativa mes actual vs. mes calendario anterior, desglosada en puerta,
// barra y total. `pct` es el actual como % del anterior (null si el mes
// anterior no tuvo noches — no hay contra qué comparar). Alimenta los tres
// anillos de la pestaña General.
export function comparativaMensual(turnos) {
  const hoy = new Date();
  const claveMes = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const claveActual = claveMes(hoy.getFullYear(), hoy.getMonth());
  const prevDate = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const clavePrev = claveMes(prevDate.getFullYear(), prevDate.getMonth());

  const delMes = (clave) => turnos.filter((t) => t.fecha.startsWith(clave));
  const sumar = (arr, campo) => arr.reduce((s, t) => s + t[campo], 0);
  const act = delMes(claveActual);
  const prev = delMes(clavePrev);

  const metrica = (campoOTotal) => {
    const actual = campoOTotal === 'total'
      ? sumar(act, 'doorRevenue') + sumar(act, 'barraRevenue')
      : sumar(act, campoOTotal);
    const anterior = campoOTotal === 'total'
      ? sumar(prev, 'doorRevenue') + sumar(prev, 'barraRevenue')
      : sumar(prev, campoOTotal);
    return { actual, anterior, pct: anterior ? Math.round((actual / anterior) * 100) : null };
  };

  return {
    door: metrica('doorRevenue'),
    bar: metrica('barraRevenue'),
    total: metrica('total'),
    prevMonthName: prevDate.toLocaleDateString('en-US', { month: 'long' }),
  };
}

// Agrupa los turnos por semana (lunes a lunes, componentes locales) en `maxWeeks`
// baldes consecutivos terminando en la semana del turno más reciente. Semanas
// sin ninguna noche quedan con turnos:[] (no se inventan datos, se ve la
// historia real, incluso si está vacía al principio).
export function weeklyBuckets(turnos, maxWeeks = 52) {
  if (turnos.length === 0) return [];
  const byWeekKey = new Map();
  let earliest = null;
  for (const t of turnos) {
    const dt = weekStartLocal(t.fecha);
    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    if (!byWeekKey.has(key)) byWeekKey.set(key, []);
    byWeekKey.get(key).push(t);
    if (!earliest || dt < earliest) earliest = dt;
  }
  // turnos[0] es el más reciente porque vienen ordenados fecha desc.
  const latestWeekStart = weekStartLocal(turnos[0].fecha);
  // No inventar semanas vacías ANTES de la primera con data: si el rango pedido
  // (maxWeeks, ej. "año") es más largo que la historia real, se recorta a la
  // historia — el gráfico arranca donde empiezan los datos, no a mitad de vacío.
  const semanasConHistoria = Math.round((latestWeekStart - earliest) / (7 * 24 * 3600 * 1000)) + 1;
  const n = Math.min(maxWeeks, semanasConHistoria);
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(latestWeekStart);
    dt.setDate(dt.getDate() - i * 7);
    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    weeks.push({ weekStart: dt, label: weekLabel(dt), turnos: byWeekKey.get(key) ?? [] });
  }
  return weeks;
}

export function revenueByWeek(turnos, maxWeeks = 26) {
  return weeklyBuckets(turnos, maxWeeks).map((w) => ({
    label: w.label,
    doorRevenue: w.turnos.reduce((s, t) => s + t.doorRevenue, 0),
    barraRevenue: w.turnos.reduce((s, t) => s + t.barraRevenue, 0),
  }));
}

// Jueves (inicio) del fin de semana jue-dom al que pertenece una fecha.
// Lunes/martes/miércoles NO son "finde" -> null: un evento suelto de entre
// semana no cuenta como "this weekend" (aunque sí suma a los totales del mes).
function findeKey(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=dom..6=sáb
  let offset;
  if (dow >= 4) offset = dow - 4;   // jue(4) / vie(5) / sáb(6)
  else if (dow === 0) offset = 3;   // dom -> vuelve al jueves de ese finde
  else return null;                 // lun / mar / mié
  dt.setDate(dt.getDate() - offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Noches del fin de semana (jue-dom) más reciente, para las tarjetas "This
// weekend" de General. Todas del MISMO finde; los eventos de entre semana no
// entran (evita el bug de mezclar días de findes distintos).
export function nochesUltimaSemana(turnos) {
  const conKey = turnos.map((t) => ({ t, key: findeKey(t.fecha) })).filter((x) => x.key);
  if (conKey.length === 0) return [];
  const ultimo = conKey.reduce((max, x) => (x.key > max ? x.key : max), conKey[0].key);
  return conKey.filter((x) => x.key === ultimo).map((x) => x.t).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

// Resumen del mes para el Overview rediseñado: lo que el venue se queda (net),
// lo que le paga a las productoras, mix de ingresos y valor por cabeza. Todo
// derivado del mismo array de turnos; net y "pagado" usan el % por productora.
export function overviewMes(turnos) {
  const hoy = new Date();
  const claveMes = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const cur = claveMes(hoy.getFullYear(), hoy.getMonth());
  const prevD = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const prev = claveMes(prevD.getFullYear(), prevD.getMonth());
  const of = (clave) => turnos.filter((t) => t.fecha.startsWith(clave));
  const sum = (arr, f) => arr.reduce((s, t) => s + f(t), 0);

  const del = of(cur);
  const prv = of(prev);
  const gross = sum(del, (t) => t.doorRevenue + t.barraRevenue);
  const net = sum(del, (t) => t.netToVenue);
  const netPrev = sum(prv, (t) => t.netToVenue);
  const paidFromDoor = sum(del, (t) => t.doorRevenue * (t.pctPuerta / 100));
  const paidFromBar = sum(del, (t) => t.barraRevenue * (t.pctBarra / 100));
  const paid = paidFromDoor + paidFromBar;
  const people = sum(del, (t) => t.personas);

  return {
    nights: del.length,
    people,
    gross,
    net,
    netPrevPct: netPrev ? Math.round(((net - netPrev) / netPrev) * 100) : null,
    paid,
    paidFromDoor,
    paidFromBar,
    paidPctOfGross: gross ? Math.round((paid / gross) * 100) : 0,
    doorCash: sum(del, (t) => t.cashRevenue),
    raOnline: sum(del, (t) => t.raRevenue),
    bar: sum(del, (t) => t.barraRevenue),
    spendPerGuest: people ? gross / people : 0,
    netPerGuest: people ? net / people : 0,
  };
}

// Rendimiento por fin de semana: revenue (door+bar) de cada noche jue/vie/sáb,
// agrupado por finde. Alimenta el gráfico de barras agrupadas (una barra por
// día, un grupo por finde) — de un vistazo el finde actual contra los previos.
export function weekendPerformance(turnos, maxWeekends = 8) {
  const porFinde = new Map();
  for (const t of turnos) {
    const key = findeKey(t.fecha);
    if (!key) continue;
    if (!porFinde.has(key)) porFinde.set(key, { key, thu: 0, fri: 0, sat: 0 });
    const rev = t.doorRevenue + t.barraRevenue;
    if (t.dia === 'Thursday') porFinde.get(key).thu += rev;
    else if (t.dia === 'Friday') porFinde.get(key).fri += rev;
    else if (t.dia === 'Saturday') porFinde.get(key).sat += rev;
  }
  const arr = [...porFinde.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-maxWeekends);
  return arr.map((w, i) => {
    const [y, m, d] = w.key.split('-').map(Number);
    return {
      ...w,
      label: new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isCurrent: i === arr.length - 1,
    };
  });
}

// "¿El % de barra está bien pagado?" — por productora: cuánto le pagás de barra
// (30% × barra, con el % real por productora) vs. cuánto consume su público
// (barra por cabeza). Clasifica en tercios: quién se lo gana vs. quién sale caro.
export function producerDeals(turnos) {
  const byP = {};
  for (const t of turnos) {
    const p = (byP[t.productora] ??= { nombre: t.productora, nights: 0, personas: 0, barra: 0, youPay: 0 });
    p.nights += 1;
    p.personas += t.personas;
    p.barra += t.barraRevenue;
    p.youPay += t.barraRevenue * (t.pctBarra / 100);
  }
  const list = Object.values(byP).map((p) => ({ ...p, barPerPers: p.personas ? p.barra / p.personas : 0 }));
  // Solo se juzga "earns/expensive" a quien realmente le pagás barra (youPay>0).
  // La casa (0% de barra) nunca es "cara": no te cuesta nada → 'none'.
  const pagadas = list.filter((p) => p.youPay > 0 && p.personas > 0).sort((a, b) => b.barPerPers - a.barPerPers);
  const tier = Math.max(1, Math.ceil(pagadas.length / 3));
  const top = new Set(pagadas.slice(0, tier).map((p) => p.nombre));
  const bottom = new Set(pagadas.slice(-tier).map((p) => p.nombre));
  return list.map((p) => {
    let deal = 'ok';
    if (p.youPay <= 0) deal = 'none';
    else if (pagadas.length >= 3 && top.has(p.nombre)) deal = 'earns';
    else if (pagadas.length >= 3 && bottom.has(p.nombre)) deal = 'expensive';
    return { ...p, deal };
  }).sort((a, b) => b.barPerPers - a.barPerPers);
}

// Integridad de caja: para las noches que tienen efectivo contado al cierre,
// varianza = (contado − fondo) − esperado. `esperado` = tickets no-RA + guardarropa
// (las dos cosas que sí son efectivo del portero). Sin efectivo contado no hay fila.
export function cashIntegrity(turnos) {
  const rows = turnos
    .filter((t) => t.efectivoContado != null)
    .map((t) => {
      const esperado = t.cashRevenue + t.guardarropaRevenue;
      return {
        fecha: t.fecha,
        dia: t.dia,
        portero: t.portero ?? '—',
        esperado,
        contado: t.efectivoContado,
        fondo: t.fondoCaja,
        variance: t.efectivoContado - t.fondoCaja - esperado,
      };
    })
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const mes = mesLocalHoy();
  const monthVariance = rows.filter((r) => r.fecha.startsWith(mes)).reduce((s, r) => s + r.variance, 0);
  return { rows, monthVariance, hasData: rows.length > 0 };
}

// ── Producers ────────────────────────────────────────────────────────────

function desviacionEstandar(valores) {
  const n = valores.length;
  if (n === 0) return 0;
  const media = valores.reduce((s, v) => s + v, 0) / n;
  const varianza = valores.reduce((s, v) => s + (v - media) ** 2, 0) / n;
  return Math.sqrt(varianza);
}

// Ranking de productoras. "Swing" es el coeficiente de variación (desvío
// estándar / promedio, en %) del € por persona noche a noche — cuánto se
// aleja cada noche del propio promedio de esa productora. Requiere 2+ noches;
// si no, queda null (no hay variación que medir con una sola noche).
//
// No incluye "net to venue": el schema no tiene el acuerdo económico por
// productora (% de puerta, fijo, etc.) — inventar ese número sería peor que
// no mostrarlo.
export function rankingProductoras(turnos) {
  const porProductora = {};
  for (const t of turnos) {
    if (!porProductora[t.productora]) {
      porProductora[t.productora] = {
        nombre: t.productora, nights: 0, personas: 0, free: 0, paid: 0, ra: 0,
        doorRevenue: 0, barraRevenue: 0, netToVenue: 0, perNoche: [],
      };
    }
    const p = porProductora[t.productora];
    p.nights += 1;
    p.personas += t.personas;
    p.free += t.freePersonas;
    p.paid += t.cashPersonas;
    p.ra += t.raPersonas;
    p.doorRevenue += t.doorRevenue;
    p.barraRevenue += t.barraRevenue;
    p.netToVenue += t.netToVenue;
    p.perNoche.push(t.avgPerPerson);
  }

  const lista = Object.values(porProductora).map((p) => {
    const avgPerPerson = p.personas ? p.doorRevenue / p.personas : 0;
    const media = p.perNoche.reduce((s, v) => s + v, 0) / (p.perNoche.length || 1);
    const sd = desviacionEstandar(p.perNoche);
    const swing = p.nights >= 2 && media ? (sd / media) * 100 : null;
    return { ...p, avgPerPerson, swing };
  });

  const porAvg = [...lista].sort((a, b) => b.avgPerPerson - a.avgPerPerson);
  const suficientesParaTiers = porAvg.length >= 3;
  const tier = Math.max(1, Math.ceil(porAvg.length / 3));
  const topNombres = new Set(porAvg.slice(0, tier).map((p) => p.nombre));
  const bottomNombres = new Set(porAvg.slice(-tier).map((p) => p.nombre));

  return porAvg.map((p) => {
    let status = 'stable';
    if (suficientesParaTiers && bottomNombres.has(p.nombre)) status = 'underperforming';
    else if (p.swing !== null && p.swing >= 35) status = 'watch';
    else if (suficientesParaTiers && topNombres.has(p.nombre)) status = 'top';
    return { ...p, status };
  });
}

// ── Door ─────────────────────────────────────────────────────────────────

// Las N noches más recientes, en orden cronológico (para gráficos y listas).
export function ultimasNoches(turnos, n = 8) {
  return turnos.slice(0, n).reverse();
}

// Todas las noches cerradas en orden cronológico (viejo -> nuevo), cada una
// con un label corto de fecha, para el gráfico de una barra por noche.
export function nochesCronologicas(turnos) {
  const label = (fechaStr) => {
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return [...turnos]
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((t) => ({ ...t, label: label(t.fecha) }));
}

// Recap de la semana (lunes-domingo) más reciente con datos, comparada
// contra la semana anterior — para la tarjeta chica de "Last week" en Door.
export function recapUltimaSemana(turnos) {
  const weeks = weeklyBuckets(turnos, 2);
  if (weeks.length === 0) return { total: 0, free: 0, paid: 0, ra: 0, deltaPct: null };
  const anterior = weeks[0]?.turnos ?? [];
  const actual = weeks[1]?.turnos ?? weeks[0]?.turnos ?? [];
  const totalActual = actual.reduce((s, t) => s + t.personas, 0);
  const totalAnterior = anterior.reduce((s, t) => s + t.personas, 0);
  return {
    total: totalActual,
    free: actual.reduce((s, t) => s + t.freePersonas, 0),
    paid: actual.reduce((s, t) => s + t.cashPersonas, 0),
    ra: actual.reduce((s, t) => s + t.raPersonas, 0),
    deltaPct: totalAnterior ? Math.round(((totalActual - totalAnterior) / totalAnterior) * 100) : null,
  };
}

// Curva de llegada por hora, superponiendo las últimas `n` noches reales de
// un día de semana dado (default sábado) — en vez de una noche "típica"
// promediada, que escondía cuánto varía en realidad. Cuenta entradas cada
// 30 minutos desde la apertura de CADA turno (no acumulado: interesa la
// tasa de llegada, para pensar dotación de puerta, no el total corrido).
export async function curvaHorariaUltimasNoches(turnos, dia = 'Saturday', n = 4) {
  const candidatos = turnos.filter((t) => t.dia === dia && t.hora_apertura && t.hora_cierre).slice(0, n);
  if (candidatos.length === 0) return { labels: [], noches: [], promedio: [] };

  const ids = candidatos.map((t) => t.id_turno);
  const { data, error } = await supabase
    .from('ingresos')
    .select('id_turno, timestamp, tipo')
    .in('id_turno', ids)
    .neq('tipo', 'guardarropa')
    .limit(5000);
  if (error) throw error;

  const BUCKET_MIN = 30;
  const contexto = {};
  for (const t of candidatos) {
    contexto[t.id_turno] = { apertura: new Date(t.hora_apertura), cierre: new Date(t.hora_cierre), buckets: new Map() };
  }
  for (const row of data ?? []) {
    const ctx = contexto[row.id_turno];
    if (!ctx) continue;
    const mins = Math.floor((new Date(row.timestamp) - ctx.apertura) / 60000);
    const bucket = Math.max(0, Math.floor(mins / BUCKET_MIN) * BUCKET_MIN);
    ctx.buckets.set(bucket, (ctx.buckets.get(bucket) ?? 0) + 1);
  }

  const duracionMax = Math.max(...candidatos.map((t) => (contexto[t.id_turno].cierre - contexto[t.id_turno].apertura) / 60000));
  const bucketCount = Math.max(1, Math.ceil(duracionMax / BUCKET_MIN));
  const referencia = contexto[candidatos[0].id_turno].apertura;
  const labels = Array.from({ length: bucketCount }, (_, i) => {
    const t = new Date(referencia.getTime() + i * BUCKET_MIN * 60000);
    return t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  });

  const noches = candidatos.map((t) => {
    const ctx = contexto[t.id_turno];
    return Array.from({ length: bucketCount }, (_, i) => ctx.buckets.get(i * BUCKET_MIN) ?? 0);
  });
  const promedio = Array.from({ length: bucketCount }, (_, i) => {
    const vals = noches.map((n) => n[i] ?? 0);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  });

  return { labels, fechas: candidatos.map((t) => t.fecha), noches, promedio };
}

// ── Nights ───────────────────────────────────────────────────────────────

export function nochesOrdenadasPorRevenue(turnos) {
  return [...turnos].sort((a, b) => b.doorRevenue - a.doorRevenue);
}

// Cuántas noches quedaron por debajo del propio promedio de revenue de esa
// productora (no del promedio general — cada una se mide contra sí misma).
export function nochesPorDebajoDelPropioPromedio(turnos) {
  const porProductora = {};
  for (const t of turnos) {
    (porProductora[t.productora] ??= []).push(t.doorRevenue);
  }
  const promedioPorProductora = {};
  for (const [nombre, valores] of Object.entries(porProductora)) {
    promedioPorProductora[nombre] = valores.reduce((s, v) => s + v, 0) / valores.length;
  }
  return turnos.filter((t) => t.doorRevenue < promedioPorProductora[t.productora]).length;
}

export function attendancePromedio(turnos) {
  if (turnos.length === 0) return 0;
  return turnos.reduce((s, t) => s + t.personas, 0) / turnos.length;
}

// ── Bar ──────────────────────────────────────────────────────────────────
// `barra_revenue` hoy es un placeholder cargado a mano (o, en la demo,
// generado por el seed) — no un import real de Revolut todavía. En cuanto
// haya datos en esa columna el dashboard los muestra como reales, tal cual
// hace con cualquier otro número: no hay nada "fake" a nivel de código.

export function resumenBarra(turnos) {
  const totalBarra = turnos.reduce((s, t) => s + t.barraRevenue, 0);
  const totalPersonas = turnos.reduce((s, t) => s + t.personas, 0);
  const totalDoor = turnos.reduce((s, t) => s + t.doorRevenue, 0);
  return {
    totalBarra,
    avgPerPersonBarra: totalPersonas ? totalBarra / totalPersonas : 0,
    trueSpendPerPerson: totalPersonas ? (totalBarra + totalDoor) / totalPersonas : 0,
  };
}
