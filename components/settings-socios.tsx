'use client'

// Gestión del perfil SOCIO: usuarios que ven todo y no modifican nada.
//
// Sigue el mismo patrón que la pantalla de administradores (crear, promover,
// revocar), con dos diferencias que no son estilísticas:
//
//   - Pide DIVISIÓN. `usuarios.area_id` es NOT NULL, así que un socio tiene que
//     estar en un área. No le da ningún permiso sobre ella: el bloqueo de
//     escritura no depende del área.
//   - "Revocar" devuelve a `personal`, no borra nada. Un socio pasa a ver solo sus
//     propias horas, que es lo que tenía antes de darle el rol.

import { useState } from 'react'
import { Eye, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useAreas } from '@/lib/areas-context'
import { opcionesApi } from '@/lib/api-cliente'

interface FormularioSocio {
  nombre: string
  correo: string
  usuario: string
  password: string
  area_id: string
}

export function SettingsSocios() {
  const { usuarios, usuario: actual, cargarUsuarios } = useAuth()
  const { areas } = useAreas()
  const [cargando, setCargando] = useState<number | null>(null)
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [formulario, setFormulario] = useState<FormularioSocio>({
    nombre: '', correo: '', usuario: '', password: '', area_id: '',
  })
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState<{ usuarioExistente: { id: number; nombre: string } } | null>(null)

  const socios = usuarios.filter((u) => u.rol === 'socio')
  const inputClase = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50'
  const divisiones = areas.filter((a) => a.activo)

  const limpiarFormulario = () => {
    setFormulario({ nombre: '', correo: '', usuario: '', password: '', area_id: '' })
    setError('')
    setConfirmar(null)
  }

  const manejarCambio = (campo: keyof FormularioSocio, valor: string) => {
    setFormulario((prev) => ({ ...prev, [campo]: valor }))
  }

  const promover = async (userId: number) => {
    setCargando(userId)
    setError('')
    try {
      const res = await fetch(`/api/usuarios/${userId}`, opcionesApi({
        method: 'PUT',
        body: { rol: 'socio' },
      }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo convertir en socio.')
        return
      }
      await cargarUsuarios()
      setFormularioAbierto(false)
      limpiarFormulario()
    } catch {
      setError('No se pudo conectar al servidor.')
    } finally {
      setCargando(null)
    }
  }

  const revocar = async (userId: number) => {
    if (userId === actual?.id) return
    setCargando(userId)
    setError('')
    try {
      const res = await fetch(`/api/usuarios/${userId}`, opcionesApi({
        method: 'PUT',
        // Vuelve a colaborador: recupera el acceso normal a sus propias horas.
        body: { rol: 'personal' },
      }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo revocar el rol de socio.')
        return
      }
      await cargarUsuarios()
    } catch {
      setError('No se pudo conectar al servidor.')
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
    if (!formulario.area_id) {
      setError('Selecciona la división del socio.')
      return
    }

    const correoLimpio = formulario.correo.trim().toLowerCase()
    const usuarioLimpio = formulario.usuario.trim().toLowerCase()
    const existente = usuarios.find(
      (u) =>
        (correoLimpio && u.correo.toLowerCase() === correoLimpio) ||
        (usuarioLimpio && u.usuario.toLowerCase() === usuarioLimpio)
    )
    if (existente && existente.rol !== 'socio') {
      setConfirmar({ usuarioExistente: existente })
      return
    }
    if (existente && existente.rol === 'socio') {
      setError('Ese usuario o correo ya pertenece a un socio.')
      return
    }

    await crearSocio()
  }

  const crearSocio = async () => {
    setError('')
    try {
      const res = await fetch('/api/usuarios', opcionesApi({
        method: 'POST',
        body: {
          nombre: formulario.nombre,
          correo: formulario.correo,
          usuario: formulario.usuario,
          password: formulario.password,
          area_id: Number(formulario.area_id),
          rol: 'socio',
        },
      }))
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15">
            <Eye size={24} className="text-sky-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">Socios (solo lectura)</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ven todos los datos de la empresa: registros de horas, clientes, presupuestos,
              consolidación, cumplimiento y reportes. No pueden registrar, aprobar, editar nada ni
              entrar en la configuración. El bloqueo está en el servidor, no en la pantalla: un POST
              hecho a mano recibe «no autorizado».
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Socios actuales</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Revocar devuelve a la persona al rol de colaborador: conserva su cuenta y sus horas.
            </p>
          </div>
          {!formularioAbierto && (
            <button
              type="button"
              onClick={() => { setFormularioAbierto(true); limpiarFormulario() }}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
            >
              <Plus size={16} />
              Nuevo socio
            </button>
          )}
        </div>

        {formularioAbierto && (
          <form onSubmit={manejarGuardar} autoComplete="off" className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Nuevo socio</h3>

            {confirmar && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-300">
                  El usuario o correo ya existe. ¿Convertir a <strong>{confirmar.usuarioExistente.nombre}</strong> en socio (solo lectura)?
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={cargando === confirmar.usuarioExistente.id}
                    onClick={() => promover(confirmar.usuarioExistente.id)}
                    className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-50"
                  >
                    {cargando === confirmar.usuarioExistente.id ? 'Convirtiendo...' : 'Sí, convertir'}
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
                  autoComplete="off"
                  name="socio_nombre"
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
                  autoComplete="off"
                  name="socio_correo"
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
                  autoComplete="off"
                  name="socio_usuario"
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
                  autoComplete="new-password"
                  name="socio_password"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">División</label>
                <select
                  value={formulario.area_id}
                  onChange={(e) => manejarCambio('area_id', e.target.value)}
                  className={inputClase}
                  autoComplete="off"
                  name="socio_area"
                >
                  <option value="">Selecciona una división...</option>
                  {divisiones.map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.nombre}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Obligatoria porque la base la exige. No otorga permisos: el socio ve toda la empresa
                  sea cual sea su división.
                </p>
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
                Crear socio
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

        {socios.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
            <Eye size={28} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay socios asignados.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {socios.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-sky-500/20">
                    <span className="text-xs font-bold uppercase text-sky-300">
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
                      {!u.activo && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          Inactivo
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.usuario}{u.area_nombre ? ` · ${u.area_nombre}` : ''}
                    </p>
                  </div>
                </div>
                {u.id !== actual?.id && (
                  <button
                    type="button"
                    disabled={cargando === u.id}
                    onClick={() => revocar(u.id)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                  >
                    {cargando === u.id ? 'Revocando...' : 'Revocar socio'}
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
