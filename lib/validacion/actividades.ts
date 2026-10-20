import { z } from 'zod'

export const esquemaActividad = z.object({
  id_operacion: z.string().optional(),
  usuario_id: z.coerce.number().int().positive().optional(),
  cliente_id: z.coerce.number().int().positive().nullable().optional(),
  proyecto_id: z.coerce.number().int().positive().nullable().optional(),
  tipo_actividad_id: z.coerce.number().int().positive().optional(),
  descripcion: z.string().optional(),
  inicio: z.string().optional(),
  fin: z.string().optional(),
  duracion_segundos: z.coerce.number().optional(),
  pausa_segundos: z.coerce.number().optional(),
  facturable: z.boolean().optional(),
  estado: z.string().optional(),
}).passthrough()

export type ActividadEntrada = z.infer<typeof esquemaActividad>
