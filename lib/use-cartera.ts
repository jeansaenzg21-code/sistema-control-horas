'use client'

import { useQuery } from '@tanstack/react-query'
import type { AlertaCartera, ClienteCartera } from '@/components/cartera-ui'
import { opcionesApi } from '@/lib/api-cliente'
import { useAuth } from '@/lib/auth-context'

type Cartera = {
  clientes: ClienteCartera[]
  totales: { clientes: number; contratadas: number; consumidas: number; disponibles: number; excedidas: number; porAprobar: number }
  alertas: AlertaCartera[]
}

export function useCartera() {
  const { usuario, empresaActiva } = useAuth()
  return useQuery({
    queryKey: ['cartera-clientes', empresaActiva?.id, usuario?.id],
    enabled: Boolean(empresaActiva && usuario),
    queryFn: async ({ signal }) => {
      const respuesta = await fetch('/api/clientes/cartera', { ...opcionesApi(), signal })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se pudo cargar la cartera.')
      return cuerpo as Cartera
    },
  })
}
