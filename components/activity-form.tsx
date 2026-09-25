'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Play } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { useClientes } from '@/lib/clientes-context'

export function ActivityForm() {
  const { iniciarActividad } = useActividad()
  const { usuario } = useAuth()
  const { clientes } = useClientes()
  const [tipoActividadId, setTipoActividadId] = useState<number | ''>('')
  const [clienteId, setClienteId] = useState<number | ''>('')
  const [proyectoId, setProyectoId] = useState<number | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [cargando, setCargando] = useState(false)
  const [tiposDisponibles, setTiposDisponibles] = useState<Array<{ id: number; nombre: string }>>([])
  const [proyectos, setProyectos] = useState<Array<{ id: number; nombre: string; estado: string; cliente_id: number | null; cliente_nombre: string | null }>>([])

  useEffect(() => {
    if (!usuario?.area_id) return
    const cargarTipos = async () => {
      try {
        const token = localStorage.getItem('pc_token')
        const res = await fetch(`/api/tipos-actividad?area_id=${usuario.area_id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (res.ok) {
          const data = await res.json()
          const ordenados = [...data].sort((a: { nombre: string }, b: { nombre: string }) => {
            const aFin = a.nombre.toLowerCase().startsWith('otros trámite') || a.nombre.toLowerCase().startsWith('otros tramite')
            const bFin = b.nombre.toLowerCase().startsWith('otros trámite') || b.nombre.toLowerCase().startsWith('otros tramite')
            if (aFin && !bFin) return 1
            if (!aFin && bFin) return -1
            return a.nombre.localeCompare(b.nombre, 'es')
          })
          setTiposDisponibles(ordenados)
        }
      } catch {
        setTiposDisponibles([])
      }
    }
    void cargarTipos()
  }, [usuario])

  useEffect(() => {
    if (!usuario) return
    const cargarProyectos = async () => {
      try {
        const token = localStorage.getItem('pc_token')
        const res = await fetch('/api/proyectos', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) {
            const disponibles = data.filter((proyecto: { estado: string }) => ['PLANIFICACION', 'EN_CURSO', 'PAUSADO'].includes(proyecto.estado))
            setProyectos(disponibles)
            const proyectoParam = new URLSearchParams(window.location.search).get('proyecto')
            const proyectoSeleccionado = Number(proyectoParam)
            if (proyectoParam && Number.isInteger(proyectoSeleccionado) && disponibles.some((proyecto: { id: number }) => proyecto.id === proyectoSeleccionado)) {
              setProyectoId(proyectoSeleccionado)
            }
          }
        }
      } catch {
        setProyectos([])
      }
    }
    void cargarProyectos()
  }, [usuario])

  const proyectoCliente = proyectos.find((proyecto) => proyecto.id === Number(proyectoId))
  const clientesVisibles = useMemo(() => {
    const clientesArea = clientes.filter((cliente) => !usuario?.area_id || cliente.area_id === usuario.area_id)
    if (proyectoCliente?.cliente_id != null && !clientesArea.some((cliente) => cliente.id === proyectoCliente.cliente_id)) {
      return [...clientesArea, { id: proyectoCliente.cliente_id, nombre: proyectoCliente.cliente_nombre || 'Cliente del proyecto', area_id: usuario?.area_id ?? 0 }]
    }
    return clientesArea
  }, [clientes, proyectoCliente, usuario?.area_id])

  useEffect(() => {
    setClienteId(proyectoCliente?.cliente_id ?? '')
  }, [proyectoCliente])

  const puedeEnviar = tipoActividadId !== '' && !cargando

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeEnviar || !usuario) return
    setCargando(true)
    const resultado = await iniciarActividad({
      usuario_id: usuario.id,
      tipo_actividad_id: tipoActividadId as number,
      cliente_id: clienteId ? Number(clienteId) : null,
      proyecto_id: proyectoId ? Number(proyectoId) : null,
      descripcion: descripcion.trim(),
    })
    setCargando(false)
    if (resultado.ok) {
      setTipoActividadId('')
      setClienteId('')
      setProyectoId('')
      setDescripcion('')
    }
  }

  return (
    <form onSubmit={manejarEnvio} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Tipo de actividad
          </label>
          <div className="relative">
            <select
              value={tipoActividadId}
              onChange={(e) => setTipoActividadId(e.target.value ? Number(e.target.value) : '')}
              required
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
            >
              <option value="">Selecciona un tipo...</option>
              {tiposDisponibles.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
            <ChevronDown
              size={17}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Cliente</label>
          <div className="relative">
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
            >
              <option value="">Sin cliente (opcional)</option>
              {clientesVisibles.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
            </select>
            <ChevronDown
              size={17}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Proyecto</label>
          <div className="relative">
            <select
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value ? Number(e.target.value) : '')}
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 hover:border-[#7c3aed]/50"
            >
              <option value="">Sin proyecto (opcional)</option>
              {proyectos.map((proyecto) => (
                <option key={proyecto.id} value={proyecto.id}>
                  {proyecto.nombre}
                </option>
              ))}
            </select>
            <ChevronDown
              size={17}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Cargo</label>
          <input
            type="text"
            value={usuario?.cargo || '—'}
            disabled
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Describe los detalles de la actividad..."
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          La fecha y hora se registran automáticamente. Solo puede existir una actividad activa.
        </p>
        <button
          type="submit"
          disabled={!puedeEnviar}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#7c3aed]/15 transition-all hover:bg-[#6d28d9] hover:shadow-lg hover:shadow-[#7c3aed]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[172px]"
        >
          {cargando ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Play size={16} />
          )}
          {cargando ? 'Iniciando...' : 'Iniciar actividad'}
        </button>
      </div>
    </form>
  )
}
