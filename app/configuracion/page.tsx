'use client'

import { useState, useEffect } from 'react'
import { Building2, Globe, ListChecks, Monitor, ShieldCheck, User, UserRound, Users, Eye } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { SettingsAreas } from '@/components/settings-areas'
import { SettingsActividades } from '@/components/settings-actividades'
import { SettingsCompany } from '@/components/settings-company'
import { SettingsWidget } from '@/components/settings-widget'
import { SettingsAdmins } from '@/components/settings-admins'
import { SettingsJefes } from '@/components/settings-jefes'
import { SettingsSocios } from '@/components/settings-socios'
import { SettingsUsuariosArea } from '@/components/settings-usuarios-area'
import { SettingsProfile } from '@/components/settings-profile'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

type Pestana = 'areas' | 'actividades' | 'empresa' | 'widget' | 'admins' | 'jefes' | 'socios' | 'mi_area' | 'perfil'

export default function Configuracion() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const esJefeArea = usuario?.rol === 'jefe_area'
  const esSocio = usuario?.rol === 'socio'
  const [pestana, setPestana] = useState<Pestana>('widget')

  useEffect(() => {
    if (usuario) {
      setPestana(esAdmin || esSocio ? 'areas' : esJefeArea ? 'mi_area' : 'perfil')
    }
  }, [usuario, esAdmin, esJefeArea, esSocio])

  // El socio ve las mismas pestañas que el administrador, pero en modo lectura.
  const pestanas: { id: Pestana; etiqueta: string; icono: React.ReactNode }[] = esAdmin || esSocio
    ? [
        { id: 'areas', etiqueta: 'Divisiones', icono: <Building2 size={17} /> },
        { id: 'actividades', etiqueta: 'Actividades', icono: <ListChecks size={17} /> },
        { id: 'empresa', etiqueta: 'Empresa', icono: <Globe size={17} /> },
        { id: 'admins', etiqueta: 'Administradores', icono: <ShieldCheck size={17} /> },
        { id: 'jefes', etiqueta: 'Jefes de área', icono: <UserRound size={17} /> },
        { id: 'socios', etiqueta: 'Socios', icono: <Eye size={17} /> },
      ]
    : esJefeArea
      ? [
          { id: 'mi_area', etiqueta: 'Usuarios de mi área', icono: <Users size={17} /> },
          { id: 'perfil', etiqueta: 'Mi perfil', icono: <User size={17} /> },
          { id: 'widget', etiqueta: 'Widget de escritorio', icono: <Monitor size={17} /> },
        ]
      : esSocio
        ? [
            { id: 'perfil', etiqueta: 'Mi perfil', icono: <User size={17} /> },
          ]
        : [
            { id: 'perfil', etiqueta: 'Mi perfil', icono: <User size={17} /> },
            { id: 'widget', etiqueta: 'Widget de escritorio', icono: <Monitor size={17} /> },
          ]

  return (
    <MainLayout title="Configuración" subtitle={esAdmin ? 'Administra las divisiones, empresa y usuarios de tu consultoría' : esJefeArea ? 'Administra los usuarios y datos de tu área' : esSocio ? 'Configuración de la empresa (solo lectura)' : 'Administra tu perfil y widget de escritorio'}>
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Apariencia</p>
            <p className="text-xs text-muted-foreground">Cambia entre tema claro y oscuro.</p>
          </div>
          <ThemeToggle />
        </div>
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

        {esSocio && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Perfil de socio: ves la misma configuración que el administrador, pero en solo lectura.
          </p>
        )}

        <fieldset className="contents" disabled={esSocio}>
          {pestana === 'areas' && <SettingsAreas />}
          {pestana === 'actividades' && <SettingsActividades />}
          {pestana === 'empresa' && <SettingsCompany />}
          {pestana === 'admins' && <SettingsAdmins />}
          {pestana === 'jefes' && <SettingsJefes />}
          {pestana === 'socios' && <SettingsSocios />}
          {pestana === 'mi_area' && <SettingsUsuariosArea />}
          {pestana === 'perfil' && <SettingsProfile />}
          {pestana === 'widget' && <SettingsWidget />}
        </fieldset>
      </div>
    </MainLayout>
  )
}
