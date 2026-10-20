'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface ToastCtx {
  mostrar: (mensaje: string) => void
}

const Ctx = createContext<ToastCtx>({ mostrar: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  return (
    <Ctx.Provider value={{ mostrar: (m) => { setMensaje(m); setTimeout(() => setMensaje(null), 3000) } }}>
      {children}
      {mensaje && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground shadow-lg">
          {mensaje}
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}