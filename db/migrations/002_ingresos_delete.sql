-- Sin policy de delete, RLS bloquea todo borrado por default.
-- "Deshacer último toque" y "Reset" necesitan poder borrar filas de ingresos
-- mientras el turno siga abierto.

create policy ingresos_delete on ingresos for delete
  using (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = ingresos.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.bloqueado = false
    )
  );
