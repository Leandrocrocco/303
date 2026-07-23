-- Borra TODOS los datos operativos de prueba (turnos, ingresos, listas)
-- pero conserva los datos de referencia: clientes, productoras, organizadores
-- y usuarios. Correr en el SQL Editor cuando quieras dejar la base limpia
-- para empezar a cargar datos reales / mostrar el dashboard sin ruido.

delete from ingresos;
delete from lista;
delete from turnos;
