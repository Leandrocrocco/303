// Estado en memoria de la sesión de puerta actual. Un solo objeto que
// el resto de los módulos de esta pantalla leen y mutan — evita pasar
// props entre archivos y da una sola fuente de verdad para el render.

export const estado = {
  turno: null,       // fila de `turnos` + { nombreCliente, nombreProductora }
  conteos: { free_23h: 0, free_lista: 0, ticket: 0, guardarropa: 0 },
  conteosPorPrecio: {}, // { [precio]: cantidad } — un botón TICKET por precio
  organizadoresPuerta: [], // para el desplegable de FREE 303
  caja: 0,            // efectivo a rendir (tickets + guardarropa, sin RA)
  cobradoRa: 0,        // tickets marcados RA, no es efectivo del portero
  raActiva: false,      // checkbox RA, se auto-destilda tras el próximo tap
  undoStack: [],        // últimas acciones, para "deshacer" (más reciente al final)
  listaCache: [],        // filas de `lista` del turno actual
  vista: 'cargando',      // 'cargando' | 'login' | 'abrir-turno' | 'conteo' | 'cierre'
};

export const eventos = new EventTarget();
export function notificar() {
  eventos.dispatchEvent(new CustomEvent('cambio'));
}
