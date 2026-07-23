-- Reemplaza turnos.productora (texto libre) por una tabla de referencia,
-- igual que organizadores. Evita que un typo en la puerta fragmente
-- silenciosamente el ranking de productoras del dashboard.
-- Correr en el SQL Editor de Supabase. turnos está vacía todavía, es seguro.

create table productoras (
  id_productora uuid primary key default gen_random_uuid(),
  id_cliente uuid not null references clientes(id_cliente),
  nombre text not null
);

create index idx_productoras_cliente on productoras(id_cliente);

alter table turnos drop column productora;
alter table turnos add column id_productora uuid not null references productoras(id_productora);

alter table productoras enable row level security;

create policy productoras_select on productoras for select
  using (is_admin() or id_cliente in (select clientes_permitidos()));
create policy productoras_insert on productoras for insert
  with check (is_admin());
