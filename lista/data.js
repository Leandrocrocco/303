// Datos del formulario público de lista. Todo pasa por funciones RPC
// (SECURITY DEFINER en Postgres) para no exigir login y validar el PIN
// del lado del servidor. Ver db/migrations/007_lista_publica.sql.

import { supabase } from '../shared/supabaseClient.js';

export async function nightsParaLista() {
  const { data, error } = await supabase.rpc('nights_para_lista');
  if (error) throw error;
  return data ?? [];
}

export async function organizadoresParaLista(idCliente) {
  const { data, error } = await supabase.rpc('organizadores_para_lista', { p_id_cliente: idCliente });
  if (error) throw error;
  return data ?? [];
}

// Devuelve el total de nombres que quedaron en esa noche, o lanza error si el PIN no valida.
export async function cargarLista(idTurno, idOrganizador, pin, nombres) {
  const { data, error } = await supabase.rpc('cargar_lista', {
    p_id_turno: idTurno,
    p_id_organizador: idOrganizador,
    p_pin: pin,
    p_nombres: nombres,
  });
  if (error) throw error;
  return data;
}
