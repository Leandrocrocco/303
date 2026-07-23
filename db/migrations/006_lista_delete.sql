-- Sin policy de delete en `lista`, RLS bloquea todo borrado de nombres.
-- Hace falta para cancelar una noche agendada que ya tiene lista cargada:
-- el turno no se puede borrar mientras filas de lista lo referencien (FK),
-- así que primero hay que poder borrar esos nombres. Solo el admin.

drop policy if exists lista_delete on lista;
create policy lista_delete on lista for delete using (is_admin());
