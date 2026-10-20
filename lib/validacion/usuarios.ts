import { z } from 'zod'

export const esquemaUsuario = z.object({
  nombre: z.string().optional(),
  correo: z.string().optional(),
  usuario: z.string().optional(),
  password: z.string().optional(),
  rol: z.string().optional(),
  area_id: z.coerce.number().int().positive().nullable().optional(),
  cargo: z.string().optional(),
  especialidad: z.string().optional(),
  supervisor_id: z.coerce.number().int().positive().nullable().optional(),
  activo: z.boolean().optional(),
}).passthrough()

export type UsuarioEntrada = z.infer<typeof esquemaUsuario>
