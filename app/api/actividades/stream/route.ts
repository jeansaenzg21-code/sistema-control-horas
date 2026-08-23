import { subscribeActivityChanges } from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const usuarioId = Number(url.searchParams.get('usuario_id'))
  if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
    return Response.json({ error: 'usuario_id requerido.' }, { status: 400 })
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
      send('retry: 3000\n\n')
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
