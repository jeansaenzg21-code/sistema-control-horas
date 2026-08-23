'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Rol = 'personal' | 'supervisor' | 'admin'

export interface Usuario {
  id: number
  nombre: string
  correo: string
  usuario: string
  rol: Rol
  area_id: number | null
  especialidad: string | null
  supervisor_id: number | null
  activo: boolean
  created_at: string
  area_nombre?: string | null
}

interface AuthContextValue {
  usuario: Usuario | null
  cargando: boolean
  usuarios: Usuario[]
  login: (credenciales: { usuario: string; password: string }) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  cargarUsuarios: () => Promise<void>
}

function mapRol(dbRol: string): Rol {
  if (dbRol === 'SUPERVISOR') return 'supervisor'
  if (dbRol === 'ADMINISTRACION') return 'admin'
  return 'personal'
}

function normalizeUsuario(raw: Record<string, unknown>): Usuario {
  return {
    id: raw.id as number,
    nombre: raw.nombre as string,
    correo: (raw.correo as string) || '',
    usuario: raw.usuario as string,
    rol: mapRol(raw.rol as string),
    area_id: raw.area_id as number | null,
    especialidad: raw.especialidad as string | null,
    supervisor_id: raw.supervisor_id as number | null,
    activo: Boolean(raw.activo),
    created_at: raw.created_at as string,
    area_nombre: (raw.area_nombre as string) || null,
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const sesionId = localStorage.getItem('pc_sesion')
    if (sesionId) {
      cargarUsuarios().then(() => {
        setCargando(false)
      })
    } else {
      setCargando(false)
    }
  }, [])

  const cargarUsuarios = useCallback(async () => {
    try {
      const res = await fetch('/api/usuarios')
      if (res.ok) {
        const data = await res.json()
        const normalized = data.map(normalizeUsuario)
        setUsuarios(normalized)
        const sesionId = localStorage.getItem('pc_sesion')
        if (sesionId) {
          const encontrado = normalized.find((u: Usuario) => u.id === Number(sesionId) && u.activo)
          if (encontrado) setUsuario(encontrado)
        }
      }
    } catch {
      // Sin conexión
    }
  }, [])

  useEffect(() => {
    if (!cargando && usuario) {
      localStorage.setItem('pc_sesion', String(usuario.id))
    }
  }, [usuario, cargando])

  const login = useCallback(async (credenciales: { usuario: string; password: string }) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credenciales),
      })
      const data = await res.json()
      if (!res.ok) {
        return { ok: false, error: data.error || 'Error al iniciar sesión.' }
      }
      const normalized = normalizeUsuario(data.usuario)
      setUsuario(normalized)
      localStorage.setItem('pc_sesion', String(normalized.id))
      if (data.token) {
        localStorage.setItem('pc_token', data.token)
        fetch('/api/widget/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: data.token,
            usuarioId: normalized.id,
            usuario: normalized.usuario,
            nombre: normalized.nombre,
            rol: normalized.rol,
          }),
        }).catch(() => {})
      }
      await cargarUsuarios()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [cargarUsuarios])

  const logout = useCallback(() => {
    const token = localStorage.getItem('pc_token')
    if (token) {
      fetch('/api/auth/session', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
      fetch('/api/widget/sync', { method: 'DELETE' }).catch(() => {})
    }
    setUsuario(null)
    localStorage.removeItem('pc_sesion')
    localStorage.removeItem('pc_token')
  }, [])

  return (
    <AuthContext.Provider value={{ usuario, cargando, usuarios, login, logout, cargarUsuarios }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext)
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return contexto
}
