'use client'

import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Globe, MapPin, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface Empresa {
  id: number
  nombre: string
  descripcion: string | null
  pais: string
  ciudad: string | null
  logo: string | null
}

interface FormularioEmpresa {
  nombre: string
  descripcion: string
  pais: string
  ciudad: string
}

const formularioInicial: FormularioEmpresa = {
  nombre: '',
  descripcion: '',
  pais: 'Perú',
  ciudad: '',
}

interface SettingsCompanyProps {
  soloRegistro?: boolean
  abrirFormularioAlMontar?: boolean
  onCancel?: () => void
  onCreated?: (empresa: Empresa) => void
}

export function SettingsCompany({
  soloRegistro = false,
  abrirFormularioAlMontar = false,
  onCancel,
  onCreated,
}: SettingsCompanyProps) {
  const { recargarContextoEmpresa, empresaActiva } = useAuth()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [cargando, setCargando] = useState(true)
  const [formularioAbierto, setFormularioAbierto] = useState(abrirFormularioAlMontar)
  const [formulario, setFormulario] = useState<FormularioEmpresa>(formularioInicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  useEffect(() => {
    let vigente = true
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    fetch('/api/empresa?todas=1', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las empresas.')
        if (!vigente) return
        const lista = Array.isArray(data) ? data : [data]
        setEmpresas(lista as Empresa[])
      })
      .catch(() => {
        if (vigente) setError('No se pudieron cargar las empresas.')
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [])

  const empresa = empresaActiva || empresas[0] || null

  const abrirFormulario = () => {
    setFormulario(formularioInicial)
    setError('')
    setExito('')
    setFormularioAbierto(true)
  }

  const cerrarFormulario = () => {
    setFormularioAbierto(false)
    setFormulario(formularioInicial)
    setError('')
    onCancel?.()
  }

  const manejarCambio = (campo: keyof FormularioEmpresa, valor: string) => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
  }

  const manejarGuardar = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setExito('')

    if (!formulario.nombre.trim()) {
      setError('El nombre de la empresa es obligatorio.')
      return
    }

    setGuardando(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
      const response = await fetch('/api/empresa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(formulario),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'No se pudo crear la empresa.')
        return
      }

      const nuevaEmpresa = data.empresa as Empresa
      setEmpresas((actual) => [...actual, nuevaEmpresa])
      await recargarContextoEmpresa()
      setExito(`${nuevaEmpresa.nombre} fue creada y recibió la división General.`)
      setFormulario(formularioInicial)
      setFormularioAbierto(false)
      onCreated?.(nuevaEmpresa)
    } catch {
      setError('No se pudo conectar al servidor.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  const campos = empresa
    ? [
        { etiqueta: 'Nombre de la empresa', valor: empresa.nombre, icono: Building2 },
        { etiqueta: 'Descripción', valor: empresa.descripcion || '', icono: null, multilinea: true },
        { etiqueta: 'País', valor: empresa.pais, icono: Globe },
        { etiqueta: 'Ciudad', valor: empresa.ciudad || '', icono: MapPin },
      ]
    : []

  return (
    <div className="space-y-4">
      {!soloRegistro && empresa && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl">
              <img src="/logo.png" alt={empresa.nombre} className="h-full w-full object-contain" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Información de la empresa</h2>
              <p className="text-sm text-muted-foreground">Empresa principal del sistema.</p>
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
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Empresas registradas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea una empresa y asigna sus divisiones y personal desde esa empresa.
            </p>
          </div>
          {!soloRegistro && !formularioAbierto && (
            <button
              type="button"
              onClick={abrirFormulario}
              className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
            >
              <Plus size={16} />
              Nueva empresa
            </button>
          )}
        </div>

        {formularioAbierto && (
          <form onSubmit={manejarGuardar} className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold text-foreground">Nueva empresa</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre</label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  value={formulario.nombre}
                  onChange={(event) => manejarCambio('nombre', event.target.value)}
                  placeholder="Ej. Consultora XYZ"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Ciudad</label>
                <input
                  type="text"
                  maxLength={100}
                  value={formulario.ciudad}
                  onChange={(event) => manejarCambio('ciudad', event.target.value)}
                  placeholder="Ej. Lima"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">País</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={formulario.pais}
                  onChange={(event) => manejarCambio('pais', event.target.value)}
                  placeholder="Ej. Perú"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
                <textarea
                  rows={2}
                  value={formulario.descripcion}
                  onChange={(event) => manejarCambio('descripcion', event.target.value)}
                  placeholder="Descripción breve"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                {error}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardando ? 'Creando...' : 'Crear empresa'}
              </button>
              <button
                type="button"
                onClick={cerrarFormulario}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {exito && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            {exito}
          </p>
        )}

        {!soloRegistro && empresas.length > 1 && (
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {empresas.map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <p className="truncate text-sm font-medium text-foreground">{item.nombre}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[item.ciudad, item.pais].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {!soloRegistro && error && !formularioAbierto && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
