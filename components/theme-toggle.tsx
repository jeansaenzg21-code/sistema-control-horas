'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import styles from '@/app/configuracion/configuracion.module.css'

const temas = [
  { id: 'claro', etiqueta: 'Claro', Icono: Sun },
  { id: 'oscuro', etiqueta: 'Oscuro', Icono: Moon },
] as const
type Tema = (typeof temas)[number]['id']

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema | null>(null)

  useEffect(() => {
    setTema(document.documentElement.classList.contains('dark') ? 'oscuro' : 'claro')
  }, [])

  const elegir = (nuevo: Tema) => {
    document.documentElement.classList.toggle('dark', nuevo === 'oscuro')
    setTema(nuevo)
    localStorage.setItem('tema', nuevo)
  }

  return (
    <section className={styles.appearance} aria-labelledby="titulo-apariencia">
      <div className={styles.panelHeading}>
        <span className={styles.tile}><Monitor size={22} aria-hidden="true" /></span>
        <div><h2 id="titulo-apariencia">Apariencia</h2><p>Cambia entre tema claro y oscuro.</p></div>
      </div>
      <div role="group" aria-label="Tema del sistema" className={styles.themeOptions}>
        {temas.map(({ id, etiqueta, Icono }) => (
          <button key={id} type="button" aria-pressed={tema === id} onClick={() => elegir(id)}>
            <Icono size={18} aria-hidden="true" />{etiqueta}
          </button>
        ))}
      </div>
    </section>
  )
}
