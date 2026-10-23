'use client'

import { useState } from 'react'
import { Clock, Plus, Pencil, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { SettingsHorario } from './settings-horario'
import { opcionesApi } from '@/lib/api-cliente'

interface SettingsUsersProps {
  areaId: number
}

interface FormularioUsuario {
  nombre: string
  correo: string
  usuario: string
  password: string
  cargo: string
}

export function SettingsUsers({ areaId }: SettingsUsersProps) {
  const { usuarios, usuario: actual, cargarUsuarios } = useAuth()
  const esJefeArea = actual?.rol === 'jefe_area'
  const esAdmin = actual?.rol === 'admin'
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [formulario, setFormulario] = useState<FormularioUsuario>({
    nombre: '',
    correo: '',
    usuario: '',
    password: '',
    cargo: '',
  })
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [horarioDe, setHorarioDe] = useState<{ id: number; nombre: string } | null>(null)

  const usuariosArea = usuarios.filter((u) => u.area_id === areaId && u.rol === 'personal')
  const enModoEdicion = formularioAbierto

  const comenzarNuevo = () => {
    setFormularioAbierto(true)
    setEditandoId(null)
    setFormulario({
      nombre: '',
      correo: '',
      usuario: '',
      password: '',
      cargo: '',
    })
    setError('')
    setExito('')
  }

  const cancelar = () => {
    setFormularioAbierto(false)
    setEditandoId(null)
    setFormulario({
      nombre: '',
      correo: '',
      usuario: '',
      password: '',
      cargo: '',
    })
    setError('')
    setExito('')
  }

  const comenzarEdicion = (id: number) => {
    const u = usuarios.find((x) => x.id === id)
    if (!u) return
    setFormularioAbierto(true)
    setEditandoId(id)
    setFormulario({
      nombre: u.nombre,
      correo: u.correo,
      usuario: u.usuario,
      password: '',
      cargo: u.cargo || '',
    })
    setError('')
    setExito('')
  }

  const manejarCambio = (campo: keyof FormularioUsuario, valor: string) => {
    setFormulario((prev) => ({ ...prev, [campo]: valor }))
  }

  const manejarGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setExito('')

    if (!formulario.nombre.trim() || !formulario.usuario.trim()) {
      setError('El nombre y el usuario son obligatorios.')
      return
    }
    if (!editandoId && !formulario.password) {
      setError('Debes asignar una contraseña.')
      return
    }

    try {
      const url = editandoId ? `/api/usuarios/${editandoId}` : '/api/usuarios'
      const method = editandoId ? 'PUT' : 'POST'
      const body: Record<string, unknown> = {
        nombre: formulario.nombre,
        correo: formulario.correo,
        usuario: formulario.usuario,
        cargo: formulario.cargo,
      }
      if (!esJefeArea || !editandoId) {
        body.rol = 'personal'
        body.area_id = areaId
      }
      if (formulario.password) {
        body.password = formulario.password
      }

      const res = await fetch(url, opcionesApi({ method, body }))
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar.')
        return
      }

      setExito(editandoId ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.')
      setFormularioAbierto(false)
      setEditandoId(null)
      setFormulario({ nombre: '', correo: '', usuario: '', password: '', cargo: '' })
      await cargarUsuarios()
    } catch {
      setError('No se pudo conectar al servidor.')
    }
  }

  const manejarEliminar = async (id: number, nombre: string) => {
    if (id === actual?.id) {
      setError('No puedes eliminar tu propio usuario.')
      return
    }
    const confirmado = window.confirm(
      esAdmin
        ? `¿Eliminar definitivamente al usuario "${nombre}" y todos sus registros (horas, horarios, excepciones, observaciones)? Esta acción no se puede deshacer.`
        : `¿Eliminar al usuario "${nombre}"?`
    )
    if (!confirmado) return
    try {
      setError('')
      setExito('')
      const res = await fetch(`/api/usuarios/${id}`, opcionesApi({ method: 'DELETE' }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo eliminar.')
        return
      }
      await cargarUsuarios()
      if (editandoId === id) {
        setFormularioAbierto(false)
        setEditandoId(null)
        setFormulario({ nombre: '', correo: '', usuario: '', password: '', cargo: '' })
      }
      setExito(
        data.desactivado
          ? data.message
          : data.eliminado
            ? 'Usuario y todos sus registros fueron eliminados.'
            : 'Usuario eliminado correctamente.'
      )
    } catch {
      setError('No se pudo eliminar.')
    }
  }

  const inputClase =
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50'

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Usuarios de la división</h2>
          <p className="text-sm text-muted-foreground">
            {esJefeArea ? 'Administra los colaboradores de tu área.' : 'Estos usuarios solo acceden a los módulos de esta división.'}
          </p>
        </div>
        {!enModoEdicion && (
          <button
            type="button"
            onClick={comenzarNuevo}
            className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
          >
            <Plus size={16} />
            Nuevo usuario
          </button>
        )}
      </div>

      {enModoEdicion && (
        <form onSubmit={manejarGuardar} className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {editandoId === null ? 'Nuevo usuario' : 'Editar usuario'}
          </h3>
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
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Contraseña {editandoId !== null && <span className="text-muted-foreground">(vacío = no cambiar)</span>}
              </label>
              <input
                type="password"
                value={formulario.password}
                onChange={(e) => manejarCambio('password', e.target.value)}
                className={inputClase}
                placeholder={editandoId === null ? 'Contraseña' : '••••••••'}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-foreground">Cargo</label>
              <input
                type="text"
                value={formulario.cargo}
                onChange={(e) => manejarCambio('cargo', e.target.value)}
                className={inputClase}
                placeholder="Ej. Jefe de marketing"
              />
            </div>
          </div>

          {(error || exito) && (
            <p
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                error
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {error || exito}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
            >
              {editandoId === null ? 'Crear usuario' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={cancelar}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!enModoEdicion && (error || exito) && (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          error
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
        }`}>
          {error || exito}
        </p>
      )}

      {usuariosArea.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
          <UserRound size={28} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Esta división aún no tiene usuarios asignados.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {usuariosArea.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/20">
                  <span className="text-xs font-bold uppercase text-[#c4b5fd]">
                    {u.nombre
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')}
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
                  <p className="truncate text-xs text-muted-foreground">
                    {u.rol} · {u.cargo || 'Sin cargo'}
                  </p>
                </div>
              </div>
              <div className="flex flex-none items-center gap-1.5">
                {!u.activo && (
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
                    Inactivo
                  </span>
                )}
                {!esJefeArea && (
                  <button
                    type="button"
                    onClick={() => setHorarioDe({ id: u.id, nombre: u.nombre })}
                    aria-label={`Horario de ${u.nombre}`}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-[#7c3aed]/10 hover:text-[#c4b5fd]"
                  >
                    <Clock size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => comenzarEdicion(u.id)}
                  aria-label={`Editar ${u.nombre}`}
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => manejarEliminar(u.id, u.nombre)}
                  aria-label={`Eliminar ${u.nombre}`}
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {horarioDe && <SettingsHorario usuario={horarioDe} onClose={() => setHorarioDe(null)} />}
    </div>
  )
}
