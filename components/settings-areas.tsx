'use client'

import { useState } from 'react'
import { Plus, ArrowLeft, Settings, Users, Trash2, Landmark, X } from 'lucide-react'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import { SettingsUsers } from './settings-users'

export function SettingsAreas() {
  const { areas, especialidades, crearArea, actualizarArea, eliminarArea, crearEspecialidad, eliminarEspecialidad } = useAreas()
  const { usuarios } = useAuth()
  const [areaSeleccionada, setAreaSeleccionada] = useState<number | null>(null)
  const [creando, setCreando] = useState(false)
  const [nuevaEspecialidad, setNuevaEspecialidad] = useState('')

  const area = areaSeleccionada != null ? areas.find((a) => a.id === areaSeleccionada) : null
  const usuariosArea = usuarios.filter((u) => u.area_id === areaSeleccionada && u.rol === 'personal')
  const especialidadesDelArea = area
    ? especialidades.filter((e) => e.area_id === area.id)
    : []

  const agregarEspecialidad = async () => {
    const valor = nuevaEspecialidad.trim()
    if (!valor || !area) return
    if (especialidadesDelArea.some((e) => e.nombre.toLowerCase() === valor.toLowerCase())) return
    await crearEspecialidad(area.id, valor)
    setNuevaEspecialidad('')
  }

  const quitarEspecialidad = async (espId: number) => {
    await eliminarEspecialidad(espId)
  }

  const manejarEliminar = async (id: number, nombre: string) => {
    const tieneUsuarios = usuarios.some((u) => u.area_id === id && u.rol === 'personal')
    if (tieneUsuarios) {
      window.alert('No se puede eliminar un área que tiene usuarios asignados.')
      return
    }
    if (!window.confirm(`¿Eliminar el área "${nombre}"?`)) return
    await eliminarArea(id)
    if (areaSeleccionada === id) setAreaSeleccionada(null)
  }

  const futuras = ['Contabilidad', 'Auditoría', 'Recursos Humanos']

  if (area) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAreaSeleccionada(null)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={15} />
            Volver
          </button>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{area.nombre}</h2>
            <p className="text-sm text-muted-foreground">{area.descripcion || 'Sin descripción'}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Configuración del área</h3>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre del área</label>
              <input
                type="text"
                value={area.nombre}
                onChange={(e) => actualizarArea(area.id, { nombre: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
              <input
                type="text"
                value={area.descripcion ?? ''}
                onChange={(e) => actualizarArea(area.id, { descripcion: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1.5 block text-sm font-medium text-foreground">Especialidades del área</label>
            <div className="flex flex-wrap gap-2">
              {especialidadesDelArea.map((esp) => (
                <span
                  key={esp.id}
                  className="flex items-center gap-1.5 rounded-full bg-[#7c3aed]/15 px-3 py-1 text-sm font-medium text-[#c4b5fd]"
                >
                  {esp.nombre}
                  <button
                    type="button"
                    onClick={() => quitarEspecialidad(esp.id)}
                    aria-label={`Quitar ${esp.nombre}`}
                    className="rounded-full p-0.5 text-[#c4b5fd]/70 transition-colors hover:text-rose-400"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={nuevaEspecialidad}
                  onChange={(e) => setNuevaEspecialidad(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      agregarEspecialidad()
                    }
                  }}
                  placeholder="Nueva especialidad..."
                  className="w-44 rounded-full border border-dashed border-border bg-background px-3 py-1 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:border-[#7c3aed]/50"
                />
                <button
                  type="button"
                  onClick={agregarEspecialidad}
                  aria-label="Agregar especialidad"
                  className="rounded-full bg-[#7c3aed]/15 p-1 text-[#c4b5fd] transition-colors hover:bg-[#7c3aed]/25"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => manejarEliminar(area.id, area.nombre)}
              className="flex items-center gap-2 rounded-lg border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
            >
              <Trash2 size={15} />
              Eliminar área
            </button>
          </div>
        </div>

        <SettingsUsers areaId={area.id} especialidades={especialidadesDelArea.map((e) => e.nombre)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Áreas de la empresa</h2>
          <p className="text-sm text-muted-foreground">
            Entra a un área para configurarla y gestionar sus usuarios
          </p>
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
        >
          <Plus size={16} />
          Nueva Área
        </button>
      </div>

      {creando && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            const nombre = String(form.get('nombre') || '').trim()
            const descripcion = String(form.get('descripcion') || '').trim()
            const resultado = await crearArea({ nombre, descripcion })
            if (resultado.ok) {
              setCreando(false)
            }
          }}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h3 className="mb-3 text-sm font-semibold text-foreground">Nueva área</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre</label>
              <input
                name="nombre"
                type="text"
                required
                placeholder="Ej. Área Legal"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
              <input
                name="descripcion"
                type="text"
                placeholder="Descripción breve"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
            >
              Crear área
            </button>
            <button
              type="button"
              onClick={() => setCreando(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {areas.map((area) => {
        const countUsuarios = usuarios.filter((u) => u.area_id === area.id && u.rol === 'personal').length
        const espDelArea = especialidades.filter((e) => e.area_id === area.id)
        return (
          <div key={area.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAreaSeleccionada(area.id)}
                  className="text-left"
                >
                  <h3 className="font-semibold text-foreground transition-colors hover:text-[#c4b5fd]">
                    {area.nombre}
                  </h3>
                </button>
              </div>
              <div className="flex flex-none items-center gap-1.5">
                <span className="flex items-center gap-1.5 rounded-full bg-[#7c3aed]/10 px-2.5 py-1 text-xs font-medium text-[#c4b5fd]">
                  <Users size={13} />
                  {countUsuarios} {countUsuarios === 1 ? 'usuario' : 'usuarios'}
                </span>
                <button
                  type="button"
                  onClick={() => setAreaSeleccionada(area.id)}
                  aria-label={`Configurar ${area.nombre}`}
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Settings size={17} />
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{area.descripcion}</p>
            <div className="mt-3 rounded-lg border border-border bg-muted p-3">
              <p className="mb-2 text-xs text-muted-foreground">Especialidades</p>
              <div className="flex flex-wrap gap-2">
                {espDelArea.map((esp) => (
                  <span
                    key={esp.id}
                    className="rounded-full bg-[#7c3aed]/15 px-3 py-1 text-sm font-medium text-[#c4b5fd]"
                  >
                    {esp.nombre}
                  </span>
                ))}
                {espDelArea.length === 0 && (
                  <span className="text-sm text-muted-foreground">Sin especialidades</span>
                )}
              </div>
            </div>
          </div>
        )
      })}

      <div className="rounded-xl border border-dashed border-border bg-card/50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Landmark size={16} className="text-muted-foreground" />
          Áreas próximas
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          En el futuro se incorporarán: {futuras.join(', ')}.
        </p>
      </div>
    </div>
  )
}
