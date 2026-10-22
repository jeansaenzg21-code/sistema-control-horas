'use client'

// Sección de Presupuestos de la ficha de un cliente.
//
// El import es lo único que se puede hacer desde aquí por ahora. Aprobar,
// vincular a un proyecto y activar las bolsas son pasos posteriores que exigirán
// al Líder del proyecto; este panel deja claro que aún no están disponibles en
// vez de oferecer botones que no harían nada.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, Upload, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

type Asignacion = {
  id: number
  usuarioId: number | null
  usuarioNombre: string | null
  nombreTexto: string | null
  categoria: string | null
  horas: number
  estado: 'CONFIRMADA' | 'PENDIENTE_REVISION' | 'RECHAZADA'
  motivo: string | null
}

type Servicio = {
  id: number
  origen: 'DETALLADO' | 'CONSOLIDADO' | 'COMPLEMENTARIO'
  nombre: string
  horas: number
  nota: string | null
  asignaciones: Asignacion[]
}

type Observacion = { tipo: string; severidad: string; mensaje: string }

type Presupuesto = {
  id: number
  version: number
  estado: string
  archivoNombre: string
  totales: {
    horasDetallado: number
    horasConsolidado: number
    asignacionesPendientes: number
    observacionesBloqueantes: number
  }
  observaciones: Observacion[]
  servicios: Servicio[]
}

type Cliente = { id: number; nombre: string }

const ETIQUETA_ESTADO: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  OBSERVADO: 'Observado',
}

function horas(n: number): string {
  return `${Number(n).toLocaleString('es-PE', { maximumFractionDigits: 2 })} h`
}

