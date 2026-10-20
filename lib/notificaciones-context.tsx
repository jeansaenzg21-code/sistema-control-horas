'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './auth-context'
import { opcionesApi } from '@/lib/api-cliente'

export interface Notificacion {
  id: number
  titulo: string
  mensaje: string | null
  url: string | null
  leida: boolean
  created_at: string
}

interface NotificacionesContextValue {
  notificaciones: Notificacion[]
  noLeidas: number
  agregarNotificacionAUsuario: (usuarioId: number, titulo: string, mensaje: string, url?: string) => Promise<void>
  marcarLeida: (id: number) => Promise<void>
  marcarTodasLeidas: () => Promise<void>
  cargarNotificaciones: (usuarioId: number) => Promise<void>
}

const NotificacionesContext = createContext<NotificacionesContextValue | null>(null)

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { usuario, empresaActiva } = useAuth()
  const empresaId = empresaActiva?.id ?? null
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])

  const cargarNotificaciones = useCallback(async (usuarioId: number) => {
    if (!empresaId) {
      setNotificaciones([])
      return
    }
    try {
      const res = await fetch(`/api/notificaciones?usuario_id=${usuarioId}`, opcionesApi())
      if (res.ok) setNotificaciones(await res.json())
      else setNotificaciones([])
    } catch {
      setNotificaciones([])
    }
  }, [empresaId])

  useEffect(() => {
    if (usuario && empresaId) {
      void cargarNotificaciones(usuario.id)
    } else {
      setNotificaciones([])
    }
  }, [usuario, empresaId, cargarNotificaciones])

  const agregarNotificacionAUsuario = useCallback(async (targetId: number, titulo: string, mensaje: string, url?: string) => {
    try {
      await fetch('/api/notificaciones', opcionesApi({
        method: 'POST',
        body: { usuario_id: targetId, titulo, mensaje, url },
      }))
      if (usuario && targetId === usuario.id) await cargarNotificaciones(usuario.id)
    } catch {
      return
    }
  }, [usuario, cargarNotificaciones])

  const marcarLeida = useCallback(async (id: number) => {
    if (!usuario) return
    try {
      await fetch('/api/notificaciones', opcionesApi({
        method: 'PUT',
        body: { usuario_id: usuario.id, notificacion_id: id },
      }))
      setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)))
    } catch {
      return
    }
  }, [usuario])

  const marcarTodasLeidas = useCallback(async () => {
    if (!usuario) return
    try {
      await fetch('/api/notificaciones', opcionesApi({
        method: 'PUT',
        body: { usuario_id: usuario.id, marcar_todas: true },
      }))
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })))
    } catch {
      return
    }
  }, [usuario])

  const noLeidas = notificaciones.filter((n) => !n.leida).length

  return (
    <NotificacionesContext.Provider value={{
      notificaciones,
      noLeidas,
      agregarNotificacionAUsuario,
      marcarLeida,
      marcarTodasLeidas,
      cargarNotificaciones,
    }}>
      {children}
    </NotificacionesContext.Provider>
  )
}

export function useNotificaciones(): NotificacionesContextValue {
  const contexto = useContext(NotificacionesContext)
  if (!contexto) {
    throw new Error('useNotificaciones debe usarse dentro de NotificacionesProvider')
  }
  return contexto
}
