-- Sesiones persistentes: token de acceso corto + token de renovación.
--
-- Antes cada dispositivo tenía un único token, que duraba 72 horas y servía
-- tanto para entrar como para renovar. Eso obligaba a volver a escribir usuario
-- y contraseña cada tres días, y no había forma de renovar sin credenciales.
--
-- Con esta migración cada dispositivo tiene DOS credenciales:
--   · token de acceso   -> el que viaja en cada petición, dura 12 horas.
--   · token de renovación -> el que permite pedir un acceso nuevo sin volver a
--     autenticarse. Dura 30 días, se guarda en cookie HttpOnly (web) o en
--     SecureStore (móvil) y NUNCA viaja en una petición de datos.
--
-- El token de renovación se rota en cada uso. Se conserva el anterior durante
-- unos minutos (`refresh_anterior`) para que dos pestañas o dos componentes que
-- renueven a la vez no se invaliden mutuamente: la primera gana y la segunda
-- puede seguir usando el token viejo durante la gracia.
--
-- Migración aditiva e idempotente. No modifica ni elimina datos. Las sesiones
-- que ya existen siguen funcionando con su `expira_en` de 72 horas: si esa
-- fecha pasa y la fila no tiene token de renovación, el usuario tendrá que
-- entrar una vez más. A partir de ahí ya no vuelve a pasar.
--
-- IMPACTO ESPERADO EN PRODUCCIÓN: nulo durante la operación. La tabla `sesiones`
-- pasa de 4 a 10 columnas y gana tres índices; con el volumen actual (decenas de
-- filas) el tiempo de la operación es de milisegundos. No se bloquea `usuarios`,
-- no se tocan `actividades` ni ningún registro de horas. La única consecuencia
-- visible es la mentioned: quien tenga una sesión creada antes de la migración
-- necesitará entrar una vez al día 31.

-- Primero se comprueba qué falta y después se construye una sola sentencia.
SET @col_refresh       = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='refresh_token');
SET @col_refresh_exp   = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='refresh_expira_en');
SET @col_refresh_ant   = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='refresh_anterior');
SET @col_refresh_ant_e = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='refresh_anterior_expira_en');
SET @col_dispositivo   = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='dispositivo');
SET @col_ultimo_uso    = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='ultimo_uso');

-- El orden importa: los contadores ya están calculados, ahora se arma el ALTER.
-- CONCAT_WS omite los NULL, así que solo se unen con coma las columnas que
-- realmente faltan. Un ALTER con varias ADD COLUMN IF NOT EXISTS necesita comas entre ellas.
SET @agregar := (SELECT TRIM(CONCAT_WS(', ',
  IF(@col_refresh       = 0, 'ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(64) NULL DEFAULT NULL AFTER token', NULL),
  IF(@col_refresh_exp   = 0, 'ADD COLUMN IF NOT EXISTS refresh_expira_en DATETIME NULL DEFAULT NULL', NULL),
  IF(@col_refresh_ant   = 0, 'ADD COLUMN IF NOT EXISTS refresh_anterior VARCHAR(64) NULL DEFAULT NULL', NULL),
  IF(@col_refresh_ant_e = 0, 'ADD COLUMN IF NOT EXISTS refresh_anterior_expira_en DATETIME NULL DEFAULT NULL', NULL),
  IF(@col_dispositivo   = 0, 'ADD COLUMN IF NOT EXISTS dispositivo VARCHAR(120) NULL DEFAULT NULL', NULL),
  IF(@col_ultimo_uso    = 0, 'ADD COLUMN IF NOT EXISTS ultimo_uso DATETIME NULL DEFAULT NULL', NULL)
)));

SET @ejecutar := IF(@agregar = '',
  'SELECT ''sesiones ya tiene las columnas de renovacion''',
  CONCAT('ALTER TABLE sesiones ', @agregar));
PREPARE stmt_agregar FROM @ejecutar;
EXECUTE stmt_agregar;
DEALLOCATE PREPARE stmt_agregar;

-- Índices. El de refresh_token debe ser único: es la credencial que permite
-- renovar sin contraseña, así que dos sesiones no pueden compartirlo.
SET @tiene_idx_refresh := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='refresh_token');
SET @crear_idx_refresh := IF(@tiene_idx_refresh = 0,
  'ALTER TABLE sesiones ADD UNIQUE INDEX idx_sesiones_refresh (refresh_token)',
  'SELECT ''El índice de refresh_token ya existe.''');
PREPARE stmt_idx_refresh FROM @crear_idx_refresh;
EXECUTE stmt_idx_refresh;
DEALLOCATE PREPARE stmt_idx_refresh;

SET @tiene_idx_ant := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='refresh_anterior');
SET @crear_idx_ant := IF(@tiene_idx_ant = 0,
  'ALTER TABLE sesiones ADD INDEX idx_sesiones_refresh_anterior (refresh_anterior)',
  'SELECT ''El índice de refresh_anterior ya existe.''');
PREPARE stmt_idx_ant FROM @crear_idx_ant;
EXECUTE stmt_idx_ant;
DEALLOCATE PREPARE stmt_idx_ant;

-- `expira_en` no tenía índice y `cleanExpiredSessions()` hace
-- DELETE FROM sesiones WHERE expira_en < NOW(), es decir un recorrido completo.
SET @tiene_idx_exp := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sesiones' AND COLUMN_NAME='expira_en');
SET @crear_idx_exp := IF(@tiene_idx_exp = 0,
  'ALTER TABLE sesiones ADD INDEX idx_sesiones_expira (expira_en)',
  'SELECT ''El índice de expira_en ya existe.''');
PREPARE stmt_idx_exp FROM @crear_idx_exp;
EXECUTE stmt_idx_exp;
DEALLOCATE PREPARE stmt_idx_exp;

-- Verificación
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesiones'
  AND COLUMN_NAME IN ('token','refresh_token','refresh_expira_en','refresh_anterior',
                      'refresh_anterior_expira_en','dispositivo','ultimo_uso')
ORDER BY ORDINAL_POSITION;

SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesiones'
  AND INDEX_NAME IN ('token','idx_sesiones_refresh','idx_sesiones_refresh_anterior','idx_sesiones_expira')
ORDER BY INDEX_NAME;
