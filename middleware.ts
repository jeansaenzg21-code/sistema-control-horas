import { NextResponse } from 'next/server'

const TAURI_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'http://localhost:5173',
]

export function middleware(request: Request) {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 })
    if (origin && TAURI_ORIGINS.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      response.headers.set('Access-Control-Max-Age', '86400')
    }
    return response
  }

  const response = NextResponse.next()
  if (origin && TAURI_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}
