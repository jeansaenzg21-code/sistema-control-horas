'use client'

import { useState, useEffect } from 'react'
import { Building2, Globe, Monitor, ShieldCheck, User, Users } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { SettingsAreas } from '@/components/settings-areas'
import { SettingsCompany } from '@/components/settings-company'
import { SettingsWidget } from '@/components/settings-widget'
import { SettingsAdmins } from '@/components/settings-admins'
import { SettingsProfile } from '@/components/settings-profile'
import { SettingsClients } from '@/components/settings-clients'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

type Pestana = 'areas' | 'empresa' | 'widget' | 'admins' | 'perfil' | 'clientes'

export default function Configuracion() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const [pestana, setPestana] = useState<Pestana>('widget')

  useEffect(() => {
    if (usuario) {
      setPestana(esAdmin ? 'areas' : 'perfil')
    }
  }, [usuario, esAdmin])

  const pestanas: { id: Pestana; etiqueta: string; icono: React.ReactNode }[] = esAdmin
    ? [
        { id: 'areas', etiqueta: 'Áreas', icono: <Building2 size={17} /> },
        { id: 'clientes', etiqueta: 'Clientes', icono: <Users size={17} /> },
        { id: 'empresa', etiqueta: 'Empresa', icono: <Globe size={17} /> },
        { id: 'admins', etiqueta: 'Administradores', icono: <ShieldCheck size={17} /> },
      ]
    : [
        { id: 'perfil', etiqueta: 'Mi perfil', icono: <User size={17} /> },
        { id: 'widget', etiqueta: 'Widget de escritorio', icono: <Monitor size={17} /> },
      ]

  return (
    <MainLayout title="Configuración" subtitle="Administra las áreas, empresa y widget de tu consultoría">
      <div className="space-y-5">
        <div className="flex gap-1 border-b border-border">
          {pestanas.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors',
                pestana === p.id
                  ? 'border-[#7c3aed] text-[#c4b5fd]'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {p.icono}
              {p.etiqueta}
            </button>
          ))}
        </div>

        {pestana === 'areas' && <SettingsAreas />}
        {pestana === 'clientes' && <SettingsClients />}
        {pestana === 'empresa' && <SettingsCompany />}
        {pestana === 'admins' && <SettingsAdmins />}
        {pestana === 'perfil' && <SettingsProfile />}
        {pestana === 'widget' && <SettingsWidget />}
      </div>
    </MainLayout>
  )
}
