'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { CalendarCheck, Clock, ListChecks, MessageSquare, Play } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { ActivityCard } from '@/components/activity-card'
import { ActivityForm } from '@/components/activity-form'
import { RegistroDiaForm } from '@/components/registro-dia-form'
import { MisRegistros } from '@/components/mis-registros'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { opcionesApi } from '@/lib/api-cliente'
import { cn, fechaLocalISO, nombreCorto } from '@/lib/utils'

const MisObservaciones = dynamic(
  () => import('@/components/mis-observaciones').then((modulo) => modulo.MisObservaciones),
  { loading: () => <div role="status" className="space-y-2.5"><div className="h-16 animate-pulse rounded-xl bg-muted/60" /><div className="h-24 animate-pulse rounded-xl bg-muted/60" /></div> },
)

type Pestana = 'registrar' | 'registros' | 'observaciones'

type ModoRegistro = 'tiempo-real' | 'dia'

/**
 * Nombre para el saludo: "Yonny Flores", no "Flores".
 *
 * El campo `nombre` guarda los apellidos delante, así que tomar la primera
 * palabra muestra el apellido. El correo corporativo sigue el patrón
 * `nombre.apellido@paredescano.com`, y es la única fuente fiable del nombre de
 * pila; si no existe un correo utilizable se cae en `nombreCorto`.
 */
function nombreParaSaludo(nombre: string, correo?: string | null): string {
  const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ')
  const local = String(correo ?? '').split('@')[0] ?? ''
  const trozos = local.split('.')
  if (trozos.length === 2) {
    const [pila, apellido] = trozos
    if (pila && apellido && limpio.toLocaleLowerCase('es-PE').includes(pila.toLocaleLowerCase('es-PE'))) {
      const capitalizar = (valor: string) => valor.charAt(0).toLocaleUpperCase('es-PE') + valor.slice(1).toLocaleLowerCase('es-PE')
      return `${capitalizar(pila)} ${capitalizar(apellido)}`
    }
  }
  return nombreCorto(limpio, correo)
}

type ResumenDia = {
  fecha: string
  total: number
  por_estado: Array<{ estado: string; registros: number }>
}

