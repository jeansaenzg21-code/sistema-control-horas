'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut, Map as MapIcon, X } from 'lucide-react'
import { CompanyMap } from '@/components/hub/company-map'
import { SettingsCompany } from '@/components/settings-company'
import { useAuth } from '@/lib/auth-context'

export default function HubEmpresas() {
  const {
    usuario,
    cargando,
    empresaActiva,
    empresasDisponibles,
    entrarEnEmpresa,
    logout,
  } = useAuth()
  const router = useRouter()
  const [entrando, setEntrando] = useState<number | null>(null)
  const [creandoEmpresa, setCreandoEmpresa] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login')
  }, [cargando, usuario, router])

  useEffect(() => {
    if (!creandoEmpresa) return
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setCreandoEmpresa(false)
    }
    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [creandoEmpresa])

  const puedeCrear = usuario?.rol === 'admin'

  const ingresar = async (empresaId: number) => {
    setError('')
    setEntrando(empresaId)
    const resultado = await entrarEnEmpresa(empresaId)
    if (resultado.ok) {
      router.replace(usuario?.rol === 'admin' || usuario?.rol === 'jefe_area' ? '/' : '/actividades')
    } else {
      setError(resultado.error || 'No se pudo ingresar a la empresa.')
      setEntrando(null)
    }
  }

  const cerrarSesion = () => {
    logout()
    router.replace('/login')
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-sm text-zinc-400">
        <Loader2 className="mr-2 animate-spin text-violet-300" size={18} />
        Cargando empresas...
      </div>
    )
  }

  if (!usuario) return null

  const iniciales = usuario.nombre
    .split(' ')
    .map((parte) => parte[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#09090b] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(167,139,250,.18) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'linear-gradient(to bottom, black, transparent 80%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-3 sm:px-8 sm:py-4">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-violet-300/15 bg-violet-500/10">
              <img src="/logo.png" alt="Paredes Cano" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-zinc-100">Control de horas</p>
              <p className="text-[11px] text-zinc-500">Paredes Cano</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/20 text-[10px] font-bold text-violet-200">
                {iniciales}
              </div>
              <div className="leading-tight">
                <p className="max-w-32 truncate text-xs font-medium text-zinc-200">{usuario.nombre}</p>
                <p className="text-[10px] text-zinc-500">{usuario.rol === 'admin' ? 'Administrador' : usuario.rol === 'jefe_area' ? 'Jefe de área' : 'Colaborador'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={cerrarSesion}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-zinc-100"
              aria-label="Cerrar sesión"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="py-3 sm:py-4">
          <section className="mb-3 flex flex-wrap items-end justify-between gap-3 sm:mb-4">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/70">
                <MapIcon size={14} />
                Red de empresas
              </div>
              <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
                Selecciona una empresa
              </h1>
              <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500 sm:text-sm">
                Ingresa al espacio de trabajo que deseas administrar.
              </p>
            </div>
          </section>

          {error && (
            <p className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300" role="alert">
              {error}
            </p>
          )}

          <CompanyMap
            empresas={empresasDisponibles}
            empresaActiva={empresaActiva}
            enteringId={entrando}
            canCreate={puedeCrear}
            onEnter={ingresar}
            onCreate={() => setCreandoEmpresa(true)}
          />
        </main>
      </div>

      {creandoEmpresa && puedeCrear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreandoEmpresa(false)
          }}
        >
          <div
            className="relative w-full max-w-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-create-title"
          >
            <h2 id="company-create-title" className="sr-only">Crear nueva empresa</h2>
            <button
              type="button"
              onClick={() => setCreandoEmpresa(false)}
              className="absolute right-3 top-3 z-10 rounded-lg border border-white/10 bg-[#111116] p-2 text-zinc-500 transition-colors hover:text-zinc-100"
              aria-label="Cerrar formulario"
            >
              <X size={16} />
            </button>
            <SettingsCompany
              soloRegistro
              abrirFormularioAlMontar
              onCancel={() => setCreandoEmpresa(false)}
              onCreated={() => setCreandoEmpresa(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
