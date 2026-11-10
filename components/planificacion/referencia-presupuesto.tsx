'use client'

import { useState } from 'react'
import { FileSpreadsheet, Plus } from 'lucide-react'
import type { PlanExcel, TareaCronograma } from '@/lib/planificacion/modelo'
import { hoy, sumarDias } from '@/lib/planificacion/fechas'
import styles from './editor.module.css'

export function ReferenciaPresupuesto({ filas, editable, ocupado, onImportar }: {
  filas: PlanExcel[]; editable: boolean; ocupado: boolean; onImportar: (tareas: TareaCronograma[]) => Promise<void>
}) {
  const [inicio, setInicio] = useState(hoy())
  const [confirmar, setConfirmar] = useState(false)
  return <div className="p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet size={16} className="text-violet-300" /> Referencia del presupuesto vigente</h4>
        <p className="mt-1 text-xs text-[#a79ab9]">{filas.length} filas de planificación. Esta referencia se mantiene separada del editor.</p></div>
      {editable && filas.length > 0 && <button className={styles.boton} disabled={ocupado} onClick={() => setConfirmar(!confirmar)}><Plus size={14} /> Copiar actividades al editor</button>}
    </div>
    {confirmar && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-xs">
      <label>Fecha de la semana 1<input className={styles.input} type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></label>
      <p className="max-w-sm text-[#bdb1cf]">Se crearán {filas.length} actividades. Las filas sin semanas válidas quedarán sin programar. No se reemplazan las existentes.</p>
      <button disabled={ocupado || !inicio} className={styles.primario} onClick={async () => {
        const tareas = filas.map((f, i): TareaCronograma => {
          const valido = f.semanaInicio != null && f.semanaFin != null && f.semanaInicio >= 1 && f.semanaFin >= f.semanaInicio
          return { id: -(i + 1), servicioId: f.servicioId, servicioNombre: null, padreId: null, nombre: f.subetapa, etapa: f.etapa,
            fechaInicio: valido ? sumarDias(inicio, (f.semanaInicio! - 1) * 7) : null,
            fechaFin: valido ? sumarDias(inicio, f.semanaFin! * 7 - 1) : null,
            horas: f.horas, progreso: 0, estado: valido ? 'PLANIFICADA' : 'PENDIENTE', responsableId: null, dependencias: [], notas: null, orden: i, revision: 0 }
        })
        await onImportar(tareas); setConfirmar(false)
      }}>Confirmar copia</button>
      <button className={styles.boton} onClick={() => setConfirmar(false)}>Cancelar</button>
    </div>}
    <div className="max-h-[500px] overflow-auto rounded-xl border border-white/[.07]">
      <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#241c30] text-[#bdb1cf]"><tr><th className="p-3">Actividad</th><th className="p-3">Etapa</th><th className="p-3">Semanas</th><th className="p-3">Horas</th></tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i} className="border-t border-white/[.04]"><td className="p-3">{f.subetapa}</td><td className="p-3 text-[#a79ab9]">{f.etapa ?? '—'}</td><td className="whitespace-nowrap p-3 text-[#a79ab9]">{f.semanaInicio ?? '—'} → {f.semanaFin ?? '—'}</td><td className="p-3 tabular-nums">{f.horas}</td></tr>)}</tbody>
      </table>
    </div>
  </div>
}
