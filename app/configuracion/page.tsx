'use client'

import { useState, useEffect } from 'react'
import { Building2, Globe, Monitor, ShieldCheck, User, UserRound, Users } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { SettingsAreas } from '@/components/settings-areas'
import { SettingsCompany } from '@/components/settings-company'
import { SettingsWidget } from '@/components/settings-widget'
import { SettingsAdmins } from '@/components/settings-admins'
import { SettingsJefes } from '@/components/settings-jefes'
import { SettingsUsuariosArea } from '@/components/settings-usuarios-area'
import { SettingsProfile } from '@/components/settings-profile'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

type Pestana = 'areas' | 'empresa' | 'widget' | 'admins' | 'jefes' | 'mi_area' | 'perfil'

export default function Configuracion() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const esJefeArea = usuario?.rol === 'jefe_area'
  const [pestana, setPestana] = useState<Pestana>('widget')

  useEffect(() => {
    if (usuario) {
      setPestana(esAdmin ? 'areas' : esJefeArea ? 'mi_area' : 'perfil')
    }
  }, [usuario, esAdmin, esJefeArea])

  const pestanas: { id: Pestana; etiqueta: string; icono: React.ReactNode }[] = esAdmin
    ? [
        { id: 'areas', etiqueta: 'Divisiones', icono: <Building2 size={17} /> },
        { id: 'empresa', etiqueta: 'Empresa', icono: <Globe size={17} /> },
        { id: 'admins', etiqueta: 'Administradores', icono: <ShieldCheck size={17} /> },
        { id: 'jefes', etiqueta: 'Jefes de área', icono: <UserRound size={17} /> },
      ]
    : esJefeArea
      ? [
          { id: 'mi_area', etiqueta: 'Usuarios de mi área', icono: <Users size={17} /> },
          { id: 'perfil', etiqueta: 'Mi perfil', icono: <User size={17} /> },
          { id: 'widget', etiqueta: 'Widget de escritorio', icono: <Monitor size={17} /> },
        ]
      : [
          { id: 'perfil', etiqueta: 'Mi perfil', icono: <User size={17} /> },
          { id: 'widget', etiqueta: 'Widget de escritorio', icono: <Monitor size={17} /> },
        ]

  return (
    <MainLayout title="Configuración" subtitle={esAdmin ? 'Administra las divisiones, empresa y usuarios de tu consultoría' : esJefeArea ? 'Administra los usuarios y datos de tu área' : 'Administra tu perfil y widget de escritorio'}>
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
        {pestana === 'empresa' && <SettingsCompany />}
        {pestana === 'admins' && <SettingsAdmins />}
        {pestana === 'jefes' && <SettingsJefes />}
        {pestana === 'mi_area' && <SettingsUsuariosArea />}
        {pestana === 'perfil' && <SettingsProfile />}
        {pestana === 'widget' && <SettingsWidget />}
      </div>
    </MainLayout>
  )
}
