-- CATALOGO DE ACTIVIDADES EN ESTADO LIMPIO.
--
-- Que hace: deja el catalogo como estaba antes de importar el Excel de
-- actividades. Es decir, SOLO las cinco actividades generales
-- (es_general = TRUE) quedan activas, que es lo que puede registrar cualquier
-- persona de cualquier division sin importar a que area pertenezca.
--
-- Por que existe: el catalogo por division no se carga con un script, se carga
-- desde Configuracion -> Actividades, importando "TIME CONTROL - ACTIVIDADES".
-- Las filas que dejo el importador siguen aqui, pero desactivadas: se conservan
-- por si hay que volver atras, y la siguiente importacion las vuelve a activar
-- por nombre sin crear duplicados.
--
-- Lo que NO se borra: nada. Las actividades ya registradas siguen apuntando a
-- su tipo (tipos_actividad es ON DELETE RESTRICT desde actividades, ademas), y
-- desactivar un tipo solo lo saca del desplegable de nuevas horas: el historial
-- conserva el nombre por id.
--
-- Para dejar el catalogo como estaba, sin ejecutar esto:
--   Configuracion -> Actividades -> Importar catalogo
--
-- Idempotente: se puede ejecutar mas de una vez sin romper nada.

-- Las generales no tienen codigo propio: son el comun denominador de todas las
-- areas y en el archivo no aparecen con uno.
UPDATE tipos_actividad
   SET codigo = NULL
 WHERE es_general = TRUE
   AND codigo IS NOT NULL;

-- Todo lo demas queda disponible pero fuera del desplegable.
UPDATE tipos_actividad
   SET activo = FALSE
 WHERE es_general = FALSE
   AND activo = TRUE;

-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
-- Debe salir un unico grupo con es_general = 1 y cinco actividades. Si el
-- segundo grupo (es_general = 0) aparece con activas > 0, algo los reactivó
-- después.

SELECT es_general,
       COALESCE(codigo, '(sin codigo)') AS codigo,
       COUNT(*) AS filas,
       SUM(activo = TRUE) AS activas
  FROM tipos_actividad
 GROUP BY es_general, codigo
 ORDER BY es_general DESC, codigo;
