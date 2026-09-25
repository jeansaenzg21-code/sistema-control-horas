'use client'

import { useState } from 'react'
import { Shield, ShieldCheck, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface FormularioAdmin {
  nombre: string
  correo: string
  usuario: string
  password: string
}

function getHeaders() {
  const token = localStorage.getItem('pc_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function SettingsAdmins() {
  const { usuarios, usuario: actual, cargarUsuarios } = useAuth()
  const [cargando, setCargando] = useState<number | null>(null)
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [formulario, setFormulario] = useState<FormularioAdmin>({ nombre: '', correo: '', usuario: '', password: '' })
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState<{ usuarioExistente: { id: number; nombre: string } } | null>(null)

  const admins = usuarios.filter((u) => u.rol === 'admin')
  const inputClase = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50'

  const limpiarFormulario = () => {
    setFormulario({ nombre: '', correo: '', usuario: '', password: '' })
    setError('')
    setConfirmar(null)
  }

  const manejarCambio = (campo: keyof FormularioAdmin, valor: string) => {
    setFormulario((prev) => ({ ...prev, [campo]: valor }))
  }

  const promover = async (userId: number) => {
    setCargando(userId)
    try {
      const res = await fetch(`/api/usuarios/${userId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ rol: 'admin' }),
      })
      if (res.ok) {
        await cargarUsuarios()
        setFormularioAbierto(false)
        limpiarFormulario()
      }
    } finally {
      setCargando(null)
    }
  }

  const revocar = async (userId: number) => {
    if (userId === actual?.id) return
    setCargando(userId)
    try {
      const res = await fetch(`/api/usuarios/${userId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ rol: 'personal' }),
      })
      if (res.ok) await cargarUsuarios()
    } finally {
      setCargando(null)
    }
  }

  const manejarGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formulario.nombre.trim() || !formulario.usuario.trim()) {
      setError('El nombre y el usuario son obligatorios.')
      return
    }
    if (!formulario.password) {
      setError('La contraseña es obligatoria.')
      return
    }

    const correoLimpio = formulario.correo.trim().toLowerCase()
    if (correoLimpio) {
      const existente = usuarios.find((u) => u.correo.toLowerCase() === correoLimpio && u.rol !== 'admin')
      if (existente) {
        setConfirmar({ usuarioExistente: existente })
        return
      }
    }

    await crearAdmin()
  }

  const crearAdmin = async () => {
    setError('')
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          nombre: formulario.nombre,
          correo: formulario.correo,
          usuario: formulario.usuario,
          password: formulario.password,
          rol: 'admin',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo crear el usuario.')
        return
      }
      await cargarUsuarios()
      setFormularioAbierto(false)
      limpiarFormulario()
    } catch {
      setError('No se pudo conectar al servidor.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7c3aed]/15">
            <ShieldCheck size={24} className="text-[#a78bfa]" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">Administradores</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Los administradores tienen acceso total al sistema: divisiones, empresa, aprobaciones, consolidación y reportes.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Administradores actuales</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Estos usuarios tienen permisos de administrador en el sistema.
            </p>
          </div>
          {!formularioAbierto && (
            <button
              type="button"
              onClick={() => { setFormularioAbierto(true); limpiarFormulario() }}
              className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
            >
              <Plus size={16} />
              Nuevo administrador
            </button>
          )}
        </div>

        {formularioAbierto && (
          <form onSubmit={manejarGuardar} className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Nuevo administrador</h3>

            {confirmar && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-300">
                  El correo coincide con <strong>{confirmar.usuarioExistente.nombre}</strong>. ¿Desea promover a <strong>{confirmar.usuarioExistente.nombre}</strong> a Administrador del sistema?
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={cargando === confirmar.usuarioExistente.id}
                    onClick={() => promover(confirmar.usuarioExistente.id)}
                    className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-50"
                  >
                    {cargando === confirmar.usuarioExistente.id ? 'Promoviendo...' : 'Sí, promover'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfirmar(null); setError('') }}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre completo</label>
                <input
                  type="text"
                  value={formulario.nombre}
                  onChange={(e) => manejarCambio('nombre', e.target.value)}
                  className={inputClase}
                  placeholder="Ej. Juan Pérez"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Correo</label>
                <input
                  type="email"
                  value={formulario.correo}
                  onChange={(e) => manejarCambio('correo', e.target.value)}
                  className={inputClase}
                  placeholder="correo@paredescano.com"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Usuario</label>
                <input
                  type="text"
                  value={formulario.usuario}
                  onChange={(e) => manejarCambio('usuario', e.target.value)}
                  className={inputClase}
                  placeholder="nombre.usuario"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Contraseña</label>
                <input
                  type="password"
                  value={formulario.password}
                  onChange={(e) => manejarCambio('password', e.target.value)}
                  className={inputClase}
                  placeholder="Contraseña"
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                {error}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
              >
                Crear administrador
              </button>
              <button
                type="button"
                onClick={() => { setFormularioAbierto(false); limpiarFormulario() }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {admins.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
            <Shield size={28} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay administradores asignados.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {admins.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/20">
                    <span className="text-xs font-bold uppercase text-[#c4b5fd]">
                      {u.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {u.nombre}
                      {u.id === actual?.id && (
                        <span className="ml-2 rounded-full bg-[#7c3aed]/15 px-2 py-0.5 text-[11px] font-semibold text-[#c4b5fd]">
                          Tú
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{u.usuario}</p>
                  </div>
                </div>
                {u.id !== actual?.id && (
                  <button
                    type="button"
                    disabled={cargando === u.id}
                    onClick={() => revocar(u.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 disabled:opacity-50"
                  >
                    Revocar admin
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
