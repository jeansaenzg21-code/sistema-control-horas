'use client'

import { useAuth } from '@/lib/auth-context'
import { SettingsUsers } from './settings-users'

export function SettingsUsuariosArea() {
  const { usuario } = useAuth()
  const areaId = usuario?.area_id

  if (areaId == null) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No tienes una división asignada.
      </div>
    )
  }

  return <SettingsUsers areaId={areaId} />
}
