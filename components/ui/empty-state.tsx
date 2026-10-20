import { ReactNode } from 'react'

export function EmptyState({ titulo, descripcion, accion }: { titulo: string; descripcion?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      {descripcion && <p className="max-w-sm text-xs text-muted-foreground">{descripcion}</p>}
      {accion}
    </div>
  )
}