-- Presupuestos de cliente, bolsas de horas y control de desviaciones.
--
-- El presupuesto PERTENECE AL CLIENTE que contrata el servicio, no al proyecto.
-- Un proyecto se vincula después a la versión aprobada. Así, si el cliente renueva
-- o amplía, queda registrado qué versión contrató cada proyecto.
--
-- DECISIÓN DE MODELO (validada con "Presupuesto Colegio Santa Rosa"):
-- la hoja de cotización trae SIETE bloques, pero solo cinco son trabajo real. Los
-- dos últimos ("Servicios Múltiples") son CONSOLIDADOS que suman los bloques
-- detallados: 252 h = bloques 1+3+4+5, y 20 h = bloque 2 + 2 h de seguimiento.
-- Por eso `genera_bolsa` existe: los consolidados se conservan como referencia
-- (el Líder puede verlos y compararlos) pero NO crean bolsas. Sin esa bandera,
-- importar el archivo daría 542 h en vez de 270 h.
--
-- Migración aditiva e idempotente. No modifica ni elimina datos. `actividades`
-- solo gana una columna opcional; las horas ya registradas siguen intactas y
-- ninguna actividad existente queda huérfana.
--
-- IMPACTO ESPERADO EN PRODUCCIÓN: nulo durante la operación. Son seis tablas
-- nuevas (vacías) y una columna nueva en `actividades`. No se bloquea ninguna
-- tabla con datos, no se tocan `actividades` ni `proyectos`, y `clientes` no se
-- modifica. Se puede ejecutar con usuarios usando la aplicación.

