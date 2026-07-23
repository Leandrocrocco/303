-- Encontrado probando: nada impedía abrir dos turnos a la vez para el mismo
-- cliente (pasó en la práctica al testear desde dos navegadores en paralelo).
-- La app siempre resume "el turno abierto más reciente", así que el otro
-- quedaba huérfano — vivo en la base pero invisible para la puerta.
-- Este índice único hace que el segundo intento de abrir falle en la base,
-- no que se pierda silenciosamente.

create unique index idx_un_turno_abierto_por_cliente
  on turnos(id_cliente)
  where bloqueado = false;
