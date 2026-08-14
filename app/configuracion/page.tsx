'use client'

import { useState } from 'react'
import { Building2, Globe } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { SettingsAreas } from '@/components/settings-areas'
import { SettingsCompany } from '@/components/settings-company'
import { SettingsAlerts } from '@/components/settings-alerts'
import { cn } from '@/lib/utils'

type Pestana = 'areas' | 'empresa'

export default function Configuracion() {
  const [pestana, setPestana] = useState<Pestana>('areas')

  const pestanas: { id: Pestana; etiqueta: string; icono: React.ReactNode }[] = [
    { id: 'areas', etiqueta: 'Áreas', icono: <Building2 size={17} /> },
    { id: 'empresa', etiqueta: 'Empresa', icono: <Globe size={17} /> },
  ]

  return (
    <MainLayout title="Configuración" subtitle="Administra las áreas y la información de tu consultoría">
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

        {pestana === 'areas' ? <SettingsAreas /> : <SettingsCompany />}

        <SettingsAlerts />
      </div>
    </MainLayout>
  )
}
