import { z } from 'zod'

const horas = z.number().positive().max(100000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < .000001, 'Usa como máximo dos decimales.')
export const esquemaServicioManual = z.object({
  presupuestoId: z.number().int().positive(), clave: z.string().uuid(), nombre: z.string().trim().min(2).max(200), horas,
  participantes: z.array(z.object({ usuarioId: z.number().int().positive(), horas })).min(1).max(100),
}).superRefine((s, ctx) => {
  if (new Set(s.participantes.map(p => p.usuarioId)).size !== s.participantes.length) ctx.addIssue({ code: 'custom', message: 'No repitas participantes.' })
  if (s.participantes.reduce((n, p) => n + Math.round(p.horas * 100), 0) !== Math.round(s.horas * 100)) ctx.addIssue({ code: 'custom', message: 'La suma de horas por participante debe coincidir con las horas del servicio.' })
})
