'use client'

// Primitivas visuales de la cartera de clientes.

//

// Son las del diseño, sin cambios de aspecto. Lo que cambia es que los tipos

// que reciben ya son los REALES que devuelve /api/clientes/cartera, en lugar de

// los objetos de ejemplo que vivían dentro del propio componente.

import { type ReactNode } from 'react'

import { CalendarDays, CheckCircle2, Hourglass, TrendingUp, X } from 'lucide-react'

export type EstadoCliente = 'EN_CURSO' | 'EN_RIESGO' | 'PENDIENTE' | 'SIN_PRESUPUESTO'

export type TipoAlerta = 'desviacion' | 'pendiente' | 'informativa'

export type ClienteCartera = {

  id: number

  nombre: string

  area_id: number

  area_nombre: string

  ruc: string | null

  correo: string | null

  telefono: string | null

  direccion: string | null

  horasContratadas: number

  /** Horas del Excel pendientes de aprobar. No son contrato. */

  horasPropuestas: number

  horasConsumidas: number

  horasPorAprobar: number

  horasDisponibles: number

  horasExcedidas: number

  desviacion: number

  desviacionPorcentaje: number | null



  servicios: string[]

  serviciosConteo: number

  estado: EstadoCliente

  ultimaActividad: string | null

  horasContratadasCampo: number

}

export type AlertaCartera = {

  id: string

  clienteId: number

  clienteNombre: string

  tipo: TipoAlerta

  titulo: string

  descripcion: string

  dato: string

  cuando: string | null

}

const FORMAT = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 })

export const horas = (numero: number) => `${FORMAT.format(Number(numero) || 0)} h`

export const porcentaje = (numero: number) => `${FORMAT.format(numero)} %`

export const saldo = (contratadas: number, consumidas: number) => Math.max(0, contratadas - consumidas)

export const exceso = (contratadas: number, consumidas: number) => Math.max(0, consumidas - contratadas)

export const porcentajeConsumo = (contratadas: number, consumidas: number) =>

  contratadas > 0 ? Math.round((consumidas / contratadas) * 100) : 0

export const PANEL = 'rounded-2xl border border-border bg-card shadow-[0_10px_35px_rgba(0,0,0,0.12)]'

