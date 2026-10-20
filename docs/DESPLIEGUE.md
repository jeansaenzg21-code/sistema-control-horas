# Despliegue controlado y vuelta atrás

Ensayado en el entorno aislado con los ocho commits pendientes. **No se ha
desplegado en producción.**

## Comprobación previa hecha: la vuelta atrás es segura

La versión desplegada (`179eb0a`) se compiló y se ejecutó contra una base que
**ya tenía las dos migraciones aplicadas**. Resultado, 12 comprobaciones:

| Comprobación | Resultado |
|---|---|
| Login con la versión antigua | **200**, no 500 |
| Actividad actual | 200 |
| Historial | 200, devuelve un array |
| Iniciar actividad | 200, se registra |
| Finalizar actividad | 200, con hora de fin |
| La fila que crea la versión antigua, ¿tiene `id_operacion`? | **Vacío**, como debe ser |
| Referencias a `refresh_token` o `id_operacion` en el código antiguo | **Ninguna** |

**Por qué es segura:** las migraciones solo *añadieron* columnas. La versión
antigua no las menciona, así que MySQL las ignora. No hay ninguna sentencia
`DROP`, ningún `NOT NULL` nuevo sin default y ningún cambio de tipo.

**Consecuencia práctica: volver atrás NO requiere tocar la base.** No hace falta
restaurar un respaldo antiguo, y por tanto **no se pierde ningún registro nuevo
que se haya creado mientras tanto**. Ese era el riesgo que había que descartar.

Un detalle que dejó la prueba: la versión antigua devolvió **252 filas** del
historial, sin paginar. Es exactamente el problema que corrigió la Fase 2. Al
volver atrás, ese panel volvería a ser lento. Es asumible durante una
incidencia, pero conviene saberlo.

## Antes de desplegar: el respaldo

Un despliegue sin respaldo verificado no es un despliegue.

```powershell
$env:MYSQL_PWD="<clave>"
# SIEMPRE con cmd /c: en PowerShell, '>' convierte la salida y rompe el UTF-8
cmd /c "`"C:\...\mysqldump.exe`" -u root -h SERVIDOR --single-transaction --quick `
  --routines --triggers --events --hex-blob --default-character-set=utf8mb4 `
  --set-gtid-purged=OFF paredescano > `"C:\...\paredescano-AAAAMMDD-HHMM.sql`""

# Restaurar en una base vacia y comparar
node tests/verificar-restauracion.js paredescano prueba
```

Si `verificar-restauracion.js` dice `diferencias: 0`, el respaldo existe de
verdad. Un `mysqldump` con código 0 no lo garantiza: ya se detectó un volcado
dañado que terminaba «bien».

## Las migraciones ya están aplicadas

Las dos se aplicaron en la base real antes de este despliegue:

- `sql/actividad_movil.sql` → `actividades.id_operacion` + índice único
- `sql/sesiones_persistentes.sql` → 6 columnas en `sesiones` + 3 índices

**No hace falta volver a aplicarlas.** Si se ejecutan otra vez, son
idempotentes y responden «ya existe».

## Despliegue

```bash
cd /var/www/paredescano          # o donde este el proyecto

# 1. Guardar la version que hay ahora, por si hay que volver
git rev-parse HEAD > /var/backups/VERSION-ACTUAL.txt
echo "179eb0a" >> /var/backups/VERSION-ACTUAL.txt

# 2. Traer el codigo nuevo
git fetch origin
git checkout <commit-que-se-despliega>      # NO usar 'main' a ciegas
git status                                   # debe salir limpio
npm ci

# 3. Compilar
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# 4. Reiniciar el servicio (pm2, systemd, lo que se use)
pm2 restart paredescano      # o: systemctl restart paredescano
pm2 logs paredescano --lines 50
```

### Orden importante

**Base migrada primero, código después.** Así es como está ahora. Si alguna vez
se invirtiera, el código nuevo tiene una salvaguarda (`createSession` degrada al
camino viejo si la migración no está), pero no conviene depender de ella.

## Verificación después de desplegar

Sin esto, un despliegue «correcto» puede estar roto.

```bash
# 1. La web responde
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/

# 2. Login: tiene que dar 200, NUNCA 500
curl -s -X POST https://TU-DOMINIO/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"TU_USUARIO","password":"TU_CLAVE"}' | head -c 200

# 3. La API de actividades responde con sesion valida
curl -s -H "Authorization: Bearer TOKEN" \
  "https://TU-DOMINIO/api/actividades?limite=1"

# 4. El nuevo endpoint de resumen existe y responde
curl -s -H "Authorization: Bearer TOKEN" \
  "https://TU-DOMINIO/api/actividades/resumen?desde=2025-01-01&hasta=2025-12-31"
```

Después, a mano con una cuenta real:

1. Entrar en la web.
2. Iniciar una actividad desde la web.
3. Verificar en la **app móvil** que aparece la misma actividad en curso.
4. Intentar iniciar otra: debe rechazarse.
5. Finalizarla y comprobar que llega la notificación al supervisor.
6. Cerrar sesión y volver a entrar.

**El paso 3 es el importante**: es el requisito de que ambos clientes muestren la
misma actividad.

## Vuelta atrás

```bash
# 1. Volver al commit guardado
cd /var/www/paredescano
git checkout $(cat /var/backups/VERSION-ACTUAL.txt | head -1)

# 2. Reinstalar y recompilar
npm ci
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# 3. Reiniciar
pm2 restart paredescano
pm2 logs paredescano --lines 50
```

**No se toca la base de datos.** Las columnas de las migraciones se quedan
como están: son aditivas y el código antiguo las ignora. **No se restaura ningún
respaldo**, precisamente para no perder los registros que se hayan creado
desde el despliegue.

## Cuándo volver atrás

Vuelve atrás si el login da 500, si se pierden registros, o si los paneles no
cargan. **No hace falta volver atrás por lentitud**: la lentitud tiene arreglo
de por sí, con un cambio pequeño, y no justifica quedarse en una versión con
las carreras de concurrencia sin resolver.

## Lo que NO se ha verificado

- **Sobre el VPS real.** Todo el ensayo se hizo con la base de pruebas y datos
  sintéticos, en un equipo de escritorio. El comportamiento en el VPS con 1 GB
  solo se sabrá con las pruebas de carga del lunes.
- **La app móvil en dispositivo real.** El flujo se probó por HTTP, no en un
  teléfono con la app instalada.
- **El widget de escritorio.** No se ha probado en este ensayo.
- **Nginx y el certificado.** El ensayo no los incluye.

## Migraciones
Ejecutar \
pm run migrar\ antes de desplegar una version nueva. Orden: 0000 a 0009 en sql/migraciones. Las bifurcaciones de compatibilidad se eliminaron; la base debe estar migrada.

