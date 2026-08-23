'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './auth-context'

export interface Cliente {
  id: number
  nombre: string
  ruc: string | null
  correo: string | null
  telefono: string | null
  direccion: string | null
  area_id: number
  area_nombre: string
  horas_contratadas: number
  horas_consumidas: number
  activo: boolean
  created_at: string
}

interface ClientesContextValue {
  clientes: Cliente[]
  cargando: boolean
  cargarClientes: () => Promise<void>
  crearCliente: (datos: Omit<Cliente, 'id' | 'area_nombre' | 'horas_consumidas' | 'activo' | 'created_at'>) => Promise<{ ok: boolean; error?: string }>
  actualizarCliente: (id: number, datos: Partial<Cliente>) => Promise<{ ok: boolean; error?: string }>
  eliminarCliente: (id: number) => Promise<void>
}

const ClientesContext = createContext<ClientesContextValue | null>(null)

export function ClientesProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)

  const cargarClientes = useCallback(async () => {
    try {
      const token = localStorage.getItem('pc_token')
      const res = await fetch('/api/clientes', { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      if (res.ok) {
        const data = await res.json()
        setClientes(data)
      }
    } catch {
      // Sin conexión
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (usuario) cargarClientes()
    else setClientes([])
  }, [usuario, cargarClientes])

  const crearCliente = useCallback(async (datos: Omit<Cliente, 'id' | 'area_nombre' | 'horas_consumidas' | 'activo' | 'created_at'>) => {
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('pc_token') ? { Authorization: `Bearer ${localStorage.getItem('pc_token')}` } : {}) },
        body: JSON.stringify(datos),
      })
      const data = await res.json()
      if (!res.ok) {
        return { ok: false, error: data.error || 'Error al crear cliente.' }
      }
      await cargarClientes()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [cargarClientes])

  const actualizarCliente = useCallback(async (id: number, datos: Partial<Cliente>) => {
    try {
      const res = await fetch('/api/clientes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('pc_token') ? { Authorization: `Bearer ${localStorage.getItem('pc_token')}` } : {}) },
        body: JSON.stringify({ id, ...datos }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { ok: false, error: data.error || 'Error al actualizar cliente.' }
      }
      await cargarClientes()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [cargarClientes])

  const eliminarCliente = useCallback(async (id: number) => {
    try {
      await fetch('/api/clientes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('pc_token') ? { Authorization: `Bearer ${localStorage.getItem('pc_token')}` } : {}) },
        body: JSON.stringify({ id }),
      })
      await cargarClientes()
    } catch {
      // Sin conexión
    }
  }, [cargarClientes])

  return (
    <ClientesContext.Provider value={{ clientes, cargando, cargarClientes, crearCliente, actualizarCliente, eliminarCliente }}>
      {children}
    </ClientesContext.Provider>
  )
}

export function useClientes(): ClientesContextValue {
  const contexto = useContext(ClientesContext)
  if (!contexto) {
    throw new Error('useClientes debe usarse dentro de ClientesProvider')
  }
  return contexto
}
