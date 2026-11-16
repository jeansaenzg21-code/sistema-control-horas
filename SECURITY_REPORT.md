# Informe de seguridad y entrega técnica

**Proyecto:** `paredes-cano-control-horas` (sistema de control de horas)
**Rama:** `feature/security-hardening`
**Fecha:** 2026-11-15
**Entorno de verificación:** Windows + Docker Desktop, Node v24.22.2, npm 11.19.1
**Base de referencia:** commit `c3a26ce` (previo al endurecimiento)

---

## 1. Resumen ejecutivo

Se ejecutó un plan de endurecimiento en tres fases sobre una rama dedicada,
**sin** `--force`, **sin** cambiar librerías de Excel, **sin** tocar el VPS, la
base productiva ni el entorno `sistema-control-horas-test`, y **sin** cambios de
interfaz o funcionalidad (salvo la corrección puntual de un defecto detectado).

| Métrica (`npm audit`) | Antes | Después |
|---|---|---|
| Árbol de producción (`--omit=dev`) | **24** (1 baja, 11 mod, 10 altas, 2 críticas) | **3** (2 moderadas, 1 alta) |
| Árbol completo | **30** | **15** |

Resultado: las vulnerabilidades **de producción** bajaron de **24 a 3**, y las 3
restantes **no tienen fix compatible** (una requiere `--force` con downgrade
incompatible de `exceljs`, y la otra no tiene fix publicado). No se ejecutó
`npm audit fix --force`.

Cada fase se validó en un **entorno aislado** (Compose `sch-verify`, volumen
`sch_verify_db`, datos ficticios) con `typecheck`, `lint`, `build`,
`docker build` y una suite funcional de API (**66/66**). Se añadieron pruebas de
regresión para el defecto corregido (**13/13**).

**Estado:** el repositorio queda **preparado para entrega**, no desplegado. El
único pendiente bloqueante para el ingeniero de sistemas es el **esquema/migración
de base de datos**, que el repositorio no incluye (limitación preexistente).

---

## 2. Alcance y metodología

- **Alcance:** dependencias del proyecto y un defecto puntual en la API de
  notificaciones. **No** incluye endurecimiento de Nginx/SO ni cambios de
  esquema.
- **Restricciones respetadas:** sin `npm audit fix --force`; sin cambiar
  `xlsx`/`exceljs`; sin `push` ni despliegues; sin acceso a VPS/DB productiva/
  entorno de test; todo en `feature/security-hardening`; sin credenciales ni
  `.env` con secretos; sin eliminar volúmenes.
- **Metodología:** auditoría `npm audit` (prod y completa) → análisis de cadenas
  (`npm ls`) y del bundle real (`.next/standalone`) → corrección por fases →
  validación funcional aislada → commit independiente por fase.

---

## 3. Vulnerabilidades iniciales

`npm audit --omit=dev` reportó **24 avisos** en producción y **30** en el árbol
completo. Los relevantes para el runtime:

| Paquete | Severidad | Naturaleza |
|---|---|---|
| `next` 16.3.6 | crítica | Múltiples avisos (cache poisoning, RCE en Image Optimization, etc.) |
| `sharp` | alta | CVE en dependencia `librsvg` |
| `source-map-js` | alta | DoS por secciones de source-map |
| `xlsx` | alta | Prototype Pollution + ReDoS (**sin fix**) |
| `exceljs` → `uuid` | moderada | Buffer bounds check en v3/v5/v6 |
| `shadcn` y sus transitivas (`@modelcontextprotocol/sdk`, `express`, `hono`, `body-parser`, `proxy-addr`, `undici`, `zod`, `deepmerge`, `minimatch`, …) | varias | Herramientas de **build/CLI**, no presentes en el bundle de producción |

Hallazgo clave del análisis: **~16 de los 24** avisos provenían de `shadcn`,
usado solo en tiempo de build (`@import 'shadcn/tailwind.css'` en
`app/globals.css`) y **ausente** de `.next/standalone`.

---

## 4. Correcciones aplicadas

