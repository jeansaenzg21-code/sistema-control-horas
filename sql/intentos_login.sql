-- Control de intentos fallidos de inicio de sesion.
--
-- El login se bloquea durante 15 minutos tras 5 intentos fallidos, tanto por
-- usuario como por IP. El bloqueo se guarda en base de datos y no en memoria
-- para que funcione igual con varias instancias del proceso y sobreviva a un
-- reinicio.
--
-- Se guarda tambien el nombre de usuario tal como se escribio (en minusculas),
-- para poder depurar un bloqueo sin revelar en la respuesta si el usuario
-- existe o no.
--
-- Migracion aditiva e idempotente: CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS `intentos_login` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  `intentos` int unsigned NOT NULL DEFAULT 0,
  `primer_intento_en` datetime NOT NULL,
  `ultimo_intento_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_intentos_login_usuario` (`usuario`),
  UNIQUE KEY `uq_intentos_login_ip` (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
