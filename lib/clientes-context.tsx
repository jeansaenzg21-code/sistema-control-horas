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

function normalizarCliente(cliente: Cliente): Cliente {
  return {
    ...cliente,
    horas_contratadas: Number(cliente.horas_contratadas) || 0,
    horas_consumidas: Number(cliente.horas_consumidas) || 0,
  }
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
  const { usuario, empresaActiva } = useAuth()
  const empresaId = empresaActiva?.id ?? null
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)

  const cargarClientes = useCallback(async () => {
    if (!empresaId) {
      setClientes([])
      return
    }

    try {
      const token = localStorage.getItem('pc_token')
      const res = await fetch('/api/clientes', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (res.ok) {
        const data = (await res.json()) as Cliente[]
        setClientes(data.map(normalizarCliente))
      } else setClientes([])
    } catch {
      setClientes([])
    } finally {
      setCargando(false)
    }
  }, [empresaId])

  useEffect(() => {
    if (usuario && empresaId) {
      setCargando(true)
      void cargarClientes()
    } else {
      setClientes([])
      setCargando(false)
    }
  }, [usuario, empresaId, cargarClientes])

  const headers = () => {
    const token = localStorage.getItem('pc_token')
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  const crearCliente = useCallback(async (datos: Omit<Cliente, 'id' | 'area_nombre' | 'horas_consumidas' | 'activo' | 'created_at'>) => {
    if (!empresaId) return { ok: false, error: 'No hay una empresa activa.' }
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(datos),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'Error al crear cliente.' }
      await cargarClientes()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [empresaId, cargarClientes])

  const actualizarCliente = useCallback(async (id: number, datos: Partial<Cliente>) => {
    if (!empresaId) return { ok: false, error: 'No hay una empresa activa.' }
    try {
      const res = await fetch('/api/clientes', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ id, ...datos }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'Error al actualizar cliente.' }
      await cargarClientes()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [empresaId, cargarClientes])

  const eliminarCliente = useCallback(async (id: number) => {
    if (!empresaId) return
    try {
      await fetch('/api/clientes', {
        method: 'DELETE',
        headers: headers(),
        body: JSON.stringify({ id }),
      })
      await cargarClientes()
    } catch {
      return
    }
  }, [empresaId, cargarClientes])

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
