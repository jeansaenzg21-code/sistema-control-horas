const ICONO = '/icon.svg'
const ETIQUETA_NOTIFICACION = 'pc-alerta-actividad'

export function notificacionesDisponibles(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function solicitarPermisoNotificaciones() {
  if (!notificacionesDisponibles()) return
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {
      /* permiso denegado: el overlay sigue funcionando */
    })
  }
}

export function notificar(titulo: string, cuerpo: string) {
  if (!notificacionesDisponibles()) return
  if (Notification.permission !== 'granted') return

  try {
    const notificacion = new Notification(titulo, {
      body: cuerpo,
      icon: ICONO,
      tag: ETIQUETA_NOTIFICACION,
    })
    notificacion.onclick = () => {
      window.focus()
      notificacion.close()
    }
  } catch {
    /* algunos navegadores requieren el service worker; el overlay sigue funcionando */
  }
}
