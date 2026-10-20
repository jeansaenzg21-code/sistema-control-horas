'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarOff, Check, Loader2, Pencil, Plus, Search, Sun, Trash2, Umbrella, X } from 'lucide-react'
import { useAuth, type Usuario } from '@/lib/auth-context'
import { opcionesApi } from '@/lib/api-cliente'

interface ExcepcionRow {
  id: number
  fecha: string
  tipo: 'FERIADO' | 'VACACIONES'
  usuario_id: number | null
  descripcion: string | null
  usuario_nombre: string | null
  ambito: 'todos' | 'colaborador'
}

interface FormEstado {
  id: number | null
  fecha: string
  tipo: 'FERIADO' | 'VACACIONES'
  usuario_id: string
  descripcion: string
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

const FORM_VACIO: FormEstado = { id: null, fecha: '', tipo: 'FERIADO', usuario_id: '', descripcion: '' }

const estiloCampo =
  'h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/40'

export function ExcepcionesAdmin() {
  const { usuarios, empresaActiva } = useAuth()
  const colaboradores = usuarios.filter((u) => u.rol === 'personal' && u.activo)

  const [rows, setRows] = useState<ExcepcionRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrando, setMostrando] = useState<'mes' | 'todas'>('mes')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState<FormEstado>(FORM_VACIO)
  const [busquedaUsuario, setBusquedaUsuario] = useState('')
  const [autocompletadoAbierto, setAutocompletadoAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const usuarioSeleccionado = colaboradores.find((u) => String(u.id) === form.usuario_id) ?? null
  const sugerencias = useMemo<Usuario[]>(() => {
    const consulta = normalizarTexto(busquedaUsuario.trim())
    if (!consulta) return colaboradores.slice(0, 8)
    return colaboradores.filter((u) => normalizarTexto([
      u.nombre,
      u.usuario,
      u.area_nombre,
      u.cargo,
    ].filter(Boolean).join(' ')).includes(consulta)).slice(0, 8)
  }, [busquedaUsuario, colaboradores])

  const cargar = useCallback(async () => {
    setCargando(true)
    setMensaje(null)
    try {
      const params = new URLSearchParams()
      if (mostrando === 'mes') {
        const hoy = new Date()
        params.set('anio', String(hoy.getFullYear()))
        params.set('mes', String(hoy.getMonth() + 1))
      }
      const url = params.toString() ? `/api/excepciones?${params.toString()}` : '/api/excepciones'
      const res = await fetch(url, opcionesApi())
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMensaje({ tipo: 'error', texto: data.error || 'No se pudieron cargar las excepciones.' })
        setRows([])
        return
      }
      setRows(await res.json())
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al cargar las excepciones.' })
      setRows([])
    } finally {
      setCargando(false)
    }
  }, [mostrando, empresaActiva?.id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrirNueva = () => {
    setForm(FORM_VACIO)
    setBusquedaUsuario('')
    setAutocompletadoAbierto(false)
    setMensaje(null)
    setModalAbierto(true)
  }

  const abrirEdicion = (row: ExcepcionRow) => {
    const usuario = row.usuario_id != null
      ? colaboradores.find((colaborador) => colaborador.id === row.usuario_id)
      : null
    setForm({
      id: row.id,
      fecha: row.fecha,
      tipo: row.tipo,
      usuario_id: row.usuario_id != null ? String(row.usuario_id) : '',
      descripcion: row.descripcion ?? '',
    })
    setBusquedaUsuario(usuario?.nombre ?? '')
    setAutocompletadoAbierto(false)
    setMensaje(null)
    setModalAbierto(true)
  }

  const guardar = async () => {
    if (!form.fecha) {
      setMensaje({ tipo: 'error', texto: 'Selecciona una fecha.' })
      return
    }
    if (form.tipo === 'VACACIONES' && !form.usuario_id) {
      setMensaje({ tipo: 'error', texto: 'Selecciona un colaborador para registrar vacaciones.' })
      return
    }
    setGuardando(true)
    setMensaje(null)
    try {
      const body = {
        fecha: form.fecha,
        tipo: form.tipo,
        usuario_id: form.usuario_id ? Number(form.usuario_id) : null,
        descripcion: form.descripcion,
      }
      const url = form.id ? `/api/excepciones/${form.id}` : '/api/excepciones'
      const res = await fetch(url, opcionesApi({
        method: form.id ? 'PUT' : 'POST',
        body,
      }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.error || 'No se pudo guardar la excepción.' })
        return
      }
      setModalAbierto(false)
      setMensaje({ tipo: 'ok', texto: form.id ? 'Excepción actualizada.' : 'Excepción agregada.' })
      cargar()
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al guardar.' })
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (row: ExcepcionRow) => {
    if (!window.confirm(`¿Eliminar la excepción del ${row.fecha} (${row.tipo})?`)) return
    setMensaje(null)
    try {
      const res = await fetch(`/api/excepciones/${row.id}`, opcionesApi({ method: 'DELETE' }))
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMensaje({ tipo: 'error', texto: data.error || 'No se pudo eliminar.' })
        return
      }
      setMensaje({ tipo: 'ok', texto: 'Excepción eliminada.' })
      cargar()
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al eliminar.' })
    }
  }

  const seleccionarUsuario = (usuario: Usuario) => {
    setForm((actual) => ({ ...actual, usuario_id: String(usuario.id) }))
    setBusquedaUsuario(usuario.nombre)
    setAutocompletadoAbierto(false)
  }

  const seleccionarGeneral = () => {
    setForm((actual) => ({ ...actual, usuario_id: '' }))
    setBusquedaUsuario('')
    setAutocompletadoAbierto(false)
  }

  const editarBusquedaUsuario = (valor: string) => {
    setBusquedaUsuario(valor)
    if (valor !== (usuarioSeleccionado?.nombre ?? '')) {
      setForm((actual) => ({ ...actual, usuario_id: '' }))
    }
    setAutocompletadoAbierto(true)
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarOff size={15} className="text-sky-400" />
            Feriados y vacaciones
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Estas fechas se excluyen del cálculo de cumplimiento del módulo /cumplimiento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            <button
              onClick={() => setMostrando('mes')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mostrando === 'mes' ? 'bg-[#7c3aed] text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Este mes
            </button>
            <button
              onClick={() => setMostrando('todas')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mostrando === 'todas' ? 'bg-[#7c3aed] text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Todas
            </button>
          </div>
          <button
            onClick={abrirNueva}
            className="flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#6d28d9]"
          >
            <Plus size={13} />
            Agregar excepción
          </button>
        </div>
      </div>

      {mensaje && (
        <div
          className={`mx-4 mt-2.5 rounded-md px-3 py-1.5 text-[11px] ${
            mensaje.tipo === 'ok'
              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {cargando ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground">Cargando excepciones...</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground">
          No hay excepciones {mostrando === 'mes' ? 'para este mes' : 'registradas'}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground">Fecha</th>
                <th className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground">Tipo</th>
                <th className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground">Colaborador</th>
                <th className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground">Descripción</th>
                <th className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 transition-colors hover:bg-[#7c3aed]/5">
                  <td className="whitespace-nowrap px-4 py-1.5 text-xs tabular-nums text-muted-foreground">{row.fecha}</td>
                  <td className="px-4 py-1.5">
                    <span
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        row.tipo === 'FERIADO'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                          : 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                      }`}
                    >
                      {row.tipo === 'FERIADO' ? <Sun size={10} /> : <Umbrella size={10} />}
                      {row.tipo.charAt(0) + row.tipo.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-xs text-muted-foreground">
                    {row.ambito === 'todos' ? (
                      <span className="text-muted-foreground">General (todos)</span>
                    ) : (
                      row.usuario_nombre ?? `#${row.usuario_id}`
                    )}
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-1.5 text-xs text-muted-foreground" title={row.descripcion ?? ''}>
                    {row.descripcion ?? '—'}
                  </td>
                  <td className="px-4 py-1.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => abrirEdicion(row)}
                        title="Editar"
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[#7c3aed]/10 hover:text-[#c4b5fd]"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => eliminar(row)}
                        title="Eliminar"
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalAbierto(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {form.id ? 'Editar excepción' : 'Agregar excepción'}
                </h2>
                <p className="text-xs text-muted-foreground">Feriado o vacaciones</p>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Fecha</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  className={`${estiloCampo} cursor-pointer`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as FormEstado['tipo'] })}
                  className={`${estiloCampo} cursor-pointer`}
                >
                  <option value="FERIADO">Feriado</option>
                  <option value="VACACIONES">Vacaciones</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Colaborador {form.tipo === 'VACACIONES' ? '(obligatorio)' : '(opcional)'}
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input
                    type="text"
                    value={usuarioSeleccionado?.nombre ?? busquedaUsuario}
                    onFocus={() => {
                      if (form.usuario_id) {
                        setBusquedaUsuario('')
                        setForm((actual) => ({ ...actual, usuario_id: '' }))
                      }
                      setAutocompletadoAbierto(true)
                    }}
                    onChange={(e) => editarBusquedaUsuario(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setAutocompletadoAbierto(false)
                    }}
                    placeholder={form.tipo === 'FERIADO' ? 'General (todos) o escribe para buscar...' : 'Escribe el nombre del colaborador...'}
                    className={`${estiloCampo} pl-8 pr-8`}
                    autoComplete="off"
                    aria-label="Buscar colaborador"
                  />
                  {form.usuario_id && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={seleccionarGeneral}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Limpiar colaborador"
                    >
                      <X size={13} />
                    </button>
                  )}
                  {autocompletadoAbierto && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl">
                      {form.tipo === 'FERIADO' && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={seleccionarGeneral}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
                        >
                          <span className="flex items-center gap-2"><CalendarOff size={13} className="text-amber-400" />General (todos)</span>
                          {!form.usuario_id && <Check size={13} className="text-emerald-400" />}
                        </button>
                      )}
                      {sugerencias.length === 0 ? (
                        <p className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">No se encontraron colaboradores.</p>
                      ) : (
                        sugerencias.map((colaborador) => {
                          const seleccionado = String(colaborador.id) === form.usuario_id
                          return (
                            <button
                              key={colaborador.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => seleccionarUsuario(colaborador)}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/15 text-[9px] font-semibold text-[#c4b5fd]">
                                  {colaborador.nombre.split(' ').map((parte) => parte[0]).slice(0, 2).join('').toUpperCase()}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium text-foreground">{colaborador.nombre}</span>
                                  <span className="block truncate text-[10px] text-muted-foreground">
                                    {[colaborador.area_nombre, colaborador.cargo].filter(Boolean).join(' · ') || 'Sin división'}
                                  </span>
                                </span>
                              </span>
                              {seleccionado && <Check size={14} className="shrink-0 text-emerald-400" />}
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
                {usuarioSeleccionado && (
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">
                    {[usuarioSeleccionado.area_nombre, usuarioSeleccionado.cargo].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Descripción (opcional)</label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') guardar() }}
                  placeholder="Ej.: Feriado nacional"
                  className={estiloCampo}
                />
              </div>
              {mensaje && (
                <div
                  className={`rounded-md px-3 py-1.5 text-[11px] ${
                    mensaje.tipo === 'ok'
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border border-rose-500/30 bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {mensaje.texto}
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-border px-4 py-3">
              <button
                onClick={guardar}
                disabled={guardando}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-50"
              >
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {form.id ? 'Guardar cambios' : 'Agregar'}
              </button>
              <button
                onClick={() => setModalAbierto(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}