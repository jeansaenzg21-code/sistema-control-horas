'use client'

import { ReactNode } from 'react'

export interface Columna<T> {
  clave: string
  titulo: string
  render?: (fila: T) => ReactNode
}

export function DataTable<T extends Record<string, unknown>>({
  columnas,
  datos,
  cargando,
  vacio = 'Sin datos',
}: {
  columnas: Columna<T>[]
  datos: T[]
  cargando?: boolean
  vacio?: string
}) {
  if (cargando) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Cargando...</div>
  }
  if (!datos || datos.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{vacio}</div>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} className="px-3 py-2">{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((fila, i) => (
            <tr key={i} className="border-t border-border">
              {columnas.map((c) => (
                <td key={c.clave} className="px-3 py-2 text-foreground">
                  {c.render ? c.render(fila) : String(fila[c.clave] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}