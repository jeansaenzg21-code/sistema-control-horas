'use client'

import { useRouter } from 'next/navigation'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { ActivityWidget, WidgetProvider } from 'paredes-cano-shared'

export function ActivityWidgetWrapper() {
  const { actividadActual, pausarActividad, reanudarActividad, finalizarActividad, tiempoPausaMs } =
    useActividad()
  const { usuario } = useAuth()
  const router = useRouter()

  return (
    <WidgetProvider
      value={{
        actividadActual,
        usuario: usuario
          ? { id: usuario.id, nombre: usuario.nombre, usuario: usuario.usuario, rol: usuario.rol }
          : null,
        tiempoPausaMs,
        pausarActividad,
        reanudarActividad,
        finalizarActividad,
      }}
    >
      <ActivityWidget onNavigate={(path) => router.push(path)} />
    </WidgetProvider>
  )
}
