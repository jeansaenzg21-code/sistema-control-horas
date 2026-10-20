-- CODIGO DE ACTIVIDAD en tipos_actividad.
--
-- Que es: el codigo que la consultoria usa en sus papeles para nombrar una
-- actividad (AC-1, AD-01, PT-32...). El archivo "TIME CONTROL - ACTIVIDADES"
-- lo trae en una columna aparte y la tabla no lo guardaba.
--
-- Por que hace falta: el nombre libre no identifica nada. "Control de calidad"
-- aparece en Activos Fijos y en Consultoria, y "Otras Actividades Inherentes"
-- en siete areas. El codigo si, y es lo que permite Cruzar la contabilidad y
-- los informes con las horas que se imputan.
--
-- Sobre los datos que ya hay: los codigos del archivo NO son una numeracion
-- limpia. Cada seccion tiene dos series superpuestas (AC-1..AC-32 y
-- AC-01..AC-06) y faltan algunos numeros. Por eso la columna es texto, no un
-- entero, y no lleva indice unico: el codigo es una etiqueta para leer y
-- ordenar, no una clave primaria. La clave primaria sigue siendo `id`.
--
-- Idempotente: se puede ejecutar mas de una vez sin romper nada.

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tipos_actividad'
     AND COLUMN_NAME = 'codigo'
);

SET @sql := IF(
  @existe > 0,
  'SELECT ''tipos_actividad.codigo ya existe'' AS mensaje',
  'ALTER TABLE tipos_actividad
     ADD COLUMN IF NOT EXISTS codigo varchar(32) COLLATE utf8mb4_unicode_ci NULL
     AFTER es_general'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Las cinco actividades generales no tienen codigo: son el comun denominator
-- de todas las areas y no tienen uno propio en el archivo.

UPDATE tipos_actividad SET codigo = NULL WHERE es_general = TRUE AND codigo IS NOT NULL;

-- Nota para la aplicacion:
-- - La API lee la columna con lib/esquema.ts (columnaExiste). Si no se ha
--   ejecutado este archivo, el catalogo sigue funcionando: solo deja de
--   devolver `codigo` y el importador avisa en vez de fallar.
-- - La app movil mantiene su propia cache_tipos (tests/integridad.test.js la
--   compara). Cuando se actualice ahi, el campo `codigo` necesita la misma
--   adicion.

SELECT COLUMN_NAME AS columna, COLUMN_TYPE AS tipo, IS_NULLABLE AS nullable
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'tipos_actividad'
   AND COLUMN_NAME = 'codigo';

SELECT es_general, COALESCE(codigo, '(sin codigo)') AS codigo, COUNT(*) AS actividades
  FROM tipos_actividad
 GROUP BY es_general, codigo
 ORDER BY es_general DESC, codigo
 LIMIT 20;
