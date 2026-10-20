import { z } from 'zod'

export const esquemaProyecto = z.object({
  nombre: z.string().optional(),
  descripcion: z.string().optional(),
  cliente_id: z.coerce.number().int().positive().nullable().optional(),
  area_id: z.coerce.number().int().positive().nullable().optional(),
  responsable_id: z.coerce.number().int().positive().nullable().optional(),
  estado: z.string().optional(),
  activo: z.boolean().optional(),
}).passthrough()

export type ProyectoEntrada = z.infer<typeof esquemaProyecto>
