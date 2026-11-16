# Guía de despliegue con Docker

Sistema de Control de Horas — Next.js 16 (App Router) + TypeScript + MySQL.

Esta guía prepara el despliegue en un servidor Ubuntu con Docker, manteniendo
MySQL **fuera** del contenedor de la aplicación y Nginx como único punto de
entrada público con HTTPS.

> **Alcance:** los archivos de Docker no modifican el código ni la base de datos
> existentes. El despliegue real, las migraciones y los respaldos los ejecuta el
> ingeniero de sistemas.

---

## 1. Arquitectura

```
Navegador / App móvil / Widget
             |
             | HTTPS 443
             v
      Nginx (host)
             |
             | HTTP 127.0.0.1:3000
             v
  Contenedor app (Next.js standalone, usuario nextjs)
             |
             | TCP 3306 (red privada / LAN)
             v
      MySQL externo (host o servidor aparte)
```

- La aplicación se publica por defecto en `127.0.0.1:3000`, accesible solo desde
  el propio host (donde corre Nginx).
- MySQL no se publica y no forma parte del compose de producción.
- No hay archivos persistentes obligatorios dentro del contenedor.

## 2. Versión de Node.js

- Se usa **Node.js 24 LTS** (`node:24-alpine`) en las tres etapas del Dockerfile.
- Justificación:
  - Es la misma versión mayor del entorno de desarrollo (`v24.22.2`).
  - Next.js 16.3.6 exige `>=20.9.0`; las dependencias más exigentes piden
    `>=20.18.1` (shadcn, undici). Node 24 cumple todo el árbol.
  - El `package-lock.json` incluye los binarios musl de `sharp` y
    `@tailwindcss/oxide`, por lo que Alpine funciona sin compilar nativo.
  - Node 20 está en fin de vida en 2026; Node 22 es LTS de mantenimiento y
    Node 24 es LTS activo.
  - Node 22 también es compatible (usando parches recientes, `>=22.13`); se
    elige 24 para no divergir del entorno de desarrollo.
- La versión se puede cambiar con el build arg `NODE_VERSION` (manteniendo la
  misma en todas las etapas) si la empresa estandariza otra LTS.
- `node:24-alpine` sigue el último patch de la línea 24. Para builds 100 %
  reproducibles, fijar `node:24.<patch>-alpine` o el digest de la imagen.

## 3. Requisitos del servidor

