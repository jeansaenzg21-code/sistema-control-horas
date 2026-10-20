import pino from 'pino'

const nivel = process.env.LOG_LEVEL || 'info'

export const logger = pino({
  level: nivel,
  base: { servicio: 'control-horas' },
})

export function loggerConId(requestId: string) {
  return logger.child({ requestId })
}

export function idPeticion(request: Request): string {
  return request.headers.get('x-request-id') || Math.random().toString(36).slice(2)
}