import { z } from 'zod'

export const esquemaCliente = z.object({
  nombre: z.string().nullable().optional(),
  razon_social: z.string().nullable().optional(),
  ruc: z.string().nullable().optional(),
  correo: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  direccion: z.string().nullable().optional(),
  encargado: z.string().nullable().optional(),
  asistente: z.string().nullable().optional(),
  area_id: z.coerce.number().int().positive().nullable().optional(),
  horas_contratadas: z.coerce.number().min(0).nullable().optional(),
  activo: z.boolean().optional(),
}).passthrough()

export type ClienteEntrada = z.infer<typeof esquemaCliente>
