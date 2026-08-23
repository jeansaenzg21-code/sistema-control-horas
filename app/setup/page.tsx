'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CheckCircle2, Eye, EyeOff, Globe, Lock, MapPin, User } from 'lucide-react'
import { Logo } from '@/components/logo'
import { cn } from '@/lib/utils'

type Paso = 'empresa' | 'admin' | 'listo'

interface SetupStatus {
  necesita_setup: boolean
  tiene_empresa: boolean
  tiene_usuarios: boolean
}

export default function SetupPage() {
  const router = useRouter()
  const [paso, setPaso] = useState<Paso>('empresa')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [verPassword, setVerPassword] = useState(false)

  const [empresa, setEmpresa] = useState({ nombre: '', descripcion: '', pais: '', ciudad: '' })
  const [admin, setAdmin] = useState({ nombre: '', correo: '', usuario: '', password: '' })

  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data: SetupStatus) => {
        if (!data.necesita_setup) {
          router.replace('/login')
          return
        }
        if (data.tiene_empresa && !data.tiene_usuarios) {
          setPaso('admin')
        }
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [router])

  const manejarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!empresa.nombre.trim() || !empresa.pais.trim()) {
      setError('El nombre y el país son obligatorios.')
      return
    }
    try {
      const res = await fetch('/api/setup/empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(empresa),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al guardar la empresa.')
        return
      }
      setPaso('admin')
    } catch {
      setError('No se pudo conectar al servidor.')
    }
  }

  const manejarAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!admin.nombre.trim() || !admin.usuario.trim()) {
      setError('El nombre y el usuario son obligatorios.')
      return
    }
    if (!admin.password) {
      setError('La contraseña es obligatoria.')
      return
    }
    try {
      const res = await fetch('/api/setup/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(admin),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al crear el administrador.')
        return
      }
      setPaso('listo')
    } catch {
      setError('No se pudo conectar al servidor.')
    }
  }

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#7c3aed]/40 border-t-[#7c3aed]" />
      </div>
    )
  }

  const input = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50'
  const label = 'mb-1 block text-xs font-medium text-foreground'

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4 py-6">
      <div className="flex w-full max-w-[400px] flex-col">
        <div className="mb-4 flex flex-col items-center gap-2">
          <Logo size={48} />
          <div className="text-center">
            <h1 className="text-base font-bold tracking-tight text-foreground">Configuración inicial</h1>
            <p className="text-xs text-muted-foreground">
              {paso === 'empresa' && 'Configura los datos de tu empresa.'}
              {paso === 'admin' && 'Crea tu cuenta de administrador.'}
              {paso === 'listo' && 'Ya puedes iniciar sesión.'}
            </p>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-center gap-2">
          {(['empresa', 'admin', 'listo'] as Paso[]).map((p, i) => {
            const activo = p === paso
            const completado = (paso === 'admin' && p === 'empresa') || (paso === 'listo')
            return (
              <div key={p} className="flex items-center gap-1.5">
                {i > 0 && <div className={cn('h-px w-6', completado || activo ? 'bg-[#7c3aed]' : 'bg-border')} />}
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                    activo
                      ? 'bg-[#7c3aed] text-white'
                      : completado
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {completado ? <CheckCircle2 size={13} /> : i + 1}
                </div>
              </div>
            )
          })}
        </div>

        <div className="overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-2xl shadow-black/40">
          {paso === 'empresa' && (
            <form onSubmit={manejarEmpresa} className="space-y-3">
              <h2 className="text-xs font-semibold text-foreground">Datos de la empresa</h2>

              <div>
                <label className={label}>
                  <span className="inline-flex items-center gap-1"><Building2 size={12} className="text-muted-foreground" /> Nombre de la empresa</span>
                </label>
                <input
                  type="text"
                  value={empresa.nombre}
                  onChange={(e) => setEmpresa((p) => ({ ...p, nombre: e.target.value }))}
                  required
                  placeholder="Ej. Paredes Cano"
                  className={input}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={label}>
                    <span className="inline-flex items-center gap-1"><Globe size={12} className="text-muted-foreground" /> País *</span>
                  </label>
                  <input
                    type="text"
                    value={empresa.pais}
                    onChange={(e) => setEmpresa((p) => ({ ...p, pais: e.target.value }))}
                    required
                    placeholder="Ej. Perú"
                    className={input}
                  />
                </div>
                <div>
                  <label className={label}>
                    <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-muted-foreground" /> Ciudad</span>
                  </label>
                  <input
                    type="text"
                    value={empresa.ciudad}
                    onChange={(e) => setEmpresa((p) => ({ ...p, ciudad: e.target.value }))}
                    placeholder="Ej. Lima"
                    className={input}
                  />
                </div>
              </div>

              <div>
                <label className={label}>Descripción</label>
                <input
                  type="text"
                  value={empresa.descripcion}
                  onChange={(e) => setEmpresa((p) => ({ ...p, descripcion: e.target.value }))}
                  placeholder="(Opcional)"
                  className={input}
                />
              </div>

              {error && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
              >
                Continuar
              </button>
            </form>
          )}

          {paso === 'admin' && (
            <form onSubmit={manejarAdmin} className="space-y-3">
              <h2 className="text-xs font-semibold text-foreground">Crear administrador</h2>

              <div>
                <label className={label}>
                  <span className="inline-flex items-center gap-1"><User size={12} className="text-muted-foreground" /> Nombre completo</span>
                </label>
                <input
                  type="text"
                  value={admin.nombre}
                  onChange={(e) => setAdmin((p) => ({ ...p, nombre: e.target.value }))}
                  required
                  placeholder="Ej. Juan Paredes"
                  className={input}
                />
              </div>

              <div>
                <label className={label}>Correo (opcional)</label>
                <input
                  type="email"
                  value={admin.correo}
                  onChange={(e) => setAdmin((p) => ({ ...p, correo: e.target.value }))}
                  placeholder="correo@paredescano.com"
                  className={input}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={label}>Usuario</label>
                  <input
                    type="text"
                    value={admin.usuario}
                    onChange={(e) => setAdmin((p) => ({ ...p, usuario: e.target.value }))}
                    required
                    autoComplete="username"
                    placeholder="Ej. admin"
                    className={input}
                  />
                </div>
                <div>
                  <label className={label}>Contraseña</label>
                  <div className="relative">
                    <Lock size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={verPassword ? 'text' : 'password'}
                      value={admin.password}
                      onChange={(e) => setAdmin((p) => ({ ...p, password: e.target.value }))}
                      required
                      autoComplete="new-password"
                      placeholder="Mín. 4"
                      className={cn(input, 'pl-8 pr-8')}
                    />
                    <button
                      type="button"
                      onClick={() => setVerPassword((v) => !v)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      {verPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-400">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setPaso('empresa'); setError('') }}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Atrás
                </button>
                <button
                  type="submit"
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
                >
                  Crear administrador
                </button>
              </div>
            </form>
          )}

          {paso === 'listo' && (
            <div className="space-y-3 py-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 size={24} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">¡Configuración completada!</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ya puedes acceder al sistema.
                </p>
              </div>
              <button
                onClick={() => router.replace('/login')}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
              >
                Ir al login
              </button>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[10px] text-muted-foreground/50">
          Paredes Cano · Control de Horas
        </p>
      </div>
    </div>
  )
}
