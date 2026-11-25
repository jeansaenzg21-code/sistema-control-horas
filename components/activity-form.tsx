'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Play, Save } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { useCatalogosActividad } from '@/lib/use-catalogos-actividad'
import { ProgresoServicio } from './servicio-progreso'
import { ClienteSearch } from './cliente-search'

export function ActivityForm() {
  const { iniciarActividad, enRefrigerio } = useActividad()
  const { usuario, empresaActiva } = useAuth()
  const claveBorrador = usuario && empresaActiva ? 'pc_actividad_borrador:' + empresaActiva.id + ':' + usuario.id : null
  const [tipoActividadId, setTipoActividadId] = useState<number | ''>('')
  const [clienteId, setClienteId] = useState<number | ''>('')
  const [servicioId, setServicioId] = useState<number | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [facturable, setFacturable] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [avisoBorrador, setAvisoBorrador] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { tiposDisponibles, servicios, cargandoServicios, sinAsignaciones, clientesVisibles } =
    useCatalogosActividad(clienteId)

  // Cambiar de cliente invalida el servicio: el anterior pertenece a las bolsas de
  // otro cliente y el servidor lo rechaza. Se limpia aqui para no dejar seleccionado
  // un valor que ya no existe en la lista.
  const cambiarCliente = (id: number | '') => {
    setClienteId(id)
    setServicioId('')
  }

  useEffect(() => {
    if (!claveBorrador) return
    try {
      const borrador = JSON.parse(sessionStorage.getItem(claveBorrador) ?? 'null')
      if (!borrador) return
      setTipoActividadId(typeof borrador.tipoActividadId === 'number' ? borrador.tipoActividadId : '')
      setClienteId(typeof borrador.clienteId === 'number' ? borrador.clienteId : '')
      setServicioId(typeof borrador.servicioId === 'number' ? borrador.servicioId : '')
      setDescripcion(typeof borrador.descripcion === 'string' ? borrador.descripcion : '')
      setFacturable(borrador.facturable === true)
    } catch {
      setAvisoBorrador('No se pudo recuperar el borrador.')
    }
  }, [claveBorrador])

  const guardarBorrador = () => {
    if (!claveBorrador) return
    try {
      sessionStorage.setItem(claveBorrador, JSON.stringify({ tipoActividadId, clienteId, servicioId, descripcion, facturable }))
      setAvisoBorrador('Borrador guardado en esta pestaña.')
    } catch {
      setAvisoBorrador('No se pudo guardar el borrador.')
    }
  }

  const servicioElegido = useMemo(
    () => servicios.find((servicio) => servicio.id === Number(servicioId)) ?? null,
    [servicios, servicioId],
  )
  const clienteOutsourcing = clientesVisibles.find((cliente) => cliente.id === Number(clienteId))?.es_outsourcing
  const servicioOutsourcing = servicios.find((servicio) => servicio.nombre === 'Outsourcing contable')
  useEffect(() => {
    if (clienteOutsourcing && servicioOutsourcing) setServicioId(servicioOutsourcing.id)
  }, [clienteOutsourcing, servicioOutsourcing])

  const puedeEnviar = tipoActividadId !== '' && !cargando && !enRefrigerio

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeEnviar || !usuario) return
    setError(null)
    setCargando(true)
    const resultado = await iniciarActividad({
      usuario_id: usuario.id,
      tipo_actividad_id: tipoActividadId as number,
      cliente_id: clienteId ? Number(clienteId) : null,
      presupuesto_servicio_id: servicioId ? Number(servicioId) : null,
      descripcion: descripcion.trim(),
      facturable,
    })
    setCargando(false)
    if (!resultado.ok) {
      setError(resultado.error || 'No se pudo iniciar la actividad.')
      return
    }
    try {
      if (claveBorrador) sessionStorage.removeItem(claveBorrador)
    } catch {
      // La actividad ya se registró aunque el almacenamiento no esté disponible.
    }
    setAvisoBorrador('')
    setTipoActividadId('')
    setClienteId('')
    setServicioId('')
    setDescripcion('')
    setFacturable(false)
  }

  return (
    <form onSubmit={manejarEnvio} className="space-y-5 max-md:space-y-3">
      <div className="grid grid-cols-1 gap-4 max-md:gap-3 md:grid-cols-2 lg:grid-cols-4">
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
          <ClienteSearch clientes={clientesVisibles} value={clienteId} onChange={cambiarCliente} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Servicio</label>
          <div className="relative">
            {clienteOutsourcing ? (
              <input readOnly value={cargandoServicios ? 'Cargando servicio...' : servicioOutsourcing?.nombre ?? 'Outsourcing contable'}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground" />
            ) : <select
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
            </select>}
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
          rows={3}
          placeholder="Describe los detalles de la actividad..."
          className="min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 transition-colors hover:border-[#7c3aed]/50">
        <input
          type="checkbox"
          checked={facturable}
          onChange={(e) => setFacturable(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-none cursor-pointer accent-[#7c3aed]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">Actividad facturable</span>
          <span className="block text-xs leading-relaxed text-muted-foreground">
            Marca la casilla si las horas se pueden facturar al cliente.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {enRefrigerio ? 'Refrigerio fijo de 1:00 p. m. a 2:00 p. m. No se pueden iniciar actividades.' : 'La fecha y hora se registran automáticamente. Solo puede existir una actividad activa.'}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button type="button" data-draft-action onClick={guardarBorrador} disabled={!claveBorrador || cargando} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 max-md:order-1 text-sm font-semibold hover:border-violet-500/60 disabled:opacity-50">
            <Save size={16} /> Guardar borrador
          </button>
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
          {cargando ? 'Iniciando...' : <>
            <span className="hidden md:inline">Registrar actividad</span>
            <span className="md:hidden">Iniciar actividad</span>
          </>}
        </button>
        </div>
      </div>
      {avisoBorrador && <p role="status" className="text-sm text-muted-foreground">{avisoBorrador}</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </form>
  )
}

