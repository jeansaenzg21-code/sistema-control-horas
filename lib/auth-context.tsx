'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { opcionesApi } from '@/lib/api-cliente'

export type Rol = 'personal' | 'supervisor' | 'jefe_area' | 'admin' | 'socio'

export interface Empresa {
  id: number
  nombre: string
  descripcion: string | null
  pais: string
  ciudad: string | null
  logo: string | null
  permite_salir_empresa: boolean
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
  if (dbRol === 'SOCIO') return 'socio'
  if (dbRol === 'PERSONAL') return 'personal'
  // Antes este `return` sin más convertía cualquier rol desconocido en
  // 'personal'. Con el socio fue un problema real de seguridad: si el ENUM se
  // actualiza en la base y la aplicación no, el socio entraba degradado a
  // 'personal', con permisos de colaborador y SIN el bloqueo de escritura.
  // Un rol desconocido se trata como el más restrictivo, nunca como el más
  // permisivo.
  return 'socio'
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
    permite_salir_empresa: raw.permite_salir_empresa == null
      ? true
      : Boolean(Number(raw.permite_salir_empresa)),
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [empresaActiva, setEmpresaActiva] = useState<Empresa | null>(null)
  const [empresasDisponibles, setEmpresasDisponibles] = useState<Empresa[]>([])
  const [requiereEmpresa, setRequiereEmpresa] = useState(false)
  const [cargando, setCargando] = useState(true)
  const temporizadorRenovacionRef = useRef<number | null>(null)
  const peticionUsuariosRef = useRef<Promise<void> | null>(null)

  // La sesion vive en una cookie HttpOnly: el navegador la envia sola en cada
  // peticion, sin que el JavaScript la toque. Por eso estas funciones ya no
  // necesitan leer ningun token del localStorage.
  const cargarUsuarios = useCallback(async () => {
    if (peticionUsuariosRef.current) return peticionUsuariosRef.current
    const peticion = (async () => {
      try {
        const data = await fetch('/api/usuarios', opcionesApi())
        if (!data.ok) {
          setUsuarios([])
          return
        }
        const filas = (await data.json()) as Array<Record<string, unknown>>
        setUsuarios(filas.map((item) => normalizeUsuario(item)))
      } catch {
        setUsuarios([])
      }
    })()
    peticionUsuariosRef.current = peticion.finally(() => { peticionUsuariosRef.current = null })
    return peticionUsuariosRef.current
  }, [])

