-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: paredescano
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `actividades`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `actividades` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `id_operacion` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuario_id` int unsigned NOT NULL,
  `cliente_id` int unsigned DEFAULT NULL,
  `tipo_actividad_id` int unsigned NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `facturable` tinyint(1) DEFAULT NULL,
  `inicio` datetime NOT NULL,
  `fin` datetime DEFAULT NULL,
  `estado` enum('EN_CURSO','PAUSADA','PENDIENTE_APROBACION','APROBADA','RECHAZADA','CORRECCION_SOLICITADA') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EN_CURSO',
  `revisado_por` int unsigned DEFAULT NULL,
  `revisado_en` datetime DEFAULT NULL,
  `observacion_revision` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `proyecto_id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_actividades_id_operacion` (`id_operacion`),
  KEY `fk_actividades_revisado_por` (`revisado_por`),
  KEY `idx_actividades_usuario` (`usuario_id`),
  KEY `idx_actividades_tipo` (`tipo_actividad_id`),
  KEY `idx_actividades_estado` (`estado`),
  KEY `idx_actividades_inicio` (`inicio`),
  KEY `idx_actividades_fin` (`fin`),
  KEY `idx_actividades_facturable` (`facturable`),
  KEY `idx_actividades_usuario_estado` (`usuario_id`,`estado`),
  KEY `fk_actividades_cliente` (`cliente_id`),
  KEY `idx_actividades_proyecto_inicio` (`proyecto_id`,`inicio`),
  CONSTRAINT `fk_actividades_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_actividades_proyecto` FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_actividades_revisado_por` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_actividades_tipo` FOREIGN KEY (`tipo_actividad_id`) REFERENCES `tipos_actividad` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_actividades_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `areas`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `areas` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int unsigned NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `jefe_id` int unsigned DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_area_empresa_nombre` (`empresa_id`,`nombre`),
  KEY `idx_areas_empresa` (`empresa_id`),
  KEY `idx_areas_activo` (`activo`),
  KEY `idx_areas_jefe_id` (`jefe_id`),
  CONSTRAINT `fk_areas_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_areas_jefe` FOREIGN KEY (`jefe_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clientes`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ruc` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telefono` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `direccion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `area_id` int unsigned NOT NULL,
  `horas_contratadas` decimal(10,2) NOT NULL DEFAULT '0.00',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_clientes_area_activo` (`area_id`,`activo`),
  KEY `idx_clientes_nombre` (`nombre`),
  CONSTRAINT `fk_clientes_area` FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `empresa`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `empresa` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `pais` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Perú',
  `ciudad` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `excepciones`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `excepciones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `tipo` enum('FERIADO','VACACIONES') COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuario_id` int unsigned DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `usuario_clave` int unsigned GENERATED ALWAYS AS (coalesce(`usuario_id`,0)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_excepciones_clave` (`fecha`,`tipo`,`usuario_clave`),
  KEY `idx_excepciones_usuario` (`usuario_id`),
  CONSTRAINT `fk_excepciones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `horarios`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `horarios` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `dia_semana` tinyint unsigned NOT NULL COMMENT '1=Lunes ... 7=Domingo',
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_horarios_usuario_dia` (`usuario_id`,`dia_semana`),
  KEY `idx_horarios_dia` (`dia_semana`),
  KEY `idx_horarios_usuario` (`usuario_id`),
  CONSTRAINT `fk_horarios_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notificaciones`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `notificaciones` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `empresa_id` int unsigned DEFAULT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mensaje` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `leida` tinyint(1) NOT NULL DEFAULT '0',
  `url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clave_deduplicacion` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notificaciones_deduplicacion` (`empresa_id`,`usuario_id`,`tipo`,`clave_deduplicacion`),
  KEY `idx_notificaciones_usuario` (`usuario_id`),
  KEY `idx_notificaciones_leida` (`leida`),
  KEY `idx_notificaciones_fecha` (`created_at`),
  KEY `idx_notificaciones_usuario_leida` (`usuario_id`,`leida`),
  KEY `idx_notificaciones_empresa_usuario` (`empresa_id`,`usuario_id`,`created_at`),
  CONSTRAINT `fk_notificaciones_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_notificaciones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=72 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `observaciones`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `observaciones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `modulo` enum('APROBACIONES','CUMPLIMIENTO') COLLATE utf8mb4_unicode_ci NOT NULL,
  `actividad_id` bigint unsigned DEFAULT NULL,
  `usuario_destino_id` int unsigned NOT NULL,
  `periodo_anio` smallint unsigned DEFAULT NULL,
  `periodo_mes` tinyint unsigned DEFAULT NULL,
  `autor_id` int unsigned DEFAULT NULL,
  `empresa_id` int unsigned NOT NULL,
  `visibilidad` enum('TRABAJADOR','INTERNA') COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('OBSERVACION','NOTA_INTERNA','SOLICITUD_CORRECCION','RESPUESTA','REENVIO','APROBACION','RECHAZO') COLLATE utf8mb4_unicode_ci NOT NULL,
  `contenido` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado_atencion` enum('ABIERTA','ATENDIDA','RESUELTA') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ABIERTA',
  `parent_id` int unsigned DEFAULT NULL,
  `origen_observacion_cumplimiento_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_observaciones_origen_legacy` (`origen_observacion_cumplimiento_id`),
  KEY `idx_observaciones_empresa_actividad` (`empresa_id`,`actividad_id`,`created_at`,`id`),
  KEY `idx_observaciones_destino` (`empresa_id`,`usuario_destino_id`,`visibilidad`,`created_at`,`id`),
  KEY `idx_observaciones_periodo` (`empresa_id`,`modulo`,`periodo_anio`,`periodo_mes`,`usuario_destino_id`,`created_at`),
  KEY `idx_observaciones_parent` (`parent_id`,`created_at`),
  KEY `fk_observaciones_destino` (`usuario_destino_id`),
  KEY `fk_observaciones_autor` (`autor_id`),
  KEY `fk_observaciones_actividad` (`actividad_id`),
  CONSTRAINT `fk_observaciones_actividad` FOREIGN KEY (`actividad_id`) REFERENCES `actividades` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_observaciones_autor` FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_observaciones_destino` FOREIGN KEY (`usuario_destino_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_observaciones_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_observaciones_parent` FOREIGN KEY (`parent_id`) REFERENCES `observaciones` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `observaciones_cumplimiento`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `observaciones_cumplimiento` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `anio` smallint unsigned NOT NULL,
  `mes` tinyint unsigned NOT NULL,
  `texto` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_obs_cumplimiento_usuario_periodo` (`usuario_id`,`anio`,`mes`),
  KEY `idx_obs_cumplimiento_periodo` (`anio`,`mes`),
  KEY `idx_obs_cumplimiento_usuario` (`usuario_id`),
  KEY `idx_obs_cumplimiento_updated_by` (`updated_by`),
  CONSTRAINT `fk_obs_cumplimiento_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_obs_cumplimiento_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pausas`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `pausas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actividad_id` bigint unsigned NOT NULL,
  `inicio` datetime NOT NULL,
  `fin` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pausas_actividad` (`actividad_id`),
  KEY `idx_pausas_inicio` (`inicio`),
  KEY `idx_pausas_fin` (`fin`),
  CONSTRAINT `fk_pausas_actividad` FOREIGN KEY (`actividad_id`) REFERENCES `actividades` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proyecto_areas`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `proyecto_areas` (
  `proyecto_id` int unsigned NOT NULL,
  `area_id` int unsigned NOT NULL,
  PRIMARY KEY (`proyecto_id`,`area_id`),
  KEY `fk_proyecto_areas_area` (`area_id`),
  CONSTRAINT `fk_proyecto_areas_area` FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_proyecto_areas_proyecto` FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proyecto_participantes`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `proyecto_participantes` (
  `proyecto_id` int unsigned NOT NULL,
  `usuario_id` int unsigned NOT NULL,
  `rol_proyecto` enum('LIDER','COORDINADOR','ESPECIALISTA','COLABORADOR') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'COLABORADOR',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`proyecto_id`,`usuario_id`),
  KEY `idx_proyecto_participantes_usuario` (`usuario_id`),
  CONSTRAINT `fk_proyecto_participantes_proyecto` FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_proyecto_participantes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proyectos`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `proyectos` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int unsigned NOT NULL,
  `cliente_id` int unsigned DEFAULT NULL,
  `jefe_id` int unsigned NOT NULL,
  `nombre` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `estado` enum('PLANIFICACION','EN_CURSO','PAUSADO','COMPLETADO','CANCELADO') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PLANIFICACION',
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_proyectos_empresa_estado` (`empresa_id`,`estado`,`activo`),
  KEY `idx_proyectos_jefe` (`jefe_id`),
  KEY `fk_proyectos_cliente` (`cliente_id`),
  CONSTRAINT `fk_proyectos_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_proyectos_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_proyectos_jefe` FOREIGN KEY (`jefe_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sesiones`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sesiones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `empresa_id` int unsigned DEFAULT NULL,
  `token` varchar(64) NOT NULL,
  `refresh_token` varchar(64) DEFAULT NULL,
  `expira_en` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `refresh_expira_en` datetime DEFAULT NULL,
  `refresh_anterior` varchar(64) DEFAULT NULL,
  `refresh_anterior_expira_en` datetime DEFAULT NULL,
  `dispositivo` varchar(120) DEFAULT NULL,
  `ultimo_uso` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  UNIQUE KEY `idx_sesiones_refresh` (`refresh_token`),
  KEY `usuario_id` (`usuario_id`),
  KEY `idx_sesiones_empresa_id` (`empresa_id`),
  KEY `idx_sesiones_refresh_anterior` (`refresh_anterior`),
  KEY `idx_sesiones_expira` (`expira_en`),
  CONSTRAINT `fk_sesiones_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `sesiones_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=146 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tipos_actividad`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `tipos_actividad` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `area_id` int unsigned DEFAULT NULL,
  `es_general` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_tipos_actividad_activo` (`activo`),
  KEY `idx_tipos_actividad_area` (`area_id`),
  KEY `idx_tipos_actividad_general_activo` (`es_general`,`activo`),
  CONSTRAINT `fk_tipos_actividad_area` FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuario` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `correo` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rol` enum('PERSONAL','SUPERVISOR','ADMINISTRACION','JEFE_AREA','SOCIO') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `area_id` int unsigned NOT NULL,
  `especialidad` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supervisor_id` int unsigned DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `cargo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_usuario` (`usuario`),
  UNIQUE KEY `uq_usuarios_correo` (`correo`),
  KEY `idx_usuarios_area` (`area_id`),
  KEY `idx_usuarios_rol` (`rol`),
  KEY `idx_usuarios_especialidad` (`especialidad`),
  KEY `idx_usuarios_supervisor` (`supervisor_id`),
  KEY `idx_usuarios_activo` (`activo`),
  CONSTRAINT `fk_usuarios_area` FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_usuarios_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'paredescano'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-27 16:05:00
