-- Evita cargar dos turnos con la misma fecha para el mismo cliente (local).
-- Correr en dos pasos: primero el chequeo, después el índice.

-- 1) Chequeo — si esto devuelve filas, hay que resolver esos duplicados a
--    mano ANTES de aplicar el índice (el create index de abajo va a fallar
--    si existe algún duplicado real).
select id_cliente, fecha, count(*) as cuantos
from turnos
group by id_cliente, fecha
having count(*) > 1;

-- 2) Si el chequeo de arriba no devolvió filas, aplicar:
create unique index idx_turnos_un_evento_por_dia on turnos(id_cliente, fecha);
