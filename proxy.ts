import { NextResponse } from 'next/server'

// Orígenes desde los que se puede llamar a la API. Incluye el escritorio
// (Tauri) y la vista previa web de la app móvil (npx expo start --web).
// Para probar la app móvil desde el navegador en otro equipo se agregan sus
// orígenes en la variable ORIGENES_MOVIL, separados por coma.
const ORIGENES_POR_DEFECTO = [
  'tauri://localhost',
  'http://tauri.localhost',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
]

const ORIGENES_PERMITIDOS = new Set([
  ...ORIGENES_POR_DEFECTO,
  ...(process.env.ORIGENES_MOVIL?.split(',') ?? [])
    .map((origen) => origen.trim())
    .filter(Boolean),
])

function permitido(origin: string | null): origin is string {
  return origin != null && ORIGENES_PERMITIDOS.has(origin)
}

// Cabeceras que un cliente puede enviar. `X-Cliente` la usa la app móvil para
// pedir el token de renovación en el cuerpo del login: la web no puede leer una
// cookie HttpOnly, así que el móvil lo recibe por respuesta. Sin esta cabecera en
// la lista, el navegador rechaza el login del móvil con un error de CORS en el
// "preflight" antes de llegar al servidor.
const CABECERAS_PERMITIDAS = 'Content-Type, Authorization, X-Cliente'

export function proxy(request: Request) {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 })
    if (permitido(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', CABECERAS_PERMITIDAS)
      response.headers.set('Access-Control-Max-Age', '86400')
      response.headers.set('Vary', 'Origin')
    }
    return response
  }

  const response = NextResponse.next()
  if (permitido(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Vary', 'Origin')
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}
