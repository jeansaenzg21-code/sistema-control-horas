'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Plus } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { useCatalogosActividad } from '@/lib/use-catalogos-actividad'
import { cn, fechaLocalISO } from '@/lib/utils'
import { ProgresoServicio } from './servicio-progreso'

/**
 * Registro de un bloque de trabajo ya terminado.
 *
 * Es la vía práctica para anotar la jornada al final del día sin cronómetro:
 * se indica la hora de entrada, la de salida y el servicio, y el bloque nace
 * cerrado (pendiente de aprobación). Se puede usar aunque haya otra actividad
 * en curso y admite varios bloques para el mismo día.
 */
export function RegistroDiaForm() {
  const { iniciarActividad } = useActividad()
  const { usuario } = useAuth()
  const [fecha, setFecha] = useState('')
  const [hoy, setHoy] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [tipoActividadId, setTipoActividadId] = useState<number | ''>('')
  const [clienteId, setClienteId] = useState<number | ''>('')
  const [servicioId, setServicioId] = useState<number | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const { tiposDisponibles, servicios, cargandoServicios, sinAsignaciones, clientesVisibles } =
    useCatalogosActividad(clienteId)

  useEffect(() => {
    const actual = fechaLocalISO(new Date())
    setHoy(actual)
    setFecha(actual)
  }, [])

  useEffect(() => {
    setServicioId('')
  }, [clienteId])

  const minutos = useMemo(() => {
    if (!horaInicio || !horaFin) return null
    const [hi, mi] = horaInicio.split(':').map(Number)
    const [hf, mf] = horaFin.split(':').map(Number)
    const total = hf * 60 + mf - (hi * 60 + mi)
    return Number.isFinite(total) ? total : null
  }, [horaInicio, horaFin])

  const duracion = useMemo(() => {
    if (minutos == null || minutos <= 0) return null
    const h = Math.floor(minutos / 60)
    const m = minutos % 60
    return m === 0 ? `${h}h` : `${h}h ${m}min`
  }, [minutos])

  const servicioElegido = useMemo(
    () => servicios.find((servicio) => servicio.id === Number(servicioId)) ?? null,
    [servicios, servicioId],
  )

  // La hora de fin nunca puede ser anterior (ni igual) a la de inicio.
  const finInvalido = horaInicio !== '' && horaFin !== '' && minutos !== null && minutos <= 0

  const puedeEnviar =
    tipoActividadId !== '' && fecha !== '' && horaInicio !== '' && horaFin !== '' && !finInvalido && !cargando

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuario) return
    setMensaje(null)

    if (minutos == null || minutos <= 0) {
      setMensaje({ tipo: 'error', texto: 'La hora de fin no puede ser anterior a la hora de inicio.' })
      return
    }

    const inicio = new Date(`${fecha}T${horaInicio}:00`).toISOString()
    const fin = new Date(`${fecha}T${horaFin}:00`).toISOString()

    setCargando(true)
    const resultado = await iniciarActividad({
      usuario_id: usuario.id,
      tipo_actividad_id: tipoActividadId as number,
      cliente_id: clienteId ? Number(clienteId) : null,
      presupuesto_servicio_id: servicioId ? Number(servicioId) : null,
      descripcion: descripcion.trim(),
      inicio,
      fin,
    })
    setCargando(false)

    if (!resultado.ok) {
      setMensaje({ tipo: 'error', texto: resultado.error || 'No se pudo registrar el bloque.' })
      return
    }

    setHoraInicio('')
    setHoraFin('')
    setServicioId('')
    setDescripcion('')
    setMensaje({ tipo: 'ok', texto: `Bloque registrado (${duracion ?? 'horas'}). Queda pendiente de aprobación.` })
  }

  return (
    <form onSubmit={manejarEnvio} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Fecha</label>
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Hora de inicio</label>
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            required
            className="w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Hora de fin</label>
          <input
            type="time"
            value={horaFin}
            min={horaInicio || undefined}
            onChange={(e) => setHoraFin(e.target.value)}
            required
            aria-invalid={finInvalido}
            className={cn(
              'w-full cursor-pointer rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 hover:border-[#7c3aed]/50',
              finInvalido
                ? 'border-rose-500/60 focus:ring-rose-500/40'
                : 'border-border focus:ring-[#7c3aed]/50',
            )}
          />
          {finInvalido && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-rose-300">
              La hora de fin no puede ser anterior a la hora de inicio.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Tipo de actividad</label>
          <div className="relative">
            <select
              value={tipoActividadId}
              onChange={(e) => setTipoActividadId(e.target.value ? Number(e.target.value) : '')}
              required
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
            >
              <option value="">Selecciona un tipo...</option>
              {tiposDisponibles.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.codigo ? `${tipo.codigo} · ${tipo.nombre}` : tipo.nombre}
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
          <label className="mb-1.5 block text-sm font-medium text-foreground">Cliente</label>
          <div className="relative">
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
            >
              <option value="">Sin cliente (opcional)</option>
              {clientesVisibles.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
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
          <label className="mb-1.5 block text-sm font-medium text-foreground">Servicio</label>
          <div className="relative">
            <select
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value ? Number(e.target.value) : '')}
              disabled={!clienteId || cargandoServicios || sinAsignaciones}
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!clienteId ? (
                <option value="">Elige primero un cliente</option>
              ) : cargandoServicios ? (
                <option value="">Cargando servicios...</option>
              ) : sinAsignaciones ? (
                <option value="">Sin servicios asignados</option>
              ) : (
                <option value="">Sin servicio (opcional)</option>
              )}
              {servicios.map((servicio) => (
                <option key={servicio.id} value={servicio.id}>
                  {servicio.nombre} ({Number(servicio.horas).toFixed(0)} h)
                </option>
              ))}
            </select>
            <ChevronDown
              size={17}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
          {sinAsignaciones && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-300">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                Este cliente tiene bolsas activas, pero no tienes horas asignadas en ninguna. Pídele a tu
                jefe de área que te las reparta para que puedas imputar contra un servicio.
              </span>
            </p>
          )}
        </div>
      </div>

      {servicioElegido && (
        <ProgresoServicio
          servicio={servicioElegido}
          minutosPrevistos={minutos != null && minutos > 0 ? minutos : null}
        />
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Describe brevemente el trabajo realizado..."
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
        />
      </div>

      {mensaje && (
        <div
          className={
            mensaje.tipo === 'ok'
              ? 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300'
              : 'rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300'
          }
        >
          {mensaje.texto}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock size={14} />
          {duracion ? (
            <>
              Duración del bloque: <span className="font-semibold text-foreground">{duracion}</span>
            </>
          ) : (
            'Indica la hora de entrada y de salida del bloque.'
          )}
        </p>
        <button
          type="submit"
          disabled={!puedeEnviar}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#7c3aed]/15 transition-all hover:bg-[#6d28d9] hover:shadow-lg hover:shadow-[#7c3aed]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[172px]"
        >
          {cargando ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Plus size={16} />
          )}
          {cargando ? 'Registrando...' : 'Registrar bloque'}
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400" />
        <span>
          Puedes añadir varios bloques para el mismo día. Cada bloque queda pendiente de aprobación y no
          reemplaza la actividad que tengas en curso.
        </span>
      </p>
    </form>
  )
}
