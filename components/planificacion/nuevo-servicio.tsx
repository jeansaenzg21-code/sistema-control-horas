'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, X } from 'lucide-react'
import type { ResponsablePlan } from '@/lib/planificacion/modelo'
import { esquemaServicioManual } from '@/lib/presupuestos/servicio-manual-validacion'
import styles from './editor.module.css'

export function NuevoServicio({ clienteId, presupuestoId, responsables, onCerrar, onGuardado }: {
  clienteId: number; presupuestoId: number; responsables: ResponsablePlan[]; onCerrar: () => void; onGuardado: () => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [horas, setHoras] = useState('')
  const [participantes, setParticipantes] = useState([{ usuarioId: '', horas: '' }])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [reintento, setReintento] = useState(false)
  const clave = useRef(crypto.randomUUID())
  const enviado = useRef<unknown>(null)
  const dialogo = useRef<HTMLDivElement>(null)
  const horasServicio = Math.round(Number(horas || 0) * 100) / 100
  const suma = participantes.reduce((n, p) => n + Math.round(Number(p.horas || 0) * 100), 0) / 100
  const sumaExacta = horasServicio > 0 && Math.round(suma * 100) === Math.round(horasServicio * 100)
  const diferencia = Math.round((horasServicio - suma) * 100) / 100
  useEffect(() => {
    dialogo.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [])
  const guardar = async () => {
    if (guardando) return
    const validacion = esquemaServicioManual.safeParse({ clave: clave.current, presupuestoId, nombre, horas: Number(horas), participantes: participantes.map(p => ({ usuarioId: Number(p.usuarioId), horas: Number(p.horas) })) })
    if (!enviado.current && !validacion.success) { setError(validacion.error.issues[0].message); return }
    enviado.current ??= validacion.success ? validacion.data : null
    setGuardando(true); setError(null)
    try {
      const r = await fetch(`/api/clientes/${clienteId}/servicios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enviado.current) })
      const datos = await r.json()
      if (!r.ok) { if (r.status < 500) enviado.current = null; throw new Error(datos.error ?? 'No se pudo crear el servicio.') }
      await onGuardado(); onCerrar()
    } catch (error) {
      setReintento(enviado.current !== null)
      setError(error instanceof Error ? error.message : 'No hubo respuesta. Reintenta el mismo envío para evitar duplicados.')
    } finally { setGuardando(false) }
  }
  return createPortal(<div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 p-4">
    <div ref={dialogo} role="dialog" aria-modal="true" aria-labelledby="titulo-nuevo-servicio" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-violet-300/20 bg-[#1c1726] p-6 text-[#e9e5f4] shadow-2xl" onKeyDown={e => {
      if (e.key === 'Escape' && !guardando) onCerrar()
      if (e.key === 'Tab') {
        const elementos = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'))
        const primero = elementos[0], ultimo = elementos[elementos.length - 1]
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo?.focus() }
        if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero?.focus() }
      }
    }}>
      <div className="mb-4 flex items-start justify-between gap-3"><div><h3 id="titulo-nuevo-servicio" className="text-base font-semibold">Añadir servicio al presupuesto</h3><p className="mt-1 text-xs leading-relaxed text-[#aca0bd]">El servicio se agregará al presupuesto vigente, con sus participantes y su bolsa de horas activa.</p></div><button className={styles.icono} aria-label="Cerrar nuevo servicio" disabled={guardando} onClick={onCerrar}><X size={15} /></button></div>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void guardar() }}>
        <fieldset disabled={guardando || reintento} className="space-y-4">
          <label className={styles.campo}>Nombre del servicio<input className={styles.input} value={nombre} maxLength={200} onChange={e => setNombre(e.target.value)} required /></label>
          <label className={styles.campo}>Horas presupuestadas del servicio<input className={styles.input} type="number" min="0.01" max="100000" step="0.01" value={horas} onChange={e => setHoras(e.target.value)} required /></label>
          <div className="flex items-center justify-between"><h4 className="text-sm font-medium">Participantes</h4><button type="button" className={styles.boton} disabled={participantes.length >= responsables.length} onClick={() => setParticipantes([...participantes, { usuarioId: '', horas: '' }])}><Plus size={13} /> Participante</button></div>
          <p className="text-xs text-[#aca0bd]">{responsables.length ? 'Solo se muestra personal activo del área del cliente.' : 'No hay participantes activos disponibles en el área del cliente.'}</p>
          {participantes.map((p, i) => <div key={i} className="flex items-end gap-2">
            <label className={`${styles.campo} min-w-0 flex-1`}>Persona<select aria-label={`Persona ${i + 1}`} className={styles.input} required value={p.usuarioId} onChange={e => setParticipantes(participantes.map((x, j) => j === i ? { ...x, usuarioId: e.target.value } : x))}>
              <option value="">Selecciona un participante</option>{responsables.map(u => <option key={u.id} value={u.id} disabled={participantes.some((x, j) => j !== i && Number(x.usuarioId) === u.id)}>{u.nombre}</option>)}
            </select></label>
            <label className={`${styles.campo} w-24 shrink-0`}>Horas<input className={styles.input} required type="number" min="0.01" max={horasServicio > 0 ? horasServicio : 100000} step="0.01" value={p.horas} onChange={e => {
              const valor = e.target.value
              const excede = horasServicio > 0 && Number(valor) > horasServicio
              setParticipantes(participantes.map((x, j) => j === i ? { ...x, horas: excede ? String(horasServicio) : valor } : x))
            }} /></label>
            <button type="button" aria-label={`Quitar participante ${i + 1}`} className={styles.icono} disabled={participantes.length <= 1} onClick={() => setParticipantes(participantes.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>)}
          <p role="status" className={`text-xs ${sumaExacta ? 'text-emerald-300' : 'text-amber-200'}`}>Distribuidas: {suma} h de {horasServicio} h. {sumaExacta ? 'La distribución coincide con el servicio.' : diferencia < 0 ? `Excede por ${Math.abs(diferencia)} h; ajusta las horas antes de crear el servicio.` : 'Debes distribuir todas las horas entre los participantes.'}</p>
        </fieldset>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={styles.boton} disabled={guardando} onClick={onCerrar}>Cancelar</button><button className={styles.primario} disabled={guardando || !responsables.length || !sumaExacta} title={sumaExacta ? undefined : 'La suma de horas por participante debe coincidir con las horas del servicio'}>{guardando ? 'Guardando…' : reintento ? 'Reintentar guardado' : 'Crear servicio y actualizar bolsa'}</button></div>
      </form>
    </div>
  </div>, document.body)
}
