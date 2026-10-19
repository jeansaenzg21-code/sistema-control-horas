'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { SettingsClients } from '@/components/settings-clients'
import { ClientesAdmin } from '@/components/clientes-admin'
import { useAuth } from '@/lib/auth-context'

const TITULO_CARPETA = 'Cartera de clientes'
const SUBTITULO_CARPETA = 'Presupuestos, bolsas de horas y desviaciones desde una sola vista.'

export default function ClientesPage() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  // La cabecera la fija la vista, no esta pagina: al abrir un cliente el titulo
  // tiene que cambiar, y la cabecera es el sitio natural para ese titulo en vez
  // de repetirlo dentro del contenido.
  const [cabecera, setCabecera] = useState({ titulo: TITULO_CARPETA, subtitulo: SUBTITULO_CARPETA })
  const cambiarCabecera = useCallback((titulo: string, subtitulo: string) => {
    setCabecera((actual) => (actual.titulo === titulo && actual.subtitulo === subtitulo ? actual : { titulo, subtitulo }))
  }, [])

  useEffect(() => {
    if (!cargando && usuario?.rol !== 'admin' && usuario?.rol !== 'jefe_area' && usuario?.rol !== 'socio') router.replace('/')
  }, [cargando, usuario, router])

  if (cargando || !usuario || (usuario.rol !== 'admin' && usuario.rol !== 'jefe_area' && usuario.rol !== 'socio')) return null

  return (
    <MainLayout title={cabecera.titulo} subtitle={cabecera.subtitulo} ancho="ancho">
      {usuario?.rol === 'admin' || usuario?.rol === 'socio' ? <ClientesAdmin onCabecera={cambiarCabecera} /> : <SettingsClients onCabecera={cambiarCabecera} />}
    </MainLayout>
  )
}
