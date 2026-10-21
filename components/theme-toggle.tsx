'use client'

import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [oscuro, setOscuro] = useState(true)

  useEffect(() => {
    const guardado = localStorage.getItem('tema')
    const esOscuro = guardado !== 'claro'
    setOscuro(esOscuro)
    document.documentElement.classList.toggle('dark', esOscuro)
  }, [])

  const alternar = () => {
    const nuevo = !oscuro
    setOscuro(nuevo)
    document.documentElement.classList.toggle('dark', nuevo)
    localStorage.setItem('tema', nuevo ? 'oscuro' : 'claro')
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Cambiar tema"
      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
    >
      {oscuro ? 'Claro' : 'Oscuro'}
    </button>
  )
}