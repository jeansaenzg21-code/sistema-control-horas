-- Migracion idempotente para la base de datos paredescano.
-- Se puede ejecutar varias veces sin perder datos ni fallar si ya fue aplicada.
CREATE TABLE IF NOT EXISTS clientes (
  id                  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre              VARCHAR(255) NOT NULL,
  ruc                 VARCHAR(20) NULL,
  correo              VARCHAR(255) NULL,
  telefono            VARCHAR(50) NULL,
  direccion           VARCHAR(255) NULL,
  area_id             INT UNSIGNED NOT NULL,
  horas_contratadas   DECIMAL(10,2) NOT NULL DEFAULT 0,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_clientes_area FOREIGN KEY (area_id) REFERENCES areas(id),
  INDEX idx_clientes_area_activo (area_id, activo),
  INDEX idx_clientes_nombre (nombre)
);

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades' AND COLUMN_NAME = 'cliente_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE actividades ADD COLUMN cliente_id INT UNSIGNED NULL AFTER usuario_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades'
    AND COLUMN_NAME = 'cliente_id' AND REFERENCED_TABLE_NAME = 'clientes'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE actividades ADD CONSTRAINT fk_actividades_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
