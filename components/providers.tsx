'use client'

import { AuthProvider } from '@/lib/auth-context'
import { AreasProvider } from '@/lib/areas-context'
import { ActivityProvider } from '@/lib/actividad-context'
import { NotificacionesProvider } from '@/lib/notificaciones-context'
import { ActivityAlert } from './activity-alert'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AreasProvider>
        <NotificacionesProvider>
          <ActivityProvider>
            {children}
            <ActivityAlert />
          </ActivityProvider>
        </NotificacionesProvider>
      </AreasProvider>
    </AuthProvider>
  )
}
