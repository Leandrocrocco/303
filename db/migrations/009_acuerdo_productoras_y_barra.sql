-- 009: reparto económico por productora + placeholder de revenue de barra.
--
-- Regla de negocio real (venía del Excel operativo previo): el venue le paga a
-- la productora 20% de la puerta y 30% de la barra. Antes
-- de esta migración el schema no tenia ningun dato del acuerdo economico,
-- asi que "net to venue" no se podia calcular de verdad (se dejo afuera del
-- dashboard a proposito). Queda por productora, no fijo global, porque el
-- porcentaje puede variar de un acuerdo a otro.
--
-- `barra_revenue` en turnos es un placeholder manual hasta que exista un
-- import real de Revolut (con desglose por hora/categoria). Por ahora es
-- un numero unico por turno, cargable a mano desde el admin.

alter table productoras add column if not exists pct_puerta numeric not null default 20;
alter table productoras add column if not exists pct_barra numeric not null default 30;

alter table turnos add column if not exists barra_revenue numeric not null default 0;
