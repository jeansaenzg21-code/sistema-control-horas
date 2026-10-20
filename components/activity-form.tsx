'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Play } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { useClientes } from '@/lib/clientes-context'
import { cn } from '@/lib/utils'
import { opcionesApi } from '@/lib/api-cliente'

/**
 * Un servicio con las horas de QUIEN lo consulta, no las del servicio entero.
 * `horas` que llega del servidor es el total de la bolsa; lo que le sirve a la
 * persona para administrarse es su parte, asi que se trae aparte.
 */
interface ServicioConProgreso {
  id: number
  nombre: string
  origen: string
  horas: string | number
  mis_horas_contratadas: string | number
  mis_horas_consumidas: string | number
}

/** Formatea horas a "12h 30m", que es como se habla del tiempo en la oficina. */
function formatearHoras(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return '0h'
  const horas = Math.floor(valor)
  const minutos = Math.round((valor - horas) * 60)
  if (minutos === 60) return `${horas + 1}h`
  return minutos === 0 ? `${horas}h` : `${horas}h ${minutos}m`
}

export function ActivityForm() {
  const { iniciarActividad } = useActividad()
  const { usuario } = useAuth()
  const { clientes } = useClientes()
  const [tipoActividadId, setTipoActividadId] = useState<number | ''>('')
  const [clienteId, setClienteId] = useState<number | ''>('')
  const [servicioId, setServicioId] = useState<number | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [cargando, setCargando] = useState(false)
  const [tiposDisponibles, setTiposDisponibles] = useState<Array<{ id: number; nombre: string; codigo?: string | null }>>([])
  const [servicios, setServicios] = useState<ServicioConProgreso[]>([])
  const [cargandoServicios, setCargandoServicios] = useState(false)
  // El cliente TIENE bolsas activas pero ninguna es de este usuario. Sin esto el
  // desplegable aparece vacío y parece una falla.
  const [sinAsignaciones, setSinAsignaciones] = useState(false)

  useEffect(() => {
    if (!usuario?.area_id) return
    const cargarTipos = async () => {
      try {
        const res = await fetch(`/api/tipos-actividad?area_id=${usuario.area_id}`, opcionesApi())
        if (res.ok) {
          const data = await res.json()
          // El servidor ya los deja en orden de código. Aquí solo se hunde el
          // "atrapa todo" de cada área ("Otras Actividades Inherentes",
          // "Otros Inherentes"), que en una lista de 30 actividades
          // específicas quedaría perdido en medio por orden alfabético.
          const esAtrapaTodo = (nombre: string) => nombre.trim().toLowerCase().startsWith('otros')
          const ordenados = [...data].sort((a: { nombre: string; codigo?: string | null }, b: { nombre: string; codigo?: string | null }) => {
            const aFin = esAtrapaTodo(a.nombre)
            const bFin = esAtrapaTodo(b.nombre)
            if (aFin !== bFin) return aFin ? 1 : -1
            if (a.codigo && b.codigo) return a.codigo.localeCompare(b.codigo, 'es', { numeric: true })
            if (a.codigo) return -1
            if (b.codigo) return 1
            return a.nombre.localeCompare(b.nombre, 'es')
          })
          setTiposDisponibles(ordenados)
        }
      } catch {
        setTiposDisponibles([])
      }
    }
    void cargarTipos()
  }, [usuario])

  // Los servicios cuelgan del cliente (cliente -> presupuesto -> servicio), asi
  // que se piden cuando ya hay cliente elegido. El servidor solo devuelve bolsas
  // activas: el origen CONSOLIDADO se queda fuera porque por regla del modulo no
  // genera saldo.
  useEffect(() => {
    if (!clienteId) {
      setServicios([])
      setCargandoServicios(false)
      setSinAsignaciones(false)
      return
    }
    const controller = new AbortController()
    const cargarServicios = async () => {
      setCargandoServicios(true)
      try {
        const res = await fetch(`/api/servicios?cliente_id=${clienteId}`, opcionesApi({ signal: controller.signal }))
        if (res.ok) {
          const data = await res.json()
          const lista = Array.isArray(data?.servicios) ? data.servicios : []
          setServicios(lista)
          setSinAsignaciones(lista.length === 0 && Boolean(data?.sinAsignaciones))
        } else {
          setServicios([])
          setSinAsignaciones(false)
        }
      } catch {
        if (!controller.signal.aborted) {
          setServicios([])
          setSinAsignaciones(false)
        }
      } finally {
        if (!controller.signal.aborted) setCargandoServicios(false)
      }
    }
    void cargarServicios()
    return () => controller.abort()
  }, [clienteId])

  const clientesVisibles = useMemo(
    () => clientes.filter((cliente) => !usuario?.area_id || cliente.area_id === usuario.area_id),
    [clientes, usuario?.area_id],
  )

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

      {servicioElegido && <BarraServicio servicio={servicioElegido} />}

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

/**
 * Cuantas horas lleva la persona en el servicio elegido, sobre las que le
 * touchan. Sirve para no pasarse: si la barra se llena antes de acabar el
 * servicio, uno tiene que avisar en vez de seguir anotando.
 *
 * Solo cuenta lo que ya tiene `fin` y esta en PENDIENTE_APROBACION o APROBADA.
 * Lo que esta en curso todavia no tiene duracion, asi que contarlo seria
 * anticipar.
 */
function BarraServicio({ servicio }: { servicio: ServicioConProgreso }) {
  const contratadas = Number(servicio.mis_horas_contratadas)
  const consumidas = Number(servicio.mis_horas_consumidas)

  // Sin asignacion confirmada no hay contra que medirse. Publicar un 0% aqui
  // seria mentir: no es que no haya gastado nada, es que nadie le asigno horas
  // a ese servicio todavia.
  if (!Number.isFinite(contratadas) || contratadas <= 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
        <p className="text-xs leading-relaxed text-foreground">
          <span className="font-medium">{servicio.nombre}</span> no tiene horas
          asignadas a tu nombre todavia, asi que no hay consumo que comparar. Puedes
          registrar contra el, pero nadie sabra cuando te pasas.
        </p>
      </div>
    )
  }

  const restante = contratadas - consumidas
  const porcentaje = Math.min(100, Math.max(0, (consumidas / contratadas) * 100))
  const excedido = restante < 0

  // 90% es el umbral: de ahi en adelante conviene revisar la bolsa antes de
  // seguir, porque en estas presupuestaciones el trabajo se factura por horas.
  const tono = excedido
    ? { barra: 'bg-rose-500', texto: 'text-rose-300', borde: 'border-rose-500/30 bg-rose-500/5' }
    : porcentaje >= 90
      ? { barra: 'bg-amber-500', texto: 'text-amber-300', borde: 'border-amber-500/30 bg-amber-500/5' }
      : { barra: 'bg-emerald-500', texto: 'text-emerald-300', borde: 'border-border bg-muted/20' }

  return (
    <div className={cn('rounded-lg border px-3 py-2.5', tono.borde)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-medium text-foreground">{servicio.nombre}</p>
        <p className={cn('text-xs font-semibold tabular-nums', tono.texto)}>
          {formatearHoras(consumidas)} de {formatearHoras(contratadas)}
        </p>
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/25"
        role="progressbar"
        aria-valuenow={Math.round(porcentaje)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Horas registradas de ${formatearHoras(contratadas)} asignadas`}
      >
        <div className={cn('h-full rounded-full transition-all', tono.barra)} style={{ width: `${porcentaje}%` }} />
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {excedido ? (
          <>
            Te pasaste por{' '}
            <span className="font-semibold text-rose-300">{formatearHoras(Math.abs(restante))}</span>. Avisa al
            responsable del servicio antes de seguir.
          </>
        ) : (
          <>
            Te quedan{' '}
            <span className="font-semibold text-foreground">{formatearHoras(restante)}</span> de este servicio.
          </>
        )}
      </p>
    </div>
  )
}
