// Apertura, resumen (si la app se recargó a mitad de noche) y cierre del turno.

import { supabase } from '../shared/supabaseClient.js';
import { estado, notificar } from './estado.js';

export async function cargarClientesYProductoras() {
  const [{ data: clientes, error: e1 }, { data: productoras, error: e2 }] = await Promise.all([
    supabase.from('clientes').select('id_cliente, nombre').order('nombre'),
    supabase.from('productoras').select('id_productora, id_cliente, nombre').eq('activo', true).order('nombre'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { clientes: clientes ?? [], productoras: productoras ?? [] };
}

// Organizadores activos de un cliente, para el desplegable de FREE 303.
export async function listarOrganizadoresPuerta(idCliente) {
  const { data, error } = await supabase
    .from('organizadores')
    .select('id_organizador, nombre')
    .eq('id_cliente', idCliente)
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data ?? [];
}

// Suma un precio de ticket más a la noche (multi-precio): la botonera dibuja
// un botón TICKET por cada valor en [valor_ticket, ...precios_extra].
export async function agregarPrecioTicket(idTurno, precio) {
  const actuales = estado.turno.precios_extra ?? [];
  if (Number(precio) === Number(estado.turno.valor_ticket) || actuales.includes(Number(precio))) {
    throw new Error('Ese precio ya existe.');
  }
  const { data, error } = await supabase
    .from('turnos')
    .update({ precios_extra: [...actuales, Number(precio)] })
    .eq('id_turno', idTurno)
    .select('*, clientes(nombre), productoras(nombre)')
    .single();
  if (error) throw error;
  estado.turno = data;
  notificar();
}

// Un turno que el portero ya activó y sigue contando (para retomar tras recargar).
export async function buscarTurnoActivo() {
  const { data, error } = await supabase
    .from('turnos')
    .select('*, clientes(nombre), productoras(nombre)')
    .eq('estado', 'activo')
    .order('hora_apertura', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Noches que el admin agendó y todavía nadie activó. El portero elige una al llegar.
export async function listarNochesProgramadas() {
  const { data, error } = await supabase
    .from('turnos')
    .select('*, clientes(nombre), productoras(nombre)')
    .eq('estado', 'programado')
    .order('fecha');
  if (error) throw error;
  return data ?? [];
}

// Activa una noche agendada: le pone portero, hora y valor de ticket, y pasa a 'activo'.
export async function activarNoche(idTurno, { portero, valor_ticket }) {
  const { data, error } = await supabase
    .from('turnos')
    .update({ estado: 'activo', portero, valor_ticket, hora_apertura: new Date().toISOString() })
    .eq('id_turno', idTurno)
    .select('*, clientes(nombre), productoras(nombre)')
    .single();
  if (error) throw error;
  return data;
}

// Deshace una apertura hecha por error: la noche vuelve a 'programado' (a la agenda),
// borrando portero y hora de apertura. Los ingresos ya contados NO se tocan (si se
// re-activa, se retoman). No revierte valor_ticket: se vuelve a pedir al re-activar.
export async function cancelarApertura(idTurno) {
  const { error } = await supabase
    .from('turnos')
    .update({ estado: 'programado', portero: null, hora_apertura: null })
    .eq('id_turno', idTurno);
  if (error) throw error;
}

// Fallback: si no hay ninguna noche agendada, el portero crea una en el acto (ya activa).
export async function crearTurnoAlVuelo({ id_cliente, id_productora, fecha, valor_ticket, portero }) {
  const { data, error } = await supabase
    .from('turnos')
    .insert({ id_cliente, id_productora, fecha, valor_ticket, portero, estado: 'activo', hora_apertura: new Date().toISOString() })
    .select('*, clientes(nombre), productoras(nombre)')
    .single();
  if (error) throw error;
  return data;
}

// Reconstruye los contadores locales desde lo ya guardado en Supabase.
// Necesario si la app se cierra/recarga a mitad de turno.
export async function resumirDesdeServidor(turnoRow) {
  estado.turno = turnoRow;

  const { data: ingresos, error: e1 } = await supabase
    .from('ingresos')
    .select('tipo, valor, es_ra')
    .eq('id_turno', turnoRow.id_turno);
  if (e1) throw e1;

  const conteos = { free_23h: 0, free_lista: 0, ticket: 0, guardarropa: 0 };
  const conteosPorPrecio = {};
  let caja = 0;
  let cobradoRa = 0;
  for (const ing of ingresos ?? []) {
    conteos[ing.tipo] = (conteos[ing.tipo] ?? 0) + 1;
    if (ing.tipo === 'ticket') conteosPorPrecio[ing.valor] = (conteosPorPrecio[ing.valor] ?? 0) + 1;
    if (ing.es_ra) cobradoRa += Number(ing.valor);
    else caja += Number(ing.valor);
  }
  estado.conteos = conteos;
  estado.conteosPorPrecio = conteosPorPrecio;
  estado.caja = caja;
  estado.cobradoRa = cobradoRa;

  const { data: lista, error: e2 } = await supabase
    .from('lista')
    .select('*')
    .eq('id_turno', turnoRow.id_turno)
    .order('nombre');
  if (e2) throw e2;
  estado.listaCache = lista ?? [];

  notificar();
}

export async function editarTurno(cambios) {
  const { data, error } = await supabase
    .from('turnos')
    .update(cambios)
    .eq('id_turno', estado.turno.id_turno)
    .select('*, clientes(nombre), productoras(nombre)')
    .single();
  if (error) throw error;
  estado.turno = data;
  notificar();
}

// Desglose para el resumen de cierre, calculado fresco desde Supabase
// (no desde estado.conteos, que mezcla tickets RA y no-RA en un solo número
// y no alcanza para desglosar cuánto de eso es caja real).
export async function calcularDesgloseCierre(idTurno) {
  const { data, error } = await supabase.from('ingresos').select('tipo, valor, es_ra').eq('id_turno', idTurno);
  if (error) throw error;

  const desglose = {
    personas: 0,
    caja: 0,
    cobradoRa: 0,
    ticketsCaja: 0,
    ticketsRa: 0,
    guardarropa: 0,
  };
  for (const ing of data ?? []) {
    if (ing.tipo !== 'guardarropa') desglose.personas += 1;
    if (ing.es_ra) desglose.cobradoRa += Number(ing.valor);
    else desglose.caja += Number(ing.valor);
    if (ing.tipo === 'ticket' && ing.es_ra) desglose.ticketsRa += 1;
    if (ing.tipo === 'ticket' && !ing.es_ra) desglose.ticketsCaja += 1;
    if (ing.tipo === 'guardarropa') desglose.guardarropa += 1;
  }
  return desglose;
}

// Requiere conexión a propósito: el cierre es una acción deliberada,
// no de alta frecuencia, y así se evita reconciliar un cierre offline
// con taps que sigan encolados después del bloqueo del turno.
export async function cerrarTurno({ fondo_caja, efectivo_contado } = {}) {
  const update = { estado: 'cerrado', hora_cierre: new Date().toISOString() };
  if (fondo_caja != null) update.fondo_caja = fondo_caja;
  if (efectivo_contado != null) update.efectivo_contado = efectivo_contado;
  const { data, error } = await supabase
    .from('turnos')
    .update(update)
    .eq('id_turno', estado.turno.id_turno)
    .select('*, clientes(nombre), productoras(nombre)')
    .single();
  if (error) throw error;
  estado.turno = data;
  notificar();
}
