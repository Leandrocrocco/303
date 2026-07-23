// Capa de datos del panel admin. Toda query contra Supabase vive acá,
// la UI (app.js) solo llama estas funciones. Si mañana cambia una tabla
// o una regla, se toca este archivo y la UI queda igual.

import { supabase } from '../shared/supabaseClient.js';

export async function listarClientes() {
  const { data, error } = await supabase.from('clientes').select('id_cliente, nombre').order('nombre');
  if (error) throw error;
  return data ?? [];
}

// Incluye inactivas: el admin las gestiona (la puerta filtra activo=true por su cuenta).
export async function listarProductoras(idCliente) {
  const { data, error } = await supabase
    .from('productoras')
    .select('*')
    .eq('id_cliente', idCliente)
    .order('activo', { ascending: false })
    .order('nombre');
  if (error) throw error;
  return data ?? [];
}

export async function crearProductora(idCliente, nombre) {
  const { error } = await supabase.from('productoras').insert({ id_cliente: idCliente, nombre });
  if (error) throw error;
}

export async function setActivoProductora(id, activo) {
  const { error } = await supabase.from('productoras').update({ activo }).eq('id_productora', id);
  if (error) throw error;
}

// % de puerta/barra que se le paga a esa productora — puede variar de
// acuerdo a acuerdo, no es un valor fijo global.
export async function actualizarAcuerdoProductora(id, pctPuerta, pctBarra) {
  const { error } = await supabase.from('productoras').update({ pct_puerta: pctPuerta, pct_barra: pctBarra }).eq('id_productora', id);
  if (error) throw error;
}

export async function listarOrganizadores(idCliente) {
  const { data, error } = await supabase
    .from('organizadores')
    .select('*')
    .eq('id_cliente', idCliente)
    .order('activo', { ascending: false })
    .order('nombre');
  if (error) throw error;
  return data ?? [];
}

export async function crearOrganizador(idCliente, nombre, pin) {
  const { error } = await supabase.from('organizadores').insert({ id_cliente: idCliente, nombre, pin });
  if (error) throw error;
}

export async function setActivoOrganizador(id, activo) {
  const { error } = await supabase.from('organizadores').update({ activo }).eq('id_organizador', id);
  if (error) throw error;
}

// Carga manual del total de barra de esa noche (placeholder hasta que haya
// un import real de Revolut). Solo tiene sentido en turnos cerrados.
export async function actualizarBarraRevenue(idTurno, monto) {
  const { error } = await supabase.from('turnos').update({ barra_revenue: monto }).eq('id_turno', idTurno);
  if (error) throw error;
}

// Agenda una noche por adelantado (estado 'programado'): sin portero ni hora,
// esos se completan cuando el portero la activa. La lista se carga contra esta noche.
export async function crearTurnoProgramado(idCliente, idProductora, fecha) {
  const { error } = await supabase
    .from('turnos')
    .insert({ id_cliente: idCliente, id_productora: idProductora, fecha, estado: 'programado' });
  if (error) throw error;
}

// Cancela una noche programada. Primero borra los nombres de lista que la
// referencian (si el organizador ya cargó algo), porque el FK no deja borrar
// el turno mientras existan. La UI solo ofrece cancelar noches 'programado',
// que nunca tienen ingresos (esos requieren turno activo).
export async function eliminarTurno(idTurno) {
  const { error: e1 } = await supabase.from('lista').delete().eq('id_turno', idTurno);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('turnos').delete().eq('id_turno', idTurno);
  if (e2) throw e2;
}

// Turnos cerrados del cliente con sus totales agregados. Los totales salen
// de `turno_totales` / `lista_conteo` (vistas que agregan DENTRO de Postgres,
// una fila por turno) — nunca se traen las filas de `ingresos`/`lista` una
// por una: la API REST corta en 1000 filas por default, y eso trunca la
// suma en silencio apenas el venue acumula unos meses de uso real.
export async function listarTurnosConTotales(idCliente) {
  const { data: turnos, error } = await supabase
    .from('turnos')
    .select('*, productoras(nombre)')
    .eq('id_cliente', idCliente)
    .order('fecha', { ascending: false });
  if (error) throw error;
  if (!turnos || turnos.length === 0) return [];

  const ids = turnos.map((t) => t.id_turno);
  const [{ data: totales, error: e2 }, { data: conteos, error: e3 }] = await Promise.all([
    supabase.from('turno_totales').select('*').in('id_turno', ids),
    supabase.from('lista_conteo').select('*').in('id_turno', ids),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;

  const nombresPorTurno = {};
  for (const c of conteos ?? []) nombresPorTurno[c.id_turno] = c.nombres;

  const porTurno = {};
  for (const t of totales ?? []) {
    porTurno[t.id_turno] = {
      personas: t.personas,
      free: t.free_personas,
      cash: t.cash_personas,
      ra: t.ra_personas,
      caja: Number(t.cash_revenue),
      cobradoRa: Number(t.ra_revenue),
    };
  }
  const vacio = { personas: 0, free: 0, cash: 0, ra: 0, caja: 0, cobradoRa: 0 };

  return turnos.map((t) => ({
    ...t,
    totales: porTurno[t.id_turno] ?? vacio,
    nombresEnLista: nombresPorTurno[t.id_turno] ?? 0,
  }));
}
