-- Ciclo de vida del turno: programado -> activo -> cerrado.
-- Antes solo existía `bloqueado` (cerrado sí/no). Ahora el admin agenda noches
-- por adelantado (programado), el organizador carga la lista contra esa noche,
-- y el portero la activa al llegar. Correr entero en el SQL Editor.

alter table turnos add column estado text not null default 'activo'
  check (estado in ('programado', 'activo', 'cerrado'));

-- portero y hora_apertura no se conocen hasta que el portero activa el turno
alter table turnos alter column portero drop not null;
alter table turnos alter column hora_apertura drop default;
alter table turnos alter column hora_apertura drop not null;

-- backfill desde el flag viejo antes de eliminarlo
update turnos set estado = case when bloqueado then 'cerrado' else 'activo' end;

-- Todo lo que depende de `bloqueado` hay que soltarlo ANTES de dropear la columna:
--  1) el índice parcial (su condición usa bloqueado)
--  2) las policies que lo referencian
drop index if exists idx_un_turno_abierto_por_cliente;
drop policy ingresos_insert on ingresos;
drop policy ingresos_delete on ingresos;
drop policy lista_insert on lista;
drop policy lista_update on lista;

alter table turnos drop column bloqueado;

-- Ingresos: solo se cuentan contra un turno ACTIVO (no programado, no cerrado)
create policy ingresos_insert on ingresos for insert
  with check (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = ingresos.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.estado = 'activo'
    )
  );
create policy ingresos_delete on ingresos for delete
  using (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = ingresos.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.estado = 'activo'
    )
  );

-- Lista: se carga contra un turno programado o activo, nunca cerrado
create policy lista_insert on lista for insert
  with check (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = lista.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.estado <> 'cerrado'
    )
  );
-- Marcar entrada (entro): solo mientras el turno está activo
create policy lista_update on lista for update
  using (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = lista.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.estado = 'activo'
    )
  );

-- Solo un turno ACTIVO por cliente a la vez (los programados futuros no bloquean)
create unique index idx_un_turno_activo_por_cliente on turnos(id_cliente) where estado = 'activo';

-- Cancelar una noche agendada: el admin puede borrar turnos
create policy turnos_delete on turnos for delete using (is_admin());
