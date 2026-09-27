# Respaldos: procedimiento verificado

## Estado actual

| Respaldo | Ubicación | Alcance | Verificado |
|---|---|---|---|
| **Completo** | `C:\Users\tsoporte\Respaldos\ParedesCano\paredescano-COMPLETO-20260927.sql` | 16 tablas, estructura y datos | **Sí, restaurado y comparado** |
| Parcial anterior | `C:\Users\tsoporte\Respaldos\ParedesCano\paredescano-actividades-sesiones-20260927.sql` | 2 tablas | Insuficiente, se conserva por si acaso |

Fuera de los repositorios. **Nunca se sube a Git**: contiene 61 usuarios con sus
hashes de contraseña y los tokens de sesión.

## El error que casi te cuesta el respaldo

La primera versión del volcado **estaba dañada** y no me di cuenta hasta que
restauré y comparé. Dos motivos, ambos por usar PowerShell:

1. **`>` en PowerShell 5.1 sobre un comando nativo convierte la salida.** El
   archivo salió en UTF-16 (119 910 bytes en vez de 59 954) y con los acentos
   rotos.
2. **Restaurar con `Get-Content -Raw | mysql` también rompe el UTF-8**, porque
   PowerShell decodifica como ANSI antes de pasar la cadena.

Un `mysqldump` que "termina bien" puede producir un archivo inútil. **Por eso
hace falta restaurarlo y compararlo**, y no basta con mirar el código de salida.

## Procedimiento correcto (PowerShell)

Siempre con `cmd /c`, que redirige en binario:

```powershell
# VOLCADO
$env:MYSQL_PWD="<clave>"
cmd /c "`"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe`" `
  -u root -h 127.0.0.1 `
  --single-transaction --quick `
  --routines --triggers --events `
  --hex-blob --default-character-set=utf8mb4 `
  --set-gtid-purged=OFF --column-statistics=0 --no-tablespaces `
  paredescano > `"C:\ruta\respaldo.sql`" 2>nul"

# RESTAURACION
cmd /c "`"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`" `
  -u root -h 127.0.0.1 --default-character-set=utf8mb4 --binary-mode=1 `
  paredescano_restaurada < `"C:\ruta\respaldo.sql`""

# VERIFICACION
node tests/verificar-restauracion.js paredescano paredescano_restaurada
```

En Linux o macOS no hay problema: `mysqldump ... > archivo.sql` y
`mysql base < archivo.sql` ya son binarios.

## Por qué `--single-transaction` es válido aquí

Comprobado antes de usarlo: **las 16 tablas son InnoDB**. No hay ninguna
`MyISAM` ni `MEMORY`, así que el volcado dentro de una transacción da un
archivo coherente sin bloquear la base.

No protege frente a un `ALTER TABLE` concurrente, que sí rompería la coherencia.
Antes de volcar hay que comprobar que no hay DDL en curso:

```sql
SELECT id, command, time, info FROM information_schema.PROCESSLIST
 WHERE command NOT IN ('Sleep','Daemon') AND id <> CONNECTION_ID();
```

Si no devuelve filas, se puede volcar.

## Qué verifica `tests/verificar-restauracion.js`

No se queda en los conteos de filas, que pueden coincidir con datos distintos:

- **CRC32 sobre los valores de cada fila**, con las columnas descubiertas del
  esquema. Un `SUM(CRC32(CONCAT_WS('|', ...)))` por tabla.
- Número de índices, columnas y claves foráneas.
- **Integridad referencial** de la base restaurada: ninguna actividad sin
  usuario, ninguna sesión sin usuario, ningún supervisor inexistente.
- Una muestra de usuario, para confirmar que el hash de contraseña llega íntegro.

Resultado de la ejecución de hoy:

```
16 tablas (5 vacías)   con contenido distinto: 0
indices 80/80   columnas 146/146   claves foraneas 32/32
huerfanas: 0 en actividades, usuarios, sesiones y notificaciones
Muestra: Administrador (hash $2b$...)
RESULTADO: restauracion CORRECTA
```

## Para un servidor Linux

```bash
mysqldump -u root -p \
  --single-transaction --quick \
  --routines --triggers --events --hex-blob \
  --default-character-set=utf8mb4 \
  --set-gtid-purged=OFF \
  paredescano > /var/backups/paredescano-$(date +%Y%m%d-%H%M).sql

# Verificar de verdad
mysql -u root -p -e "CREATE DATABASE prueba CHARACTER SET utf8mb4"
mysql -u root -p prueba < /var/backups/paredescano-*.sql
node tests/verificar-restauracion.js paredescano prueba
mysql -u root -p -e "DROP DATABASE prueba"
```

## Copia fuera del servidor

```powershell
scp root@SERVIDOR:/var/backups/paredescano-*.sql C:\Users\tsoporte\Respaldos\ParedesCano\
```

Un respaldo en el mismo disco que se quiere proteger no protege de nada. Y una
segunda copia en otro sitio, porque un VPS también se pierde.

## Antes de cada despliegue

1. ¿Existe un respaldo completo de menos de 24 h?
2. ¿Se restauró con éxito alguna vez con `verificar-restauracion.js`?
3. ¿Hay una copia fuera del servidor?
