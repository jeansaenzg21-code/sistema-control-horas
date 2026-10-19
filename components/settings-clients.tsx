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
import { notifyClientesChange } from '@/lib/events'
import { CarteraClientes } from './cartera-clientes'
import { ClienteGestion } from './cliente-gestion'
import type { ClienteCartera } from './cartera-ui'
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

const TITULO_CARPETA = 'Cartera de clientes'
const SUBTITULO_CARPETA = 'Presupuestos, bolsas de horas y desviaciones desde una sola vista.'

export function SettingsClients({ onCabecera }: { onCabecera?: (titulo: string, subtitulo: string) => void }) {
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
  const [presupuestosDe, setPresupuestosDe] = useState<{ id: number; nombre: string } | null>(null)
  const [clienteAbierto, setClienteAbierto] = useState<ClienteCartera | null>(null)

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

  const abrirCrear = useCallback(() => {
    setFormulario({
      ...formularioVacio,
      area_id: esJefeArea && usuario?.area_id ? Number(usuario.area_id) : '',
    })
    setEditandoId(null)
    setCreando(true)
    setError('')
  }, [esJefeArea, usuario?.area_id])

  const iniciarEdicion = useCallback((cliente: ClienteCartera) => {
    setFormulario({
      nombre: cliente.nombre,
      ruc: cliente.ruc ?? '',
      correo: cliente.correo ?? '',
      telefono: cliente.telefono ?? '',
      direccion: cliente.direccion ?? '',
      area_id: cliente.area_id,
      horas_contratadas: cliente.horasContratadas,
    })
    setEditandoId(cliente.id)
    setCreando(false)
    setError('')
  }, [])

  const cancelar = useCallback(() => {
    setFormulario(formularioVacio)
    setCreando(false)
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
        <CarteraClientes
          onCrear={abrirCrear}
          onEditar={(c) => { iniciarEdicion(c); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onEliminar={(c) => void manejarEliminar(c.id, c.nombre)}
          onImportarPresupuesto={(c) => setPresupuestosDe({ id: c.id, nombre: c.nombre })}
          onAbrirGestion={(c) => { setClienteAbierto(c); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        />
      )}

      {/* "Nuevo cliente" abre directamente el modal de subir el Excel. Antes
          pasaba por un cartel intermedio con dos botones, y el importador se
          quedaba pintado debajo de la tabla, que parecía un aviso suelto.
          El Excel ya trae el cliente y el área, así que el camino natural es
          subir el archivo. */}
      {creando && (
        <ImportadorPresupuesto
          onCancelar={cancelar}
          onListo={async (datos) => {
            // Primero el cliente, porque presupuesto_servicios y el propio
            // presupuesto cuelgan de él y no pueden existir sin cliente.
            //
            // `horas_contratadas` se deja en 0 a propósito. Las horas del Excel
            // NO son horas contratadas todavía: hay 2 h complementarias sin
            // confirmar, y ese total se recalcula cuando el Líder active las
            // bolsas. Además `clientes.horas_contratadas` es un único número para
            // todo el cliente: escribir ahí el total de un proyecto contaminaría
            // los saldos de los demás proyectos del mismo cliente.
            const creado = await crearCliente({
              nombre: datos.nombre,
              area_id: datos.areaId,
              horas_contratadas: 0,
              // El Excel no trae datos de contacto: se dejan vacíos y el usuario
              // los rellena después si los necesita.
              ruc: null,
              correo: null,
              telefono: null,
              direccion: null,
            })

            if (!creado?.ok) {
              setError(creado?.error ?? 'No se pudo crear el cliente.')
              return
            }

            // El id lo devuelve el alta, no se busca en `clientes`: ese array
            // todavía no incluye al cliente nuevo, así que buscarlo por nombre
            // fallaba y el Excel nunca se importaba. El modal se cerraba como si
            // nada y el cliente quedaba sin una sola hora.
            if (!creado.id) {
              setError('El cliente se creó, pero el alta no devolvió su id: no se pudo importar el presupuesto.')
              return
            }

            // Y después el presupuesto, reenviando el Excel que ya se había leído.
            const binario = Uint8Array.from(atob(datos.archivoBase64), (c) => c.charCodeAt(0))
            const fd = new FormData()
            fd.append('archivo', new File([binario], datos.nombreArchivo))
            fd.append('cliente_id', String(creado.id))
            const r = await fetch('/api/presupuestos', { method: 'POST', body: fd })

            if (!r.ok) {
              const cuerpo = await r.json().catch(() => ({}))
              setError(
                `El cliente se creó, pero el presupuesto no se pudo importar: ${cuerpo.error ?? 'error desconocido'}.`,
              )
            }
            // `crearCliente` ya avisó, pero lo hizo ANTES de importar el Excel:
              // quien escuchaba podía recargar la cartera con el cliente a cero
              // horas. Este segundo aviso llega con el presupuesto ya guardado,
              // que es el estado final que se tiene que ver en pantalla.
            notifyClientesChange()
            setCreando(false)
            setPresupuestosDe({ id: creado.id, nombre: datos.nombre })
          }}
        />
      )}

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
    </div>
  )
}
