'use client'

import { useState } from 'react'
import { Plus, Trash2, UserRound, UsersRound } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useAreas } from '@/lib/areas-context'

interface FormularioJefe {
  nombre: string
  correo: string
  usuario: string
  password: string
  cargo: string
  area_id: string
}

const formularioVacio: FormularioJefe = {
  nombre: '',
  correo: '',
  usuario: '',
  password: '',
  cargo: '',
  area_id: '',
}

function getHeaders() {
  const token = localStorage.getItem('pc_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function SettingsJefes() {
  const { usuarios, cargarUsuarios } = useAuth()
  const { areas } = useAreas()
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [formulario, setFormulario] = useState<FormularioJefe>(formularioVacio)
  const [guardando, setGuardando] = useState(false)
  const [eliminando, setEliminando] = useState<number | null>(null)
  const [seleccionPromover, setSeleccionPromover] = useState('')
  const [promoviendo, setPromoviendo] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  const jefes = usuarios.filter((u) => u.rol === 'jefe_area')
  const areasActivas = areas.filter((area) => area.activo)
  const colaboradoresDisponibles = usuarios.filter((u) => (
    u.rol === 'personal'
    && u.activo
    && u.area_id != null
    && !jefes.some((jefe) => jefe.area_id === u.area_id)
    && !areas.some((area) => area.id === u.area_id && area.jefe_id != null)
  ))

  const abrirFormulario = () => {
    setFormulario({ ...formularioVacio, area_id: areasActivas[0] ? String(areasActivas[0].id) : '' })
    setFormularioAbierto(true)
    setError('')
    setExito('')
  }

  const cerrarFormulario = () => {
    setFormularioAbierto(false)
    setFormulario(formularioVacio)
    setError('')
  }

  const cambiar = (campo: keyof FormularioJefe, valor: string) => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
  }

  const crearJefe = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (!formulario.nombre.trim() || !formulario.usuario.trim() || !formulario.password || !formulario.area_id) {
      setError('Completa nombre, usuario, contraseña y división.')
      return
    }

    setGuardando(true)
    setError('')
    setExito('')
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          nombre: formulario.nombre,
          correo: formulario.correo,
          usuario: formulario.usuario,
           password: formulario.password,
           cargo: formulario.cargo.trim(),
           rol: 'jefe_area',
          area_id: Number(formulario.area_id),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo crear el jefe de área.')
        return
      }
      await cargarUsuarios()
      setFormularioAbierto(false)
      setFormulario(formularioVacio)
      setExito('Jefe de área creado correctamente.')
    } catch {
      setError('No se pudo conectar al servidor.')
    } finally {
      setGuardando(false)
    }
  }

  const revocar = async (id: number, nombre: string) => {
    if (!window.confirm(`¿Revocar el perfil de jefe de área de "${nombre}"?`)) return
    setEliminando(id)
    setError('')
    setExito('')
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ rol: 'personal' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo revocar el perfil.')
        return
      }
      await cargarUsuarios()
      setExito('El perfil fue revocado correctamente.')
    } catch {
      setError('No se pudo conectar al servidor.')
    } finally {
      setEliminando(null)
    }
  }

  const promover = async () => {
    const colaborador = usuarios.find((u) => u.id === Number(seleccionPromover))
    if (!colaborador || colaborador.area_id == null) return
    setPromoviendo(true)
    setError('')
    setExito('')
    try {
      const res = await fetch(`/api/usuarios/${colaborador.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ rol: 'jefe_area', area_id: colaborador.area_id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo asignar el jefe de área.')
        return
      }
      await cargarUsuarios()
      setSeleccionPromover('')
      setExito('El colaborador fue asignado como jefe de área.')
    } catch {
      setError('No se pudo conectar al servidor.')
    } finally {
      setPromoviendo(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#7c3aed]/15">
            <UserRound size={22} className="text-[#c4b5fd]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Jefes de área</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Administran únicamente los datos de su división. No pueden aprobar, rechazar ni solicitar correcciones de registros.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Perfiles asignados</h3>
            <p className="mt-1 text-xs text-muted-foreground">Cada jefe pertenece a una sola división.</p>
          </div>
          {!formularioAbierto && (
            <button
              type="button"
              onClick={abrirFormulario}
              className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
            >
              <Plus size={16} />
              Nuevo jefe de área
            </button>
          )}
        </div>

        {formularioAbierto && (
          <form onSubmit={crearJefe} className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <h4 className="mb-3 text-sm font-semibold text-foreground">Crear jefe de área</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Nombre completo</label>
                <input value={formulario.nombre} onChange={(e) => cambiar('nombre', e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50" placeholder="Ej. Ana Pérez" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Correo</label>
                <input type="email" value={formulario.correo} onChange={(e) => cambiar('correo', e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50" placeholder="correo@paredescano.com" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Usuario</label>
                <input value={formulario.usuario} onChange={(e) => cambiar('usuario', e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50" placeholder="ana.perez" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Contraseña</label>
                <input type="password" value={formulario.password} onChange={(e) => cambiar('password', e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50" placeholder="Contraseña temporal" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Cargo</label>
                <input value={formulario.cargo} onChange={(e) => cambiar('cargo', e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50" placeholder="Ej. Jefe de marketing" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-foreground">División</label>
                <select value={formulario.area_id} onChange={(e) => cambiar('area_id', e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50">
                  <option value="">Selecciona una división...</option>
                  {areasActivas.map((area) => <option key={area.id} value={String(area.id)}>{area.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={guardando} className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:opacity-50">
                {guardando ? 'Creando...' : 'Crear jefe de área'}
              </button>
              <button type="button" onClick={cerrarFormulario} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button>
            </div>
          </form>
        )}

        {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>}
        {exito && <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">{exito}</p>}

        {colaboradoresDisponibles.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
            <h4 className="text-sm font-semibold text-foreground">Asignar un colaborador existente</h4>
            <p className="mt-1 text-xs text-muted-foreground">Convierte un perfil importado en jefe de su división.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={seleccionPromover}
                onChange={(e) => setSeleccionPromover(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              >
                <option value="">Selecciona un colaborador...</option>
                {colaboradoresDisponibles.map((colaborador) => (
                  <option key={colaborador.id} value={String(colaborador.id)}>
                    {colaborador.nombre} · {colaborador.area_nombre || 'Sin división'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void promover()}
                disabled={!seleccionPromover || promoviendo}
                className="h-10 rounded-lg border border-[#7c3aed]/40 px-4 text-sm font-semibold text-[#c4b5fd] transition-colors hover:bg-[#7c3aed]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {promoviendo ? 'Asignando...' : 'Asignar jefe'}
              </button>
            </div>
          </div>
        )}

        {jefes.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-card/50 p-7 text-center">
            <UsersRound size={28} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Todavía no hay jefes de área.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {jefes.map((jefe) => (
              <div key={jefe.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/20 text-xs font-bold uppercase text-[#c4b5fd]">
                    {jefe.nombre.split(' ').map((parte) => parte[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{jefe.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">{jefe.cargo || 'Sin cargo'} · {jefe.area_nombre || 'Sin división'} · @{jefe.usuario}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={eliminando === jefe.id}
                  onClick={() => revocar(jefe.id, jefe.nombre)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {eliminando === jefe.id ? 'Revocando...' : 'Revocar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
