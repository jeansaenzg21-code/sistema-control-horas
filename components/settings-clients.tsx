'use client'

/**
 * Administración de clientes.
 *
 * La cartera y la gestión integral son la vista real: consumes
 * /api/clientes/cartera y /api/proyectos/[id]/gestion. Aquí solo viven los
 * formularios de alta, edición, borrado e importación, que se abren encima.
 *
 * Antes este archivo traía dentro una "vista de diseño" con clientes inventados
 * y un interruptor para saltar entre las dos. Eso se eliminó: una maqueta dentro
 * del módulo hace creer que hay datos que no existen.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Clock, Loader2 } from 'lucide-react'

import { useClientes } from '@/lib/clientes-context'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import { useNotificaciones } from '@/lib/notificaciones-context'
import { CarteraClientes } from './cartera-clientes'
import { ClienteGestion } from './cliente-gestion'
import type { ClienteCartera } from './cartera-ui'
import { SettingsClientePresupuestos } from './settings-cliente-presupuestos'
import { ImportarPresupuestosMasivo } from './importar-presupuestos-masivo'

interface FormularioCliente {
  nombre: string
  ruc: string
  correo: string
  telefono: string
  direccion: string
  encargado: string
  asistente: string
  es_outsourcing: boolean
  encargado_usuario_id: number | ''
  area_id: number | ''
  horas_contratadas: number | ''
}

const formularioVacio: FormularioCliente = {
  nombre: '',
  ruc: '',
  correo: '',
  telefono: '',
  direccion: '',
  encargado: '',
  asistente: '',
  es_outsourcing: false,
  encargado_usuario_id: '',
  area_id: '',
  horas_contratadas: '',
}

const TITULO_CARPETA = 'Cartera de clientes'
const SUBTITULO_CARPETA = 'Presupuestos, bolsas de horas y desviaciones desde una sola vista.'

export function SettingsClients({ onCabecera }: { onCabecera?: (titulo: string, subtitulo: string) => void }) {
  const { cargando, cargarClientes, actualizarCliente, eliminarCliente } = useClientes()
  const { areas } = useAreas()
  const { usuario, usuarios } = useAuth()
  const { cargarNotificaciones } = useNotificaciones()

  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [formulario, setFormulario] = useState<FormularioCliente>(formularioVacio)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [presupuestosDe, setPresupuestosDe] = useState<{ id: number; nombre: string } | null>(null)
  const [clienteAbierto, setClienteAbierto] = useState<ClienteCartera | null>(null)
  const [importandoMasivo, setImportandoMasivo] = useState(false)
  const [solicitudesAsistente, setSolicitudesAsistente] = useState<Array<{ id: number; cliente_id: number; cliente: string; solicitante: string; cantidad: number; comentario: string | null }>>([])
  const [asistentesElegidos, setAsistentesElegidos] = useState<Record<number, number>>({})
  const [avisoSolicitud, setAvisoSolicitud] = useState('')

  const cargarSolicitudes = useCallback(async () => {
    if (usuario?.rol !== 'jefe_area') return
    const res = await fetch('/api/clientes/solicitudes-asistente')
    if (res.ok) setSolicitudesAsistente(await res.json())
  }, [usuario?.rol])

  useEffect(() => { void cargarSolicitudes() }, [cargarSolicitudes])

  const solicitarAsistente = async (cliente: ClienteCartera) => {
    const comentario = window.prompt(`¿Qué apoyo necesitas para ${cliente.nombre}? (opcional)`, '')
    if (comentario === null) return
    const res = await fetch('/api/clientes/solicitudes-asistente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: cliente.id, comentario }) })
    const body = await res.json()
    setAvisoSolicitud(res.ok ? 'Solicitud enviada al jefe de área.' : body.error ?? 'No se pudo enviar la solicitud.')
  }

  const asignarAsistente = async (solicitudId: number) => {
    const usuario_id = asistentesElegidos[solicitudId]
    if (!usuario_id) return
    const res = await fetch('/api/clientes/solicitudes-asistente', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ solicitud_id: solicitudId, usuario_id }) })
    const body = await res.json()
    setAvisoSolicitud(res.ok ? 'Asistente asignado.' : body.error ?? 'No se pudo asignar el asistente.')
    if (res.ok) await cargarSolicitudes()
  }

  useEffect(() => {
    if (!cargando && usuario) void cargarNotificaciones(usuario.id)
  }, [cargando, usuario, cargarNotificaciones])

  // La cabecera sigue a la vista: cartera o ficha del cliente. Al abrir un
  // cliente, el titulo pasa a ser su nombre y el subtitulo su contexto, para no
  // repetir el mismo rotulo dentro del contenido.
  useEffect(() => {
    if (!onCabecera) return
    if (!clienteAbierto) {
      onCabecera(TITULO_CARPETA, SUBTITULO_CARPETA)
      return
    }
    onCabecera(clienteAbierto.nombre, `${clienteAbierto.area_nombre} · gestión integral`)
  }, [onCabecera, clienteAbierto])

  const iniciarEdicion = useCallback((cliente: ClienteCartera) => {
    setFormulario({
      nombre: cliente.nombre,
      ruc: cliente.ruc ?? '',
      correo: cliente.correo ?? '',
      telefono: cliente.telefono ?? '',
      direccion: cliente.direccion ?? '',
      encargado: cliente.encargado ?? '',
      asistente: cliente.asistente ?? '',
      es_outsourcing: cliente.es_outsourcing,
      encargado_usuario_id: cliente.encargado_usuario_id ?? '',
      area_id: cliente.area_id,
      horas_contratadas: cliente.horasContratadas,
    })
    setEditandoId(cliente.id)
    setError('')
  }, [])

  const cancelar = useCallback(() => {
    setFormulario(formularioVacio)
    setEditandoId(null)
    setError('')
  }, [])

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
      encargado: formulario.encargado.trim() || null,
      asistente: formulario.asistente.trim() || null,
      es_outsourcing: formulario.es_outsourcing,
      encargado_usuario_id: formulario.encargado_usuario_id || null,
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
    <div className="space-y-3">
      {clienteAbierto ? (
        <ClienteGestion
          cliente={clienteAbierto}
          onVolver={() => setClienteAbierto(null)}
          onEditar={(c) => { iniciarEdicion(c); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onImportarPresupuesto={(c) => setPresupuestosDe({ id: c.id, nombre: c.nombre })}
        />
      ) : (
        <>
        {usuario?.rol === 'jefe_area' && solicitudesAsistente.length > 0 && <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <h2 className="mb-2 text-sm font-semibold">Solicitudes de asistentes para outsourcing ({solicitudesAsistente.length})</h2>
          <div className="space-y-2">{solicitudesAsistente.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs"><span className="min-w-0 flex-1"><strong>{s.cliente}</strong> · solicitado por {s.solicitante}{s.comentario ? ` · ${s.comentario}` : ''}</span><select aria-label={`Asistente para ${s.cliente}`} value={asistentesElegidos[s.id] ?? ''} onChange={(e) => setAsistentesElegidos((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))} className="h-8 rounded-md border border-border bg-background px-2"><option value="">Asignar usuario…</option>{usuarios.filter((u) => u.activo && u.area_id === usuario.area_id && u.rol === 'personal').map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select><button type="button" onClick={() => void asignarAsistente(s.id)} disabled={!asistentesElegidos[s.id]} className="rounded-md bg-primary px-2.5 py-1.5 font-medium text-white disabled:opacity-50">Asignar</button></div>)}</div>
        </section>}
        <CarteraClientes
          onEditar={(c) => { iniciarEdicion(c); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onEliminar={(c) => void manejarEliminar(c.id, c.nombre)}
          onImportarPresupuesto={(c) => setPresupuestosDe({ id: c.id, nombre: c.nombre })}
          onAbrirGestion={(c) => { setClienteAbierto(c); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onImportarClientes={() => setImportandoMasivo(true)}
          onSolicitarAsistente={usuario?.rol === 'personal' ? solicitarAsistente : undefined}
        />
        </>
      )}
      {avisoSolicitud && <p role="status" className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">{avisoSolicitud}</p>}

      {editandoId && (
        <form onSubmit={manejarEditar} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Editar cliente</h2>
            <button type="button" onClick={cancelar} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar formulario">×</button>
          </div>

          {error && <p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Nombre *</span>
              <input type="text" required value={formulario.nombre} onChange={(e) => setFormulario((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del cliente" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">RUC</span>
              <input type="text" value={formulario.ruc} onChange={(e) => setFormulario((f) => ({ ...f, ruc: e.target.value }))} placeholder="RUC del cliente" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Correo</span>
              <input type="email" value={formulario.correo} onChange={(e) => setFormulario((f) => ({ ...f, correo: e.target.value }))} placeholder="correo@ejemplo.com" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Teléfono</span>
              <input type="text" value={formulario.telefono} onChange={(e) => setFormulario((f) => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono de contacto" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Dirección</span>
              <input type="text" value={formulario.direccion} onChange={(e) => setFormulario((f) => ({ ...f, direccion: e.target.value }))} placeholder="Dirección del cliente" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-foreground md:col-span-2">
              <input type="checkbox" checked={formulario.es_outsourcing} onChange={(e) => setFormulario((f) => ({ ...f, es_outsourcing: e.target.checked, encargado: e.target.checked ? f.encargado : '', asistente: e.target.checked ? f.asistente : '', encargado_usuario_id: e.target.checked ? f.encargado_usuario_id : '' }))} />
              Cliente de outsourcing
            </label>

            {formulario.es_outsourcing && <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Encargado del cliente</span>
              <input type="text" value={formulario.encargado} onChange={(e) => setFormulario((f) => ({ ...f, encargado: e.target.value }))} placeholder="Nombre del encargado" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Asistente (opcional)</span>
              <input type="text" value={formulario.asistente} onChange={(e) => setFormulario((f) => ({ ...f, asistente: e.target.value }))} placeholder="Nombre del asistente" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Encargado asignado</span>
              <select value={formulario.encargado_usuario_id} onChange={(e) => setFormulario((f) => ({ ...f, encargado_usuario_id: e.target.value ? Number(e.target.value) : '' }))} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Sin asignar</option>{usuarios.filter((u) => u.activo && u.area_id === formulario.area_id && u.rol === 'personal').map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            </label>
            </>}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">División *</span>
              <select required value={formulario.area_id} onChange={(e) => setFormulario((f) => ({ ...f, area_id: e.target.value ? Number(e.target.value) : '' }))} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30">
                <option value="">Selecciona una división...</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.nombre}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground"><Clock size={13} /> Horas contratadas</span>
              <input type="number" min="0" step="0.5" value={formulario.horas_contratadas} onChange={(e) => setFormulario((f) => ({ ...f, horas_contratadas: e.target.value ? Number(e.target.value) : '' }))} placeholder="Ej. 100" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30" />
              <span className="mt-1 flex items-start gap-1 text-[10px] leading-snug text-muted-foreground">
                <AlertTriangle size={11} className="mt-0.5 flex-none" />
                Valor de referencia para clientes sin presupuesto. La cartera y la gestión integral
                cuentan las bolsas activas, no este campo.
              </span>
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={!formularioEsValido || guardando} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {guardando ? <><Loader2 size={14} className="mr-1.5 inline animate-spin" />Guardando...</> : 'Guardar cambios'}
            </button>
            <button type="button" onClick={cancelar} className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button>
          </div>
        </form>
      )}

      {presupuestosDe && (
        <SettingsClientePresupuestos
          cliente={presupuestosDe}
          onCerrar={() => setPresupuestosDe(null)}
        />
      )}

      {importandoMasivo && (
        <ImportarPresupuestosMasivo
          onCerrar={() => setImportandoMasivo(false)}
          onCompletado={() => void cargarClientes()}
        />
      )}
    </div>
  )
}
