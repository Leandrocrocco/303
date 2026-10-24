-- `Receipt#` del export de Revolut es el id del PEDIDO, no de la transacción:
-- un pedido pagado en dos tarjetas (split) trae dos filas reales con el mismo
-- recibo (visto en el export real: mismo minuto, mismo método, montos
-- distintos). Con unique(id_cliente, receipt_ref) la segunda se descartaba en
-- silencio y la barra de la noche quedaba corta.
--
-- Nueva clave: recibo + hora + total + método + `linea` (numera las filas
-- idénticas dentro del archivo). Reimportar el mismo CSV sigue sin duplicar.
-- Las filas ya cargadas quedan con linea = 1. Si antes se descartó alguna
-- venta repetida, hay que reimportar ese CSV una vez: entra solo la que faltaba.

alter table barra_transacciones add column linea smallint not null default 1;

alter table barra_transacciones drop constraint barra_transacciones_id_cliente_receipt_ref_key;

alter table barra_transacciones add constraint barra_transacciones_dedupe_key
  unique (id_cliente, receipt_ref, timestamp_utc, total, metodo_pago, linea);
