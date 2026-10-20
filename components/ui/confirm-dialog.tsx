'use client'

import { useEffect } from 'react'

export function ConfirmDialog({
  abierto,
  titulo,
  descripcion,
  onConfirmar,
  onCancelar,
  confirmarTexto = 'Confirmar',
}: {
  abierto: boolean
  titulo: string
  descripcion?: string
  onConfirmar: () => void
  onCancelar: () => void
  confirmarTexto?: string
}) {
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto, onCancelar])

  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        {descripcion && <p className="mt-1 text-xs text-muted-foreground">{descripcion}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted">
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90">
            {confirmarTexto}
          </button>
        </div>
      </div>
    </div>
  )
}