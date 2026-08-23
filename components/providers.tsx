'use client'

import { AuthProvider } from '@/lib/auth-context'
import { AreasProvider } from '@/lib/areas-context'
import { ClientesProvider } from '@/lib/clientes-context'
import { ActivityProvider } from '@/lib/actividad-context'
import { NotificacionesProvider } from '@/lib/notificaciones-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AreasProvider>
        <ClientesProvider>
          <NotificacionesProvider>
            <ActivityProvider>
              {children}
            </ActivityProvider>
          </NotificacionesProvider>
        </ClientesProvider>
      </AreasProvider>
    </AuthProvider>
  )
}
