'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { ExcepcionesAdmin } from '@/components/excepciones-admin'
import { useAuth } from '@/lib/auth-context'

export default function CumplimientoExcepciones() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  const autorizado = usuario?.rol === 'admin' || usuario?.rol === 'socio' || (usuario?.rol === 'jefe_area' && usuario.area_id != null)
  useEffect(() => {
    if (!cargando && !autorizado) router.replace('/cumplimiento')
  }, [cargando, autorizado, router])

  if (cargando || !autorizado) return null

  return <ExcepcionesAdmin />
}