| Fase | Cambio | Commit | Efecto (prod) |
|---|---|---|---|
| 1 | Mover `shadcn` de `dependencies` a `devDependencies` | `f645470` | 24 → 6 |
| 2 | `npm audit fix` (compatible): `next` 16.3.6→16.4.6, `sharp` 0.35.4→0.35.5, `source-map-js` 1.2.1→1.2.2 (+ transitivas) | `02cf033` | 6 → 3 |
| 3 | Corregir `POST /api/notificaciones` con `mensaje` válido + pruebas de regresión | `be53831` | — |
| — | Documentación (DEPLOYMENT.md) | `6bcfaa1`, `7fa0160` | — |

**Detalle de la Fase 3 (corrección puntual).** `POST /api/notificaciones`
devolvía **400** cuando el cuerpo incluía un `mensaje` no vacío: `validarTexto`
(`app/api/notificaciones/route.ts`) devolvía el propio texto en el caso válido y
el llamador lo interpretaba como error. Se cambió el retorno a `null` en el caso
válido (validador: mensaje de error o `null`). Cambio mínimo, sin tocar UI ni
otras funcionalidades.

---

## 5. Versiones actualizadas

| Paquete | Antes | Después | Motivo |
|---|---|---|---|
| `next` | 16.3.6 | **16.4.6** | Crítica (múltiples advisories) |
| `sharp` | 0.35.4 | **0.35.5** | Alta (librsvg) |
| `source-map-js` | 1.2.1 | **1.2.2** | Alta (DoS) |
| `shadcn` | 4.16.1 (`dependencies`) | 4.23.0 (`devDependencies`) | Elimina avisos de build del árbol de producción |

Sin cambios en `xlsx` (0.18.5) ni `exceljs` (4.4.0), según lo autorizado.

---

## 6. Vulnerabilidades restantes

### 6.1 Producción (`npm audit --omit=dev` → 3 avisos, 2 paquetes)

| Paquete | Severidad | Advisory | Exposición real | Mitigación |
|---|---|---|---|---|
| `xlsx` 0.18.5 | alta | Prototype Pollution (`GHSA-4r6h-8v6p-xvw6`), ReDoS (`GHSA-5pgg-2g8v-p4x9`) | **Cliente**: `components/importar-presupuestos-masivo.tsx` parsea en el navegador un archivo que el propio usuario selecciona. No afecta al servidor. | Migrar a `exceljs`/`read-excel-file` (ya presente) — **requiere autorización**. Mientras tanto: usar solo archivos de confianza y mantener la validación posterior en servidor. |
| `exceljs` → `uuid` <11.1.1 | moderada | Buffer bounds check en v3/v5/v6 con `buf` provisto (`GHSA-w5hq-g745-h8pq`) | **Servidor**: `exceljs` se usa en `lib/laptops/excel.ts` y `lib/presupuestos/importar-excel.ts`; la ruta vulnerable de `uuid` no se ejerce en esos flujos. | El fix propuesto exige `exceljs@3.4.0` (downgrade **incompatible**). Se deja como está. |

### 6.2 Solo desarrollo (árbol completo → 15 avisos)

`deepmerge` (vía `@shadcn/registry`), `minimatch` (vía `ts-morph` y
`typescript-eslint`), además de `uuid`/`xlsx`. **No forman parte de la imagen
de producción** (`.next/standalone` no los incluye). Se corrigen al actualizar
esas herramientas de desarrollo, sin impacto en el runtime.

---

## 7. Resultados de las pruebas

Entorno aislado `sch-verify` (MySQL 8.4 en `127.0.0.1:3308`; app
`sistema-control-horas:fase3` en `127.0.0.1:3002`; datos **ficticios**):

| Verificación | Resultado |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | OK |
| `npm run lint` | 0 errores (9 warnings preexistentes) |
| `npm run build` (`next build`) | OK |
| `docker build` (multistage, usuario no root) | OK |
| `GET /api/salud` | 200 `{"ok":true,"baseDeDatos":"conectada"}` |
| Suite funcional de API | **66/66** |
| Pruebas de regresión de notificaciones (`npm test`) | **13/13** |

