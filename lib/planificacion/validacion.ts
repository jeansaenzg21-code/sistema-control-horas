import { z } from 'zod'

export const fechaPlan = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(valor => {
  const d = new Date(`${valor}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === valor && valor >= '1900-01-01' && valor <= '2200-12-31'
}, 'Indica una fecha válida entre 1900 y 2200.')
const id = z.number().int().positive()
export const esquemaTareaPlan = z.object({
  servicio_id: id.nullable().default(null),
  padre_id: id.nullable().default(null),
  nombre: z.string().trim().min(2, 'Escribe al menos dos caracteres.').max(200),
  etapa: z.string().trim().max(120).nullable().default(null),
  fecha_inicio: fechaPlan.nullable(), fecha_fin: fechaPlan.nullable(),
  horas: z.number().min(0).max(100000).default(0),
  progreso: z.number().int().min(0).max(100).default(0),
  estado: z.enum(['PENDIENTE', 'PLANIFICADA', 'EN_CURSO', 'COMPLETADA']).optional(),
  responsable_id: id.nullable().default(null),
  dependencias: z.array(id).max(100).default([]),
  notas: z.string().trim().max(500).nullable().default(null),
  clave_creacion: z.string().uuid().optional(),
})
export const esquemaLotePlan = z.object({ tareas: z.array(esquemaTareaPlan).min(1).max(300) })
export const esquemaEditarPlan = esquemaTareaPlan.extend({
  id, revision: z.number().int().nonnegative(), antes_de: id.nullable().optional(),
})
export const esquemaConfigPlan = z.object({ fecha_inicio: fechaPlan, meses: z.number().int().min(1).max(60) })
