'use client'

import { useCallback, useEffect, useState } from 'react'
import { opcionesApi } from '@/lib/api-cliente'
import { CheckCircle2, Loader2, Plus } from 'lucide-react'

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

export function SettingsActividades() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null)

  const [areaId, setAreaId] = useState('')
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

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

  const areaActual = catalogo?.areas.find((area) => String(area.id) === areaId) ?? null
  const actividadesArea = (areaActual?.actividades ?? []).filter((actividad) => actividad.activo)

  const conCatalogo = catalogo?.areas.filter((area) => area.activas > 0) ?? []
  const sinCatalogo = catalogo?.areas.filter((area) => area.activas === 0) ?? []

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Catálogo de actividades</h2>
        <p className="text-sm text-muted-foreground">
          Las {catalogo?.generales.length ?? 5} actividades generales están disponibles para todas las
          divisiones. Cada división puede además tener las suyas propias.
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

      {catalogo && catalogo.areas.length === 0 && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Primero crea una división en la pestaña Divisiones.
        </p>
      )}

      {catalogo && catalogo.areas.length > 0 && (
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
                {catalogo.areas.map((area) => (
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

      {catalogo && catalogo.conCodigo && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">División</th>
                <th className="px-3 py-2 text-right font-medium">Actividades</th>
                <th className="px-3 py-2 text-right font-medium">Con código</th>
                <th className="px-3 py-2 text-right font-medium">Inactivas</th>
                <th className="px-3 py-2 text-right font-medium">Con horas</th>
              </tr>
            </thead>
            <tbody>
              {conCatalogo.map((area) => (
                <tr key={area.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-foreground">
                    {area.nombre}
                    {!area.activo && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        desactivada
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">{area.activas}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.con_codigo}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.inactivas}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.en_uso}</td>
                </tr>
              ))}
              {sinCatalogo.map((area) => (
                <tr key={area.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">
                    {area.nombre}
                    {!area.activo && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        desactivada
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">0</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.inactivas}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.en_uso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {areaActual && (
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <h3 className="text-sm font-semibold text-foreground">
            Actividades de {areaActual.nombre}
          </h3>
          {actividadesArea.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Esta división aún no tiene actividades propias; su personal usa las generales.
            </p>
          ) : (
            <ul className="mt-2 max-h-72 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border bg-background">
              {actividadesArea.map((actividad) => (
                <li key={actividad.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                    {actividad.codigo || '—'}
                  </span>
                  <span className="text-foreground">{actividad.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {catalogo && (
        <p className="text-xs text-muted-foreground">
          Las divisiones con 0 actividades solo pueden registrar las {catalogo.generales.length} generales.
        </p>
      )}
    </div>
  )
}