export default function Actividades() {
  const { actividadActual, cargandoActividad, historial, totalHistorial } = useActividad()
  const { usuario, empresaActiva, cargando } = useAuth()
  const router = useRouter()
  const [pestana, setPestana] = useState<Pestana>('registrar')
  const [modoRegistro, setModoRegistro] = useState<ModoRegistro>('tiempo-real')
  const [hoy, setHoy] = useState(() => fechaLocalISO(new Date()))

  // La tarjeta se calcula para el dia de HOY. Si la aplicacion queda abierta
  // pasada la medianoche, el estado cambia de fecha y la consulta se renueva
  // sola, sin recargar la pagina.
  useEffect(() => {
    const revisar = () => {
      const actual = fechaLocalISO(new Date())
      setHoy((anterior) => (anterior === actual ? anterior : actual))
    }
    const intervalo = window.setInterval(revisar, 60_000)
    return () => window.clearInterval(intervalo)
  }, [])

  const { data: resumenDia, refetch: refetchResumenDia } = useQuery({
    queryKey: ['actividades-resumen-dia', empresaActiva?.id, usuario?.id, hoy],
    enabled: Boolean(empresaActiva) && Boolean(usuario) && usuario?.rol !== 'admin' && usuario?.rol !== 'socio',
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await fetch(`/api/actividades/resumen-dia?fecha=${hoy}`, opcionesApi())
      if (!res.ok) throw new Error('No se pudo cargar el resumen del día.')
      return (await res.json()) as ResumenDia
    },
  })

  // El historial ya se refresca por SSE al crear o finalizar una actividad.
  // Aprovechamos ese aviso para volver a pedir el conteo del dia, sin bajar las
  // filas otra vez.
  useEffect(() => {
    if (!usuario || usuario.rol === 'admin' || usuario.rol === 'socio') return
    void refetchResumenDia()
  }, [historial, usuario, refetchResumenDia])

  // La preferencia se recuerda: quien trabaja siempre al final del día no
  // debería volver a elegir el modo cada mañana.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const guardado = window.localStorage.getItem('pc_modo_registro')
    if (guardado === 'tiempo-real' || guardado === 'dia') setModoRegistro(guardado)
  }, [])

  const cambiarModoRegistro = (modo: ModoRegistro) => {
    setModoRegistro(modo)
    if (typeof window !== 'undefined') window.localStorage.setItem('pc_modo_registro', modo)
  }

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (usuario.rol === 'admin' || usuario.rol === 'socio') {
      router.replace('/')
    }
  }, [cargando, usuario, router])

  useEffect(() => {
    if (!usuario || usuario.rol === 'admin' || usuario.rol === 'jefe_area' || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('pestana') === 'observaciones' || params.get('tab') === 'observaciones') {
      setPestana('observaciones')
    }
  }, [usuario])

  useEffect(() => {
    if (!usuario || usuario.rol === 'admin' || usuario.rol === 'jefe_area' || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('actividad')) return
    router.replace(`/aprobaciones?${params.toString()}`)
  }, [usuario, router])

  const totalHoy = resumenDia?.total ?? 0
  const aprobadasHoy = resumenDia?.por_estado.find((e) => e.estado === 'APROBADA')?.registros ?? 0
  const pendientesHoy = resumenDia?.por_estado.find((e) => e.estado === 'PENDIENTE_APROBACION')?.registros ?? 0

  // El admin y el socio no registran horas: la redirección ya está lanzada en el
  // efecto de arriba, así que aquí no se monta nada para ninguno de los dos.
  if (cargando || !usuario || usuario.rol === 'admin' || usuario.rol === 'socio') return null

  const fechaHoy = new Date(`${hoy}T00:00:00`).toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const primerNombre = nombreParaSaludo(usuario.nombre, usuario.correo)

  const pestañas: { id: Pestana; etiqueta: string; icono: React.ReactNode }[] = [
    { id: 'registrar', etiqueta: 'Registrar', icono: <Play size={16} /> },
    {
      id: 'registros',
      etiqueta: `Mis registros${totalHistorial > 0 ? ` (${totalHistorial})` : ''}`,
      icono: <ListChecks size={16} />,
    },
    {
      id: 'observaciones',
      etiqueta: 'Mis observaciones',
      icono: <MessageSquare size={16} />,
    },
  ]

  const tarjetasResumen = [
    { etiqueta: 'Hoy', ayuda: 'Registros de hoy', valor: String(totalHoy) },
    { etiqueta: 'Aprobados', ayuda: 'Aprobados de hoy', valor: String(aprobadasHoy) },
    { etiqueta: 'Pendientes', ayuda: 'Pendientes de hoy', valor: String(pendientesHoy) },
  ]

  return (
    <MainLayout
      title="Actividades"
      subtitle="Registra tu tiempo y consulta tus registros"
    >
      <div className="space-y-5">
        <div className="flex gap-1 border-b border-border">
          {pestañas.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors',
                pestana === p.id
                  ? 'border-[#7c3aed] text-[#c4b5fd]'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {p.icono}
              {p.etiqueta}
            </button>
          ))}
        </div>

        {pestana === 'registrar' ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs capitalize text-muted-foreground">{fechaHoy}</p>
                <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">Hola, {primerNombre}</h2>
                <p className="text-xs leading-snug text-muted-foreground sm:text-sm">
                  {actividadActual
                    ? 'Tienes una actividad en curso, puedes pausarla o finalizarla.'
                    : '¿Qué vas a trabajar hoy?'}
                </p>
                {actividadActual && (
                  <div
                    key={actividadActual.estado}
                    className={cn(
                    'mt-2 flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium',
                    actividadActual.estado === 'PAUSADA'
                      ? 'border-slate-300/30 bg-slate-300/10 text-slate-300'
                      : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
                    )}
                    style={actividadActual.estado === 'PAUSADA'
                      ? { borderColor: 'rgba(203, 213, 225, 0.3)', backgroundColor: 'rgba(203, 213, 225, 0.1)', color: '#cbd5e1' }
                      : { borderColor: 'rgba(52, 211, 153, 0.25)', backgroundColor: 'rgba(52, 211, 153, 0.1)', color: '#6ee7b7' }}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 flex-none rounded-full',
                        actividadActual.estado === 'PAUSADA' ? '' : 'animate-pulse',
                      )}
                      style={{
                        width: 8,
                        height: 8,
                        backgroundColor: actividadActual.estado === 'PAUSADA' ? '#cbd5e1' : '#34d399',
                      }}
                    />
                    {actividadActual.estado === 'PAUSADA' ? 'Pausada' : 'En curso'}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 divide-x divide-border rounded-lg bg-muted/60">
                {tarjetasResumen.map((tarjeta) => (
                  <div
                    key={tarjeta.etiqueta}
                    title={tarjeta.ayuda}
                    className="min-w-[3.25rem] px-2 py-1.5 text-center sm:min-w-[4rem] sm:px-4 sm:py-2"
                  >
                    <p className="text-base font-bold leading-tight text-foreground sm:text-lg">
                      {tarjeta.valor}
                    </p>
                    <p className="whitespace-nowrap text-[10px] text-muted-foreground sm:text-[11px]">
                      {tarjeta.etiqueta}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-2 sm:grid-cols-2">
              <OpcionModo
                activo={modoRegistro === 'tiempo-real'}
                onClick={() => cambiarModoRegistro('tiempo-real')}
                icono={<Play size={17} />}
                titulo="Tiempo real"
                descripcion="Inicia el cronómetro mientras trabajas y finalízalo al terminar."
              />
              <OpcionModo
                activo={modoRegistro === 'dia'}
                onClick={() => cambiarModoRegistro('dia')}
                icono={<Clock size={17} />}
                titulo="Al final del día"
                descripcion="Carga tus actividades con hora de inicio y fin cuando termines la jornada."
              />
            </div>

            {modoRegistro === 'tiempo-real' ? (
              cargandoActividad ? (
                <section className="rounded-xl border border-border bg-card p-5">
                  <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                  <div className="mt-4 h-24 animate-pulse rounded-xl bg-muted/60" />
                </section>
              ) : actividadActual ? (
                <ActivityCard />
              ) : (
                <section className="rounded-xl border border-border bg-card p-5">
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/15">
                      <CalendarCheck size={17} className="text-[#c4b5fd]" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        Registrar nueva actividad
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Inicia el registro con fecha y hora automáticas.
                      </p>
                    </div>
                  </div>
                  <ActivityForm />
                </section>
              )
            ) : (
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-emerald-500/15">
                    <Clock size={17} className="text-emerald-300" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Registrar horas del día</h2>
                    <p className="text-sm text-muted-foreground">
                      Al terminar tu jornada, anota el bloque con hora de inicio y fin. Queda pendiente de
                      aprobación.
                    </p>
                  </div>
                </div>
                {actividadActual && (
                  <p className="mb-4 rounded-lg border border-[#7c3aed]/30 bg-[#7c3aed]/10 px-3 py-2 text-xs leading-relaxed text-[#c4b5fd]">
                    Tienes una actividad en curso. Cambia a “Tiempo real” para pausarla o finalizarla.
                  </p>
                )}
                <RegistroDiaForm />
              </section>
            )}
          </>
        ) : pestana === 'registros' ? (
          <MisRegistros />
        ) : (
          <MisObservaciones />
        )}
      </div>
    </MainLayout>
  )
}

function OpcionModo({
  activo,
  onClick,
  icono,
  titulo,
  descripcion,
}: {
  activo: boolean
  onClick: () => void
  icono: React.ReactNode
  titulo: string
  descripcion: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'flex items-start gap-3 rounded-lg px-3.5 py-3 text-left transition-colors',
        activo
          ? 'bg-[#7c3aed]/15 ring-1 ring-inset ring-[#7c3aed]/40'
          : 'hover:bg-muted/50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg',
          activo ? 'bg-[#7c3aed]/20 text-[#c4b5fd]' : 'bg-muted text-muted-foreground',
        )}
      >
        {icono}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-semibold', activo ? 'text-foreground' : 'text-foreground/90')}>
          {titulo}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{descripcion}</span>
      </span>
    </button>
  )
}
