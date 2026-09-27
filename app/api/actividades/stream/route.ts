import { subscribeActivityChanges } from '@/lib/events'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const usuarioId = Number(url.searchParams.get('usuario_id'))
  const token = url.searchParams.get('token')
  if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
    return Response.json({ error: 'usuario_id requerido.' }, { status: 400 })
  }

  // La cookie HttpOnly manda y el token en la URL es solo para clientes que no
  // pueden tener cookies. Asi el caso normal (la web) no expone el token en los
  // logs de acceso, en el historial del navegador ni en el Referer.
  const origen = new Request(request.url, {
    headers: token ? { Authorization: `Bearer ${token}` } : request.headers,
  })
  const user = await getUserFromRequest(origen)
  if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 })
  const context = await getEmpresaContext(user)
  if (!context.activa) return Response.json({ error: 'No hay una empresa activa.' }, { status: 409 })
  // La autorizacion se mantiene: un usuario normal solo puede escuchar sus
  // propios eventos, aunque manipule el `usuario_id` de la URL.
  if (user.rol !== 'ADMINISTRACION' && user.id !== usuarioId) {
    return Response.json({ error: 'No autorizado.' }, { status: 403 })
  }

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {}
      }
      // `retry:` es la espera que el NAVEGADOR usa si se cae sola. Antes era
      // 3000 ms, y como no habia ningun limite, 200 usuarios que se quedaban sin
      // conexion reopening 20 veces por minuto cada uno. Ahora la reconexion la
      // gobierna el cliente, con espera creciente y dispersion aleatoria; este
      // valor es solo el suelo por si el cliente no interviene.
      send('retry: 15000\n\n')
      send('event: ready\ndata: {}\n\n')
      unsubscribe = subscribeActivityChanges(usuarioId, () => {
        send('event: activity-changed\ndata: {}\n\n')
      })
      heartbeat = setInterval(() => send(': ping\n\n'), 25000)
      request.signal.addEventListener('abort', () => {
        if (heartbeat) clearInterval(heartbeat)
        if (unsubscribe) unsubscribe()
        try {
          controller.close()
        } catch {}
      })
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat)
      if (unsubscribe) unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
