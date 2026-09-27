# Fase 3: pruebas de carga. Procedimiento para el lunes

**Nada de esto se ejecuta contra producción.** El objetivo es medir, no
demonstrar. Al final no se afirmará que el VPS aguanta 200 usuarios: se dirá
qué se comprobó y qué queda por comprobar.

## Principio de oro

**El generador de carga va en otra máquina que el servidor que se mide.** Si se
ejecuta en el mismo VPS, se está midiendo el generador tanto como el sistema, y
el resultado no sirve.

## 1. Preparar el servidor que se mide

Debe tener un perfil parecido al VPS actual: ~1 GB de RAM, Ubuntu, Nginx, MySQL y
el mismo Node. En DigitalOcean, un droplet de 1 GB con el mismo Ubuntu.

```bash
# Base de datos de pruebas: clon del esquema, NADA de datos reales
mysqldump -u root --no-data --routines paredescano > esquema.sql
mysql -u root -e "CREATE DATABASE paredescano_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root paredescano_test < esquema.sql
mysql -u root paredescano_test < sql/actividad_movil.sql
mysql -u root paredescano_test < sql/sesiones_persistentes.sql

# 202 usuarios y 50 000 actividades sinteticas
node tests/semilla.js          # USUARIOS=200 ACTIVIDADES=50000
```

**Verificar que el servidor NO apunta a la base real antes de empezar:**

```bash
grep -E "DB_NAME|DB_USER" .env
# debe decir paredescano_test
```

Si dice `paredescano`, **para**. Con la base real, la carga crea y cierra
actividades de los trabajadores de verdad.

## 2. Compilar y arrancar en modo producción

```bash
npm run build
# Con output: standalone se arranca con el servidor embebido:
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public        # si existe
cd .next/standalone && PORT=3000 node server.js
```

Detrás de Nginx, como en producción. Verificar que `proxy.ts` (el CORS) queda
delante y que `client_max_body_size` no corta nada.

## 3. Por cada nivel de concurrencia

Niveles: **25, 50, 100, 150, 200**.

### En el SERVIDOR (terminal 1, por SSH)

```bash
node tests/medir-servidor.js --nivel 50 --salida metricas-50.json
```

Registra cada 5 s: carga de CPU, memoria libre, swap usada, RSS de Node, RSS de
MySQL, conexiones MySQL. **Detiene la prueba solo** si ve 3 avisos seguidos de:
swap > 400 MB, carga > 4, swap activo > 300/s, MySQL > 90 conexiones, o Node >
700 MB.

### En la MÁQUINA DE CARGA (terminal 2)

```bash
node tests/carga.js --url http://IP_DEL_SERVIDOR --nivel 50 --duracion 600 \
     --salida carga-50.json
```

600 s por nivel: 5 min de calentamiento, 5 min de medición.

### Entre niveles

**Parar y esperar a que el sistema se estabilice.** Sin esto, el nivel 200 empieza
con el servidor todavía procesando el 150 y el resultado mezcla ambas cosas.

```bash
# Esperar a que baje la carga y no haya conexiones MySQL:solo las del pool
watch -n5 'cat /proc/loadavg; free -m | head -2'
#Cuando la carga lleve 2 minutos estable y la memoria libre similar a la de
# antes de empezar, se puede subir al siguiente nivel.
```

## 4. Pico de las 8 de la mañana

El escenario de jornada usa frecuencias realistas. El pico es otro caso: todos
pulsan "Iniciar" a la vez.

```bash
node tests/carga.js --url http://IP --nivel 200 --duracion 180 --pico
```

## 5. Qué mirar en cada nivel

