'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Logo } from '@/components/logo'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const manejarEnvio = (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuario.trim() || !password) return
    setError('')
    setCargando(true)
    window.setTimeout(() => {
      const resultado = login({ usuario: usuario.trim(), password })
      if (resultado.ok) {
        router.replace('/')
        router.refresh()
      } else {
        setError(resultado.error || 'Error al iniciar sesión.')
        setCargando(false)
      }
    }, 350)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <Logo size={72} />
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Paredes Cano</h1>
            <p className="text-sm text-muted-foreground">Registro de horas · Acceso al sistema</p>
          </div>
        </div>

        <form
          onSubmit={manejarEnvio}
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Usuario</label>
            <div className="relative">
              <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                required
                placeholder="Nombre de usuario"
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Contraseña</label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type={verPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-10 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                {verPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {cargando ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Primer acceso: usuario <span className="font-semibold text-foreground">admin</span> · contraseña{' '}
          <span className="font-semibold text-foreground">admin</span>
        </p>
      </div>
    </div>
  )
}
