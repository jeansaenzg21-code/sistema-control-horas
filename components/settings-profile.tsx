'use client'

import { useState } from 'react'
import { User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export function SettingsProfile() {
  const { usuario, cargarUsuarios } = useAuth()
  const [nombre, setNombre] = useState(usuario?.nombre || '')
  const [correo, setCorreo] = useState(usuario?.correo || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [guardando, setGuardando] = useState(false)

  const inputClase = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50'

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setExito('')

    if (!nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }

    setGuardando(true)
    try {
      const body: Record<string, string> = { nombre: nombre.trim(), correo: correo.trim() }
      if (password) body.password = password

      const res = await fetch(`/api/usuarios/${usuario?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar.')
        return
      }
      await cargarUsuarios()
      setPassword('')
      setExito('Perfil actualizado correctamente.')
    } catch {
      setError('No se pudo conectar al servidor.')
    } finally {
      setGuardando(false)
    }
  }

  if (!usuario) return null

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7c3aed]/15">
            <User size={24} className="text-[#a78bfa]" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">Mi perfil</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Actualiza tu información personal y contraseña.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <form onSubmit={guardar} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre completo</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={inputClase}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Correo electrónico</label>
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className={inputClase}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Contraseña <span className="text-muted-foreground">(dejar vacío para no cambiar)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClase}
              placeholder="••••••••"
            />
          </div>

          {(error || exito) && (
            <p className={`rounded-lg border px-3 py-2 text-sm ${
              error
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            }`}>
              {error || exito}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  )
}
