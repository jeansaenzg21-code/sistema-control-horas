'use client'

import { UsersRound } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useAreas } from '@/lib/areas-context'
import { SettingsUsers } from './settings-users'

export function SettingsUsuariosArea() {
  const { usuario } = useAuth()
  const { areas } = useAreas()
  const area = usuario?.area_id ? areas.find((item) => item.id === usuario.area_id) : null

  if (!area) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No tienes una división asignada.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#7c3aed]/15">
            <UsersRound size={20} className="text-[#c4b5fd]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Usuarios de {area.nombre}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Administra únicamente los colaboradores de tu área.</p>
          </div>
        </div>
      </div>
      <SettingsUsers areaId={area.id} />
    </div>
  )
}
