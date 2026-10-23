'use client'

import { useCallback, useEffect, useState } from 'react'
import { opcionesApi } from '@/lib/api-cliente'
import { CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react'

interface ActividadCatalogo {
  id: number
  nombre: string
  codigo: string | null
  activo: number
}

interface AreaCatalogo {
  id: number
  nombre: string
  activo: number
  activas: number
  inactivas: number
  con_codigo: number
  en_uso: number
  actividades: ActividadCatalogo[]
}

interface GeneralCatalogo {
  id: number
  nombre: string
}

interface Catalogo {
  conCodigo: boolean
  areas: AreaCatalogo[]
  generales: GeneralCatalogo[]
}

interface FilaActividad {
  area: AreaCatalogo
  actividad: ActividadCatalogo
}

interface Mensaje {
  tipo: 'ok' | 'error'
  texto: string
}

function ordenarFilas(filas: FilaActividad[]): FilaActividad[] {
  return [...filas].sort((a, b) => {
    const area = a.area.nombre.localeCompare(b.area.nombre, 'es')
    if (area !== 0) return area
    const codigo = (a.actividad.codigo ?? '').localeCompare(b.actividad.codigo ?? '', 'es', {
      numeric: true,
    })
    if (codigo !== 0) return codigo
    return a.actividad.nombre.localeCompare(b.actividad.nombre, 'es')
  })
}

export function SettingsActividades() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null)

  const [areaId, setAreaId] = useState('')
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)

  const [filtroArea, setFiltroArea] = useState('todas')
  const [mostrarInactivas, setMostrarInactivas] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [mensajeLista, setMensajeLista] = useState<Mensaje | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorCatalogo(null)
    try {
      const res = await fetch('/api/tipos-actividad/catalogo', opcionesApi())
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorCatalogo(data.error || 'No se pudo cargar el catálogo.')
        return
      }
      setCatalogo(data as Catalogo)
    } catch {
      setErrorCatalogo('Error de conexión al cargar el catálogo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (!catalogo || areaId || catalogo.areas.length === 0) return
    setAreaId(String(catalogo.areas[0].id))
  }, [catalogo, areaId])

  const areas = catalogo?.areas ?? []
  const generales = catalogo?.generales ?? []

  const areaActual = areas.find((area) => String(area.id) === areaId) ?? null

  const filas = ordenarFilas(
    areas
      .filter((area) => filtroArea === 'todas' || String(area.id) === filtroArea)
      .flatMap((area) =>
        area.actividades
          .filter((actividad) => mostrarInactivas || actividad.activo)
          .map((actividad) => ({ area, actividad }))
      )
  )

  const agregar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setMensaje(null)

    if (!areaId) {
      setMensaje({ tipo: 'error', texto: 'Selecciona una división.' })
      return
    }
    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe el nombre de la actividad.' })
      return
    }

    setGuardando(true)
    try {
      const res = await fetch('/api/tipos-actividad', opcionesApi({
        method: 'POST',
        body: {
          area_id: Number(areaId),
          nombre: nombre.trim(),
          codigo: codigo.trim() || null,
        },
      }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.error || 'No se pudo guardar la actividad.' })
        return
      }
      setNombre('')
      setCodigo('')
      setMensaje({
        tipo: 'ok',
        texto: data.reactivada ? 'Actividad reactivada.' : 'Actividad agregada.',
      })
      await cargar()
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al guardar la actividad.' })
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (fila: FilaActividad) => {
    const confirmado = window.confirm(
      `¿Eliminar la actividad "${fila.actividad.nombre}" de ${fila.area.nombre}?`
    )
    if (!confirmado) return

    setEliminandoId(fila.actividad.id)
    setMensajeLista(null)
    try {
      const res = await fetch(
        `/api/tipos-actividad/${fila.actividad.id}`,
        opcionesApi({ method: 'DELETE' })
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMensajeLista({ tipo: 'error', texto: data.error || 'No se pudo eliminar la actividad.' })
        return
      }
      setMensajeLista({
        tipo: 'ok',
        texto: data.desactivada
          ? 'La actividad tiene horas registradas, así que se desactivó.'
          : 'Actividad eliminada.',
      })
      await cargar()
    } catch {
      setMensajeLista({ tipo: 'error', texto: 'Error de conexión al eliminar la actividad.' })
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Catálogo de actividades</h2>
        <p className="text-sm text-muted-foreground">
          Las {generales.length} actividades generales están disponibles para todas las divisiones.
          Cada división puede además tener las suyas propias.
        </p>
      </div>

      {cargando && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Cargando catálogo...
        </p>
      )}
      {errorCatalogo && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
          {errorCatalogo}
        </p>
      )}

      {catalogo && !catalogo.conCodigo && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Falta la columna <code className="font-mono">codigo</code>. Ejecuta{' '}
          <code className="font-mono">sql/actividades_codigo.sql</code> para poder guardar códigos.
        </p>
      )}

      {catalogo && areas.length === 0 && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Primero crea una división en la pestaña Divisiones.
        </p>
      )}

      {catalogo && areas.length > 0 && (
        <form
          onSubmit={agregar}
          className="space-y-3 rounded-xl border border-border bg-card p-4"
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">Agregar actividad</h3>
            <p className="text-xs text-muted-foreground">
              Elige la división y escribe la actividad que podrá registrar su personal.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-1">
              División
              <select
                value={areaId}
                onChange={(evento) => setAreaId(evento.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              >
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.nombre}
                    {area.activo ? '' : ' (desactivada)'}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-1">
              Código (opcional)
              <input
                value={codigo}
                onChange={(evento) => setCodigo(evento.target.value)}
                maxLength={32}
                disabled={!catalogo.conCodigo}
                placeholder="AC-1"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 disabled:opacity-50"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-1">
              Actividad
              <input
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                maxLength={255}
                placeholder="Nombre de la actividad"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {mensaje ? (
              <p
                className={`flex items-center gap-1.5 text-xs ${
                  mensaje.tipo === 'ok' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {mensaje.tipo === 'ok' && <CheckCircle2 size={14} />}
                {mensaje.texto}
              </p>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {guardando ? 'Guardando...' : 'Agregar actividad'}
            </button>
          </div>
        </form>
      )}

      {catalogo && areas.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Actividades registradas</h3>
              <p className="text-xs text-muted-foreground">
                {filtroArea === 'todas' ? 'Todas las divisiones' : areaActual?.nombre} ·{' '}
                {filas.length} {filas.length === 1 ? 'actividad' : 'actividades'}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                División
                <select
                  value={filtroArea}
                  onChange={(evento) => setFiltroArea(evento.target.value)}
                  className="block w-full min-w-44 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
                >
                  <option value="todas">Todas las divisiones</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.nombre}
                      {area.activo ? '' : ' (desactivada)'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={mostrarInactivas}
                  onChange={(evento) => setMostrarInactivas(evento.target.checked)}
                  className="size-4 rounded border-border accent-[#7c3aed]"
                />
                Mostrar inactivas
              </label>
            </div>
          </div>

          {mensajeLista && (
            <p
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${
                mensajeLista.tipo === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
              }`}
            >
              {mensajeLista.tipo === 'ok' && <CheckCircle2 size={14} />}
              {mensajeLista.texto}
            </p>
          )}

          {filas.length === 0 ? (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
              {mostrarInactivas
                ? 'No hay actividades registradas para esta selección.'
                : 'No hay actividades activas para esta selección. Marca "Mostrar inactivas" para ver las desactivadas.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">División</th>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Actividad</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => (
                    <tr
                      key={fila.actividad.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {fila.area.nombre}
                        {!fila.area.activo && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            desactivada
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {fila.actividad.codigo || '—'}
                      </td>
                      <td className="px-3 py-2 text-foreground">{fila.actividad.nombre}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            fila.actividad.activo
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {fila.actividad.activo ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void eliminar(fila)}
                          disabled={eliminandoId === fila.actividad.id}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-400 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {eliminandoId === fila.actividad.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {catalogo && generales.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <h3 className="text-sm font-semibold text-foreground">Actividades generales</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Disponibles para todas las divisiones. No se eliminan desde aquí.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {generales.map((general) => (
              <li
                key={general.id}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
              >
                {general.nombre}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