export function SettingsClientePresupuestos({
  cliente,
  onCerrar,
}: {
  cliente: Cliente
  onCerrar: () => void
}) {
  const { usuario } = useAuth()
  const puedeImportar = usuario?.rol !== 'admin' && usuario?.rol !== 'socio'
  const [presupuestos, setPresupuestos] = useState<Presupuesto[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    try {
      const respuesta = await fetch(`/api/presupuestos?cliente_id=${cliente.id}`)
      if (!respuesta.ok) throw new Error('No se pudieron cargar los presupuestos.')
      setPresupuestos((await respuesta.json()) as Presupuesto[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar.')
    } finally {
      setCargando(false)
    }
  }, [cliente.id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function importar(archivo: File) {
    setSubiendo(true)
    setError(null)
    setExito(null)
    try {
      const datos = new FormData()
      datos.append('archivo', archivo)
      datos.append('cliente_id', String(cliente.id))
      const respuesta = await fetch('/api/presupuestos', { method: 'POST', body: datos })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se pudo importar el archivo.')

      const detalle = [
        `${cuerpo.serviciosDetallados} servicios`,
        `${cuerpo.serviciosConsolidados} consolidados de referencia`,
        cuerpo.asignacionesPendientes > 0
          ? `${cuerpo.asignacionesPendientes} asignaciones por confirmar`
          : null,
        cuerpo.observacionesBloqueantes > 0
          ? `${cuerpo.observacionesBloqueantes} observaciones bloqueantes`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')

      setExito(
        cuerpo.yaExistia
          ? `Documento reimportado (versión ${cuerpo.version}). ${detalle}.`
          : `Importado como versión ${cuerpo.version}: ${detalle}.`
      )
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el archivo.')
    } finally {
      setSubiendo(false)
      if (inputArchivo.current) inputArchivo.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 sm:bg-transparent" onClick={onCerrar}>
      <div
        role="dialog"
        aria-label={`Presupuestos de ${cliente.nombre}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-border bg-background shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-background px-5 py-4">
          <FileSpreadsheet size={20} className="mt-0.5 flex-none text-[#a78bfa]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">Presupuestos</h2>
            <p className="truncate text-xs text-muted-foreground">{cliente.nombre}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {puedeImportar && !exito && (
          <>
          {/* Zona de importación */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setArrastrando(true)
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastrando(false)
              const archivo = e.dataTransfer.files?.[0]
              if (archivo) void importar(archivo)
            }}
            className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              arrastrando ? 'border-[#7c3aed] bg-[#7c3aed]/5' : 'border-border'
            }`}
          >
            <input
              ref={inputArchivo}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                if (archivo) void importar(archivo)
              }}
            />
            {subiendo ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                Analizando el Excel...
              </p>
            ) : (
              <>
                <Upload size={22} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Importar presupuesto en Excel</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  Arrastra el archivo .xlsx o selecciónalo. Se conservan el documento original y
                  todas las versiones anteriores.
                </p>
                <button
                  type="button"
                  onClick={() => inputArchivo.current?.click()}
                  className="mt-3 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9]"
                >
                  Seleccionar archivo
                </button>
              </>
            )}
          </div>
          </>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
              {error}
            </p>
          )}
          {exito && (
            <div className="animate-in slide-in-from-bottom-4 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3.5">
              <span className="success-pop flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <CheckCircle2 size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Presupuesto importado correctamente
                </p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-300">{exito}</p>
                <button
                  type="button"
                  onClick={() => setExito(null)}
                  className="mt-2.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/10"
                >
                  Importar otra versión
                </button>
              </div>
            </div>
          )}

          {cargando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando...</p>
          ) : presupuestos && presupuestos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Este cliente todavía no tiene presupuestos importados.
            </p>
          ) : (
            presupuestos?.map((p) => (
              <PresupuestoVista key={p.id} presupuesto={p} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function PresupuestoVista({ presupuesto }: { presupuesto: Presupuesto }) {
  const [abierto, setAbierto] = useState(true)
  const detallados = presupuesto.servicios.filter((s) => s.origen === 'DETALLADO')
  const complementarios = presupuesto.servicios.filter((s) => s.origen === 'COMPLEMENTARIO')
  const consolidados = presupuesto.servicios.filter((s) => s.origen === 'CONSOLIDADO')
  const bloqueante = presupuesto.totales.observacionesBloqueantes > 0

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          v{presupuesto.version}
        </span>
        <span className="rounded-md border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-2 py-0.5 text-[11px] font-semibold text-[#c4b5fd]">
          {ETIQUETA_ESTADO[presupuesto.estado] ?? presupuesto.estado}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={presupuesto.archivoNombre}>
          {presupuesto.archivoNombre}
        </span>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          {abierto ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
        <Cifra etiqueta="Horas contratadas" valor={horas(presupuesto.totales.horasDetallado)} />
        <Cifra
          etiqueta="Por confirmar"
          valor={String(presupuesto.totales.asignacionesPendientes)}
          alerta={presupuesto.totales.asignacionesPendientes > 0}
        />
        <Cifra
          etiqueta="Bloqueantes"
          valor={String(presupuesto.totales.observacionesBloqueantes)}
          alerta={bloqueante}
        />
        <Cifra etiqueta="Consolidado" valor={horas(presupuesto.totales.horasConsolidado)} />
      </div>

      {bloqueante && (
        <p className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle size={14} className="mt-0.5 flex-none" />
          No se puede aprobar mientras haya observaciones bloqueantes sin resolver.
        </p>
      )}

      {!abierto ? null : (
        <div className="space-y-4 border-t border-border px-4 py-3">
          {presupuesto.observaciones.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Observaciones ({presupuesto.observaciones.length})
              </h3>
              <ul className="space-y-1.5">
                {presupuesto.observaciones.map((o, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                      o.severidad === 'BLOQUEANTE'
                        ? 'border-amber-500/25 bg-amber-500/5 text-amber-300'
                        : o.severidad === 'REVISAR'
                          ? 'border-border bg-muted/30 text-muted-foreground'
                          : 'border-border bg-muted/20 text-muted-foreground'
                    }`}
                  >
                    {o.severidad === 'BLOQUEANTE' ? (
                      <AlertTriangle size={13} className="mt-0.5 flex-none" />
                    ) : (
                      <Info size={13} className="mt-0.5 flex-none" />
                    )}
                    <span className="min-w-0">{o.mensaje}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <GrupoServicios titulo="Servicios contratados" servicios={detallados} />

          {complementarios.length > 0 && (
            <GrupoServicios
              titulo="Horas por confirmar"
                servicios={complementarios}
              nota="Solo están en el consolidado. El Líder debe confirmarlas para que generen bolsa."
            />
          )}

          {consolidados.length > 0 && (
            <GrupoServicios
              titulo="Consolidados de referencia"
              servicios={consolidados}
              nota="Resúmenes de los servicios anteriores. No generan bolsa: importarlos también daría el doble de horas."
            />
          )}
        </div>
      )}
    </section>
  )
}

function Cifra({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={`mt-0.5 text-sm font-semibold ${alerta ? 'text-amber-400' : 'text-foreground'}`}>
        {valor}
      </p>
    </div>
  )
}

function GrupoServicios({
  titulo,
  servicios,
  nota,
}: {
  titulo: string
  servicios: Servicio[]
  nota?: string
}) {
  if (servicios.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h3>
      {nota && <p className="mb-2 text-[11px] text-muted-foreground">{nota}</p>}
      <ul className="space-y-2">
        {servicios.map((s) => (
          <li key={s.id} className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 text-sm text-foreground">{s.nombre}</span>
              <span className="flex-none text-sm font-semibold text-[#c4b5fd]">{horas(s.horas)}</span>
            </div>
            {s.nota && <p className="mt-1 text-[11px] text-muted-foreground">{s.nota}</p>}
            {s.asignaciones.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                {s.asignaciones.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-1 h-1.5 w-1.5 flex-none rounded-full ${
                        a.estado === 'CONFIRMADA' ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground">
                        {a.usuarioNombre ?? a.nombreTexto ?? 'Sin persona'}
                      </span>
                      {a.categoria && (
                        <span className="text-muted-foreground"> · {a.categoria}</span>
                      )}
                      {a.motivo && (
                        <span className="block text-[11px] text-amber-400">{a.motivo}</span>
                      )}
                    </span>
                    <span className="flex-none text-muted-foreground">{horas(a.horas)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