| Métrica | Dónde sale | Qué significa si va mal |
|---|---|---|
| p95 por ruta | `carga.js` | Una ruta lenta se nota antes que el promedio |
| Errores inesperados | `carga.js` | Un 500 es un fallo. Un 409 o 401 son respuestas correctas |
| SSE simultáneos | `carga.js` | Deben ser los del nivel, sin duplicarse |
| RSS de Node | `medir-servidor.js` | Si crece entre niveles y no baja, hay fuga |
| RSS de MySQL | `medir-servidor.js` | Con buffer pool de 128 MB no debería pasar de 400 |
| Conexiones MySQL | `medir-servidor.js` | Con pool de 10 por proceso, debe quedarse en 10-20 |
| Swap | `medir-servidor.js` | Si crece, la RAM no da: ese es el cuello de botella |
| Registros duplicados | SQL | La prueba E: dos inicios simultáneos, una sola actividad |

## 6. Comprobación de integridad DESPUÉS de la carga

Con la carga ya pesada, comprobar que no se rompió nada. Con la base de pruebas.

```sql
-- Ningun usuario puede tener dos actividades activas
SELECT usuario_id, COUNT(*) FROM actividades
 WHERE estado IN ('EN_CURSO','PAUSADA') GROUP BY usuario_id HAVING COUNT(*) > 1;
-- debe devolver 0 filas

-- Ninguna operacion movil duplicada
SELECT id_operacion, COUNT(*) FROM actividades
 WHERE id_operacion IS NOT NULL GROUP BY id_operacion HAVING COUNT(*) > 1;
-- debe devolver 0 filas

-- Nadie quedo con la sesion colgada
SELECT COUNT(*) FROM sesiones WHERE expira_en < NOW() AND refresh_expira_en < NOW();
```

## 7. Plantilla de resultados

Rellenar una por nivel. Lo que no se rellene, se deja en blanco: es preferible
un hueco a un invento.

```
NIVEL: ___ usuarios            FECHA: ___  HORA: ___
Servidor: RAM ___ MB | CPU ___ nucleos | swap ___ MB | Node ___ v__ | MySQL ___

Peticiones totales: ____     por segundo: ____
Latencia GLOBAL   p50 ____ ms | p95 ____ ms | p99 ____ ms | max ____ ms

Por ruta:
  /api/actividades/actual   n=____ p50 ____ p95 ____ errores ____
  /api/actividades (POST)   n=____ p50 ____ p95 ____ errores ____
  /api/actividades/[id]/finalizar n=____ p50 ____ p95 ____ errores ____
  /api/actividades (GET)    n=____ p50 ____ p95 ____ errores ____
  /api/auth/login           n=____ p50 ____ p95 ____ errores ____

Servidor durante la prueba:
  carga maxima ____  |  memoria libre minima ____ MB
  swap maxima ____ MB |  Node maximo ____ MB |  MySQL maximo ____ MB
  conexiones MySQL maximas ____ de ____

SSE: maximo ____ simultaneos | conexiones totales ____
Registros duplicados tras la carga: ____   (debe ser 0)
Usuarios con doble actividad activa: ____   (debe ser 0)

INTERRUMPIDO: si / no     Motivo: ____

COMPROBADO: ____
NO COMPROBADO: ____
```

## 8. Qué NO se puede concluir con esto

- **Mi portátil no es el VPS.** Los números de aquí sirven para comparar niveles
  entre sí, no para extrapolar al VPS. Con 1 GB de RAM el perfil de consumo es
  otro.
- **200 usuarios simultáneos no es lo mismo que 200 usuarios concurrentes.** El
generador no simula 200 personas contando cada segundo, sino usuarios con
  pausas entre acciones.
- **Falta medir el widget de escritorio y la app en dispositivo real.** El
  widget mantiene un stream abierto mucho tiempo.
- **Falta medir el pico de las 8 de la mañana** si no se ejecuta `--pico`.

Sobre Redis o ampliar el VPS: **no se recomienda nada de eso hasta tener las
cifras de este documento.** Si el swap crece, el problema es RAM. Si la carga de
CPU se satura, es CPU. Son decisiones distintas con証拠 distintos.
