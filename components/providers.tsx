'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth-context'
import { AreasProvider } from '@/lib/areas-context'
import { ClientesProvider } from '@/lib/clientes-context'
import { ActivityProvider } from '@/lib/actividad-context'
import { NotificacionesProvider } from '@/lib/notificaciones-context'
import { ToastProvider } from '@/components/ui/toast'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AreasProvider>
          <ClientesProvider>
            <NotificacionesProvider>
            <ActivityProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </ActivityProvider>
            </NotificacionesProvider>
          </ClientesProvider>
        </AreasProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
