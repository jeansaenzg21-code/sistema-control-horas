'use client'

import { useState } from 'react'
import { ChevronDown, Play } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'

const TIPOS_ACTIVIDAD = [
  'Redacción de contrato',
  'Revisión de documentación',
  'Consultoría legal',
  'Reunión con cliente',
  'Investigación legal',
  'Redacción de escritos',
  'Seguimiento de caso',
]

export function ActivityForm() {
  const { iniciarActividad } = useActividad()
  const { usuario } = useAuth()
  const [tipoActividad, setTipoActividad] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cargando, setCargando] = useState(false)

  const especialidad = usuario?.especialidad || 'Corporativo'
  const areaId = usuario?.areaId ?? null
  const puedeEnviar = tipoActividad.trim() !== '' && descripcion.trim() !== '' && !cargando

  const manejarEnvio = (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeEnviar) return
    setCargando(true)
    // Simula la llamada al backend antes de iniciar
    window.setTimeout(() => {
      iniciarActividad({
        titulo: descripcion.trim(),
        tipo: tipoActividad,
        especialidad,
        areaId,
        usuarioId: usuario?.id,
        usuarioNombre: usuario?.nombre,
      })
      setCargando(false)
      setTipoActividad('')
      setDescripcion('')
    }, 400)
  }

  return (
    <form onSubmit={manejarEnvio} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Tipo de actividad
          </label>
          <div className="relative">
            <select
              value={tipoActividad}
              onChange={(e) => setTipoActividad(e.target.value)}
              required
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
            >
              <option value="">Selecciona un tipo...</option>
              {TIPOS_ACTIVIDAD.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
            <ChevronDown
              size={17}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Especialidad</label>
          <input
            type="text"
            value={especialidad}
            disabled
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          required
          rows={2}
          placeholder="Describe los detalles de la actividad..."
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
        />
      </div>

      <button
        type="submit"
        disabled={!puedeEnviar}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cargando ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <Play size={16} />
        )}
        {cargando ? 'Iniciando...' : 'Iniciar actividad'}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Al iniciar se registrará automáticamente la fecha y la hora de inicio. Solo puede existir
        una actividad activa a la vez.
      </p>
    </form>
  )
}