-- ---------------------------------------------------------------------------
-- presupuestos: el documento, versionado por cliente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuestos (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int unsigned NOT NULL,
  `cliente_id` int unsigned NOT NULL,
  -- Se incrementan a mano al aprobar una versión nueva. Dos archivos distintos
  -- del mismo cliente son dos versiones, no dos presupuestos.
  `version` int unsigned NOT NULL DEFAULT 1,
  `estado` enum('BORRADOR','EN_REVISION','APROBADO','OBSERVADO') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BORRADOR',
  `archivo_nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- SHA-256 del archivo. Es lo que hace idempotente la importación: reimportar
  -- el mismo documento actualiza la versión existente en vez de duplicarla.
  `archivo_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- El documento original, para auditoría. Se lee solo al importar, nunca al
  -- abrir un proyecto: no se vuelve a parsear el Excel en cada consulta.
  `archivo_bytes` mediumblob,
  -- Resultado del análisis, ya estructurado: totales por bloque, procedencia de
  -- cada cifra y discrepancias detectadas.
  `analisis` json,
  `creado_por` int unsigned NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revisado_por` int unsigned DEFAULT NULL,
  `revisado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_presupuestos_version` (`empresa_id`,`cliente_id`,`version`),
  UNIQUE KEY `uq_presupuestos_hash` (`empresa_id`,`cliente_id`,`archivo_hash`),
  KEY `idx_presupuestos_cliente_estado` (`cliente_id`,`estado`),
  CONSTRAINT `fk_presupuestos_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_presupuestos_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_presupuestos_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_presupuestos_revisado_por` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- presupuesto_servicios: una fila por servicio. Las DETALLADAS son las bolsas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuesto_servicios (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `presupuesto_id` int unsigned NOT NULL,
  -- Se llena al aprobar. Un presupuesto aprobado puede tener varios proyectos, y un
  -- proyecto nuevo creado desde el presupuesto queda vinculado desde el inicio.
  `proyecto_id` int unsigned DEFAULT NULL,
  -- DETALLADO     -> bolsa real, cuenta para el saldo.
  -- CONSOLIDADO   -> referencia; se guarda pero NO genera bolsa.
  -- COMPLEMENTARIO -> horas que el consolidado tiene y el detalle no (las 2 h
  --   de acompañamiento del Comité). Genera bolsa solo cuando el Líder confirma.
  `origen` enum('DETALLADO','CONSOLIDADO','COMPLEMENTARIO') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DETALLADO',
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `horas` decimal(10,2) NOT NULL DEFAULT '0.00',
  `moneda` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `importe` decimal(14,2) DEFAULT NULL,
  -- El "Fee" del Excel no son horas: es un cargo fijo. Se guarda aparte para no
  -- sumarlo a la bolsa por error.
  `fee` decimal(14,2) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  -- Trazabilidad: fila del Excel de la que salió este servicio.
  `fila_origen` int unsigned DEFAULT NULL,
  `nota` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ps_servicios_presupuesto` (`presupuesto_id`,`origen`),
  KEY `idx_ps_servicios_proyecto` (`proyecto_id`),
  KEY `idx_ps_servicios_horas` (`proyecto_id`,`horas`),
  CONSTRAINT `fk_ps_servicios_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuestos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ps_servicios_proyecto` FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- presupuesto_asignaciones: horas por persona dentro de un servicio
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuesto_asignaciones (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `servicio_id` int unsigned NOT NULL,
  -- NULL mientras no se haya confirmado una persona real. El Excel trae
  -- categorías sin nombre ("Trainee", "Junior") y una fila con horas pero sin
  -- persona; esas horas se conservan SIN dueño en vez de adjudicarlas a alguien.
  `usuario_id` int unsigned DEFAULT NULL,
  `nombre_texto` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `categoria` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `horas` decimal(10,2) NOT NULL DEFAULT '0.00',
  `estado` enum('CONFIRMADA','PENDIENTE_REVISION','RECHAZADA') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDIENTE_REVISION',
  -- Por qué requiere confirmación. Es lo que se muestra al Líder.
  `motivo` text COLLATE utf8mb4_unicode_ci,
  `fila_origen` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pa_asig_servicio` (`servicio_id`,`estado`),
  KEY `idx_pa_asig_usuario` (`usuario_id`),
  CONSTRAINT `fk_pa_asig_servicio` FOREIGN KEY (`servicio_id`) REFERENCES `presupuesto_servicios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pa_asig_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- presupuesto_planificacion: la planificación relativa del Excel (Hoja2)
-- ---------------------------------------------------------------------------
-- Se guarda en semanas RELATIVAS (S1..S20), nunca en fechas de calendario. El
-- Excel no trae fechas de inicio reales, y convertirlas sería inventarlas. El
-- Líder fija la fecha de inicio y recién ahí se traduce a fechas.
CREATE TABLE IF NOT EXISTS presupuesto_planificacion (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `presupuesto_id` int unsigned NOT NULL,
  `proyecto_id` int unsigned DEFAULT NULL,
  `etapa` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subetapa` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `semana_inicio` smallint unsigned DEFAULT NULL,
  `semana_fin` smallint unsigned DEFAULT NULL,
  `mes` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `horas` decimal(10,2) NOT NULL DEFAULT '0.00',
  `fila_origen` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pp_plan_presupuesto` (`presupuesto_id`),
  KEY `idx_pp_plan_proyecto` (`proyecto_id`,`semana_inicio`),
  CONSTRAINT `fk_pp_plan_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuestos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pp_plan_proyecto` FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- presupuesto_cambios: historial con responsable, fecha y justificación
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuesto_cambios (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `presupuesto_id` int unsigned NOT NULL,
  `servicio_id` int unsigned DEFAULT NULL,
  `tipo` enum('IMPORTACION','APROBACION','VINCULO_PROYECTO','REDISTRIBUCION','AMPLIACION','OBSERVACION','DESVIACION') COLLATE utf8mb4_unicode_ci NOT NULL,
  -- Antes y después, para que el historial sea auditable y no solo un LOG.
  `detalle` json,
  -- Obligatoria: una redistribución sin motivo escrito no se puede registrar.
  `justificacion` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuario_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pc_cambios_presupuesto` (`presupuesto_id`,`created_at`),
  KEY `idx_pc_cambios_servicio` (`servicio_id`),
  CONSTRAINT `fk_pc_cambios_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuestos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pc_cambios_servicio` FOREIGN KEY (`servicio_id`) REFERENCES `presupuesto_servicios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pc_cambios_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- presupuesto_desviaciones: una viva por asignación
-- ---------------------------------------------------------------------------
-- `horas_registradas` y `horas_aprobadas` son columnas SEPARADAS a propósito: no
-- son lo mismo. Una actividad EN_CURSO o PENDIENTE_APROBACION está registrada
-- pero todavía puede ser rechazada, así que no cuenta como saldo consumido. Si se
-- sumaran ambas, la misma hora se descontaría dos veces al pasar a APROBADA.
CREATE TABLE IF NOT EXISTS presupuesto_desviaciones (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `servicio_id` int unsigned NOT NULL,
  `asignacion_id` int unsigned DEFAULT NULL,
  `usuario_id` int unsigned DEFAULT NULL,
  `proyecto_id` int unsigned DEFAULT NULL,
  `horas_asignadas` decimal(10,2) NOT NULL DEFAULT '0.00',
  `horas_registradas` decimal(10,2) NOT NULL DEFAULT '0.00',
  `horas_aprobadas` decimal(10,2) NOT NULL DEFAULT '0.00',
  `estado` enum('PENDIENTE','JUSTIFICADA','APROBADA','RECHAZADA') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDIENTE',
  `justificacion` text COLLATE utf8mb4_unicode_ci,
  `resuelto_por` int unsigned DEFAULT NULL,
  `resuelto_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Una sola desviación viva por asignación: se actualiza, no se apila.
  UNIQUE KEY `uq_pd_desviacion_asignacion` (`asignacion_id`),
  KEY `idx_pd_desviaciones_servicio` (`servicio_id`),
  KEY `idx_pd_desviaciones_proyecto` (`proyecto_id`,`estado`),
  KEY `idx_pd_desviaciones_usuario` (`usuario_id`,`estado`),
  CONSTRAINT `fk_pd_desv_servicio` FOREIGN KEY (`servicio_id`) REFERENCES `presupuesto_servicios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pd_desv_asignacion` FOREIGN KEY (`asignacion_id`) REFERENCES `presupuesto_asignaciones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pd_desv_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pd_desv_proyecto` FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pd_desv_resuelto_por` FOREIGN KEY (`resuelto_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- actividades: vínculo con la bolsa. Aditivo y opcional.
-- ---------------------------------------------------------------------------
-- NULL significa "no budgeting": la actividad sigue siendo válida y cuenta igual
-- que antes. Solo se rellena cuando el usuario elige a qué servicio imputa sus
-- horas, y siempre después de la transacción de inicio, para no tocar la lógica
-- de integridad ni el camino de escritura offline.
SET @col_bolsa := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='actividades' AND COLUMN_NAME='presupuesto_servicio_id');
SET @alter_bolsa := IF(@col_bolsa = 0,
  'ALTER TABLE actividades ADD COLUMN IF NOT EXISTS presupuesto_servicio_id INT UNSIGNED NULL DEFAULT NULL AFTER proyecto_id',
  'SELECT ''actividades ya tiene presupuesto_servicio_id''');
PREPARE stmt_bolsa FROM @alter_bolsa;
EXECUTE stmt_bolsa;
DEALLOCATE PREPARE stmt_bolsa;

SET @idx_bolsa := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='actividades' AND INDEX_NAME='idx_actividades_servicio');
SET @crear_idx_bolsa := IF(@idx_bolsa = 0,
  'ALTER TABLE actividades ADD INDEX idx_actividades_servicio (presupuesto_servicio_id, inicio)',
  'SELECT ''El índice de servicio ya existe.''');
PREPARE stmt_idx_bolsa FROM @crear_idx_bolsa;
EXECUTE stmt_idx_bolsa;
DEALLOCATE PREPARE stmt_idx_bolsa;

-- La clave foránea se añade aparte: si algo falla antes, la columna y el índice
-- quedan listos y este paso se puede reintentar sin repetir el ALTER.
SET @fk_bolsa := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='actividades' AND CONSTRAINT_NAME='fk_actividades_servicio');
SET @alter_fk := IF(@fk_bolsa = 0,
  'ALTER TABLE actividades ADD CONSTRAINT fk_actividades_servicio FOREIGN KEY (presupuesto_servicio_id) REFERENCES presupuesto_servicios (id) ON DELETE SET NULL',
  'SELECT ''La FK de servicio ya existe.''');
PREPARE stmt_fk FROM @alter_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

-- ---------------------------------------------------------------------------
-- planificación: vínculo con la bolsa.
-- ---------------------------------------------------------------------------
-- El Excel de Hoja2 trae las sub-etapas por nombre de tarea, no por servicio. Sin
-- esta columna habría que adivinar la relación comparando textos, y una
-- coincidencia inventada movería horas de un servicio a otro. NULL = sub-etapa
-- aún no vinculada; el Gantt la muestra como tal hasta que se relacione.
SET @col_plan_servicio := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='presupuesto_planificacion'
    AND COLUMN_NAME='presupuesto_servicio_id');
SET @alter_plan_servicio := IF(@col_plan_servicio = 0,
  'ALTER TABLE presupuesto_planificacion ADD COLUMN IF NOT EXISTS presupuesto_servicio_id INT UNSIGNED NULL DEFAULT NULL AFTER presupuesto_id',
  'SELECT ''presupuesto_planificacion ya tiene presupuesto_servicio_id''');
PREPARE stmt_plan_servicio FROM @alter_plan_servicio;
EXECUTE stmt_plan_servicio;
DEALLOCATE PREPARE stmt_plan_servicio;

SET @fk_plan_servicio := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='presupuesto_planificacion'
    AND CONSTRAINT_NAME='fk_pp_plan_servicio');
SET @alter_fk_plan := IF(@fk_plan_servicio = 0,
  'ALTER TABLE presupuesto_planificacion ADD CONSTRAINT fk_pp_plan_servicio FOREIGN KEY (presupuesto_servicio_id) REFERENCES presupuesto_servicios (id) ON DELETE SET NULL',
  'SELECT ''La FK de planificación ya existe.''');
PREPARE stmt_fk_plan FROM @alter_fk_plan;
EXECUTE stmt_fk_plan;
DEALLOCATE PREPARE stmt_fk_plan;

SET @idx_plan_servicio := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='presupuesto_planificacion'
    AND INDEX_NAME='idx_pp_plan_servicio');
SET @crear_idx_plan := IF(@idx_plan_servicio = 0,
  'ALTER TABLE presupuesto_planificacion ADD INDEX idx_pp_plan_servicio (presupuesto_servicio_id)',
  'SELECT ''El índice de planificación ya existe.''');
PREPARE stmt_idx_plan FROM @crear_idx_plan;
EXECUTE stmt_idx_plan;
DEALLOCATE PREPARE stmt_idx_plan;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'presupuesto%'
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (   (TABLE_NAME = 'actividades' AND COLUMN_NAME = 'presupuesto_servicio_id')
       OR (TABLE_NAME = 'presupuesto_planificacion' AND COLUMN_NAME = 'presupuesto_servicio_id') )
ORDER BY TABLE_NAME;
