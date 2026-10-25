-- Índices para filtrar y ordenar rápidamente la bandeja personal.
-- El bloque consulta el catálogo para poder ejecutarse más de una vez.
SET @indice_bandeja = (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'observaciones'
     AND index_name = 'idx_observaciones_bandeja_personal'
);
SET @sql_bandeja = IF(
  @indice_bandeja = 0,
  'ALTER TABLE observaciones ADD INDEX idx_observaciones_bandeja_personal (empresa_id, usuario_destino_id, visibilidad, modulo, created_at, id)',
  'SELECT 1'
);
PREPARE stmt_bandeja FROM @sql_bandeja;
EXECUTE stmt_bandeja;
DEALLOCATE PREPARE stmt_bandeja;

SET @indice_respuestas = (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'observaciones'
     AND index_name = 'idx_observaciones_respuestas'
);
SET @sql_respuestas = IF(
  @indice_respuestas = 0,
  'ALTER TABLE observaciones ADD INDEX idx_observaciones_respuestas (parent_id, empresa_id, tipo, visibilidad)',
  'SELECT 1'
);
PREPARE stmt_respuestas FROM @sql_respuestas;
EXECUTE stmt_respuestas;
DEALLOCATE PREPARE stmt_respuestas;
