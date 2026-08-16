'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface SettingsUsersProps {
  areaId: string
  especialidades: string[]
}

interface FormularioUsuario {
  nombre: string
  correo: string
  usuario: string
  password: string
  especialidad: string
}

export function SettingsUsers({ areaId, especialidades }: SettingsUsersProps) {
  const { usuarios, usuario: actual, crearUsuario, actualizarUsuario, eliminarUsuario } = useAuth()
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [formulario, setFormulario] = useState<FormularioUsuario>({
    nombre: '',
    correo: '',
    usuario: '',
    password: '',
    especialidad: especialidades[0] || '',
  })
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  const usuariosArea = usuarios.filter((u) => u.areaId === areaId && u.rol === 'abogado')
  const enModoEdicion = formularioAbierto

  const opcionesEspecialidad = especialidades.length > 0 ? especialidades : ['Corporativo', 'Tributario', 'Laboral']

  const comenzarNuevo = () => {
    setFormularioAbierto(true)
    setEditandoId(null)
    setFormulario({
      nombre: '',
      correo: '',
      usuario: '',
      password: '',
      especialidad: opcionesEspecialidad[0] || '',
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
      especialidad: opcionesEspecialidad[0] || '',
    })
    setError('')
    setExito('')
  }

  const comenzarEdicion = (id: string) => {
    const u = usuarios.find((x) => x.id === id)
    if (!u) return
    setFormularioAbierto(true)
    setEditandoId(id)
    setFormulario({
      nombre: u.nombre,
      correo: u.correo,
      usuario: u.usuario,
      password: '',
      especialidad: u.especialidad,
    })
    setError('')
    setExito('')
  }

  const manejarCambio = (campo: keyof FormularioUsuario, valor: string) => {
    setFormulario((prev) => ({ ...prev, [campo]: valor }))
  }

  const manejarGuardar = (e: React.FormEvent) => {
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

    let resultado
    if (!editandoId) {
      resultado = crearUsuario({
        nombre: formulario.nombre,
        correo: formulario.correo,
        usuario: formulario.usuario,
        password: formulario.password,
        rol: 'abogado',
        areaId,
        especialidad: formulario.especialidad,
      })
    } else {
      resultado = actualizarUsuario(editandoId, {
        nombre: formulario.nombre,
        correo: formulario.correo,
        usuario: formulario.usuario,
        password: formulario.password,
        areaId,
        especialidad: formulario.especialidad,
      })
    }

    if (!resultado.ok) {
      setError(resultado.error || 'No se pudo guardar.')
      return
    }

    setExito(editandoId ? 'Abogado actualizado correctamente.' : 'Abogado creado correctamente.')
    setFormularioAbierto(false)
    setEditandoId(null)
    setFormulario({
      nombre: '',
      correo: '',
      usuario: '',
      password: '',
      especialidad: opcionesEspecialidad[0] || '',
    })
  }

  const manejarEliminar = (id: string, nombre: string) => {
    if (id === actual?.id) {
      setError('No puedes eliminar tu propio usuario.')
      return
    }
    if (!window.confirm(`¿Eliminar al abogado "${nombre}"?`)) return
    eliminarUsuario(id)
    if (editandoId === id) {
      setFormularioAbierto(false)
      setEditandoId(null)
      setFormulario({ nombre: '', correo: '', usuario: '', password: '', especialidad: opcionesEspecialidad[0] || '' })
    }
    setError('')
    setExito('')
  }

  const inputClase =
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50'

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Abogados del área</h2>
          <p className="text-sm text-muted-foreground">
            Estos usuarios solo acceden a los módulos de esta área.
          </p>
        </div>
        {!enModoEdicion && (
          <button
            type="button"
            onClick={comenzarNuevo}
            className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
          >
            <Plus size={16} />
            Nuevo abogado
          </button>
        )}
      </div>

      {enModoEdicion && (
        <form onSubmit={manejarGuardar} className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {editandoId === null ? 'Nuevo abogado' : 'Editar abogado'}
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
              <label className="mb-1.5 block text-sm font-medium text-foreground">Especialidad</label>
              <select
                value={formulario.especialidad}
                onChange={(e) => manejarCambio('especialidad', e.target.value)}
                className={inputClase}
              >
                {opcionesEspecialidad.map((esp) => (
                  <option key={esp} value={esp}>
                    {esp}
                  </option>
                ))}
              </select>
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
              {editandoId === null ? 'Crear abogado' : 'Guardar cambios'}
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

      {usuariosArea.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
          <UserRound size={28} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Este área aún no tiene abogados asignados.
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
                    Abogado · {u.especialidad || 'Sin especialidad'}
                  </p>
                </div>
              </div>
              <div className="flex flex-none items-center gap-1.5">
                {!u.activo && (
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
                    Inactivo
                  </span>
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
    </div>
  )
}
