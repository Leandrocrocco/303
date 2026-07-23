// Cola de sync genérica, independiente de qué tabla escribe.
// Cualquier pantalla que necesite "guardar ahora, sincronizar cuando haya red"
// pasa por acá — no reimplementar esto por pantalla.
//
// Regla central: cada registro trae su propio id (uuid) generado en el cliente
// antes de encolarse. Eso permite reintentar con upsert sin nunca duplicar filas,
// aunque el mismo insert se reintente varias veces.

import { openDB } from 'https://esm.sh/idb@8';
import { supabase } from './supabaseClient.js';

const DB_NAME = '303-cola-local';
const DB_VERSION = 1;
const STORE = 'pendientes';

let dbPromise;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'claveLocal' });
      },
    });
  }
  return dbPromise;
}

// Otras partes de la app escuchan estos eventos para actualizar la UI
// (ej. contador de "N sin sincronizar", o avisar si un tap fue rechazado).
export const eventos = new EventTarget();

/**
 * Encola un insert y dispara un intento de sync inmediato.
 * `registro` debe incluir la columna id de la tabla ya generada (crypto.randomUUID()).
 * Devuelve enseguida — no espera a que llegue a Supabase.
 */
export async function encolarInsert(tabla, registro) {
  const db = await getDb();
  const claveLocal = crypto.randomUUID();
  await db.put(STORE, { claveLocal, tabla, registro, creado: Date.now() });
  emitirPendientes();
  intentarSincronizar();
  return registro;
}

async function intentarUno(item) {
  const { error } = await supabase.from(item.tabla).upsert(item.registro, { ignoreDuplicates: true });
  if (!error) return 'ok';
  // error.code presente = el servidor respondió (rechazo real, ej. RLS por turno bloqueado).
  // sin error.code = no hubo respuesta (falla de red) -> reintentar más tarde.
  return error.code ? 'rechazado' : 'reintentar';
}

let sincronizando = false;
export async function intentarSincronizar() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  try {
    const db = await getDb();
    const items = await db.getAll(STORE);
    for (const item of items) {
      const resultado = await intentarUno(item);
      if (resultado === 'ok') {
        await db.delete(STORE, item.claveLocal);
        eventos.dispatchEvent(new CustomEvent('sincronizado', { detail: item }));
      } else if (resultado === 'rechazado') {
        await db.delete(STORE, item.claveLocal);
        eventos.dispatchEvent(new CustomEvent('rechazado', { detail: item }));
      }
      // 'reintentar': queda en la cola tal cual, se vuelve a intentar en la próxima pasada
    }
  } finally {
    sincronizando = false;
    emitirPendientes();
  }
}

export async function contarPendientes() {
  const db = await getDb();
  return db.count(STORE);
}

/**
 * Busca en la cola local un insert pendiente que todavía no llegó a Supabase
 * y lo cancela sin enviarlo. Devuelve true si encontró y canceló algo —
 * en ese caso el llamador no necesita hacer nada más en el servidor.
 * Devuelve false si no había nada pendiente (ya sincronizó o nunca pasó por la cola),
 * y el llamador es responsable de borrar/revertir directo contra Supabase.
 */
export async function cancelarSiPendiente(tabla, campoId, valorId) {
  const db = await getDb();
  const items = await db.getAll(STORE);
  const item = items.find((i) => i.tabla === tabla && i.registro[campoId] === valorId);
  if (!item) return false;
  await db.delete(STORE, item.claveLocal);
  emitirPendientes();
  return true;
}

async function emitirPendientes() {
  const cantidad = await contarPendientes();
  eventos.dispatchEvent(new CustomEvent('pendientes', { detail: { cantidad } }));
}

window.addEventListener('online', intentarSincronizar);
setInterval(intentarSincronizar, 15000);
intentarSincronizar();
