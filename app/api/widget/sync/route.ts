import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { notifyAuthChange } from '@/lib/events'
import { tokenDeRequest } from '@/lib/auth'

const SYNC_FILE = join(tmpdir(), '.paredes-cano-widget-sync.json')

interface SyncData {
  token: string
  usuarioId: number
  usuario: string
  nombre: string
  rol: string
  timestamp: number
}

function widgetSyncHabilitado(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.WIDGET_SYNC_ENABLED === 'true'
}

function widgetSyncDeshabilitado(): NextResponse {
  return NextResponse.json({ error: 'Sincronización de widget no disponible.' }, { status: 404 })
}

function readSync(): SyncData | null {
  try {
    if (!existsSync(SYNC_FILE)) return null
    const raw = readFileSync(SYNC_FILE, 'utf-8')
    const data = JSON.parse(raw) as SyncData
    if (Date.now() - data.timestamp > 12 * 60 * 60 * 1000) {
      unlinkSync(SYNC_FILE)
      return null
    }
    return data
  } catch {
    return null
  }
}

function writeSync(data: SyncData) {
  writeFileSync(SYNC_FILE, JSON.stringify(data), 'utf-8')
}

function deleteSync() {
  try {
    if (existsSync(SYNC_FILE)) unlinkSync(SYNC_FILE)
  } catch {}
}

/**
 * Roles que no usan el widget de escritorio.
 *
 * El widget es un temporizador de REGISTRO de horas. El admin no lo usa porque
 * no registra horas, y el socio por lo mismo: su perfil es de solo lectura y
 * cada intento de guardar una actividad rebotaría con 401. Se les borra el
 * archivo de sincronización para que el proceso de escritorio no los espere.
 */
function esSinWidget(rol: string | undefined | null): boolean {
  const r = (rol || '').toUpperCase()
  return r === 'ADMIN' || r === 'ADMINISTRACION' || r === 'SOCIO'
}

export async function POST(request: Request) {
  try {
    if (!widgetSyncHabilitado()) return widgetSyncDeshabilitado()
    const body = await request.json()
    // El token puede venir en el cuerpo (como hasta ahora) o, si la web ya no lo
    // guarda en localStorage, leerse de la cookie HttpOnly o de la cabecera
    // Bearer. Asi el widget de escritorio sigue recibiendo la credencial aunque
    // el navegador no la tenga en JavaScript.
    const token =
      typeof body.token === 'string' && body.token.length >= 10
        ? body.token
        : tokenDeRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'token requerido' }, { status: 400 })
    }
    if (esSinWidget(body.rol)) {
      deleteSync()
      return NextResponse.json({ ok: false, motivo: 'rol sin widget' })
    }
    writeSync({
      token,
      usuarioId: body.usuarioId,
      usuario: body.usuario,
      nombre: body.nombre,
      rol: body.rol,
      timestamp: Date.now(),
    })
    notifyAuthChange('login')
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error en widget sync POST:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function GET() {
  try {
    if (!widgetSyncHabilitado()) return widgetSyncDeshabilitado()
    const data = readSync()
    if (!data) {
      return NextResponse.json({ synced: false })
    }
    if (esSinWidget(data.rol)) {
      deleteSync()
      return NextResponse.json({ synced: false })
    }
    return NextResponse.json({ synced: true, token: data.token, usuario: { id: data.usuarioId, usuario: data.usuario, nombre: data.nombre, rol: data.rol } })
  } catch (error) {
    console.error('Error en widget sync GET:', error)
    return NextResponse.json({ synced: false })
  }
}

export async function DELETE() {
  try {
    if (!widgetSyncHabilitado()) return widgetSyncDeshabilitado()
    deleteSync()
    notifyAuthChange('logout')
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error en widget sync DELETE:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
