// Botonera de conteo: cada tap registra un ingreso, optimista en la UI
// y encolado para sync (ver shared/queue.js). Deshacer y reset operan
// sobre la misma pila de acciones, así que "deshacer" funciona sin
// importar si la última acción fue un tap directo o un check-in de lista.

import { supabase } from '../shared/supabaseClient.js';
import { encolarInsert, cancelarSiPendiente } from '../shared/queue.js';
import { estado, notificar } from './estado.js';

function calcularValor(tipo, valorExplicito) {
  if (tipo === 'ticket') return valorExplicito ?? Number(estado.turno.valor_ticket);
  if (tipo === 'guardarropa') return 2;
  return 0; // free_23h, free_lista
}

// tipo: 'free_23h' | 'ticket' | 'guardarropa'. free_lista no pasa por acá,
// se registra desde lista.js (por nombre) o registrarFree303 (sin nombre).
// valorExplicito: para tickets con multi-precio (uno de estado.turno.precios_extra).
export async function registrarTap(tipo, valorExplicito) {
  const esRa = tipo !== 'guardarropa' && estado.raActiva;
  const valor = calcularValor(tipo, valorExplicito);
  const registro = {
    id_ingreso: crypto.randomUUID(),
    id_turno: estado.turno.id_turno,
    timestamp: new Date().toISOString(),
    tipo,
    es_ra: esRa,
    valor,
  };

  estado.conteos[tipo] += 1;
  if (tipo === 'ticket') estado.conteosPorPrecio[valor] = (estado.conteosPorPrecio[valor] ?? 0) + 1;
  if (esRa) estado.cobradoRa += registro.valor;
  else estado.caja += registro.valor;
  estado.raActiva = false; // el checkbox se destilda solo después de cada ingreso
  estado.undoStack.push({ tipo: 'ingreso', registro });
  notificar();

  await encolarInsert('ingresos', registro);
}

// FREE 303: pasar N personas sin lista, atribuidas a un organizador. Se registran
// como free_lista (mismo camino/contador que "free por lista") pero con
// id_organizador, como si ese organizador las hubiese anotado.
export async function registrarFree303(cantidad, idOrganizador) {
  const registros = [];
  for (let i = 0; i < cantidad; i++) {
    registros.push({
      id_ingreso: crypto.randomUUID(),
      id_turno: estado.turno.id_turno,
      timestamp: new Date().toISOString(),
      tipo: 'free_lista',
      es_ra: false,
      valor: 0,
      id_organizador: idOrganizador,
    });
  }

  estado.conteos.free_lista += cantidad;
  estado.undoStack.push({ tipo: 'free303', registros });
  notificar();

  for (const registro of registros) await encolarInsert('ingresos', registro);
}

export async function deshacerUltimo() {
  const accion = estado.undoStack.pop();
  if (!accion) return;

  if (accion.tipo === 'ingreso') {
    const { registro } = accion;
    estado.conteos[registro.tipo] -= 1;
    if (registro.tipo === 'ticket') estado.conteosPorPrecio[registro.valor] -= 1;
    if (registro.es_ra) estado.cobradoRa -= registro.valor;
    else estado.caja -= registro.valor;
    notificar();

    const canceladoLocal = await cancelarSiPendiente('ingresos', 'id_ingreso', registro.id_ingreso);
    if (!canceladoLocal) {
      await supabase.from('ingresos').delete().eq('id_ingreso', registro.id_ingreso);
    }
  } else if (accion.tipo === 'free303') {
    const { registros } = accion;
    estado.conteos.free_lista -= registros.length;
    notificar();
    for (const registro of registros) {
      const canceladoLocal = await cancelarSiPendiente('ingresos', 'id_ingreso', registro.id_ingreso);
      if (!canceladoLocal) {
        await supabase.from('ingresos').delete().eq('id_ingreso', registro.id_ingreso);
      }
    }
  } else if (accion.tipo === 'lista') {
    const { fila, idIngreso } = accion;
    estado.conteos.free_lista -= 1;
    const cacheItem = estado.listaCache.find((l) => l.id_lista === fila.id_lista);
    if (cacheItem) {
      cacheItem.entro = false;
      cacheItem.hora_entro = null;
    }
    notificar();

    await supabase.from('lista').update({ entro: false, hora_entro: null }).eq('id_lista', fila.id_lista);
    const canceladoLocal = await cancelarSiPendiente('ingresos', 'id_ingreso', idIngreso);
    if (!canceladoLocal) {
      await supabase.from('ingresos').delete().eq('id_ingreso', idIngreso);
    }
  }
}

export async function resetearTurno() {
  await supabase.from('ingresos').delete().eq('id_turno', estado.turno.id_turno);
  await supabase
    .from('lista')
    .update({ entro: false, hora_entro: null })
    .eq('id_turno', estado.turno.id_turno)
    .eq('entro', true);

  estado.conteos = { free_23h: 0, free_lista: 0, ticket: 0, guardarropa: 0 };
  estado.conteosPorPrecio = {};
  estado.caja = 0;
  estado.cobradoRa = 0;
  estado.raActiva = false;
  estado.undoStack = [];
  for (const fila of estado.listaCache) {
    fila.entro = false;
    fila.hora_entro = null;
  }
  notificar();
}