- Ubuntu 22.04/24.04 (o similar) con Docker Engine 24+ y Compose v2.
- Nginx instalado en el host.
- MySQL 8.x accesible desde el contenedor.
- Certificado TLS (Let's Encrypt u otro).
- Puertos públicos: 80 y 443. El 3000 no se expone a Internet.

Instalación de Docker (referencia):

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# Cerrar y volver a iniciar sesión para aplicar el grupo docker
docker --version
docker compose version
```

## 4. Archivos incluidos

| Archivo | Uso |
|---|---|
| `Dockerfile` | Imagen multistage optimizada para Next.js standalone. |
| `.dockerignore` | Excluye secretos, `.git`, `node_modules`, `timer`, `extension`, etc. |
| `docker-compose.yml` | Producción: solo la app; MySQL externo vía `.env`. |
| `docker-compose.test.yml` | Pruebas locales con MySQL desechable y credenciales ficticias. |
| `.env.example` | Plantilla de variables (sin credenciales reales). |
| `.gitattributes` | Fuerza finales de línea LF en Dockerfile, compose y `.env.example`. |
| `DEPLOYMENT.md` | Esta guía. |

## 5. Configuración de variables

```bash
cp .env.example .env
chmod 600 .env
# Editar .env con los valores reales del entorno
```

Reglas:

- `.env` **no** se versiona (ya está en `.gitignore`).
- Guardar `.env` con finales de línea **LF**. En Windows, un `.env` con CRLF
  puede dejar un `\r` invisible al final de cada valor y romper contraseñas o
  cadenas de conexión.
- Nunca pasar secretos como `ARG`/`--build-arg`: los secretos se inyectan en
  tiempo de ejecución con `env_file`.
- `HOSTNAME=0.0.0.0` y `PORT=3000` deben mantenerse dentro del contenedor.
- `COOKIE_SECURE=true` es lo esperado en producción (ver sección 12).

## 6. Conexión a MySQL externo

### 6.1 MySQL instalado en el mismo host

En `.env`:

```env
DB_HOST=host.docker.internal
DB_PORT=3306
```

`docker-compose.yml` ya incluye `extra_hosts: host.docker.internal:host-gateway`,
que es lo que hace funcionar ese nombre en Linux. Docker Desktop lo resuelve solo.

**No usar `localhost` ni `127.0.0.1` como `DB_HOST` dentro del contenedor:**
esos valores apuntan al propio contenedor, no al host.

MySQL debe escuchar en una interfaz accesible por Docker. Si se usa
`bind-address = 127.0.0.1` en MySQL, el contenedor no podrá conectarse. Opciones:

- Escuchar en la IP privada del host (`bind-address = 10.0.0.x`) y permitir solo
  la subred de Docker en el firewall, o
- Usar `network_mode: host` (menos aislado; no recomendado),
- O mover MySQL a un servidor dedicado (opción recomendada).

### 6.2 MySQL en otro servidor

```env
DB_HOST=10.0.0.15
DB_PORT=3306
```

Requisitos: ruta de red desde el host/contenedor, firewall que permita solo la
IP del servidor de aplicación y usuario MySQL con permisos limitados.

### 6.3 Usuario y base de datos

```sql
CREATE DATABASE paredescano CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'paredescano_app'@'%' IDENTIFIED BY 'CONTRASENA_FUERTE';
GRANT SELECT, INSERT, UPDATE, DELETE ON paredescano.* TO 'paredescano_app'@'%';
FLUSH PRIVILEGES;
```

Ajustar los privilegios según lo que requiera la operación normal. No usar
`root` para la aplicación ni exponer el puerto 3306 a Internet.

> El repositorio **no incluye esquema ni migraciones**. La base debe existir y
> estar migrada antes de arrancar. El script `npm run migrar` apunta a
> `scripts/migrar.js`, que no existe en el repositorio (limitación preexistente,
> ajena a Docker).

## 7. Construcción y arranque

### 7.1 Imagen versionada (recomendado)

Versionar la imagen con el commit de Git permite rollback exacto:

```bash
git rev-parse --short HEAD          # p. ej. a607697
export TAG="2026-11-15-$(git rev-parse --short HEAD)"
docker build -t "sistema-control-horas:${TAG}" .
```

Luego, en `.env`:

```env
APP_IMAGE=sistema-control-horas:2026-11-15-a607697
```

O construir y arrancar con Compose en un paso:

```bash
docker compose build --pull
docker compose up -d
```

### 7.2 Verificación

```bash
docker compose ps
docker compose logs -f app
curl -i http://127.0.0.1:3000/api/salud
```

Respuesta esperada con MySQL accesible:

```json
{"ok":true,"baseDeDatos":"conectada"}
```

Si MySQL no responde: HTTP 503 con `{"ok":false,"baseDeDatos":"sin conexion"}`.

## 8. Healthcheck, liveness y readiness

- **Liveness**: ¿el proceso sigue vivo? Si muere, Docker lo reinicia según
  `restart: unless-stopped`.
- **Readiness**: ¿puede atender tráfico? Depende de MySQL.

El healthcheck usa `/api/salud`, que ejecuta `SELECT 1` en MySQL:

- MySQL disponible → `healthy`.
- MySQL caído o credenciales incorrectas → `unhealthy`.

Importante:

- En Docker Compose estándar, **`unhealthy` no provoca reinicio automático**.
  El contenedor sigue corriendo aunque no pueda atender peticiones.
- `restart: unless-stopped` solo cubre caídas del proceso y reinicios del host.
- Para reaccionar a `unhealthy`, usar monitoreo externo (Uptime Kuma, Zabbix,
  Prometheus/Alertmanager) o un orquestador (Swarm/Kubernetes). No se incluye
  auto-reinicio por healthcheck para no ocultar fallas de base de datos.
- Ajustar `retries`/`start_period` si MySQL tarda en arrancar tras un reinicio.

Comandos:

```bash
docker compose ps
docker inspect --format '{{.State.Health.Status}}' $(docker compose ps -q app)
```

### 8.1 Operación diaria: logs, estado y parada

```bash
docker compose logs -f --tail=100 app   # logs en vivo
docker compose ps                       # estado y salud
docker compose restart app              # reinicio del proceso
docker compose stop                     # detener sin eliminar
docker compose down                     # detener y eliminar el contenedor (conserva imágenes)

# NUNCA usar `down -v` en producción: elimina volúmenes.
# En este compose de producción la app no tiene volúmenes, pero la costumbre
# de usar `-v` sí puede borrar datos en otros stacks.
```

## 9. Actualización

```bash
# 1. Respaldar la base (fuera del contenedor, según política de la empresa)
# 2. Actualizar código
git fetch --all
git switch main
git pull --ff-only

# 3. Construir nueva imagen con tag nuevo
export TAG="$(date +%F)-$(git rev-parse --short HEAD)"
docker build -t "sistema-control-horas:${TAG}" .

# 4. Apuntar .env a la nueva imagen y recrear
#    APP_IMAGE=sistema-control-horas:<TAG>
docker compose up -d

# 5. Verificar
docker compose ps
curl -fsS http://127.0.0.1:3000/api/salud
docker compose logs --tail=100 app
```

- **No ejecutar `docker compose down -v`**: `-v` borra volúmenes (en el compose
  de pruebas contiene la base de pruebas).
- La aplicación no guarda datos locales; actualizar la imagen no toca MySQL.

## 10. Rollback

Cada despliegue debe conservar el tag anterior:

```bash
docker image ls sistema-control-horas
```

Para volver atrás:

1. Editar `.env` y establecer `APP_IMAGE=sistema-control-horas:<TAG_ANTERIOR>`.
2. Recrear el contenedor **sin** reconstruir:

```bash
docker compose up -d --no-build
docker compose ps
curl -fsS http://127.0.0.1:3000/api/salud
```

Si el rollback incluye cambios de base de datos, restaurar el respaldo
correspondiente según el procedimiento de la empresa (fuera del alcance de
Docker). Conservar varias imágenes: `docker image prune` solo debe retirar tags
antiguos de forma controlada.

## 11. Nginx y HTTPS

### 11.1 Nginx como proxy inverso

`/etc/nginx/sites-available/sistema-control-horas`:

```nginx
server {
    listen 80;
    server_name horas.empresa.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;                       # nginx >= 1.25.1; en versiones antiguas: listen 443 ssl http2;

    server_name horas.empresa.com;

    ssl_certificate     /etc/letsencrypt/live/horas.empresa.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/horas.empresa.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    client_max_body_size 25m;       # importaciones de Excel

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # SSE (/api/auth/stream, /api/actividades/stream): sin buffering y con
        # timeouts largos para que la conexión no se corte.
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Activar y recargar:

```bash
sudo ln -s /etc/nginx/sites-available/sistema-control-horas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 11.2 HTTPS con Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d horas.empresa.com
sudo systemctl status certbot.timer     # renovación automática
```

- `COOKIE_SECURE` y la bandera `Secure` de `lib/auth.ts` **requieren HTTPS**.
  Si se sirve por HTTP, el navegador rechazará las cookies de sesión y el login
  no persistirá. No desactivar `Secure` en producción.
- Opcional: HSTS, `ssl_stapling`, y cabeceras de seguridad una vez validado el
  funcionamiento.

## 12. Cambio de `COOKIE_SECURE` en `lib/auth.ts`

Cambio conservado de la tarea anterior:

- Antes: `const seguro = ''` (nunca se enviaba `Secure`).
- Ahora: `Secure` se agrega cuando `NODE_ENV=production` **o**
  `COOKIE_SECURE=true`.
- Las cookies siguen siendo `HttpOnly; SameSite=Lax`.
- En desarrollo (`next dev` por HTTP) no se agrega `Secure` para no romper el
  login local.
- En producción no se puede desactivar `Secure`; el despliegue **debe** usar
  HTTPS.

## 13. Volúmenes y persistencia

- **MySQL externo**: sus respaldos y volúmenes son responsabilidad del DBA.
- **Aplicación**: no escribe datos persistentes. Las importaciones de Excel se
  procesan en memoria.
- `/tmp/.paredes-cano-widget-sync.json`: archivo efímero de sincronización del
  widget (expira en 12 h). Se pierde al recrear el contenedor; el widget vuelve
  a sincronizar al iniciar sesión. No requiere volumen.
- Logs: salida estándar, rotada por el driver `json-file` (10 MB × 3).
- Caché de Next (`.next/cache`) es opcional y reconstruible; no se monta.

## 14. Pruebas locales (datos de prueba)

Solo en un equipo de desarrollo. **No** usa la base de producción:

```bash
docker compose -f docker-compose.test.yml up -d --build
docker compose -f docker-compose.test.yml ps
curl -i http://127.0.0.1:3001/api/salud    # esperado: 200 {"ok":true,...}
docker compose -f docker-compose.test.yml logs -f app
docker compose -f docker-compose.test.yml down
```

- MySQL de prueba: `127.0.0.1:3307`, credenciales ficticias, volumen
  `sistema-control-horas-test-db`.
- Para borrar también los datos de prueba:
  `docker compose -f docker-compose.test.yml down -v`.
- La base de prueba se crea vacía (sin esquema). `/api/salud` responde 200
  porque solo ejecuta `SELECT 1`; las pantallas funcionales requieren el esquema
  real.
- Al correr con `NODE_ENV=production`, las cookies llevan `Secure`: un login por
  `http://127.0.0.1:3001` no conservará la sesión. Esto es esperado; para probar
  login completo usar HTTPS (por ejemplo, un túnel TLS local) o validar en el
  entorno de staging.

## 15. Seguridad

Checklist implementado:

- [x] Proceso con usuario no root (`nextjs`, UID 1001).
- [x] Sin `.env`, tokens ni credenciales en la imagen ni en el contexto.
- [x] `.dockerignore` excluye secretos, `.git`, `node_modules`, apps auxiliares.
- [x] `npm ci` con lockfile para builds reproducibles.
- [x] Telemetría de Next desactivada (`NEXT_TELEMETRY_DISABLED=1`).
- [x] `HOSTNAME=0.0.0.0` y `PORT=3000` dentro del contenedor.
- [x] Puerto publicado solo en `127.0.0.1` por defecto.
- [x] MySQL fuera de la red pública y del compose de producción.
- [x] `no-new-privileges:true` y `restart: unless-stopped`.
- [x] Cookies `HttpOnly; SameSite=Lax; Secure` en producción.
- [x] Healthcheck funcional contra `/api/salud`.

Endurecimiento opcional (evaluar antes de aplicar):

```yaml
# En docker-compose.yml, solo si la aplicación no necesita escribir en disco:
read_only: true
tmpfs:
  - /tmp:size=64m
cap_drop:
  - ALL
```

No se aplica por defecto para no romper escrituras de caché de Next ni la
sincronización temporal del widget.

Comandos de revisión (ejecutar en el servidor):

```bash
docker scout quickview sistema-control-horas:<TAG>   # si Docker Scout está disponible
trivy image sistema-control-horas:<TAG>             # alternativa
npm audit --omit=dev
```

### 15.1 Hallazgos de `npm audit` (2026-11-15)

`npm audit --omit=dev` reportó **24 avisos preexistentes** en el árbol de
dependencias (1 bajo, 11 moderados, 10 altos, 2 críticos). Los más relevantes
para el runtime:

| Paquete | Severidad | Nota |
|---|---|---|
| `next` 16.3.6 | crítica | Hay parche disponible con `npm audit fix` (sube el patch/minor dentro de `^16.3.6`). |
| `sharp` | alta | Recomendación: actualizar; la app usa `images.unoptimized`, pero el paquete puede quedar trazado en standalone. |
| `undici`, `proxy-addr`, `body-parser` | alta/crítica | Dependencias transitivas de Next. Se corrigen al actualizar Next. |
| `xlsx` | alta | **Sin fix disponible**; se usa en las importaciones de Excel. |
| `exceljs` → `uuid` | moderada | El fix propuesto implica un cambio incompatible (`exceljs@3.4.0`). |
| `shadcn`, `eslint`, MCP SDK | varias | Herramientas de desarrollo/CLI; no forman parte del flujo de la API. |

Este análisis inicial quedó **ejecutado** el 2026-11-15 en dos fases
controladas (ver §15.3). Mientras se completa la revisión de los avisos que
requieren cambio incompatible, el riesgo se reduce manteniendo Nginx/HTTPS, sin
exponer el puerto de la app y restringiendo la superficie de importación de
archivos.

### 15.2 Análisis de cadenas de dependencia (2026-11-15)

El conteo de `npm audit` se calcula sobre el árbol completo de `dependencies`.
La inspección de las cadenas (`npm ls`) y del bundle real de producción
(`.next/standalone/node_modules`) muestra que la mayoría de los avisos **no
llegan a la imagen**:

- **`shadcn`** figura en `dependencies` pero solo se usa en tiempo de build
  (`@import 'shadcn/tailwind.css'` en `app/globals.css`). Arrastra
  `@modelcontextprotocol/sdk`, `express`, `body-parser`, `proxy-addr`
  (crítica), `hono`, `qs`, `ip-address`, `fast-uri`, `systeminformation`,
  `undici`, `zod`, `deepmerge`, `ts-morph` y `minimatch`. **Ninguno** aparece
  en `.next/standalone`.
- Los avisos que **sí** están en el runtime standalone son:
  `next` (crítica), `sharp` (alta), `brace-expansion` (alta) y, vía
  `exceljs`, `uuid` (moderada). `xlsx` (alta, sin fix) se usa en el cliente.

Correcciones recomendadas, en este orden:

1. Mover `shadcn` a `devDependencies` (elimina ~16 avisos, incluida una
   crítica). El build de Docker usa `npm ci` completo, así que el import CSS
   sigue funcionando.
2. `npm audit fix` (sin `--force`) para `next` → 16.4.x, `sharp` → 0.35.5,
   `source-map-js` → 1.2.2, `brace-expansion` → 5.0.13.
3. `xlsx`: sin fix en npm; migrar la única importación cliente a
   `read-excel-file` (ya presente) o `exceljs`.
4. `exceljs`/`uuid`: dejar como está (el fix propuesto es incompatible).

Ninguna de estas acciones se ha ejecutado todavía; el detalle y la aprobación
corresponden al informe de seguridad entregado aparte.

### 15.3 Ejecución del plan de actualización (2026-11-15)

Se aplicaron las acciones 1 y 2 del plan anterior en la rama
`feature/security-hardening`, cada una validada antes de su commit y **sin**
`--force`, sin bajadas de versión y sin cambios de UI/funcionalidad:

| Fase | Cambio | Commit | `npm audit --omit=dev` |
|---|---|---|---|
| 1 | `shadcn` movido de `dependencies` a `devDependencies` | `f645470` | 24 → **6** |
| 2 | `npm audit fix` compatible: `next` 16.3.6→16.4.6, `sharp` 0.35.4→0.35.5, `source-map-js` 1.2.1→1.2.2 (y ajustes transitivos) | `02cf033` | 6 → **3** |

Resultado final en producción (`--omit=dev`): **3 avisos**, todos sin fix
compatible:

| Paquete | Severidad | Estado |
|---|---|---|
| `xlsx` | alta | Sin fix en npm. Se usa en el cliente; migrar a `read-excel-file`/`exceljs` es una tarea aparte. |
| `exceljs` → `uuid` | moderada | El fix propuesto obliga a `exceljs@3.4.0` (incompatible). Se deja como está. |

Quedan fuera del alcance de este cambio los avisos `deepmerge`, `minimatch`,
`zod`, `@modelcontextprotocol/*`, `hono`, `express`, `undici`, etc.: son
dependencias de **desarrollo/CLI** (varias ya retiradas al subir `shadcn`) y no
forman parte del bundle de producción.

Validación funcional de ambas fases (entorno aislado, ver §16.3): **66/66
comprobaciones correctas** — `typecheck`, `lint` (0 errores), `build` y pruebas
de API (login, sesión, permisos, CRUD, actividades, notificaciones,
excepciones, horarios, importaciones Excel y SSE). Se registró además un
**defecto preexistente** ajeno a estas fases: `POST /api/notificaciones`
responde 400 cuando el cuerpo incluye `mensaje` no vacío (`validarTexto`
devuelve el texto y el llamador lo trata como error).

## 16. Estado de validación y verificaciones pendientes

### 16.1 Validaciones completadas (Windows + Docker Desktop)

Estas pruebas se ejecutaron con éxito en un equipo Windows con Docker Desktop,
sobre una **copia** de la base de datos (nunca producción):

1. `docker build` de la imagen multistage: **exitoso**.
2. `docker compose up` con la aplicación Next.js y un **MySQL 8.4** en
   contenedores: **exitoso**. La aplicación quedó conectada a la base.
3. `GET /api/salud`: **HTTP 200** con `{"ok":true,"baseDeDatos":"conectada"}`.
4. Respaldo de MySQL obtenido del proveedor de nube: **descargado y verificado
   por SHA256** antes de usarlo.
5. Restauración del respaldo: **31 tablas** restauradas correctamente en
   MySQL 8.4.
6. Aplicación conectada a la base restaurada: **interfaz operativa**, mostrando
   correctamente los datos existentes.
7. Cambios de Docker publicados en el repositorio Git.

En conjunto, quedó cubierto el ciclo `build → compose → healthcheck → datos
reales`. Esto valida los archivos de la sección 4, pero **no sustituye** la
validación en el servidor de destino ni el endurecimiento de producción
(sección 15).

### 16.2 Verificaciones pendientes antes de producción

Quedan a cargo del ingeniero de sistemas, en el servidor Ubuntu de destino:

1. Construir la imagen versionada en el servidor:
   `docker build -t sistema-control-horas:test .`
2. `docker compose -f docker-compose.test.yml up -d --build` (MySQL desechable).
3. Confirmar `healthy` y `200` en `http://127.0.0.1:3001/api/salud`.
4. Probar login real contra MySQL de staging por HTTPS y verificar las cookies
   `Secure; HttpOnly; SameSite=Lax` en DevTools.
5. Confirmar que la imagen no contiene secretos:
   `docker run --rm --entrypoint sh sistema-control-horas:test -c "ls -la /app; env"`
6. Validar Nginx + HTTPS y las rutas SSE (`/api/auth/stream`).
7. Ejecutar análisis de vulnerabilidades de la imagen (`trivy` / Docker Scout).
8. Confirmar en el servidor los avisos residuales de `npm audit --omit=dev`
   (§15.3): solo `xlsx` y `exceljs`/`uuid`, sin fix compatible.
9. Validar respaldo/restauración de MySQL en el servidor y el procedimiento de
   rollback.
10. Confirmar que `SETUP_TOKEN` se retira o rota después de la instalación.

### 16.3 Validación funcional de Fases 1 y 2 (2026-11-15)

Para verificar que la actualización de dependencias no alteró comportamiento,
se levantó un entorno **aislado** (proyecto Compose `sch-verify` y volumen
`sch_verify_db`, distintos de los de test existentes), con MySQL 8.4 en
`127.0.0.1:3308` y la imagen `sistema-control-horas:fase2` en
`127.0.0.1:3002`, usando **datos ficticios** (nunca el respaldo real):

1. Esquema + datos ficticios cargados con `FOREIGN_KEY_CHECKS=0` (31 tablas).
2. `GET /api/salud` → 200 `{"ok":true,"baseDeDatos":"conectada"}`.
3. Suite de API (Node, `fetch`): **66/66 correctas**, cubriendo login/cookies,
   sesión, matriz de permisos por rol (admin/jefe/personal/socio/TI), CRUD,
   ciclo de actividad (iniciar/pausar/continuar/finalizar y bloque cerrado →
   `PENDIENTE_APROBACION`), aprobaciones, notificaciones, excepciones, horarios,
   importaciones Excel (`tipos-actividad`, `usuarios`, `laptops`) y SSE.
4. Comportamientos confirmados como correctos: `GET /api/horarios` y
   `GET /api/excepciones` son admin-only; un usuario SOCIO recibe **401** al
   escribir (guard de solo lectura en `lib/auth.ts`); `POST /api/laptops/importar`
   exige el perfil de Sistemas.

## 17. Diagnóstico rápido

| Síntoma | Causa probable | Acción |
|---|---|---|
| `/api/salud` 503 | MySQL inaccesible o credenciales malas | Revisar `DB_*`, firewall y logs de MySQL. |
| `unhealthy` pero app responde | MySQL intermitente | Revisar red/credenciales; el estado no reinicia solo. |
| Login no persiste | Sin HTTPS y cookie `Secure` | Configurar TLS en Nginx. |
| `ECONNREFUSED` a MySQL | `DB_HOST=127.0.0.1` dentro del contenedor | Usar `host.docker.internal` o IP real. |
| Error de conexión desde el host | MySQL con `bind-address=127.0.0.1` | Escuchar en IP privada y restringir por firewall. |
| Build falla en `npm ci` | `shared/` fuera del contexto | No excluir `shared` en `.dockerignore`. |
| SSE se corta | Proxy con buffering/timeouts cortos | `proxy_buffering off` y timeouts largos. |

---

**Recordatorio:** este repositorio quedó preparado, no desplegado. No se
ejecutaron migraciones ni se accedió a producción.
