'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { generarId } from './format'
import { leerStorage, escribirStorage } from './storage'
import { useAuth } from './auth-context'

export interface Notificacion {
  id: string
  titulo: string
  mensaje: string
  fecha: string
  leida: boolean
  href?: string
}

interface NotificacionesContextValue {
  notificaciones: Notificacion[]
  noLeidas: number
  agregarNotificacion: (titulo: string, mensaje: string, href?: string) => void
  agregarNotificacionAUsuario: (usuarioId: string, titulo: string, mensaje: string, href?: string) => void
  marcarLeida: (id: string) => void
  marcarTodasLeidas: () => void
}

const NotificacionesContext = createContext<NotificacionesContextValue | null>(null)

function claveDeUsuario(usuarioId: string) {
  return `pc_notificaciones_${usuarioId}`
}

function normalizar(lista: unknown): Notificacion[] {
  if (!Array.isArray(lista)) return []
  return lista.filter(
    (n): n is Notificacion =>
      !!n &&
      typeof n === 'object' &&
      typeof (n as Notificacion).id === 'string' &&
      typeof (n as Notificacion).titulo === 'string',
  )
}

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const usuarioId = usuario?.id ?? null
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])

  useEffect(() => {
    if (!usuarioId) {
      setNotificaciones([])
      return
    }
    setNotificaciones(normalizar(leerStorage(claveDeUsuario(usuarioId))))
  }, [usuarioId])

  useEffect(() => {
    if (!usuarioId) return
    escribirStorage(claveDeUsuario(usuarioId), notificaciones)
  }, [notificaciones, usuarioId])

  const agregarNotificacionAUsuario = useCallback(
    (targetId: string, titulo: string, mensaje: string, href?: string) => {
      if (!targetId) return
      const nueva: Notificacion = {
        id: generarId(),
        titulo,
        mensaje,
        fecha: new Date().toISOString(),
        leida: false,
        href,
      }
      const existentes = usuarioId === targetId ? notificaciones : normalizar(leerStorage(claveDeUsuario(targetId)))
      escribirStorage(claveDeUsuario(targetId), [nueva, ...existentes])
      if (usuarioId === targetId) {
        setNotificaciones((prev) => [nueva, ...prev])
      }
    },
    [usuarioId, notificaciones],
  )

  const agregarNotificacion = useCallback(
    (titulo: string, mensaje: string, href?: string) => {
      if (usuarioId) agregarNotificacionAUsuario(usuarioId, titulo, mensaje, href)
    },
    [usuarioId, agregarNotificacionAUsuario],
  )

  const marcarLeida = useCallback(
    (id: string) => {
      setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)))
    },
    [],
  )

  const marcarTodasLeidas = useCallback(() => {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })))
  }, [])

  const noLeidas = notificaciones.filter((n) => !n.leida).length

  return (
    <NotificacionesContext.Provider
      value={{
        notificaciones,
        noLeidas,
        agregarNotificacion,
        agregarNotificacionAUsuario,
        marcarLeida,
        marcarTodasLeidas,
      }}
    >
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