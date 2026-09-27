-- Soporte de la app móvil (Paredes Cano Control de Tiempos).
--
-- La app registra actividades sin conexión y las envía después. Con esta
-- migración el servidor puede:
--   1. Guardar la hora real de inicio y fin enviada por el dispositivo, en
--      lugar de la hora de sincronización.
--   2. Reconocer un reintento y devolver la misma actividad en vez de crear
--      una segunda fila.
--
-- Es una migración aditiva e idempotente: solo agrega una columna y un índice
-- único. No modifica, mueve ni elimina datos existentes. MySQL permite varios
-- valores NULL en un índice único, por lo que las actividades creadas desde el
-- sistema web siguen funcionando sin cambios.

SET @tiene_columna := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'actividades'
    AND COLUMN_NAME = 'id_operacion'
);

SET @agregar_columna := IF(
  @tiene_columna = 0,
  'ALTER TABLE actividades ADD COLUMN id_operacion VARCHAR(64) NULL DEFAULT NULL AFTER id',
  'SELECT ''La columna id_operacion ya existe en actividades.'''
);
PREPARE stmt_columna FROM @agregar_columna;
EXECUTE stmt_columna;
DEALLOCATE PREPARE stmt_columna;

SET @tiene_indice := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'actividades'
    AND COLUMN_NAME = 'id_operacion'
);

SET @crear_indice := IF(
  @tiene_indice = 0,
  'ALTER TABLE actividades ADD UNIQUE INDEX idx_actividades_id_operacion (id_operacion)',
  'SELECT ''El índice de id_operacion ya existe en actividades.'''
);
PREPARE stmt_indice FROM @crear_indice;
EXECUTE stmt_indice;
DEALLOCATE PREPARE stmt_indice;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'actividades'
  AND COLUMN_NAME = 'id_operacion';
