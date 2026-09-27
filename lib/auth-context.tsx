'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Rol = 'personal' | 'supervisor' | 'jefe_area' | 'admin'

export interface Empresa {
  id: number
  nombre: string
  descripcion: string | null
  pais: string
  ciudad: string | null
  logo: string | null
}

export interface Usuario {
  id: number
  nombre: string
  correo: string
  usuario: string
  rol: Rol
  area_id: number | null
  cargo: string | null
  especialidad: string | null
  supervisor_id: number | null
  activo: boolean
  created_at: string
  area_nombre?: string | null
  empresa_id: number | null
}

interface AuthContextValue {
  usuario: Usuario | null
  cargando: boolean
  usuarios: Usuario[]
  empresaActiva: Empresa | null
  empresasDisponibles: Empresa[]
  requiereEmpresa: boolean
  login: (credenciales: { usuario: string; password: string }) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  cargarUsuarios: () => Promise<void>
  recargarContextoEmpresa: () => Promise<boolean>
  salirDeEmpresa: () => Promise<{ ok: boolean; error?: string }>
  entrarEnEmpresa: (empresaId: number) => Promise<{ ok: boolean; error?: string }>
}

function mapRol(dbRol: string): Rol {
  if (dbRol === 'SUPERVISOR') return 'supervisor'
  if (dbRol === 'JEFE_AREA') return 'jefe_area'
  if (dbRol === 'ADMINISTRACION') return 'admin'
  return 'personal'
}

function normalizeUsuario(raw: Record<string, unknown>): Usuario {
  return {
    id: Number(raw.id),
    nombre: String(raw.nombre || ''),
    correo: String(raw.correo || ''),
    usuario: String(raw.usuario || ''),
    rol: mapRol(String(raw.rol || 'PERSONAL')),
    area_id: raw.area_id == null ? null : Number(raw.area_id),
    cargo: raw.cargo == null ? null : String(raw.cargo),
    especialidad: raw.especialidad == null ? null : String(raw.especialidad),
    supervisor_id: raw.supervisor_id == null ? null : Number(raw.supervisor_id),
    activo: Boolean(raw.activo),
    created_at: String(raw.created_at || ''),
    area_nombre: raw.area_nombre == null ? null : String(raw.area_nombre),
    empresa_id: raw.empresa_id == null ? null : Number(raw.empresa_id),
  }
}

function normalizeEmpresa(raw: Record<string, unknown>): Empresa {
  return {
    id: Number(raw.id),
    nombre: String(raw.nombre || ''),
    descripcion: raw.descripcion == null ? null : String(raw.descripcion),
    pais: String(raw.pais || 'Perú'),
    ciudad: raw.ciudad == null ? null : String(raw.ciudad),
    logo: raw.logo == null ? null : String(raw.logo),
  }
}

function limpiarSesionLocal() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('pc_sesion')
  localStorage.removeItem('pc_token')
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [empresaActiva, setEmpresaActiva] = useState<Empresa | null>(null)
  const [empresasDisponibles, setEmpresasDisponibles] = useState<Empresa[]>([])
  const [requiereEmpresa, setRequiereEmpresa] = useState(false)
  const [cargando, setCargando] = useState(true)

  const cargarUsuarios = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (!token) {
      setUsuarios([])
      return
    }

    try {
      const res = await fetch('/api/usuarios', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUsuarios(data.map((item: Record<string, unknown>) => normalizeUsuario(item)))
      }
    } catch {
      setUsuarios([])
    }
  }, [])

  const cargarContextoEmpresa = useCallback(async (): Promise<boolean> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (!token) {
      setUsuario(null)
      setEmpresaActiva(null)
      setEmpresasDisponibles([])
      setRequiereEmpresa(false)
      return false
    }

    try {
      const res = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        limpiarSesionLocal()
        setUsuario(null)
        setEmpresaActiva(null)
        setEmpresasDisponibles([])
        setRequiereEmpresa(false)
        return false
      }

      setUsuario(normalizeUsuario(data.usuario))
      setEmpresaActiva(data.empresa_activa ? normalizeEmpresa(data.empresa_activa) : null)
      setEmpresasDisponibles(
        Array.isArray(data.empresas)
          ? data.empresas.map((item: Record<string, unknown>) => normalizeEmpresa(item))
          : []
      )
      setRequiereEmpresa(Boolean(data.requiere_empresa))
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (!token || !usuario || !empresaActiva || usuario.rol === 'admin') return

    const controller = new AbortController()
    void fetch('/api/widget/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        token,
        usuarioId: usuario.id,
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        rol: usuario.rol,
      }),
      signal: controller.signal,
    }).catch(() => {})

    return () => controller.abort()
  }, [usuario, empresaActiva])

  useEffect(() => {
    let vigente = true
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (!token) {
      limpiarSesionLocal()
      setCargando(false)
      return
    }

    cargarContextoEmpresa()
      .then((ok) => {
        if (ok && vigente) return cargarUsuarios()
        return undefined
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [cargarContextoEmpresa, cargarUsuarios])

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
      if (data.token) localStorage.setItem('pc_token', data.token)
      await cargarContextoEmpresa()
      await cargarUsuarios()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [cargarContextoEmpresa, cargarUsuarios])

  const salirDeEmpresa = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (!token) return { ok: false, error: 'La sesión no está disponible.' }

    try {
      const res = await fetch('/api/auth/empresa', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'No se pudo salir de la empresa.' }
      setEmpresaActiva(null)
      setUsuario((actual) => actual ? { ...actual, empresa_id: null } : actual)
      setUsuarios([])
      setRequiereEmpresa(true)
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [])

  const entrarEnEmpresa = useCallback(async (empresaId: number) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (!token) return { ok: false, error: 'La sesión no está disponible.' }

    try {
      const res = await fetch('/api/auth/empresa', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ empresa_id: empresaId }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'No se pudo ingresar a la empresa.' }
      setEmpresaActiva(normalizeEmpresa(data.empresa_activa))
      setUsuario((actual) => actual ? { ...actual, empresa_id: empresaId } : actual)
      setRequiereEmpresa(false)
      await cargarUsuarios()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [cargarUsuarios])

  const logout = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (token) {
      fetch('/api/auth/session', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
      fetch('/api/widget/sync', { method: 'DELETE' }).catch(() => {})
    }
    setUsuario(null)
    setUsuarios([])
    setEmpresaActiva(null)
    setEmpresasDisponibles([])
    setRequiereEmpresa(false)
    limpiarSesionLocal()
  }, [])

  return (
    <AuthContext.Provider value={{
      usuario,
      cargando,
      usuarios,
      empresaActiva,
      empresasDisponibles,
      requiereEmpresa,
      login,
      logout,
      cargarUsuarios,
      recargarContextoEmpresa: cargarContextoEmpresa,
      salirDeEmpresa,
      entrarEnEmpresa,
    }}>
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
