# Respaldos: qué tenemos y qué falta

## Lo que hay hoy

| Qué | Dónde | Cuándo | Alcance |
|---|---|---|---|
| Parcial | `C:\Users\tsoporte\Respaldos\ParedesCano\paredescano-actividades-sesiones-20260927.sql` | 27/09/2026 14:25 | **Solo 2 de 16 tablas** |

**Cubre:** `actividades` (15 filas) y `sesiones` (3 filas), con `--complete-insert`,
que genera los `INSERT` con los valores literales. Se puede restaurar sin
depender del orden de las columnas.

**NO cubre.** Y esto es lo importante: **el respaldo actual NO permite restaurar
la base.** Faltan 14 tablas, entre ellas las que contienen datos que no se
pueden regenerar:

| Tabla | Por qué no se puede regenerar |
|---|---|
| `usuarios` | 61 personas: nombre, **hash de contraseña**, rol, área, supervisor |
| `areas` | 17 áreas con su empresa y su jefe |
| `clientes` | 2 clientes |
| `tipos_actividad` | 22 tipos, con la marca de general o específico |
| `horarios` | franjas de trabajo por persona (vacía hoy, pero es configuración) |
| `proyectos`, `proyecto_participantes`, `proyecto_areas` | estructura de proyectos |
| `excepciones`, `observaciones`, `observaciones_cumplimiento` | historial de revisiones |
| `pausas` | pausas registradas |
| `notificaciones` | avisos enviados |
| `empresa` | datos de la empresa |

Si se perdiera la base ahora mismo, **no se podrían recuperar los usuarios ni sus
contraseñas**, y habría que volver a crear 61 cuentas a mano.

## Por qué se hizo así

El respaldo se tomó justo antes de las migraciones, y solo de las dos tablas que
esas migraciones tocaban. Fue una medida de seguridad para poder deshacer
`id_operacion` y las columnas de sesión, no un respaldo del sistema. **Seidx
 should've dicho antes que no es un respaldo completo.**

## Procedimiento para obtener un respaldo completo y seguro

Hacerlo **antes de desplegar**. Los `.sql` con datos personales no se suben al
repositorio: van fuera, como el actual.

### 1. Completo, con estructura y datos

```bash
# En el servidor. --single-transaction da un punto de coherencia sin bloquear.
mysqldump -u root -p \
  --single-transaction \
  --routines --triggers --events \
  --default-character-set=utf8mb4 \
  --hex-blob \
  --set-gtid-purged=OFF \
  paredescano > /var/backups/paredescano-completo-$(date +%Y%m%d-%H%M).sql
```

Lo que hace cada opción y por qué:

- `--single-transection`: vuelca dentro de una transacción, así el archivo es
  coherente aunque entren usuarios mientras se genera. Sin esta opción, un
  `INSERT` y un `DELETE` simultáneos dejan el respaldo inconsistente.
- `--routines --triggers --events`: la base podría tener procedimientos o
  disparadores que no están en el código.
- `--hex-blob`: los campos binarios se guardan en hexadecimal, sin problemas de
  codificación.
- `--set-gtid-purged=OFF`: evita que un `PURGE` de binlogs afecte a otras
  réplicas. Importante si algún día hay una.

### 2. Comprobación de que el archivo sirve

Un respaldo sin verificar no es un respaldo:

```bash
ls -lh /var/backups/paredescano-completo-*.sql
# debe ser de cientos de KB o mas, no de unos pocos bytes

# Buscar que estan TODAS las tablas
grep -c "^CREATE TABLE" /var/backups/paredescano-completo-*.sql
# debe devolver 16

# Probar a restaurarlo en una base vacia
mysql -u root -p -e "CREATE DATABASE prueba_respaldo CHARACTER SET utf8mb4"
mysql -u root -p prueba_respaldo < /var/backups/paredescano-completo-*.sql
mysql -u root -p -e "SELECT COUNT(*) FROM prueba_respaldo.usuarios;"   # 61
mysql -u root -p -e "SELECT COUNT(*) FROM prueba_respaldo.actividades;" # 15
mysql -u root -p -e "DROP DATABASE prueba_respaldo;"
```

Solo cuando esa restauración de prueba dé los conteos correctos, el respaldo
existe de verdad.

### 3. Copia fuera del servidor

Un respaldo en el mismo disco que se quiere proteger no protege de nada:

```bash
scp root@SERVIDOR:/var/backups/paredescano-completo-*.sql  C:\Users\tsoporte\Respaldos\ParedesCano\
```

Y conviene otra copia en un sitio distinto (nube o disco externo), porque un
VPS también puede perderse.

### 4. Verificación periódica

El lunes, antes de tocar nada:

1. Comprobar que existe un respaldo **completo** y de menos de 24 h.
2. Comprobar que alguien lo restauró con éxito alguna vez (el punto 2 de arriba).
3. Comprobar que hay una copia fuera del servidor.

## Nota sobre los datos personales

El archivo contiene 61 usuarios con sus hashes de contraseña, nombres y correos.
**No se sube a Git.** Los hashes de bcrypt no se pueden recuperar, pero tampoco
deben Viajar: si alguien los obtiene, puede atacarlos fuera de línea. Por eso el
respaldo va en una carpeta fuera de los repositorios, con la base de datos en
uso y solo accesible por quien administra el servidor.