// El hover de fondo era un morado oscuro propio de la cartera. Al migrar al
// tema pasó a ser el mismo `bg-secondary` del reposo, es decir un hover que no
// hace nada. Se usa `bg-accent/15` para que el botón reaccione al pasar el ratón.
export const BOTON = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-[#e7e9f3] transition hover:border-primary hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500'

export const PRIMARIO = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300'

export const MUTED = 'text-[#a1a8bd]'

/** Paleta estable: el mismo cliente siempre recibe el mismo color. */

const COLORES = [

  '#7651d4', '#3f8ae0', '#2fa98a', '#c9743a', '#b4508f',

  '#5c8f2e', '#8a6b2f', '#4a72b8', '#a05252', '#4f8a8a',

]

export function colorDeCliente(id: number): string {

  return COLORES[Math.abs(id) % COLORES.length]

}

export function inicialesDe(nombre: string): string {

  const partes = nombre.trim().split(/\s+/).filter(Boolean)

  if (partes.length === 0) return '—'

  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()

  return (partes[0][0] + partes[1][0]).toUpperCase()

}

export function Avatar({ iniciales, color, grande = false }: { iniciales: string; color: string; grande?: boolean }) {

  return (

    <div

      className={`flex shrink-0 items-center justify-center rounded-xl font-bold text-white ${grande ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs'}`}

      style={{ background: `linear-gradient(140deg, ${color}, #262a45)` }}

      aria-hidden="true"

    >

      {iniciales}

    </div>

  )

}

const ETIQUETA_ESTADO: Record<EstadoCliente, string> = {

  EN_CURSO: 'En curso',

  EN_RIESGO: 'En riesgo',

  PENDIENTE: 'Pendiente',

  SIN_PRESUPUESTO: 'Sin presupuesto',

}

export { ETIQUETA_ESTADO }

export function Estado({ valor }: { valor: EstadoCliente }) {

  const estilos: Record<EstadoCliente, string> = {

    EN_CURSO: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',

    EN_RIESGO: 'bg-rose-500/10 text-rose-300 ring-rose-500/20',

    PENDIENTE: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',

    SIN_PRESUPUESTO: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',

  }

  return (

    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${estilos[valor]}`}>

      {ETIQUETA_ESTADO[valor]}

    </span>

  )

}

export function Kpi({ icono, etiqueta, valor, nota, tono = 'violeta', avance }: {

  icono: ReactNode

  etiqueta: string

  valor: string

  nota?: string

  tono?: 'violeta' | 'azul' | 'verde' | 'ambar' | 'rojo'

  avance?: number

}) {

  const colores = {

    violeta: { icono: 'bg-violet-500/15 text-[#b58aff]', barra: '#9966ee', numero: 'text-white' },

    azul: { icono: 'bg-blue-500/15 text-[#92b0ff]', barra: '#7597ed', numero: 'text-white' },

    verde: { icono: 'bg-emerald-500/15 text-[#6de1b1]', barra: '#5ccaac', numero: 'text-white' },

    ambar: { icono: 'bg-amber-500/15 text-[#ffc66d]', barra: '#efb64e', numero: 'text-white' },

    rojo: { icono: 'bg-rose-500/15 text-[#ff7e99]', barra: '#ff748e', numero: 'text-[#ff8198]' },

  }[tono]

  return (

    <div className={`${PANEL} min-w-0 min-h-[102px] !rounded-xl px-2.5 py-3 sm:px-3`}>

      <div className="flex min-w-0 items-start gap-2">

        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colores.icono}`}>{icono}</span>

        <div className="min-w-0 flex-1">

          <p className="min-h-[24px] text-[10px] leading-3 text-[#b7bed0]">{etiqueta}</p>

          <p className={`mt-1 whitespace-nowrap text-[clamp(16px,1.5vw,23px)] leading-none font-bold tracking-tight ${colores.numero}`}>{valor}</p>

          {typeof avance === 'number' ? <div className="mt-2 flex items-center gap-1.5"><div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, avance))}%`, backgroundColor: colores.barra }} /></div><span className="text-[9px] text-[#b7bed0]">{avance}%</span></div> : nota ? <p className="mt-2 line-clamp-1 text-[9px] leading-3 text-[#a3abc0]" title={nota}>{nota}</p> : null}

        </div>

      </div>

    </div>

  )

}

export function CabeceraPanel({ icono, titulo, descripcion, accion }: { icono: ReactNode; titulo: string; descripcion?: string; accion?: ReactNode }) {

  return (

    <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4 py-3">

      <div className="flex min-w-0 items-center gap-2.5">

        <span className="text-[#ab83fb]">{icono}</span>

        <div className="min-w-0">

          <h2 className="text-sm font-semibold text-[#f1f0fa]">{titulo}</h2>

          {descripcion && <p className="mt-0.5 text-[11px] text-[#969eb3]">{descripcion}</p>}

        </div>

      </div>

      {accion}

    </div>

  )

}

export function IconoAlerta({ tipo }: { tipo: TipoAlerta }) {

  const variante = {

    desviacion: 'bg-rose-500/15 text-rose-300',

    pendiente: 'bg-amber-500/15 text-amber-300',

    informativa: 'bg-violet-500/15 text-violet-300',

  }[tipo]

  return (

    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${variante}`}>

      {tipo === 'desviacion' ? <TrendingUp size={18} /> : tipo === 'pendiente' ? <Hourglass size={18} /> : <CalendarDays size={18} />}

    </span>

  )

}

export function BarraProgreso({ total, consumidas }: { total: number; consumidas: number }) {
  const progreso = porcentajeConsumo(total, consumidas)
  const color = progreso > 100 ? '#fb7185' : progreso >= 90 ? '#f5b958' : '#9a70ed'
  // Sin min-w: la barra cede el ancho al que le da la columna. Con un mínimo
  // fijo se desbordaba de la celda en las tablas que ajustan el ancho por
  // porcentaje.
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className="h-1.5 min-w-[18px] flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, progreso)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-7 shrink-0 text-right text-[9px] text-[#aeb4c7]">{progreso}%</span>
    </div>
  )
}

export function Aviso({ texto, cerrar }: { texto: string; cerrar: () => void }) {

  return (

    <div className="fixed bottom-5 right-5 z-50 flex max-w-[380px] items-start gap-3 rounded-xl border border-violet-400/35 bg-popover p-3.5 text-xs text-[#eee7ff] shadow-2xl" role="status">

      <CheckCircle2 size={18} className="shrink-0 text-violet-300" />

      <p className="leading-relaxed">{texto}</p>

      <button type="button" aria-label="Cerrar aviso" onClick={cerrar} className="ml-auto shrink-0 rounded p-0.5 hover:bg-white/10"><X size={15} /></button>

    </div>

  )

}
