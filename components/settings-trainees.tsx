'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { GraduationCap, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { opcionesApi } from '@/lib/api-cliente'

type Trainee = {
  id: number; correo: string; inicio: string; vencimiento: string
  activo: number; vencido: number; sugerir_conversion: number
}
type Edicion = 'alta' | Trainee | null
const control = 'block w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'
const boton = 'rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50'

export function SettingsTrainees({ areaId }: { areaId: number }) {
  const { usuario, cargarUsuarios } = useAuth()
  const [filas, setFilas] = useState<Trainee[] | null>(null)
  const [edicion, setEdicion] = useState<Edicion>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cargar = useCallback(async (signal?: AbortSignal) => {
    try {
      const respuesta = await fetch('/api/usuarios/trainees?area_id=' + areaId, opcionesApi({ signal }))
      if (!respuesta.ok) { const fallo = await respuesta.json().catch(() => ({})); throw new Error(fallo.error || 'No se pudo cargar la lista de trainees.') }
      const datos = await respuesta.json()
      if (!signal?.aborted) setFilas(datos)
    } catch (fallo) {
      if (!signal?.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la lista.')
    }
  }, [areaId])

  useEffect(() => {
    if (usuario?.rol !== 'admin') return
    const controlador = new AbortController()
    void cargar(controlador.signal)
    return () => controlador.abort()
  }, [cargar, usuario?.rol])

  const dialogo = useRef<HTMLDialogElement>(null)
  const abierto = edicion !== null
  useEffect(() => {
    const modal = dialogo.current
    if (!modal) return
    if (abierto && !modal.open) modal.showModal()
    else if (!abierto && modal.open) modal.close()
  }, [abierto])

  if (usuario?.rol !== 'admin') return null

  async function enviar(body: Record<string, unknown>, confirmacion: string) {
    if (guardando) return
    setGuardando(true)
    setError('')
    setAviso('')
    try {
      const respuesta = await fetch('/api/usuarios/trainees', opcionesApi({ method: 'POST', body: { ...body, area_id: areaId } }))
      const datos = await respuesta.json()
      if (!respuesta.ok) throw new Error(datos.error || 'No se pudo aplicar el cambio.')
      setEdicion(null)
      setAviso(confirmacion)
      await Promise.all([cargar(), cargarUsuarios()])
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo aplicar el cambio.')
    } finally {
      setGuardando(false)
    }
  }

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const campos = Object.fromEntries(new FormData(evento.currentTarget))
    if (edicion === 'alta') void enviar({ ...campos, accion: 'alta' }, 'Cuenta trainee creada.')
    else if (edicion) void enviar({ ...campos, accion: 'convertir', usuario_id: edicion.id }, 'Cuenta convertida a practicante. Su historial se conservó.')
  }

  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><GraduationCap size={21} className="text-violet-400" /><h2 className="text-base font-semibold">Trainees de la división</h2></div>
      <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" onClick={() => { setError(''); setEdicion('alta') }} disabled={guardando}><Plus size={17} /> Nuevo trainee</button>
    </header>
    <dialog
      ref={dialogo}
      aria-labelledby="trainee-dialogo-titulo"
      onCancel={(evento) => {
        evento.preventDefault()
        if (!guardando) { setEdicion(null); setError('') }
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60"
    >
    {edicion && <form key={edicion === 'alta' ? 'alta' : edicion.id} onSubmit={guardar} className="grid min-w-0 gap-4 p-4 sm:p-6">
      <h3 id="trainee-dialogo-titulo" className="text-lg font-semibold">{edicion === 'alta' ? 'Crear cuenta temporal' : 'Convertir a practicante'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
      {edicion !== 'alta' && <label className="grid min-w-0 content-start gap-2 text-sm"><span>Nombre completo</span><input name="nombre" autoComplete="name" className={control} maxLength={120} required /></label>}
      <label className="grid min-w-0 content-start gap-2 text-sm"><span>{edicion === 'alta' ? 'Correo temporal' : 'Correo oficial'}</span><input type="email" name="correo" className={control} maxLength={100} required /></label>
      {edicion === 'alta' ? <>
        <label className="grid min-w-0 content-start gap-2 text-sm"><span>Contraseña</span><input type="password" autoComplete="new-password" name="password" className={control} required /></label>
      </> : <label className="grid min-w-0 content-start gap-2 text-sm"><span>DNI (contraseña inicial)</span><input type="password" name="dni" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} className={control} required /></label>}
</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        <button type="button" className={boton} onClick={() => { setEdicion(null); setError('') }} disabled={guardando}>Cancelar</button>
        <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50" disabled={guardando}>{guardando ? 'Guardando…' : edicion === 'alta' ? 'Crear cuenta' : 'Confirmar conversión'}</button>
      </footer>
    </form>}
    </dialog>
    {!edicion && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {aviso && <p role="status" className="text-sm text-emerald-400">{aviso}</p>}
    {filas === null ? !error && <p role="status" className="text-sm text-muted-foreground">Cargando trainees…</p>
      : filas.length === 0 ? !edicion && <p className="text-sm text-muted-foreground">Esta división aún no tiene trainees.</p>
        : <ul className="divide-y divide-border">{filas.map((fila) => <li key={fila.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0"><strong className="break-all text-sm">{fila.correo}</strong>
            <p className="text-xs text-muted-foreground">{!fila.activo ? 'De baja' : fila.vencido ? 'Acceso vencido' : 'Activo'} · Alta {fila.inicio} · Vencimiento {fila.vencimiento}</p>
          </div>
          {Boolean(fila.activo) && <div className="flex flex-wrap gap-2">
            {Boolean(fila.sugerir_conversion) && <button type="button" className={boton} disabled={guardando} onClick={() => { setError(''); setEdicion(fila) }}>Convertir a practicante</button>}
            <button type="button" className={boton + ' text-destructive'} disabled={guardando} onClick={() => {
              if (window.confirm('¿Dar de baja esta cuenta? Se revocará su acceso y se conservará su historial.')) void enviar({ accion: 'baja', usuario_id: fila.id }, 'Cuenta dada de baja.')
            }}>Dar de baja</button>
          </div>}
        </li>)}</ul>}
  </section>
}
