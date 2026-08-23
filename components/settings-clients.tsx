'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, X, Clock, Building2, Mail, Phone, MapPin, Search, UsersRound, SlidersHorizontal } from 'lucide-react'
import { useClientes, type Cliente } from '@/lib/clientes-context'
import { useAreas } from '@/lib/areas-context'

interface FormularioCliente {
  nombre: string
  ruc: string
  correo: string
  telefono: string
  direccion: string
  area_id: number | ''
  horas_contratadas: number | ''
}

const formularioVacio: FormularioCliente = {
  nombre: '',
  ruc: '',
  correo: '',
  telefono: '',
  direccion: '',
  area_id: '',
  horas_contratadas: '',
}

export function SettingsClients() {
  const { clientes, crearCliente, actualizarCliente, eliminarCliente } = useClientes()
  const { areas } = useAreas()
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [formulario, setFormulario] = useState<FormularioCliente>(formularioVacio)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [areaFiltro, setAreaFiltro] = useState<number | ''>('')

  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (!termino && areaFiltro === '') return clientes
    return clientes.filter((cliente) =>
      (areaFiltro === '' || cliente.area_id === areaFiltro) &&
      [cliente.nombre, cliente.ruc, cliente.correo, cliente.area_nombre]
        .filter(Boolean)
        .some((valor) => valor!.toLowerCase().includes(termino)),
    )
  }, [clientes, busqueda, areaFiltro])

  const manejarCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formulario.nombre.trim() || !formulario.area_id) return
    setCargando(true)
    setError('')
    const resultado = await crearCliente({
      nombre: formulario.nombre.trim(),
      ruc: formulario.ruc.trim() || null,
      correo: formulario.correo.trim() || null,
      telefono: formulario.telefono.trim() || null,
      direccion: formulario.direccion.trim() || null,
      area_id: Number(formulario.area_id),
      horas_contratadas: Number(formulario.horas_contratadas) || 0,
    })
    setCargando(false)
    if (resultado.ok) {
      setFormulario(formularioVacio)
      setCreando(false)
    } else setError(resultado.error || 'No se pudo registrar el cliente.')
  }

  const manejarEditar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editandoId || !formulario.nombre.trim() || !formulario.area_id) return
    setCargando(true)
    setError('')
    const resultado = await actualizarCliente(editandoId, {
      nombre: formulario.nombre.trim(),
      ruc: formulario.ruc.trim() || null,
      correo: formulario.correo.trim() || null,
      telefono: formulario.telefono.trim() || null,
      direccion: formulario.direccion.trim() || null,
      area_id: Number(formulario.area_id),
      horas_contratadas: Number(formulario.horas_contratadas) || 0,
    })
    setCargando(false)
    if (resultado.ok) {
      setFormulario(formularioVacio)
      setEditandoId(null)
    } else setError(resultado.error || 'No se pudo actualizar el cliente.')
  }

  const iniciarEdicion = (cliente: Cliente) => {
    setFormulario({
      nombre: cliente.nombre,
      ruc: cliente.ruc || '',
      correo: cliente.correo || '',
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      area_id: cliente.area_id,
      horas_contratadas: cliente.horas_contratadas,
    })
    setEditandoId(cliente.id)
    setCreando(false)
  }

  const cancelar = () => {
    setFormulario(formularioVacio)
    setCreando(false)
    setEditandoId(null)
  }

  const manejarEliminar = async (id: number, nombre: string) => {
    if (!window.confirm(`¿Eliminar el cliente "${nombre}"?`)) return
    await eliminarCliente(id)
  }

  const formularioEsValido = formulario.nombre.trim() && formulario.area_id !== ''

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#7c3aed]/20 p-2.5 text-[#c4b5fd]"><UsersRound size={22} /></div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Cartera de clientes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Organiza clientes, áreas y horas contratadas.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/40 p-2">
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-muted-foreground">
                <SlidersHorizontal size={15} className="text-[#a78bfa]" />
                <select
                  value={areaFiltro}
                  onChange={(e) => setAreaFiltro(e.target.value ? Number(e.target.value) : '')}
                  aria-label="Filtrar por área"
                  className="cursor-pointer bg-transparent py-2 text-sm text-foreground outline-none"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="" className="bg-card text-foreground">Todas las áreas</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id} className="bg-card text-foreground">{area.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="relative w-full sm:w-48">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full rounded-lg border border-border/70 bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/20"
                />
              </div>
            </div>
            <button
              onClick={() => { setCreando((v) => !v); setEditandoId(null); setFormulario(formularioVacio); setError('') }}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#7c3aed]/20 transition-colors hover:bg-[#6d28d9]"
            >
              <Plus size={16} />
              Nuevo cliente
            </button>
          </div>
        </div>
      </div>

      {(creando || editandoId) && (
        <form
          onSubmit={editandoId ? manejarEditar : manejarCrear}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {editandoId ? 'Editar cliente' : 'Nuevo cliente'}
          </h3>
          {error && <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre *</label>
              <input
                type="text"
                value={formulario.nombre}
                onChange={(e) => setFormulario((f) => ({ ...f, nombre: e.target.value }))}
                required
                placeholder="Nombre del cliente"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">RUC</label>
              <input
                type="text"
                value={formulario.ruc}
                onChange={(e) => setFormulario((f) => ({ ...f, ruc: e.target.value }))}
                placeholder="RUC del cliente"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Correo</label>
              <input
                type="email"
                value={formulario.correo}
                onChange={(e) => setFormulario((f) => ({ ...f, correo: e.target.value }))}
                placeholder="correo@ejemplo.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Teléfono</label>
              <input
                type="text"
                value={formulario.telefono}
                onChange={(e) => setFormulario((f) => ({ ...f, telefono: e.target.value }))}
                placeholder="Teléfono de contacto"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Dirección</label>
              <input
                type="text"
                value={formulario.direccion}
                onChange={(e) => setFormulario((f) => ({ ...f, direccion: e.target.value }))}
                placeholder="Dirección del cliente"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Área *</label>
              <select
                value={formulario.area_id}
                onChange={(e) => setFormulario((f) => ({ ...f, area_id: e.target.value ? Number(e.target.value) : '' }))}
                required
                className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
              >
                <option value="">Selecciona un área...</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  Horas contratadas
                </span>
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={formulario.horas_contratadas}
                onChange={(e) => setFormulario((f) => ({ ...f, horas_contratadas: e.target.value ? Number(e.target.value) : '' }))}
                placeholder="Ej. 100"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={!formularioEsValido || cargando}
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cargando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear cliente'}
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

      {clientes.length === 0 && !creando && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Building2 size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No hay clientes registrados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea un nuevo cliente para comenzar a registrar horas
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 justify-items-start gap-4 md:grid-cols-2">
        {clientesFiltrados.map((cliente) => {
          const horasRestantes = cliente.horas_contratadas - cliente.horas_consumidas
          const porcentajeConsumo = cliente.horas_contratadas > 0
            ? Math.min(100, (cliente.horas_consumidas / cliente.horas_contratadas) * 100)
            : 0

          return (
            <div
              key={cliente.id}
              className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#7c3aed]/50 hover:shadow-lg hover:shadow-[#7c3aed]/5"
              style={{ width: '360px', maxWidth: '100%' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground">{cliente.nombre}</h3>
                  {cliente.ruc && (
                    <p className="mt-1 text-xs text-muted-foreground">RUC: {cliente.ruc}</p>
                  )}
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => iniciarEdicion(cliente)}
                    aria-label={`Editar ${cliente.nombre}`}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => manejarEliminar(cliente.id, cliente.nombre)}
                    aria-label={`Eliminar ${cliente.nombre}`}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 border-y border-border/70 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-[#a78bfa]" />
                  <span className="truncate">{cliente.area_nombre}</span>
                </div>
                {cliente.correo && (
                  <p className="flex items-center gap-2 truncate"><Mail size={14} className="text-[#a78bfa]" />{cliente.correo}</p>
                )}
                {cliente.telefono && (
                  <p className="flex items-center gap-2"><Phone size={14} className="text-[#a78bfa]" />{cliente.telefono}</p>
                )}
                {cliente.direccion && (
                  <p className="flex items-center gap-2 truncate"><MapPin size={14} className="text-[#a78bfa]" />{cliente.direccion}</p>
                )}
              </div>

              <div className="mt-3 rounded-lg border border-border bg-muted p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Horas contratadas: <span className="font-semibold text-foreground">{cliente.horas_contratadas}h</span></span>
                  <span>Consumidas: <span className="font-semibold text-foreground">{cliente.horas_consumidas}h</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${porcentajeConsumo}%`,
                      backgroundColor: porcentajeConsumo >= 90 ? '#ef4444' : porcentajeConsumo >= 70 ? '#f59e0b' : '#7c3aed',
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Restantes: <span className={`font-semibold ${horasRestantes <= 0 ? 'text-rose-400' : horasRestantes < 10 ? 'text-amber-400' : 'text-foreground'}`}>
                    {horasRestantes}h
                  </span>
                </p>
              </div>
            </div>
          )
        })}
        {clientesFiltrados.length === 0 && clientes.length > 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No hay clientes que coincidan con la búsqueda.
          </div>
        )}
      </div>
    </div>
  )
}
