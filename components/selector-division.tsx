'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import styles from './consolidacion.module.css'

export function SelectorDivision({ areas, areaId, onChange, id, etiqueta, todas, etiquetaOpciones = 'Áreas' }: {
  areas: Array<{ id: number; nombre: string }>
  areaId: string
  id?: string
  etiqueta?: string
  etiquetaOpciones?: string
  todas?: string
  onChange: (id: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const control = useRef<HTMLButtonElement>(null)
  const idLista = useId()
  const nombre = areas.find((area) => String(area.id) === areaId)?.nombre

  useEffect(() => {
    if (!abierto) return
    const cerrarFuera = (evento: PointerEvent) => {
      if (evento.target instanceof Node && !raiz.current?.contains(evento.target)) setAbierto(false)
    }
    document.addEventListener('pointerdown', cerrarFuera)
    return () => document.removeEventListener('pointerdown', cerrarFuera)
  }, [abierto])

  const elegir = (id: string) => {
    if (id !== areaId) onChange(id)
    setAbierto(false)
    control.current?.focus()
  }

  return (
    <div className={styles.divisionPicker} ref={raiz}
      onBlur={(evento) => { if (evento.relatedTarget && !evento.currentTarget.contains(evento.relatedTarget)) setAbierto(false) }}
      onKeyDown={(evento) => {
        if (evento.key !== 'Escape' || !abierto) return
        evento.preventDefault()
        setAbierto(false)
        control.current?.focus()
      }}>
      <button id={id} aria-label={etiqueta} ref={control} type="button" className={styles.control} aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined} onClick={() => setAbierto(!abierto)}>
        <span>{nombre ?? todas ?? 'Elegir división'}</span><ChevronDown size={17} aria-hidden="true" />
      </button>
      {abierto && <div id={idLista} className={styles.divisionMenu}>
        <ul className={styles.divisionOptions} aria-label={etiquetaOpciones}>
          {todas && <li><button type="button" aria-pressed={!areaId} onClick={() => elegir('')}>
            <span>{todas}</span>{!areaId && <Check size={16} aria-hidden="true" />}
          </button></li>}
          {areas.map((area) => (
            <li key={area.id}>
              <button type="button" aria-pressed={String(area.id) === areaId} onClick={() => elegir(String(area.id))}>
                <span title={area.nombre}>{area.nombre}</span>
                {String(area.id) === areaId && <Check size={16} aria-hidden="true" />}
              </button>
            </li>
          ))}
          {!areas.length && <li className={styles.noDivisions}>No hay divisiones disponibles.</li>}
        </ul>
        {areaId && !todas && <button type="button" className={styles.clearDivision} onClick={() => elegir('')}>Quitar selección</button>}
      </div>}
    </div>
  )
}
