'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { WidgetContextValue } from './types'

const WidgetContext = createContext<WidgetContextValue | null>(null)

export function WidgetProvider({
  children,
  value,
}: {
  children: ReactNode
  value: WidgetContextValue
}) {
  return <WidgetContext.Provider value={value}>{children}</WidgetContext.Provider>
}

export function useWidget(): WidgetContextValue {
  const ctx = useContext(WidgetContext)
  if (!ctx) throw new Error('useWidget debe usarse dentro de WidgetProvider')
  return ctx
}
