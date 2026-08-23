'use client'

import { useState, useEffect } from 'react'
import { Monitor, Download, CheckCircle2, Clock } from 'lucide-react'

const VERSION = '1.0.0'

const DESCARGAS: Record<string, { archivo: string; disponible: boolean }> = {
  Windows: {
    archivo: `/downloads/Paredes-Cano-Timer-${VERSION}-x64-setup.exe`,
    disponible: true,
  },
  macOS: { archivo: '', disponible: false },
  Linux: { archivo: '', disponible: false },
}

function detectarSO(): string {
  if (typeof window === 'undefined') return 'desconocido'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'Windows'
  if (ua.includes('mac')) return 'macOS'
  if (ua.includes('linux')) return 'Linux'
  return 'desconocido'
}

export function SettingsWidget() {
  const [so, setSo] = useState<string>('desconocido')

  useEffect(() => {
    setSo(detectarSO())
  }, [])

  const descarga = DESCARGAS[so]
  const disponible = descarga?.disponible ?? false

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7c3aed]/15">
            <Monitor size={24} className="text-[#a78bfa]" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">Paredes Cano Timer</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Registra tus horas mientras trabajas sin necesidad de mantener abierta la ventana del sistema.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              El Widget permanece visible sobre tus aplicaciones para que puedas pausar o finalizar tu actividad en cualquier momento.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium text-foreground">Disponible para instalar</span>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sistema operativo</p>
          <p className="mt-1.5 text-sm font-medium text-foreground">{so === 'desconocido' ? 'No detectado' : so}</p>
        </div>

        {disponible ? (
          <>
            <a
              href={descarga.archivo}
              download
              className="inline-flex items-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6d28d9]"
            >
              <Download size={16} />
              Descargar Paredes Cano Timer
            </a>
            <p className="text-xs text-muted-foreground">
              Después de descargarlo, ejecuta el instalador para instalar el Widget en tu computadora.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5">
            <Clock size={16} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {so === 'desconocido'
                ? 'No se pudo detectar tu sistema operativo'
                : `Próximamente para ${so}`}
            </span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h4 className="text-sm font-semibold text-foreground">Cómo funciona</h4>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="font-semibold text-[#a78bfa]">1.</span>
            Descarga e instala el Widget en tu computadora.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-[#a78bfa]">2.</span>
            Inicia sesión en el sistema web con tu perfil de personal.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-[#a78bfa]">3.</span>
            El Widget aparecerá solo, sincronizado con tu sesión.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-[#a78bfa]">4.</span>
            Pausa, reanuda o finaliza tu actividad directamente desde el Widget.
          </li>
        </ol>
      </div>
    </div>
  )
}
