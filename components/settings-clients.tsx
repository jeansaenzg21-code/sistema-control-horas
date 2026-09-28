'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Clock, FileSpreadsheet, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, UsersRound } from 'lucide-react'
import { useClientes, type Cliente } from '@/lib/clientes-context'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import { useNotificaciones } from '@/lib/notificaciones-context'
import { evaluarBolsaHoras } from '@/lib/bolsa-horas'
import { formatoHoras } from '@/lib/utils'
import { SettingsClientePresupuestos } from './settings-cliente-presupuestos'
import { ImportadorPresupuesto } from './cliente-desde-excel'

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

function normalizar(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .map((parte) => parte[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function SettingsClients() {
  const { clientes, cargando, crearCliente, actualizarCliente, eliminarCliente } = useClientes()
  const { areas } = useAreas()
  const { usuario } = useAuth()
  const esJefeArea = usuario?.rol === 'jefe_area'
  const { cargarNotificaciones } = useNotificaciones()
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [formulario, setFormulario] = useState<FormularioCliente>(formularioVacio)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [areaFiltro, setAreaFiltro] = useState<number | ''>('')
  // Cliente al que se le está viendo el presupuesto. El import vive aquí.
  const [presupuestosDe, setPresupuestosDe] = useState<{ id: number; nombre: string } | null>(null)
  // Alta de cliente leyendo el presupuesto en Excel.
  const [importandoDesdeExcel, setImportandoDesdeExcel] = useState(false)

  useEffect(() => {
    if (!cargando && usuario) void cargarNotificaciones(usuario.id)
  }, [cargando, usuario, cargarNotificaciones])

  const clientesFiltrados = useMemo(() => {
    const termino = normalizar(busqueda.trim())
    return clientes.filter((cliente) => {
      if (areaFiltro !== '' && cliente.area_id !== areaFiltro) return false
      if (!termino) return true
      return [cliente.nombre, cliente.ruc, cliente.correo, cliente.telefono, cliente.direccion, cliente.area_nombre]
        .some((valor) => normalizar(valor).includes(termino))
    })
  }, [clientes, busqueda, areaFiltro])

  const abrirCrear = () => {
    setFormulario({
      ...formularioVacio,
      area_id: esJefeArea && usuario?.area_id ? Number(usuario.area_id) : '',
    })
    setEditandoId(null)
    setCreando(true)
    setError('')
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
    setError('')
  }

  const cancelar = () => {
    setFormulario(formularioVacio)
    setCreando(false)
    setEditandoId(null)
    setError('')
  }

  const manejarCrear = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (!formulario.nombre.trim() || !formulario.area_id) return
    setGuardando(true)
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
    setGuardando(false)
    if (resultado.ok) cancelar()
    else setError(resultado.error || 'No se pudo registrar el cliente.')
  }

  const manejarEditar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (!editandoId || !formulario.nombre.trim() || !formulario.area_id) return
    setGuardando(true)
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
    setGuardando(false)
    if (resultado.ok) cancelar()
    else setError(resultado.error || 'No se pudo actualizar el cliente.')
  }

  const manejarEliminar = async (id: number, nombre: string) => {
    if (!window.confirm(`¿Eliminar el cliente "${nombre}"?`)) return
    await eliminarCliente(id)
  }

  const formularioEsValido = Boolean(formulario.nombre.trim() && formulario.area_id !== '')

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#7c3aed]/15 text-[#c4b5fd]">
            <UsersRound size={20} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a78bfa]">Administración</p>
            <h1 className="mt-1 text-lg font-semibold text-foreground">Cartera de clientes</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Organiza clientes, divisiones y horas contratadas.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={abrirCrear}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9]"
        >
          <Plus size={16} />
          Nuevo cliente
        </button>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="buscar-cliente" className="sr-only">Buscar clientes</label>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="buscar-cliente"
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por nombre, RUC o contacto..."
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#7c3aed]/50"
          />
        </div>
        <div className="w-full sm:w-52">
          <label htmlFor="filtro-area-clientes" className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Building2 size={13} />
            División
          </label>
          <select
            id="filtro-area-clientes"
            value={areaFiltro}
            onChange={(evento) => setAreaFiltro(evento.target.value ? Number(evento.target.value) : '')}
            className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
          >
            <option value="">Todas las divisiones</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.nombre}</option>)}
          </select>
        </div>
        <span className="px-1 pb-2 text-[11px] text-muted-foreground sm:whitespace-nowrap">
          {clientesFiltrados.length} {clientesFiltrados.length === 1 ? 'cliente' : 'clientes'}
        </span>
      </section>
      {creando && !editandoId && !importandoDesdeExcel && (
        <section className="rounded-xl border border-border bg-card/40 p-4">
          <h2 className="text-sm font-semibold text-foreground">Nuevo cliente</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            El presupuesto en Excel ya trae el nombre del cliente y su división. Súbelo y se
            rellena solo.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportandoDesdeExcel(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9]"
            >
              <FileSpreadsheet size={14} />
              Desde un presupuesto en Excel
            </button>
            <button
              type="button"
              onClick={() => {
                setFormulario(formularioVacio)
                setCreando(false)
              }}
              className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Crear sin presupuesto
            </button>
          </div>
        </section>
      )}

      {creando && importandoDesdeExcel && (
        <ImportadorPresupuesto
          onCancelar={() => setImportandoDesdeExcel(false)}
          onListo={async (datos) => {
            // Primero el cliente, porque presupuesto_servicios y el propio
            // presupuesto cuelgan de el y no pueden existir sin cliente.
            const creado = await crearCliente({
              nombre: datos.nombre,
              area_id: datos.areaId,
              horas_contratadas: datos.horas,
              // El Excel no trae datos de contacto: se dejan vacíos y el usuario
              // los rellena después si los necesita.
              ruc: null,
              correo: null,
              telefono: null,
              direccion: null,
            })
            if (!creado) {
              setError('No se pudo crear el cliente.')
              return
            }
            const clienteNuevo = clientes.find((c) => c.nombre.trim() === datos.nombre)
            if (!clienteNuevo) {
              setImportandoDesdeExcel(false)
              return
            }

            // Y después el presupuesto, reenviando el Excel que ya se había leído.
            const binario = Uint8Array.from(atob(datos.archivoBase64), (c) => c.charCodeAt(0))
            const fd = new FormData()
            fd.append('archivo', new File([binario], datos.nombreArchivo))
            fd.append('cliente_id', String(clienteNuevo.id))
            const r = await fetch('/api/presupuestos', { method: 'POST', body: fd })
            if (!r.ok) {
              const cuerpo = await r.json().catch(() => ({}))
              setError(
                `El cliente se creó, pero el presupuesto no se pudo importar: ${cuerpo.error ?? 'error desconocido'}.`
              )
            }
            setImportandoDesdeExcel(false)
            setCreando(false)
            setPresupuestosDe({ id: clienteNuevo.id, nombre: clienteNuevo.nombre })
          }}
        />
      )}

      {(editandoId || (creando && !importandoDesdeExcel)) && (
        <form onSubmit={editandoId ? manejarEditar : manejarCrear} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{editandoId ? 'Editar cliente' : 'Nuevo cliente (manual)'}</h2>
            <button type="button" onClick={cancelar} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar formulario">
              <span className="sr-only">Cerrar</span>
              ×
            </button>
          </div>
          {error && <p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Nombre *</span>
              <input type="text" required value={formulario.nombre} onChange={(evento) => setFormulario((f) => ({ ...f, nombre: evento.target.value }))} placeholder="Nombre del cliente" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">RUC</span>
              <input type="text" value={formulario.ruc} onChange={(evento) => setFormulario((f) => ({ ...f, ruc: evento.target.value }))} placeholder="RUC del cliente" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Correo</span>
              <input type="email" value={formulario.correo} onChange={(evento) => setFormulario((f) => ({ ...f, correo: evento.target.value }))} placeholder="correo@ejemplo.com" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Teléfono</span>
              <input type="text" value={formulario.telefono} onChange={(evento) => setFormulario((f) => ({ ...f, telefono: evento.target.value }))} placeholder="Teléfono de contacto" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Dirección</span>
              <input type="text" value={formulario.direccion} onChange={(evento) => setFormulario((f) => ({ ...f, direccion: evento.target.value }))} placeholder="Dirección del cliente" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">División *</span>
              <select required value={formulario.area_id} onChange={(evento) => setFormulario((f) => ({ ...f, area_id: evento.target.value ? Number(evento.target.value) : '' }))} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30">
                <option value="">Selecciona una división...</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground"><Clock size={13} /> Horas contratadas</span>
              <input type="number" min="0" step="0.5" value={formulario.horas_contratadas} onChange={(evento) => setFormulario((f) => ({ ...f, horas_contratadas: evento.target.value ? Number(evento.target.value) : '' }))} placeholder="Ej. 100" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={!formularioEsValido || guardando} className="rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50">
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear cliente'}
            </button>
            <button type="button" onClick={cancelar} className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button>
          </div>
        </form>
      )}

      {cargando ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-xl border border-border bg-card/60" />)}
        </div>
      ) : clientes.length === 0 && !creando ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <Building2 size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No hay clientes registrados</p>
          <p className="mt-1 text-xs text-muted-foreground">Crea el primer cliente para comenzar a registrar horas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clientesFiltrados.map((cliente) => {
            const horasContratadas = Number(cliente.horas_contratadas) || 0
            const horasConsumidas = Number(cliente.horas_consumidas) || 0
            const horasRestantes = horasContratadas - horasConsumidas
            const porcentajeConsumo = horasContratadas > 0 ? Math.min(100, (horasConsumidas / horasContratadas) * 100) : 0
            const bolsa = evaluarBolsaHoras(horasContratadas, horasConsumidas)
            const mensajeBolsa = bolsa.estado === 'agotada'
              ? `Bolsa agotada: ${formatoHoras(Math.abs(bolsa.restantes))} excedidas. Revisa facturación adicional.`
              : `Bolsa por agotarse: quedan ${formatoHoras(bolsa.restantes)} (${Math.max(0, Math.round(bolsa.porcentajeRestante))}%). Revisa una ampliación.`
            return (
              <article id={`cliente-${cliente.id}`} key={cliente.id} className="group flex min-h-56 flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#7c3aed]/50">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/15 text-xs font-semibold text-[#c4b5fd]">{iniciales(cliente.nombre)}</div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-foreground">{cliente.nombre}</h2>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground" title={cliente.area_nombre || 'Sin división asignada'}>
                      <Building2 size={12} className="flex-none text-[#a78bfa]" />
                      División: {cliente.area_nombre || 'Sin asignar'}
                    </p>
                  </div>
                  <div className="flex flex-none gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setPresupuestosDe({ id: cliente.id, nombre: cliente.nombre })}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Presupuestos de ${cliente.nombre}`}
                      title="Importar y revisar presupuestos"
                    >
                      <FileSpreadsheet size={14} />
                    </button>
                    <button type="button" onClick={() => iniciarEdicion(cliente)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Editar ${cliente.nombre}`}><Pencil size={14} /></button>
                    <button type="button" onClick={() => manejarEliminar(cliente.id, cliente.nombre)} className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400" aria-label={`Eliminar ${cliente.nombre}`}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 border-y border-border/70 py-3 text-xs text-muted-foreground">
                  <p className="truncate" title={cliente.ruc || 'RUC no registrado'}>
                    RUC: <span className="text-foreground">{cliente.ruc || 'No registrado'}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 truncate" title={cliente.correo || 'Correo no registrado'}>
                    <Mail size={13} className="flex-none text-[#a78bfa]" />
                    <span className="truncate">Correo: <span className="text-foreground">{cliente.correo || 'No registrado'}</span></span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 truncate" title={cliente.telefono || 'Teléfono no registrado'}>
                    <Phone size={13} className="flex-none text-[#a78bfa]" />
                    <span className="truncate">Teléfono: <span className="text-foreground">{cliente.telefono || 'No registrado'}</span></span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 truncate" title={cliente.direccion || 'Dirección no registrada'}>
                    <MapPin size={13} className="flex-none text-[#a78bfa]" />
                    <span className="truncate">Dirección: <span className="text-foreground">{cliente.direccion || 'No registrada'}</span></span>
                  </p>
                </div>
                {bolsa.estado !== 'normal' && (
                  <div
                    role="alert"
                    className={`mt-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
                      bolsa.estado === 'agotada'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>{mensajeBolsa}</span>
                  </div>
                )}
                <div className="mt-auto pt-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Contratadas <strong className="text-foreground">{formatoHoras(horasContratadas)}</strong></span>
                    <span>Consumidas <strong className="text-foreground">{formatoHoras(horasConsumidas)}</strong></span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${porcentajeConsumo}%`, backgroundColor: bolsa.estado === 'agotada' ? '#ef4444' : bolsa.estado === 'por_agotarse' ? '#f59e0b' : '#7c3aed' }} /></div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {horasRestantes >= 0 ? 'Restantes' : 'Excedidas'}:{' '}
                    <span className={horasRestantes <= 0 ? 'font-semibold text-rose-400' : horasRestantes < 10 ? 'font-semibold text-amber-400' : 'font-semibold text-foreground'}>
                      {formatoHoras(Math.abs(horasRestantes))}
                    </span>
                  </p>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setPresupuestosDe({ id: cliente.id, nombre: cliente.nombre })}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:bg-muted"
                  >
                    <FileSpreadsheet size={13} className="text-[#a78bfa]" />
                    Presupuestos
                  </button>
                </div>
              </article>
            )
          })}
          {clientesFiltrados.length === 0 && clientes.length > 0 && <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No hay clientes que coincidan con la búsqueda.</div>}
        </div>
      )}

      {presupuestosDe && (
        <SettingsClientePresupuestos
          cliente={presupuestosDe}
          onCerrar={() => setPresupuestosDe(null)}
        />
      )}
    </div>
  )
}
