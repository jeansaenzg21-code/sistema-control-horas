# Escalado

`lib/events.ts` mantiene los listeners de SSE en la memoria del proceso. Eso
significa que las notificaciones en tiempo real solo funcionan cuando hay una
unica instancia del servidor: con mas de una instancia, un cliente conectado a
una instancia no recibe los eventos emitidos por otra.

Interfaz preparada para cambiar a Redis en el futuro: la emision y suscripcion
pasan por funciones centralizadas, de modo que se puede sustituir el bus en
memoria por un adaptador de Redis (pub/sub) sin tocar los consumidores.

No se implementa Redis todavia. Limitacion conocida hasta entonces: una sola
instancia por despliegue.