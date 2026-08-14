'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { leerStorage, escribirStorage } from './storage'
import { generarId } from './format'

export type Rol = 'admin' | 'abogado'

export interface Usuario {
  id: string
  nombre: string
  correo: string
  usuario: string
  passwordHash: string
  rol: Rol
  areaId: string | null
  especialidad: string
  activo: boolean
}

export interface Credenciales {
  usuario: string
  password: string
}

interface UsuarioNuevo {
  nombre: string
  correo: string
  usuario: string
  password: string
  rol: Rol
  areaId: string | null
  especialidad: string
  activo?: boolean
}

interface AuthContextValue {
  usuario: Usuario | null
  cargando: boolean
  usuarios: Usuario[]
  login: (credenciales: Credenciales) => { ok: boolean; error?: string }
  logout: () => void
  crearUsuario: (datos: UsuarioNuevo) => { ok: boolean; error?: string }
  actualizarUsuario: (id: string, cambios: Partial<UsuarioNuevo>) => { ok: boolean; error?: string }
  eliminarUsuario: (id: string) => { ok: boolean; error?: string }
}

const CLAVE_USUARIOS = 'pc_usuarios'
const CLAVE_SESION = 'pc_sesion'

const AuthContext = createContext<AuthContextValue | null>(null)

// Hash simple para una app de demo sin backend. Cuando se conecte a MySQL la
// autenticación real ocurrirá en el servidor (bcrypt) y esto desaparecerá.
function hashPassword(password: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i)
    h1 = (h1 ^ c) * 0x01000193
    h2 = (h2 * 33) ^ c
  }
  h1 = h1 >>> 0
  h2 = h2 >>> 0
  return `pc$${h1.toString(16)}${h2.toString(16)}`
}

function usuarioPorDefecto(): Usuario {
  return {
    id: generarId(),
    nombre: 'Administrador',
    correo: 'admin@paredescano.com',
    usuario: 'admin',
    passwordHash: hashPassword('admin'),
    rol: 'admin',
    areaId: null,
    especialidad: 'Corporativo',
    activo: true,
  }
}

function sanitizarUsuario(usuario: Usuario): Usuario {
  return { ...usuario }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)

  // Carga inicial: si no hay usuarios registrados, crea el admin por defecto.
  useEffect(() => {
    let guardados = leerStorage<Usuario[]>(CLAVE_USUARIOS) ?? []
    if (guardados.length === 0) {
      guardados = [usuarioPorDefecto()]
      escribirStorage(CLAVE_USUARIOS, guardados)
    }
    setUsuarios(guardados)

    const sesionId = leerStorage<string>(CLAVE_SESION)
    if (sesionId) {
      const encontrado = guardados.find((u) => u.id === sesionId && u.activo)
      if (encontrado) setUsuario(encontrado)
    }
    setCargando(false)
  }, [])

  // Persistencia
  useEffect(() => {
    if (!cargando) escribirStorage(CLAVE_USUARIOS, usuarios)
  }, [usuarios, cargando])

  useEffect(() => {
    if (usuario) escribirStorage(CLAVE_SESION, usuario.id)
    else escribirStorage(CLAVE_SESION, null)
  }, [usuario])

  const login = useCallback((credenciales: Credenciales) => {
    const u = credenciales.usuario.trim().toLowerCase()
    const encontrado = usuarios.find((x) => x.usuario.toLowerCase() === u)
    if (!encontrado || encontrado.passwordHash !== hashPassword(credenciales.password)) {
      return { ok: false, error: 'Usuario o contraseña incorrectos.' }
    }
    if (!encontrado.activo) {
      return { ok: false, error: 'Tu cuenta está desactivada. Contacta al administrador.' }
    }
    setUsuario(sanitizarUsuario(encontrado))
    return { ok: true }
  }, [usuarios])

  const logout = useCallback(() => {
    setUsuario(null)
  }, [])

  const crearUsuario = useCallback((datos: UsuarioNuevo) => {
    const usuarioLimpio = datos.usuario.trim().toLowerCase()
    if (usuarios.some((u) => u.usuario.toLowerCase() === usuarioLimpio)) {
      return { ok: false, error: 'Ya existe un usuario con ese nombre.' }
    }
    const nuevo: Usuario = {
      id: generarId(),
      nombre: datos.nombre.trim(),
      correo: datos.correo.trim(),
      usuario: usuarioLimpio,
      passwordHash: hashPassword(datos.password),
      rol: datos.rol,
      areaId: datos.areaId ?? null,
      especialidad: datos.especialidad.trim(),
      activo: datos.activo !== false,
    }
    setUsuarios((prev) => [...prev, nuevo])
    return { ok: true }
  }, [usuarios])

  const actualizarUsuario = useCallback((id: string, cambios: Partial<UsuarioNuevo>) => {
    let error: string | undefined
    setUsuarios((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u
        const proximo: Usuario = { ...u }
        if (cambios.nombre !== undefined) proximo.nombre = cambios.nombre.trim()
        if (cambios.correo !== undefined) proximo.correo = cambios.correo.trim()
        if (cambios.usuario !== undefined) {
          const limpio = cambios.usuario.trim().toLowerCase()
          if (prev.some((o) => o.id !== id && o.usuario.toLowerCase() === limpio)) {
            error = 'Ya existe otro usuario con ese nombre.'
            return u
          }
          proximo.usuario = limpio
        }
        if (cambios.password !== undefined && cambios.password !== '') {
          proximo.passwordHash = hashPassword(cambios.password)
        }
        if (cambios.rol !== undefined) proximo.rol = cambios.rol
        if (cambios.areaId !== undefined) proximo.areaId = cambios.areaId
        if (cambios.especialidad !== undefined) proximo.especialidad = cambios.especialidad.trim()
        if (cambios.activo !== undefined) proximo.activo = cambios.activo
        return proximo
      }),
    )
    if (error) return { ok: false, error }
    return { ok: true }
  }, [])

  const eliminarUsuario = useCallback((id: string) => {
    setUsuarios((prev) => prev.filter((u) => u.id !== id))
    return { ok: true }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        usuario,
        cargando,
        usuarios,
        login,
        logout,
        crearUsuario,
        actualizarUsuario,
        eliminarUsuario,
      }}
    >
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
