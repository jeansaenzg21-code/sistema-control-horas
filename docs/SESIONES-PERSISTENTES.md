# Sesiones persistentes y revocables por dispositivo

Documento independiente. **No está implementado.** Requiere migración, así que
queda a la espera de aprobación. La implementación actual y probada (acceso de
12 h, renovación de 30 días) no se toca hasta que se decida esto.

## Qué hace hoy el sistema, sin adornos

| Credencial | Dura | Dónde vive |
|---|---|---|
| Token de acceso | 12 h (+ 0-20 min de dispersión) | Cookie `HttpOnly` y cabecera `Authorization` |
| Token de renovación | 30 días | Cookie `pc_refresh`, `HttpOnly` |

**Si un trabajador no abre la app ni la web durante más de 30 días, la
renovación devuelve 401 y tiene que volver a escribir usuario y contraseña.**
Eso NO cumple el requisito de «permanecer conectado hasta que cierre sesión»,
y no debe presentarse como si lo cumpliera.

## Por qué no se puede garantizar «hasta que cierre sesión»

No es una decisión de diseño, es un límite de las plataformas:

- **Navegadores.** Una cookie `HttpOnly` sobrevive a cerrar el navegador, pero
  no a borrar datos de navegación, usar una ventana privada (se descarta al
  cerrarla) ni cambiar de perfil. Safari además aplica *ITP*: puede reducir las
  cookies de forma agresiva tras unos días sin visitar el sitio.
- **iOS.** El sistema puede purgar el almacenamiento seguro de una app que no se
  abre durante varias semanas. Varía por versión y por cantidad de apps
  instaladas; no hay garantía de plazo.
- **Android.** El comportamiento depende del fabricante: algunos hypoglyrow
  más agresivamente que otros.
- **Un teléfono desbloqueado es una sesión viva.** Sin caducidad, quien encuentre
  el dispositivo podría registrar horas. Ese es justo el riesgo que una caducidad
  limita.

Es decir: **la sesión indefinida no es segura, y ninguna plataforma la
respetaría igual.** Lo que sí se puede garantizar es que el sistema sea
transparente y que exista una salida.

## Propuesta: tres capas, sin falsa promesa

### 1. Renovación transparente

El usuario nunca ve el login mientras su dispositivo esté con vida. Si la
renovación falla por una red caída, se reintenta; solo cuando el token de
renovación se caducó de verdad, se pide la contraseña.

### 2. Expiración deslizante con límite honesto

Cada renovación extiende la ventana (por ejemplo, 90 días). Un dispositivo en
uso **nunca** se cierra solo. Uno abandonado, en cambio, se cierra por inactividad.

Esto se debe decir con sus palabras: **no es «conectado para siempre»**. Es
«conectado mientras lo uses». La diferencia importa: el segundo caso es
inevitable si quieres que un dispositivo olvidado deje de permitir registrar
horas.

### 3. Atado al dispositivo

- El móvil genera un **secreto de equipo** de 32 bytes, lo guarda en
  `expo-secure-store` y nunca sale de ahí. Lo manda junto a cada renovación.
- El servidor guarda el **hash** del secreto, nunca el secreto. Si alguien lee la
  tabla `sesiones`, no puede suplantar ningún dispositivo.
- Cada renovación compara el hash. Si no coincide, esa sesión se revoca.

**Qué protege de verdad el secreto de SecureStore, y qué no:**

| Amenaza | ¿Queda protegida? | Por qué |
|---|---|---|
| Se pierde el teléfono, desbloqueado | **Parcialmente** | Hace falta el secreto, que está en SecureStore (Keychain/Keystore, ligado al bloqueo de pantalla). Un atacante con la pantalla activa puede superarlo. |
| Se roba el archivo de la base de datos | **Sí** | En la base solo hay hashes. |
| Se intercepta la cookie en la red | **No** | El cookie es una credencial de la sesión. Por eso el `Secure` y el `HttpOnly` son obligatorios, y por eso en la web el límite real lo pone el navegador. |
| Se clona la aplicación | **No del todo** | SecureStore no se restaura entre dispositivos. Es una limitación a favor. |
| Un XSS en la web | **No** | El `HttpOnly` impide leer la cookie, pero puede hacer peticiones. Por eso la web necesita además las protecciones normales contra XSS. |

Sobre la huella del navegador: **no se usa como garantia de identidad.** Cambia con
frecuencia, produce falsos positivos, y no protege de nada que no
protegiera el `HttpOnly`. Como mucho sirve para *registrar* un acceso sospechoso
y avisar, nunca para validar la sesión.

## Revocación de un teléfono perdido

1. El usuario entra desde otro dispositivo y abre la lista de sesiones
   (`GET /api/auth/sesion`, ya existe).
2. Ve cada equipo con su etiqueta (`iPhone · Safari`, `Windows · Chrome`) y su
   último uso.
3. Al revocar uno, el servidor borra esa fila. El token de acceso de ese equipo
   deja de funcionar en la siguiente petición, y el de renovación también, así
   que **no se puede recuperar con la cookie robada**.
4. Existe una acción aparte, «cerrar todas las sesiones», que es explícita y no
   se activa por accidente.
5. Desactivar la cuenta (`activo = 0`) impide renovar. Ya está implementado y
   verificado.

## Migración que requeriría

```sql
ALTER TABLE sesiones
  ADD COLUMN secreto_dispositivo_hash CHAR(64) NULL DEFAULT NULL,
  ADD COLUMN etiqueta VARCHAR(120) NULL DEFAULT NULL;
```

`dispositivo` ya existe con la etiqueta legible. Los scripts los escribiría
aditivos e idempotentes, como los dos anteriores, y `createSession` ya tiene el
patrón de degradar al camino viejo si la migración aún no está aplicada, para
que el orden de despliegue no importe.

## Decisión pendiente

Tres opciones, y la recomendación es la primera:

1. **Renovación transparente + deslizante de 90 días + atado al secreto.**
   El usuario no ve el login durante meses; un dispositivo abandonado se
   caduca; un teléfono perdido pierde su acceso al segundo. Es el equilibrio
   correcto.
2. **Solo renovar la implementación actual (12 h / 30 días).** Menos código y
   ningún riesgo nuevo, pero el trabajador tiene que volver a entrar cada mes.
3. **Ventana muy larga sin atado al dispositivo.** No lo recomiendo: un
   teléfono desbloqueado sería una sesión abierta indefinida.
