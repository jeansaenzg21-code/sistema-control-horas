'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { ExcepcionesAdmin } from '@/components/excepciones-admin'
import { useAuth } from '@/lib/auth-context'

export default function CumplimientoExcepciones() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  // Las excepciones son de administración: el socio no entra ni por URL.
  useEffect(() => {
    if (!cargando && usuario?.rol === 'socio') router.replace('/cumplimiento')
  }, [cargando, usuario, router])

  if (cargando || !usuario || usuario.rol === 'socio') return null

  return <ExcepcionesAdmin />
}