  const cargarContextoEmpresa = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/session', opcionesApi())
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setUsuario(null)
        setEmpresaActiva(null)
        setEmpresasDisponibles([])
        setRequiereEmpresa(false)
        return false
      }

      setUsuario(normalizeUsuario(data.usuario as Record<string, unknown>))
      setEmpresaActiva(
        data.empresa_activa ? normalizeEmpresa(data.empresa_activa as Record<string, unknown>) : null
      )
      setEmpresasDisponibles(
        Array.isArray(data.empresas)
          ? (data.empresas as Array<Record<string, unknown>>).map((item) => normalizeEmpresa(item))
          : []
      )
      setRequiereEmpresa(Boolean(data.requiere_empresa))
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    // El widget es el temporizador de registro. Ni el admin ni el socio
    // registran horas, así que no se les ofrece ni se les sincroniza.
    if (!usuario || !empresaActiva || usuario.rol === 'admin' || usuario.rol === 'socio') return

    const controller = new AbortController()
    void fetch('/api/widget/sync', opcionesApi({
      method: 'POST',
      body: {
        usuarioId: usuario.id,
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        rol: usuario.rol,
      },
      signal: controller.signal,
    })).catch(() => {})

    return () => controller.abort()
  }, [usuario, empresaActiva])

  // Renovacion ANTICIPADA y escalonada.
  //
  // Sin esto el token solo se renueva cuando una peticion recibe un 401. Si los
  // tokens vencieran todos a la vez, las renovaciones ocurririan en el mismo
  // segundo. El servidor ya reparte las caducidades en una ventana de 20
  // minutos; aqui cada usuario renueva por su cuenta un poco antes de caducar,
  // y solo con la pestana visible, para no renovar en segundo plano sin parar.
  //
  // La cookie de renovacion es HttpOnly: la envia el navegador sola, no hay que
  // leerla. El nuevo token de acceso llega en otra cookie HttpOnly, asi que
  // tampoco hay que guardarlo en ningun lado.
  useEffect(() => {
    if (!usuario) return
    const MARGEN_MINUTOS = 45

    const revisar = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      try {
        await fetch('/api/auth/sesion', opcionesApi({ method: 'POST' }))
      } catch {
        // Sin red no se renueva. El proximo 401 reintentara y, si el token de
        // renovacion sigue vivo, el usuario no llega a ver el login.
      }
    }

    const programar = () => {
      if (temporizadorRenovacionRef.current !== null) {
        window.clearTimeout(temporizadorRenovacionRef.current)
      }
      // Se añade un retardo aleatorio hasta 5 minutos: si 200 usuarios entran a
      // la vez, sus renovaciones no se alinean en un mismo segundo.
      const espera = (MARGEN_MINUTOS + Math.random() * 5) * 60 * 1000
      temporizadorRenovacionRef.current = window.setTimeout(revisar, espera)
    }

    programar()
    document.addEventListener('visibilitychange', programar)
    return () => {
      if (temporizadorRenovacionRef.current !== null) {
        window.clearTimeout(temporizadorRenovacionRef.current)
        temporizadorRenovacionRef.current = null
      }
      document.removeEventListener('visibilitychange', programar)
    }
  }, [usuario])

  useEffect(() => {
    let vigente = true

    // La lista de usuarios es pesada y la mayoría de rutas no la necesita al
    // inicio. Primero valida sesión; luego se solicita en segundo plano solo
    // cuando hay una sesión real. Las páginas que la requieran pueden pedirla
    // también: cargarUsuarios comparte la petición en curso.
    cargarContextoEmpresa()
      .then((haySesion) => { if (haySesion) void cargarUsuarios() })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [cargarContextoEmpresa, cargarUsuarios])

  const login = useCallback(async (credenciales: { usuario: string; password: string }) => {
    try {
      const res = await fetch('/api/auth/login', opcionesApi({ method: 'POST', body: credenciales }))
      const data = (await res.json()) as { usuario?: Record<string, unknown>; error?: string }
      if (!res.ok) {
        return { ok: false, error: data.error || 'Error al iniciar sesión.' }
      }

      const normalized = normalizeUsuario(data.usuario ?? {})
      setUsuario(normalized)
      // La sesión ya quedó creada por el servidor. No retener la navegación al
      // login mientras se cargan los datos secundarios del contexto.
      void cargarContextoEmpresa()
      void cargarUsuarios()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [cargarContextoEmpresa, cargarUsuarios])

  const salirDeEmpresa = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/empresa', opcionesApi({ method: 'DELETE' }))
      const data = (await res.json().catch(() => ({}))) as { error?: string }
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
    try {
      const res = await fetch('/api/auth/empresa', opcionesApi({
        method: 'PUT',
        body: { empresa_id: empresaId },
      }))
      const data = (await res.json()) as {
        error?: string
        empresa_activa?: Record<string, unknown>
      }
      if (!res.ok) return { ok: false, error: data.error || 'No se pudo ingresar a la empresa.' }
      setEmpresaActiva(normalizeEmpresa(data.empresa_activa ?? {}))
      setUsuario((actual) => actual ? { ...actual, empresa_id: empresaId } : actual)
      setRequiereEmpresa(false)
      await cargarUsuarios()
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [cargarUsuarios])

  const logout = useCallback(() => {
    fetch('/api/auth/session', opcionesApi({ method: 'DELETE' })).catch(() => {})
    fetch('/api/widget/sync', { method: 'DELETE' }).catch(() => {})
    setUsuario(null)
    setUsuarios([])
    setEmpresaActiva(null)
    setEmpresasDisponibles([])
    setRequiereEmpresa(false)
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
