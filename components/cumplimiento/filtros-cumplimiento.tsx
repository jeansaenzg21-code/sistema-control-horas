'use client'

import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useClientes } from '@/lib/clientes-context'

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const estiloControl =
  'h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/40 cursor-pointer'

interface Props {
  anio: number
  mes: number
  usuarioId: string
  clienteId: string
  cargando?: boolean
  onAnio: (v: number) => void
  onMes: (v: number) => void
  onUsuarioId: (v: string) => void
  onClienteId: (v: string) => void
  onConsultar: () => void
}

export function FiltrosCumplimiento({
  anio,
  mes,
  usuarioId,
  clienteId,
  cargando,
  onAnio,
  onMes,
  onUsuarioId,
  onClienteId,
  onConsultar,
}: Props) {
  const { usuarios } = useAuth()
  const { clientes } = useClientes()

  const anios = useMemo(() => {
    const actual = new Date().getFullYear()
    return [actual - 2, actual - 1, actual, actual + 1]
  }, [])

  const colaboradores = useMemo(
    () => usuarios.filter((u) => u.rol === 'personal' && u.activo),
    [usuarios],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Mes</label>
          <select value={mes} onChange={(e) => onMes(Number(e.target.value))} className={estiloControl}>
            {NOMBRES_MESES.map((nombre, index) => (
              <option key={nombre} value={index + 1}>{nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Año</label>
          <select value={anio} onChange={(e) => onAnio(Number(e.target.value))} className={estiloControl}>
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Colaborador</label>
          <select value={usuarioId} onChange={(e) => onUsuarioId(e.target.value)} className={estiloControl}>
            <option value="">Todos</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Cliente</label>
          <select value={clienteId} onChange={(e) => onClienteId(e.target.value)} className={estiloControl}>
            <option value="">Todos</option>
            {clientes.filter((c) => c.activo).map((c) => (
              <option key={c.id} value={String(c.id)}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={onConsultar}
            disabled={cargando}
            className="flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#7c3aed] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            Consultar
          </button>
        </div>
      </div>
    </div>
  )
}