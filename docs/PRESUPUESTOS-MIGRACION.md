# Presupuestos de cliente — estado de la migración

## Dónde se aplicó

**MySQL local de la máquina de desarrollo, `localhost:3306`, MySQL 8.0.46
(host `LP-CND03860KQ`), base `paredescano`.**

NO se aplicó en ningún servidor de producción. La conexión se tomó de
`.env.local`, que apunta a `localhost`. La base `paredescano` de este equipo es la
que se está usando para pruebas; producción entra el lunes 28 de septiembre y, en
su momento, se aplica sobre el servidor real con autorización expresa.

## Copia de seguridad previa

`C:\Users\tsoporte\Respaldos\ParedesCano\paredescano-antes-presupuestos-20260927.sql`

Verificada por restauración en una base desechable antes de tocar nada:

| Concepto | Original | Restaurada |
| --- | --- | --- |
| Tablas | 16 | 16 |
| Índices | 80 | 80 |
| Columnas | 146 | 146 |
| Usuarios | 61 | 61 |
| Actividades | 15 | 15 |
| Clientes | 2 | 2 |
| Proyectos | 0 | 0 |

**0 diferencias.** La base temporal de verificación se eliminó después.

## Qué cambió en el esquema

Seis tablas nuevas, **todas vacías** (0 filas), InnoDB:

| Tabla | Filas | Clave foráneas |
| --- | --- | --- |
| `presupuestos` | 0 | 4 (`empresa`, `cliente`, `creado_por`, `revisado_por`) |
| `presupuesto_servicios` | 0 | 2 (`presupuesto`, `proyecto`) |
| `presupuesto_asignaciones` | 0 | 2 (`servicio`, `usuario`) |
| `presupuesto_planificacion` | 0 | 2 (`presupuesto`, `proyecto`) |
| `presupuesto_cambios` | 0 | 3 (`presupuesto`, `servicio`, `usuario`) |
| `presupuesto_desviaciones` | 0 | 5 (`servicio`, `asignacion`, `usuario`, `proyecto`, `resuelto_por`) |

Restricciones únicas que sostienen la idempotencia y el saldo:

- `presupuestos.uq_presupuestos_hash` (`empresa_id`, `cliente_id`, `archivo_hash`)
  → reimportar el mismo archivo actualiza la versión, no la duplica.
- `presupuestos.uq_presupuestos_version` (`empresa_id`, `cliente_id`, `version`)
- `presupuesto_desviaciones.uq_pd_desviacion_asignacion` (`asignacion_id`)
  → una sola desviación viva por asignación.

Y **una columna nueva** en `actividades`:

- `actividades.presupuesto_servicio_id` `INT UNSIGNED NULL`, con índice
  `idx_actividades_servicio` y FK `ON DELETE SET NULL`.

Es nullable a propósito: las 15 actividades existentes siguen siendo válidas y
ninguna queda huérfana ni cambia de comportamiento.

## Idempotencia comprobada

La migración se ejecutó **dos veces**. La segunda detectó la columna, el índice y
la FK ya presentes y no cambió nada. Después de la segunda ejecución los datos
seguían igual: 61 usuarios, 15 actividades, 2 clientes, 4 sesiones, 0
actividades con presupuesto asignado.

## Lo que NO se ha hecho

- **No se ha aplicado nada en el servidor de producción.** Ni esta migración ni
  ninguna otra. Requiere autorización expresa.
- No se ha creado todavía ningún registro de presupuesto. Las seis tablas están
  vacías.
- No se ha modificado ninguna tabla con datos: `actividades` solo gana una
  columna opcional.

## Reproducir la comprobación

```sql
SELECT TABLE_NAME, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'paredescano' AND TABLE_NAME LIKE 'presupuesto%';

SELECT COUNT(*) AS actividades_huerfanas
FROM actividades WHERE presupuesto_servicio_id IS NULL;
```
