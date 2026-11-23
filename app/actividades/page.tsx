'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { CalendarCheck, CalendarRange, Check, CircleCheck, Clock, Coffee, ListChecks, MessageSquare, Play, X } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { ActivityCard } from '@/components/activity-card'
import { ActivityForm } from '@/components/activity-form'
import { RegistroDiaForm } from '@/components/registro-dia-form'
import { MisRegistros } from '@/components/mis-registros'
import { CronogramaActividades } from '@/components/cronograma-actividades'
import { MisObservaciones, useMisObservaciones } from '@/components/mis-observaciones'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { opcionesApi } from '@/lib/api-cliente'
import { cn, fechaLocalISO, nombreCorto } from '@/lib/utils'
import styles from './actividades.module.css'

type Pestana = 'registrar' | 'registros' | 'cronograma' | 'observaciones'

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
  const { actividadActual, cargandoActividad, historial, totalHistorial, enRefrigerio } = useActividad()
  const { usuario, empresaActiva, cargando } = useAuth()
  const router = useRouter()
  useMisObservaciones()
  const [pestana, setPestana] = useState<Pestana>('registrar')
  const [modoRegistro, setModoRegistro] = useState<ModoRegistro>('tiempo-real')
  const [avisoRefrigerioAbierto, setAvisoRefrigerioAbierto] = useState(false)
  const [hoy, setHoy] = useState(() => fechaLocalISO(new Date()))

  useEffect(() => {
    setAvisoRefrigerioAbierto(enRefrigerio)
  }, [enRefrigerio])

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
      id: 'cronograma',
      etiqueta: 'Cronograma semanal',
      icono: <CalendarRange size={16} />,
    },
    {
      id: 'observaciones',
      etiqueta: 'Mis observaciones',
      icono: <MessageSquare size={16} />,
    },
  ]

  const tarjetasResumen = [
    { icono: CalendarCheck, tono: 'violeta', etiqueta: 'Hoy', ayuda: 'Registros de hoy', valor: resumenDia ? String(totalHoy) : '—' },
    { icono: CircleCheck, tono: 'verde', etiqueta: 'Aprobados', ayuda: 'Aprobados de hoy', valor: resumenDia ? String(aprobadasHoy) : '—' },
    { icono: Clock, tono: 'ambar', etiqueta: 'Pendientes', ayuda: 'Pendientes de hoy', valor: resumenDia ? String(pendientesHoy) : '—' },
  ]

  return (
    <MainLayout
      title="Actividades"
      ancho="ancho"
      subtitle="Registro, seguimiento y cronograma de mis actividades."
    >
      {enRefrigerio && avisoRefrigerioAbierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-refrigerio" aria-describedby="detalle-refrigerio" className="relative w-full max-w-md rounded-3xl border border-amber-400/30 bg-card p-7 text-center shadow-2xl shadow-amber-500/10 sm:p-9">
            <button type="button" onClick={() => setAvisoRefrigerioAbierto(false)} aria-label="Cerrar aviso de refrigerio" className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X size={20} />
            </button>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-400/15 text-amber-300">
              <Coffee size={40} aria-hidden="true" />
            </div>
            <h2 id="titulo-refrigerio" className="mt-6 text-2xl font-bold text-foreground">¡Es hora de refrigerio!</h2>
            <p id="detalle-refrigerio" className="mt-3 text-sm leading-relaxed text-muted-foreground">
              De 1:00 p. m. a 2:00 p. m. el cronómetro se pausa y no es posible registrar ni reanudar actividades.
            </p>
            <p className="mt-6 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200">
              El registro estará disponible nuevamente a las 2:00 p. m.
            </p>
            <button type="button" onClick={() => setAvisoRefrigerioAbierto(false)} className="mt-6 w-full rounded-xl bg-[#7c3aed] px-4 py-3 text-sm font-semibold text-white hover:bg-[#6d28d9]">
              Entendido
            </button>
          </div>
        </div>
      )}
      <div className={styles.module}>
        <nav className={styles.tabs} aria-label="Vistas de actividades">
          {pestañas.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-current={pestana === p.id ? true : undefined}
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
        </nav>

        {pestana === 'registrar' ? (
          <>
            {enRefrigerio && (
              <p role="status" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-200">
                Es hora de refrigerio (1:00 p. m. a 2:00 p. m.). {actividadActual ? 'El cronómetro se pausa.' : ''} No puedes registrar ni reanudar actividades hasta las 2:00 p. m.
              </p>
            )}
            <div className={styles.hero}>
              <div className="min-w-0 flex-1">
                <p className={styles.date}><CalendarCheck size={18} aria-hidden="true" />{fechaHoy}</p>
                <h2 className={styles.greeting}>Hola, {primerNombre}</h2>
                <p className="text-base leading-snug text-muted-foreground">
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

              <div className={styles.summary}>
                {tarjetasResumen.map((tarjeta) => (
                  <div
                    key={tarjeta.etiqueta}
                    title={tarjeta.ayuda}
                    className={styles.stat}
                    data-tone={tarjeta.tono}
                  >
                    <tarjeta.icono size={22} aria-hidden="true" />
                    <p className="text-xl font-bold leading-tight text-foreground">
                      {tarjeta.valor}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tarjeta.etiqueta}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.modes}>
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
                <section className={styles.formPanel}>
                  <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                  <div className="mt-4 h-24 animate-pulse rounded-xl bg-muted/60" />
                </section>
              ) : actividadActual ? (
                <ActivityCard />
              ) : (
                <section className={cn(styles.formPanel, styles.newActivityPanel)}>
                  <div className={styles.formHeader}>
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/15">
                      <CalendarCheck size={17} className="text-[#c4b5fd]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">
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
              <section className={styles.formPanel}>
                <div className={styles.formHeader}>
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-emerald-500/15">
                    <Clock size={17} className="text-emerald-300" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">Registrar horas del día</h2>
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
        ) : pestana === 'cronograma' ? (
          <CronogramaActividades />
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
        styles.mode,
        activo
          ? 'bg-[#7c3aed]/15 ring-1 ring-inset ring-[#7c3aed]/40'
          : 'hover:bg-muted/50',
      )}
    >
      <span
        className={cn(
          styles.modeIcon,
          activo ? 'bg-[#7c3aed]/20 text-[#c4b5fd]' : 'bg-muted text-muted-foreground',
        )}
      >
        {icono}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-base font-semibold', activo ? 'text-foreground' : 'text-foreground/90')}>
          {titulo}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{descripcion}</span>
      </span>
      <span className={styles.modeCheck} aria-hidden="true">{activo && <Check size={14} />}</span>
    </button>
  )
}
