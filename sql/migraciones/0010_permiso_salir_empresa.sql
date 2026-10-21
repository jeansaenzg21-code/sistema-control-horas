-- Permite al administrador decidir si los usuarios pueden salir de la empresa
-- desde el menu de usuario. El valor por defecto conserva el comportamiento
-- anterior: la salida esta habilitada.
--
-- La migracion es idempotente: si la columna ya existe, no hace nada.

SET @tiene_columna := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'empresa'
    AND COLUMN_NAME = 'permite_salir_empresa'
);

SET @agregar_columna := IF(
  @tiene_columna = 0,
  'ALTER TABLE empresa ADD COLUMN permite_salir_empresa TINYINT(1) NOT NULL DEFAULT 1 AFTER logo',
  'SELECT ''La columna permite_salir_empresa ya existe en empresa.'''
);
PREPARE stmt_columna FROM @agregar_columna;
EXECUTE stmt_columna;
DEALLOCATE PREPARE stmt_columna;
