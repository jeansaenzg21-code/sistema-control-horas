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
  const { usuario } = useAuth()
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])

  const cargarNotificaciones = useCallback(async (usuarioId: number) => {
    try {
      const res = await fetch(`/api/notificaciones?usuario_id=${usuarioId}`)
      if (res.ok) {
        const data = await res.json()
        setNotificaciones(data)
      }
    } catch {
      // Sin conexión
    }
  }, [])

  useEffect(() => {
    if (usuario) {
      cargarNotificaciones(usuario.id)
    } else {
      setNotificaciones([])
    }
  }, [usuario, cargarNotificaciones])

  const agregarNotificacionAUsuario = useCallback(async (targetId: number, titulo: string, mensaje: string, url?: string) => {
    try {
      await fetch('/api/notificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: targetId, titulo, mensaje, url }),
      })
      if (usuario && targetId === usuario.id) {
        await cargarNotificaciones(usuario.id)
      }
    } catch {
      // Sin conexión
    }
  }, [usuario, cargarNotificaciones])

  const marcarLeida = useCallback(async (id: number) => {
    try {
      if (!usuario) return
      await fetch('/api/notificaciones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id, notificacion_id: id }),
      })
      setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)))
    } catch {
      // Sin conexión
    }
  }, [usuario])

  const marcarTodasLeidas = useCallback(async () => {
    try {
      if (!usuario) return
      await fetch('/api/notificaciones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id, marcar_todas: true }),
      })
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })))
    } catch {
      // Sin conexión
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
