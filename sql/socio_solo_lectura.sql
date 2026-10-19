-- SOCIO: perfil de solo lectura ("fantasma").
--
-- Qué es: un usuario que ve TODO lo de la empresa, igual que el administrador,
-- pero no puede modificar nada. Sin temporizador, sin aprobaciones, sin
-- clientes, sin presupuestos y sin configuración.
--
-- Por qué hace falta: antes no existía un rol "ver y nada más". El
-- administrador puede ver todo pero también lo cambia; el jefe de área solo ve
-- su área. Para una gerencia que necesita revisar sin tocar, ninguna de las dos
-- opciones servía.
--
-- Idempotente: se puede ejecutar más de una vez sin romper nada.

-- ---------------------------------------------------------------------------
-- 1. El rol en el ENUM
-- ---------------------------------------------------------------------------
-- `usuarios.rol` es un ENUM, no un VARCHAR: añadir un valor exige tocar la
-- definición de la columna. MODIFY no pierde datos ni el índice `idx_usuarios_rol`
-- (que existe en la tabla), pero sí reconstruye la tabla, así que en producción
-- conviene hacerlo en mantenimiento.

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'usuarios'
     AND COLUMN_NAME = 'rol'
     AND COLUMN_TYPE LIKE '%SOCIO%'
);

SET @sql := IF(
  @existe > 0,
  'SELECT ''usuarios.rol ya incluye SOCIO'' AS mensaje',
  'ALTER TABLE usuarios
     MODIFY COLUMN rol ENUM(''PERSONAL'',''SUPERVISOR'',''ADMINISTRACION'',''JEFE_AREA'',''SOCIO'')
       COLLATE utf8mb4_unicode_ci DEFAULT NULL'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2. Verificación
-- ---------------------------------------------------------------------------
-- Debe salir una fila con la definición nueva y el conteo de socios (0 al
-- principio). Si `usuarios.rol` sigue sin SOCIO, la aplicación bloqueará el
-- acceso en vez de dejar entrar a medio mundo: preferible un fallo visible.

SELECT COLUMN_TYPE AS definicion_rol
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'usuarios'
   AND COLUMN_NAME = 'rol';

SELECT rol, COUNT(*) AS usuarios
  FROM usuarios
 GROUP BY rol
 ORDER BY rol;

-- ---------------------------------------------------------------------------
-- 3. Notas para la aplicación
-- ---------------------------------------------------------------------------
-- - El bloqueo real NO está aquí: está en la API (lib/auth.ts). Ocultar botones
--   no impide nada, porque un POST se puede hacer a mano desde el navegador.
-- - `area_id` es NOT NULL en `usuarios`, así que un socio tiene que estar en un
--   área. No le da acceso a esa área: el socio ve todo, pero sigue necesitando un
--   área para que las consultas que filtren por área no devuelvan NULL.
-- - `supervisor_id` se deja NULL. El socio no supervisa a nadie: ponerlo en la
--   cadena de supervisión haría que sus subordinados tuvieran que pasar por él
--   para aprobar sus horas.
