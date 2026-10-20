'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { NOMBRES_DIAS } from '@/lib/dias'
import { opcionesApi } from '@/lib/api-cliente'

interface Props {
  usuario: { id: number; nombre: string }
  onClose: () => void
}

interface DiaHorario {
  activo: boolean
  hora_inicio: string
  hora_fin: string
}

const estiloCampo =
  'h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/40 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer'

export function SettingsHorario({ usuario, onClose }: Props) {
  const [dias, setDias] = useState<Record<number, DiaHorario>>({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const iniciales = useCallback((): Record<number, DiaHorario> => {
    const base: Record<number, DiaHorario> = {}
    for (const d of NOMBRES_DIAS) {
      base[d.dia_semana] = { activo: false, hora_inicio: '08:00', hora_fin: '17:00' }
    }
    return base
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    setMensaje(null)
    const base = iniciales()
    try {
      const res = await fetch(`/api/horarios?usuario_id=${usuario.id}`, opcionesApi())
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMensaje({ tipo: 'error', texto: data.error || 'No se pudo cargar el horario.' })
        setDias(base)
        return
      }
      const filas = (await res.json()) as Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }>
      for (const f of filas) {
        if (base[f.dia_semana]) {
          base[f.dia_semana] = {
            activo: true,
            hora_inicio: f.hora_inicio.slice(0, 5),
            hora_fin: f.hora_fin.slice(0, 5),
          }
        }
      }
      setDias(base)
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al cargar el horario.' })
      setDias(base)
    } finally {
      setCargando(false)
    }
  }, [usuario.id, iniciales])

  useEffect(() => {
    cargar()
  }, [cargar])

  const guardar = async () => {
    const aEnviar = []
    for (const d of NOMBRES_DIAS) {
      const dia = dias[d.dia_semana]
      if (dia && dia.activo) {
        if (!dia.hora_inicio || !dia.hora_fin) {
          setMensaje({ tipo: 'error', texto: `${d.nombre}: indica la hora de entrada y salida.` })
          return
        }
        const inicio = dia.hora_inicio
        const fin = dia.hora_fin
        const iniMin = Number(inicio.split(':')[0]) * 60 + Number(inicio.split(':')[1])
        const finMin = Number(fin.split(':')[0]) * 60 + Number(fin.split(':')[1])
        if (finMin <= iniMin) {
          setMensaje({ tipo: 'error', texto: `${d.nombre}: la salida debe ser mayor a la entrada.` })
          return
        }
        aEnviar.push({ dia_semana: d.dia_semana, hora_inicio: inicio, hora_fin: fin })
      }
    }

    setGuardando(true)
    setMensaje(null)
    try {
      const res = await fetch('/api/horarios', opcionesApi({
        method: 'PUT',
        body: { usuario_id: usuario.id, dias: aEnviar },
      }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.error || 'No se pudo guardar el horario.' })
        return
      }
      setMensaje({ tipo: 'ok', texto: 'Horario guardado correctamente.' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al guardar.' })
    } finally {
      setGuardando(false)
    }
  }

  const toggle = (diaSemana: number) => {
    setDias((prev) => {
      const actual = prev[diaSemana] ?? { activo: false, hora_inicio: '08:00', hora_fin: '17:00' }
      return { ...prev, [diaSemana]: { ...actual, activo: !actual.activo } }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Horario de trabajo</h2>
            <p className="text-xs text-muted-foreground">{usuario.nombre}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {cargando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando horario...</p>
          ) : (
            <div className="space-y-1.5">
              {NOMBRES_DIAS.map((d) => {
                const dia = dias[d.dia_semana] ?? { activo: false, hora_inicio: '08:00', hora_fin: '17:00' }
                return (
                  <div key={d.dia_semana} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <label className="flex w-24 cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={dia.activo}
                        onChange={() => toggle(d.dia_semana)}
                        className="h-4 w-4 accent-[#7c3aed]"
                      />
                      {d.nombre}
                    </label>
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        type="time"
                        value={dia.hora_inicio}
                        disabled={!dia.activo}
                        onChange={(e) =>
                          setDias((prev) => ({ ...prev, [d.dia_semana]: { ...prev[d.dia_semana], hora_inicio: e.target.value } }))
                        }
                        className={estiloCampo}
                      />
                      <span className="text-xs text-muted-foreground">a</span>
                      <input
                        type="time"
                        value={dia.hora_fin}
                        disabled={!dia.activo}
                        onChange={(e) =>
                          setDias((prev) => ({ ...prev, [d.dia_semana]: { ...prev[d.dia_semana], hora_fin: e.target.value } }))
                        }
                        className={estiloCampo}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {mensaje && (
            <div
              className={`mt-3 rounded-md px-3 py-1.5 text-[11px] ${
                mensaje.tipo === 'ok'
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border border-rose-500/30 bg-rose-500/10 text-rose-400'
              }`}
            >
              {mensaje.texto}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button
            onClick={guardar}
            disabled={guardando || cargando}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            Guardar horario
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}