import { z } from 'zod'

export const esquemaCliente = z.object({
  nombre: z.string().optional(),
  razon_social: z.string().optional(),
  ruc: z.string().optional(),
  correo: z.string().optional(),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  area_id: z.coerce.number().int().positive().nullable().optional(),
  activo: z.boolean().optional(),
}).passthrough()

export type ClienteEntrada = z.infer<typeof esquemaCliente>
