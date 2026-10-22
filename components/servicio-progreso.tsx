'use client'

import { AlertTriangle } from 'lucide-react'

import type { ServicioConProgreso } from '@/lib/use-catalogos-actividad'
import { cn } from '@/lib/utils'

/** Formatea horas a "12h 30m", que es como se habla del tiempo en la oficina. */
function formatearHoras(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return '0h'
  const horas = Math.floor(valor)
  const minutos = Math.round((valor - horas) * 60)
  if (minutos === 60) return `${horas + 1}h`
  return minutos === 0 ? `${horas}h` : `${horas}h ${minutos}m`
}

/**
 * Consumo de la bolsa personal sobre el servicio elegido.
 *
 * `minutosPrevistos` permite avisar ANTES de guardar: en el registro de jornada
 * ya se sabe cuánto va a durar el bloque, así que se compara el consumo actual
 * más ese bloque contra las horas asignadas. En el cronómetro no hay duración
 * conocida y solo se muestra lo consumido.
 *
 * Solo cuenta lo que ya tiene `fin` y está en PENDIENTE_APROBACION o APROBADA.
 * Lo que está en curso todavía no tiene duración, así que contarlo sería
 * anticipar.
 */
export function ProgresoServicio({
  servicio,
  minutosPrevistos,
}: {
  servicio: ServicioConProgreso
  minutosPrevistos?: number | null
}) {
  const contratadas = Number(servicio.mis_horas_contratadas)
  const consumidas = Number(servicio.mis_horas_consumidas)
  const previstas = minutosPrevistos && minutosPrevistos > 0 ? minutosPrevistos / 60 : 0

  // Sin asignación confirmada no hay contra qué medirse. Publicar un 0% aquí
  // sería mentir: no es que no haya gastado nada, es que nadie le asignó horas
  // a ese servicio todavía.
  if (!Number.isFinite(contratadas) || contratadas <= 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
        <p className="text-xs leading-relaxed text-foreground">
          <span className="font-medium">{servicio.nombre}</span> no tiene horas
          asignadas a tu nombre todavía, así que no hay consumo que comparar. Puedes
          registrar contra él, pero nadie sabrá cuándo te pasas.
        </p>
      </div>
    )
  }

  const restante = contratadas - consumidas
  const restanteProyectado = contratadas - consumidas - previstas
  const porcentaje = Math.min(100, Math.max(0, (consumidas / contratadas) * 100))
  const porcentajeProyectado =
    previstas > 0
      ? Math.min(100, Math.max(0, ((consumidas + previstas) / contratadas) * 100))
      : porcentaje
  const excedido = restante < 0
  const sePasaConBloque = previstas > 0 && restanteProyectado < 0

  // 90% es el umbral: de ahí en adelante conviene revisar la bolsa antes de
  // seguir, porque en estas presupuestaciones el trabajo se factura por horas.
  const alerta = excedido || sePasaConBloque || porcentajeProyectado >= 90
  const tono = excedido || sePasaConBloque
    ? { barra: 'bg-rose-500', texto: 'text-rose-300', borde: 'border-rose-500/30 bg-rose-500/5' }
    : alerta
      ? { barra: 'bg-amber-500', texto: 'text-amber-300', borde: 'border-amber-500/30 bg-amber-500/5' }
      : { barra: 'bg-emerald-500', texto: 'text-emerald-300', borde: 'border-border bg-muted/20' }

  return (
    <div
      className={cn('rounded-lg border px-3 py-2.5', tono.borde)}
      role={alerta ? 'alert' : undefined}
    >
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

      {previstas > 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Este bloque suma <span className="font-semibold text-foreground">{formatearHoras(previstas)}</span>:
          quedarías en {formatearHoras(consumidas + previstas)} de {formatearHoras(contratadas)}.
        </p>
      )}

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {excedido ? (
          <>
            Te pasaste por{' '}
            <span className="font-semibold text-rose-300">{formatearHoras(Math.abs(restante))}</span>. Avisa al
            responsable del servicio antes de seguir.
          </>
        ) : sePasaConBloque ? (
          <>
            Con este bloque te pasarías por{' '}
            <span className="font-semibold text-rose-300">{formatearHoras(Math.abs(restanteProyectado))}</span>. Te
            quedan <span className="font-semibold text-foreground">{formatearHoras(restante)}</span> antes de
            registrarlo.
          </>
        ) : alerta ? (
          <>
            Estás al <span className="font-semibold text-amber-300">{Math.round(porcentajeProyectado)}%</span> de tu
            bolsa y te quedan <span className="font-semibold text-foreground">{formatearHoras(restante)}</span>.
            Revisa con tu responsable antes de seguir registrando.
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