Cobertura de la suite funcional: login y cookies (`HttpOnly; Secure;
SameSite=Lax`), sesión, matriz de permisos por rol (admin/jefe/personal/socio/TI),
CRUD, ciclo de actividad (iniciar/pausar/continuar/finalizar y bloque cerrado →
`PENDIENTE_APROBACION`), aprobaciones, notificaciones, excepciones, horarios,
importaciones Excel (`tipos-actividad`, `usuarios`, `laptops`), SSE y logout.

Cobertura de regresión de notificaciones: mensaje válido persistido; mensaje
ausente/vacío; rechazo de espacios, no-texto y longitud excesiva; autenticación
(401); permisos (403); marcado como leída.

---

## 8. Limitaciones y riesgos pendientes

1. **Esquema/migraciones de base de datos (bloqueante para entrega):** el
   repositorio no incluye el esquema ni `scripts/migrar.js` (el script `npm run
   migrar` apunta a un archivo inexistente). El ingeniero de sistemas debe
   obtener el esquema/volcado y cargarlo (ver DEPLOYMENT.md §13.1 y §13.2).
2. **`xlsx` sin fix:** requiere migración de librería (fuera de alcance sin
   autorización). Riesgo acotado al navegador del usuario que importa.
3. **`exceljs`/`uuid`:** sin fix compatible; riesgo real bajo en los flujos
   actuales.
4. **Validación en el servidor de destino:** las pruebas se hicieron en un
   entorno aislado local; falta repetir login real por HTTPS, cookies `Secure`,
   Nginx y SSE en el servidor.
5. **Análisis de imagen:** pendiente `trivy`/Docker Scout sobre la imagen final.
6. **Sin pruebas automatizadas de UI/E2E:** la cobertura es de API y de la
   lógica de validación.

---

## 9. Recomendaciones de mantenimiento

- Ejecutar `npm audit --omit=dev` y `npm audit` periódicamente; revisar avisos
  nuevos y aplicar solo fixes compatibles (evitar `--force`).
- Programar la migración de `xlsx` a `exceljs`/`read-excel-file` en una tarea
  aprobada, con pruebas de importación.
- Mantener `shadcn` en `devDependencies`; cualquier herramienta de build no debe
  residir en `dependencies`.
- Incorporar al repositorio el **esquema y migraciones versionadas** (idealmente
  con el `migrar` funcional) y ejecutarlas en CI/despliegue.
- Integrar `npm run typecheck`, `npm run lint` y `npm test` como verificación
  previa a cada entrega.
- Añadir `trivy`/Docker Scout al pipeline y revisar la imagen antes de publicar.
- Versionar imágenes por commit (`sistema-control-horas:<TAG>`) para rollback
  exacto; conservar al menos la versión anterior.

---

## 10. Estado de preparación para despliegue Docker

- **Imagen:** multistage, `node:24-alpine`, usuario no root (UID 1001),
  `next.config.mjs` con `output: 'standalone'`, healthcheck contra `/api/salud`.
- **Compose:** producción con MySQL externo (no incluido en el compose);
  puerto publicado solo en `127.0.0.1`; `no-new-privileges`; logs rotados.
- **Documentación:** `DEPLOYMENT.md` cubre variables de entorno (§5), MySQL
  externo (§6), construcción/arranque (§7), healthcheck (§8), actualización (§9),
  rollback (§10), Nginx/HTTPS (§11), volúmenes/persistencia (§13), **esquema,
  migraciones y respaldos/restauración (§13.1 y §13.2)**, pruebas locales (§14)
  y seguridad (§15).
- **Pendiente bloqueante:** esquema/migración de la base (§8.1). Resto de
  verificaciones en el servidor de destino: DEPLOYMENT.md §16.2.

---

## 11. Anexo: comandos de verificación

```bash
# Calidad y pruebas
npm run typecheck
npm run lint
npm run build
npm test                       # regresión de notificaciones (requiere API en marcha)

# Auditoría
npm audit --omit=dev
npm audit

# Imagen
docker build -t sistema-control-horas:<TAG> .
docker run --rm --entrypoint sh sistema-control-horas:<TAG> -c "ls -la /app; env"
trivy image sistema-control-horas:<TAG>   # o: docker scout quickview <imagen>
```
