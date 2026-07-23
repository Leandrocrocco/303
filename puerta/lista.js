// Buscador de la lista de invitados. Busca contra una copia local
// (cargada al abrir/resumir turno) para que escribir un nombre no
// dependa de la red en cada tecla — el botón de refresco es el
// respaldo explícito para traer altas de último momento.
//
// Confirmar una entrada SÍ requiere conexión: es una escritura con
// validación (nadie entra dos veces con el mismo nombre) y el volumen
// es bajo, así que no vale la pena la complejidad de encolarla offline.

import { supabase } from '../shared/supabaseClient.js';
import { estado, notificar } from './estado.js';

// Rango unicode de marcas diacríticas combinantes (acentos, tildes) que
// queda expuesto al descomponer con NFD. Se arma con codePointAt para no
// depender de que el archivo se guarde/edite con los caracteres literales.
const DIACRITICOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICOS, '');
}

export async function refrescarLista() {
  const { data, error } = await supabase
    .from('lista')
    .select('*')
    .eq('id_turno', estado.turno.id_turno)
    .order('nombre');
  if (error) throw error;
  estado.listaCache = data ?? [];
  notificar();
}

export function buscar(query) {
  const q = normalizar(query.trim());
  if (!q) return [];
  return estado.listaCache
    .filter((fila) => fila.nombre_normalizado.includes(q))
    .slice(0, 8);
}

// Devuelve { ok: true } o { ok: false, motivo }.
export async function marcarEntrada(fila) {
  const horaEntro = new Date().toISOString();

  const { data, error } = await supabase
    .from('lista')
    .update({ entro: true, hora_entro: horaEntro })
    .eq('id_lista', fila.id_lista)
    .eq('entro', false)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, motivo: error.code ? 'error' : 'sin-conexion' };
  }
  if (!data) {
    // Alguien ya lo había marcado (refresh atrasado / doble tap en la puerta)
    await refrescarLista();
    return { ok: false, motivo: 'ya-entro' };
  }

  const idIngreso = crypto.randomUUID();
  const { error: e2 } = await supabase.from('ingresos').insert({
    id_ingreso: idIngreso,
    id_turno: estado.turno.id_turno,
    timestamp: horaEntro,
    tipo: 'free_lista',
    es_ra: false,
    valor: 0,
  });
  if (e2) {
    // La marca en la lista ya quedó guardada; revertimos para no dejarla inconsistente.
    await supabase.from('lista').update({ entro: false, hora_entro: null }).eq('id_lista', fila.id_lista);
    return { ok: false, motivo: 'sin-conexion' };
  }

  const cacheItem = estado.listaCache.find((l) => l.id_lista === fila.id_lista);
  if (cacheItem) {
    cacheItem.entro = true;
    cacheItem.hora_entro = horaEntro;
  }
  estado.conteos.free_lista += 1;
  estado.undoStack.push({ tipo: 'lista', fila: { ...fila, hora_entro: horaEntro }, idIngreso });
  notificar();

  return { ok: true };
}
