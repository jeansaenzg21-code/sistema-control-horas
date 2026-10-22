'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Play } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { useCatalogosActividad } from '@/lib/use-catalogos-actividad'
import { ProgresoServicio } from './servicio-progreso'

export function ActivityForm() {
  const { iniciarActividad } = useActividad()
  const { usuario } = useAuth()
  const [tipoActividadId, setTipoActividadId] = useState<number | ''>('')
  const [clienteId, setClienteId] = useState<number | ''>('')
  const [servicioId, setServicioId] = useState<number | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [cargando, setCargando] = useState(false)
  const { tiposDisponibles, servicios, cargandoServicios, sinAsignaciones, clientesVisibles } =
    useCatalogosActividad(clienteId)

  // Cambiar de cliente invalida el servicio: el anterior pertenece a las bolsas de
  // otro cliente y el servidor lo rechaza. Se limpia aqui para no dejar seleccionado
  // un valor que ya no existe en la lista.
  useEffect(() => {
    setServicioId('')
  }, [clienteId])

  const servicioElegido = useMemo(
    () => servicios.find((servicio) => servicio.id === Number(servicioId)) ?? null,
    [servicios, servicioId],
  )

  const puedeEnviar = tipoActividadId !== '' && !cargando

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeEnviar || !usuario) return
    setCargando(true)
    const resultado = await iniciarActividad({
      usuario_id: usuario.id,
      tipo_actividad_id: tipoActividadId as number,
      cliente_id: clienteId ? Number(clienteId) : null,
      presupuesto_servicio_id: servicioId ? Number(servicioId) : null,
      descripcion: descripcion.trim(),
    })
    setCargando(false)
    if (resultado.ok) {
      setTipoActividadId('')
      setClienteId('')
      setServicioId('')
      setDescripcion('')
    }
  }

  return (
    <form onSubmit={manejarEnvio} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Tipo de actividad
          </label>
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

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Cargo</label>
          <input
            type="text"
            value={usuario?.cargo || '—'}
            disabled
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      {servicioElegido && <ProgresoServicio servicio={servicioElegido} />}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Describe los detalles de la actividad..."
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          La fecha y hora se registran automáticamente. Solo puede existir una actividad activa.
        </p>
        <button
          type="submit"
          disabled={!puedeEnviar}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#7c3aed]/15 transition-all hover:bg-[#6d28d9] hover:shadow-lg hover:shadow-[#7c3aed]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[172px]"
        >
          {cargando ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Play size={16} />
          )}
          {cargando ? 'Iniciando...' : 'Iniciar actividad'}
        </button>
      </div>
    </form>
  )
}

