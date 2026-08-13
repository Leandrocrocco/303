-- Import real de barra (Revolut POS): transacciones crudas, no un solo
-- número manual por noche como venía siendo `turnos.barra_revenue`.
-- Requiere `noche_303()` (migración 011) ya aplicada.
--
-- Diseño: cualquiera sea el camino que inserte filas acá (import directo
-- desde admin, más adelante n8n, lo que sea), el matching a una noche
-- concreta vive en UN SOLO lugar — un trigger, no en el script de import.
-- Así no hay que reescribir esa lógica en cada lugar que algún día escriba
-- acá.
--
-- Pendiente a propósito: el CSV de bebidas desglosadas todavía no se vio
-- (falta que Leandro lo suba). Esta tabla es solo transacciones (cash/card,
-- montos, hora) — el desglose de qué se vendió es una tabla aparte que se
-- suma después, sin tocar esta.

create table barra_transacciones (
  id_transaccion uuid primary key default gen_random_uuid(),
  id_cliente uuid not null references clientes(id_cliente),
  id_turno uuid references turnos(id_turno), -- null si no matcheó ninguna noche cargada — se revisa a mano
  receipt_ref text not null,
  timestamp_utc timestamptz not null,
  metodo_pago text not null check (metodo_pago in ('cash', 'card')),
  subtotal numeric not null default 0,     -- Subtotal (excl. tax) del export
  impuestos numeric not null default 0,    -- Total taxes
  propina numeric not null default 0,      -- Tip
  total numeric not null default 0,        -- Total (lo que efectivamente cobró el POS)
  estado_pos text not null default 'Completed', -- Status crudo del export (Completed/Cancelled/...)
  origen text not null default 'revolut_pos',
  creado_en timestamptz not null default now(),
  unique (id_cliente, receipt_ref) -- reimportar el mismo CSV no duplica filas
);

create index idx_barra_transacciones_turno on barra_transacciones(id_turno);
create index idx_barra_transacciones_cliente on barra_transacciones(id_cliente);

-- Asigna sola la noche que corresponde según la hora de la venta, con el
-- mismo corte que ya usa noche_303() (06:00 Europe/Madrid, respeta DST).
create or replace function _asignar_turno_barra()
returns trigger
language plpgsql
as $$
declare
  v_fecha date;
begin
  v_fecha := noche_303(new.timestamp_utc);
  select id_turno into new.id_turno
    from turnos
    where id_cliente = new.id_cliente and fecha = v_fecha
    limit 1;
  return new;
end;
$$;

create trigger trg_asignar_turno_barra
  before insert on barra_transacciones
  for each row execute function _asignar_turno_barra();

alter table barra_transacciones enable row level security;

create policy barra_transacciones_select on barra_transacciones for select
  using (is_admin() or id_cliente in (select clientes_permitidos()));
create policy barra_transacciones_insert on barra_transacciones for insert
  with check (is_admin() or id_cliente in (select clientes_permitidos()));
create policy barra_transacciones_delete on barra_transacciones for delete
  using (is_admin());

-- Vista análoga a turno_totales — agrega dentro de Postgres, para que el
-- día que el dashboard quiera usar esto en vez de (o además de)
-- turnos.barra_revenue, no traiga transacción por transacción al navegador.
create or replace view barra_totales
with (security_invoker = true)
as
select
  id_turno,
  count(*) as transacciones,
  coalesce(sum(subtotal), 0) as subtotal,
  coalesce(sum(impuestos), 0) as impuestos,
  coalesce(sum(propina), 0) as propina,
  coalesce(sum(total), 0) as total,
  coalesce(sum(total) filter (where metodo_pago = 'cash'), 0) as total_cash,
  coalesce(sum(total) filter (where metodo_pago = 'card'), 0) as total_card
from barra_transacciones
where id_turno is not null and estado_pos = 'Completed'
group by id_turno;

grant select on barra_totales to anon, authenticated;
