'use client'

import { useEffect, useState } from 'react'
import { Building2, MapPin, Globe } from 'lucide-react'

interface Empresa {
  id: number
  nombre: string
  descripcion: string | null
  pais: string
  ciudad: string | null
}

export function SettingsCompany() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null)

  useEffect(() => {
    fetch('/api/empresa')
      .then((r) => r.json())
      .then(setEmpresa)
      .catch(() => {})
  }, [])

  if (!empresa) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  const campos = [
    { etiqueta: 'Nombre de la empresa', valor: empresa.nombre, icono: Building2 },
    { etiqueta: 'Descripción', valor: empresa.descripcion || '', icono: null, multilinea: true },
    { etiqueta: 'País', valor: empresa.pais, icono: Globe },
    { etiqueta: 'Ciudad', valor: empresa.ciudad || '', icono: MapPin },
  ]

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl">
          <img src="/logo.png" alt={empresa.nombre} className="h-full w-full object-contain" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Información de la empresa</h2>
          <p className="text-sm text-muted-foreground">
            Los cambios requieren contacto con el administrador.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {campos.map((campo) => (
          <div key={campo.etiqueta} className={campo.multilinea ? 'md:col-span-2' : undefined}>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              {campo.etiqueta}
            </label>
            {campo.multilinea ? (
              <textarea
                value={campo.valor}
                readOnly
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
              />
            ) : (
              <div className="relative">
                {campo.icono && (
                  <campo.icono
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                )}
                <input
                  type="text"
                  value={campo.valor}
                  readOnly
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pl-9 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
