'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  FolderKanban,
  LoaderCircle,
  Plus,
  Search,
  UsersRound,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { esAdministrador, esJefeDeArea } from '@/lib/permisos'
import type { Proyecto, RolProyecto } from '@/lib/proyectos'
import { cn } from '@/lib/utils'

interface Candidato {
  id: number
  nombre: string
  usuario: string
  rol: string
  area_id: number
  area_nombre: string
  cargo: string | null
  especialidad: string | null
}

interface ClienteCandidato {
  id: number
  nombre: string
}

interface FormularioProyecto {
  nombre: string
  descripcion: string
  cliente_id: string
  jefe_id: string
  estado: string
  fecha_inicio: string
  fecha_fin: string
  participantes: Record<number, RolProyecto>
}

type FiltroEstado = 'TODOS' | Proyecto['estado']

const estados = [
  { value: 'PLANIFICACION', label: 'Planificación' },
  { value: 'EN_CURSO', label: 'En curso' },
  { value: 'PAUSADO', label: 'Pausado' },
  { value: 'COMPLETADO', label: 'Completado' },
  { value: 'CANCELADO', label: 'Cancelado' },
] as const

const roles: Array<{ value: RolProyecto; label: string }> = [
  { value: 'COORDINADOR', label: 'Coordinador' },
  { value: 'ESPECIALISTA', label: 'Especialista' },
  { value: 'COLABORADOR', label: 'Colaborador' },
]

const estadoLabels: Record<string, string> = Object.fromEntries(estados.map((estado) => [estado.value, estado.label]))
const inputClase = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#7c3aed]'

function headers() {
  const token = localStorage.getItem('pc_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function iniciales(nombre: string) {
  return nombre.trim().split(/\s+/).map((parte) => parte[0]).slice(0, 2).join('').toUpperCase()
}

function fecha(valor: string | null) {
  if (!valor) return 'Sin fecha'
  const date = new Date(`${valor.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? valor : date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function claseEstado(estado: string) {
  if (estado === 'EN_CURSO') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
  if (estado === 'PAUSADO') return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
  if (estado === 'COMPLETADO') return 'border-sky-400/25 bg-sky-400/10 text-sky-300'
  if (estado === 'CANCELADO') return 'border-rose-400/25 bg-rose-500/10 text-rose-300'
  return 'border-violet-400/25 bg-violet-400/10 text-violet-300'
}

function areasProyecto(proyecto: Proyecto) {
  return proyecto.areas ? proyecto.areas.split(', ').filter(Boolean) : []
}

function ProyectoRow({ proyecto }: { proyecto: Proyecto }) {
  const areas = areasProyecto(proyecto)
  const participantes = Math.max(0, Number(proyecto.participantes_count || 0))
  return (
    <Link href={`/proyectos/${proyecto.id}`} className="group grid gap-3 border-b border-border/70 px-4 py-4 transition-colors last:border-0 hover:bg-muted/30 lg:grid-cols-[minmax(0,1.5fr)_140px_140px_110px_24px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/10 text-[#c4b5fd]"><BriefcaseBusiness size={17} /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold text-foreground">{proyecto.nombre}</h2><span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', claseEstado(proyecto.estado))}>{estadoLabels[proyecto.estado] || proyecto.estado}</span></div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{proyecto.descripcion || 'Sin descripción'}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Building2 size={11} /> {proyecto.cliente_nombre || 'Sin cliente'}</span>{areas.slice(0, 2).map((area) => <span key={area} className="rounded bg-muted px-1.5 py-0.5">{area}</span>)}{areas.length > 2 && <span>+{areas.length - 2}</span>}</div>
        </div>
      </div>
      <div className="hidden min-w-0 lg:block"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Líder</p><p className="mt-1 truncate text-xs text-foreground">{proyecto.jefe_nombre}</p></div>
      <div className="hidden min-w-0 lg:block"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Equipo</p><p className="mt-1 text-xs text-foreground">{participantes} {participantes === 1 ? 'persona' : 'personas'}</p></div>
      <div className="hidden lg:block"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Entrega</p><p className="mt-1 flex items-center gap-1 text-xs text-foreground"><CalendarDays size={12} /> {fecha(proyecto.fecha_fin)}</p></div>
      <ArrowRight size={15} className="hidden text-muted-foreground transition-colors group-hover:text-[#c4b5fd] lg:block" />
      <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs text-muted-foreground lg:hidden"><span>{participantes} participantes</span><span>{fecha(proyecto.fecha_fin)}</span></div>
    </Link>
  )
}

function ModalProyecto({
  formulario,
  setFormulario,
  candidatos,
  clientes,
  busqueda,
  setBusqueda,
  candidatosFiltrados,
  guardando,
  error,
  esAdmin,
  onClose,
  onSubmit,
  onCambiarParticipante,
  onCambiarRol,
}: {
  formulario: FormularioProyecto
  setFormulario: React.Dispatch<React.SetStateAction<FormularioProyecto>>
  candidatos: Candidato[]
  clientes: ClienteCandidato[]
  busqueda: string
  setBusqueda: (valor: string) => void
  candidatosFiltrados: Candidato[]
  guardando: boolean
  error: string
  esAdmin: boolean
  onClose: () => void
  onSubmit: (evento: FormEvent) => void
  onCambiarParticipante: (id: number, seleccionado: boolean) => void
  onCambiarRol: (id: number, rol: RolProyecto) => void
}) {
  const actualizar = (campo: keyof Omit<FormularioProyecto, 'participantes'>, valor: string) => setFormulario((actual) => ({ ...actual, [campo]: valor }))
  const seleccionarJefe = (valor: string) => setFormulario((actual) => {
    const participantes = { ...actual.participantes }
    for (const [id, rol] of Object.entries(participantes)) if (rol === 'LIDER' && Number(id) !== Number(valor)) participantes[Number(id)] = 'COLABORADOR'
    if (valor) participantes[Number(valor)] = 'LIDER'
    return { ...actual, jefe_id: valor, participantes }
  })
  const jefes = candidatos.filter((candidato) => candidato.rol === 'JEFE_AREA')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) onClose() }}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl border border-border bg-card sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-base font-semibold text-foreground">Nuevo proyecto</h2><p className="mt-0.5 text-xs text-muted-foreground">Completa los datos básicos y selecciona el equipo.</p></div><button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar"><X size={17} /></button></div>
        <form onSubmit={onSubmit} className="overflow-y-auto">
          {error && <div className="mx-5 mt-4 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>}
          <div className="space-y-5 p-5">
            <section><h3 className="mb-3 text-sm font-semibold text-foreground">Datos del proyecto</h3><div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-foreground">Nombre *</span><input autoFocus required value={formulario.nombre} onChange={(evento) => actualizar('nombre', evento.target.value)} placeholder="Nombre del proyecto" className={inputClase} /></label>
              <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-foreground">Descripción</span><textarea rows={3} value={formulario.descripcion} onChange={(evento) => actualizar('descripcion', evento.target.value)} placeholder="Objetivo o alcance" className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#7c3aed]" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Estado</span><select value={formulario.estado} onChange={(evento) => actualizar('estado', evento.target.value)} className={inputClase}>{estados.map((estado) => <option key={estado.value} value={estado.value}>{estado.label}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Cliente</span><select value={formulario.cliente_id} onChange={(evento) => actualizar('cliente_id', evento.target.value)} className={inputClase}><option value="">Sin cliente</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Jefe del proyecto *</span>{esAdmin ? <select required value={formulario.jefe_id} onChange={(evento) => seleccionarJefe(evento.target.value)} className={inputClase}><option value="">Selecciona un jefe...</option>{jefes.map((candidato) => <option key={candidato.id} value={candidato.id}>{candidato.nombre} · {candidato.area_nombre}</option>)}</select> : <input disabled value="Tú" className={`${inputClase} opacity-60`} />}</label>
              <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Inicio</span><input type="date" value={formulario.fecha_inicio} onChange={(evento) => actualizar('fecha_inicio', evento.target.value)} className={inputClase} /></label><label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Entrega</span><input type="date" value={formulario.fecha_fin} onChange={(evento) => actualizar('fecha_fin', evento.target.value)} className={inputClase} /></label></div>
            </div></section>
            <section className="border-t border-border pt-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-foreground">Equipo</h3><p className="mt-0.5 text-xs text-muted-foreground">Selecciona personas de cualquier división.</p></div><span className="text-xs text-muted-foreground">{Object.keys(formulario.participantes).length} seleccionados</span></div><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar por nombre o área" className={`${inputClase} pl-9`} /></div><div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">{candidatosFiltrados.map((candidato) => { const rol = formulario.participantes[candidato.id]; const esLider = rol === 'LIDER'; return <div key={candidato.id} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2', rol ? 'border-[#7c3aed]/30 bg-[#7c3aed]/5' : 'border-transparent hover:bg-muted/40')}><input type="checkbox" checked={Boolean(rol)} disabled={esLider} onChange={(evento) => onCambiarParticipante(candidato.id, evento.target.checked)} className="h-4 w-4 accent-[#7c3aed]" /><div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground">{iniciales(candidato.nombre)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-foreground">{candidato.nombre}</p><p className="truncate text-[11px] text-muted-foreground">{candidato.area_nombre}</p></div>{esLider ? <span className="text-[10px] font-medium text-[#c4b5fd]">Líder</span> : rol ? <select value={rol} onChange={(evento) => onCambiarRol(candidato.id, evento.target.value as RolProyecto)} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground">{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : null}</div>})}{candidatosFiltrados.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">No se encontraron participantes.</p>}</div></section>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3"><button type="button" onClick={onClose} className="rounded-lg border border-border px-3.5 py-2 text-sm text-foreground hover:bg-muted">Cancelar</button><button type="submit" disabled={guardando} className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50">{guardando && <LoaderCircle size={15} className="animate-spin" />}{guardando ? 'Guardando...' : 'Crear proyecto'}</button></div>
        </form>
      </div>
    </div>
  )
}

export function ProyectosLista() {
  const { usuario } = useAuth()
  const esAdmin = esAdministrador(usuario)
  const puedeGestionar = esAdmin || esJefeDeArea(usuario)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [clientes, setClientes] = useState<ClienteCandidato[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaPersonas, setBusquedaPersonas] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS')
  const [formulario, setFormulario] = useState<FormularioProyecto>({ nombre: '', descripcion: '', cliente_id: '', jefe_id: usuario && esJefeDeArea(usuario) ? String(usuario.id) : '', estado: 'PLANIFICACION', fecha_inicio: '', fecha_fin: '', participantes: {} })

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const token = localStorage.getItem('pc_token')
      const cabeceras = token ? { Authorization: `Bearer ${token}` } : undefined
      const res = await fetch('/api/proyectos', { headers: cabeceras })
      const data = await res.json().catch(() => [])
      if (!res.ok) { setProyectos([]); setError(data.error || 'No se pudieron cargar los proyectos.'); return }
      setProyectos(Array.isArray(data) ? data as Proyecto[] : [])
      if (puedeGestionar) {
        const resCandidatos = await fetch('/api/proyectos/candidatos', { headers: cabeceras })
        const dataCandidatos = await resCandidatos.json().catch(() => ({}))
        if (resCandidatos.ok) { setCandidatos(Array.isArray(dataCandidatos.usuarios) ? dataCandidatos.usuarios : []); setClientes(Array.isArray(dataCandidatos.clientes) ? dataCandidatos.clientes : []) } else setError(dataCandidatos.error || 'No se pudieron cargar los participantes.')
      }
    } catch { setError('No se pudo conectar con el servidor.') } finally { setCargando(false) }
  }, [puedeGestionar])

  useEffect(() => { void cargarDatos() }, [cargarDatos])

  const abrirFormulario = () => {
    const jefeId = usuario && esJefeDeArea(usuario) ? usuario.id : null
    setFormulario({ nombre: '', descripcion: '', cliente_id: '', jefe_id: jefeId ? String(jefeId) : '', estado: 'PLANIFICACION', fecha_inicio: '', fecha_fin: '', participantes: jefeId ? { [jefeId]: 'LIDER' } : {} })
    setFormularioAbierto(true); setError(''); setExito('')
  }

  const cambiarParticipante = (id: number, seleccionado: boolean) => setFormulario((actual) => { const participantes = { ...actual.participantes }; if (seleccionado) { if (participantes[id] !== 'LIDER') participantes[id] = 'ESPECIALISTA' } else if (participantes[id] !== 'LIDER') delete participantes[id]; return { ...actual, participantes } })
  const cambiarRol = (id: number, rol: RolProyecto) => setFormulario((actual) => ({ ...actual, participantes: { ...actual.participantes, [id]: rol } }))
  const candidatosFiltrados = useMemo(() => { const texto = busquedaPersonas.trim().toLocaleLowerCase('es'); return texto ? candidatos.filter((candidato) => `${candidato.nombre} ${candidato.usuario} ${candidato.area_nombre}`.toLocaleLowerCase('es').includes(texto)) : candidatos }, [candidatos, busquedaPersonas])

  const crearProyecto = async (evento: FormEvent) => {
    evento.preventDefault()
    if (!formulario.nombre.trim()) { setError('Escribe un nombre para el proyecto.'); return }
    if (esAdmin && !formulario.jefe_id) { setError('Selecciona el jefe del proyecto.'); return }
    setGuardando(true); setError(''); setExito('')
    try {
      const participantes = Object.entries(formulario.participantes).map(([id, rol]) => ({ usuario_id: Number(id), rol_proyecto: rol }))
      const res = await fetch('/api/proyectos', { method: 'POST', headers: headers(), body: JSON.stringify({ nombre: formulario.nombre.trim(), descripcion: formulario.descripcion.trim(), cliente_id: formulario.cliente_id || null, jefe_id: formulario.jefe_id || null, estado: formulario.estado, fecha_inicio: formulario.fecha_inicio || null, fecha_fin: formulario.fecha_fin || null, participantes }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo crear el proyecto.'); return }
      setFormularioAbierto(false); setExito('Proyecto creado correctamente.'); await cargarDatos()
    } catch { setError('No se pudo conectar con el servidor.') } finally { setGuardando(false) }
  }

  const proyectosFiltrados = useMemo(() => { const termino = busqueda.trim().toLocaleLowerCase('es'); return proyectos.filter((proyecto) => { if (filtroEstado !== 'TODOS' && proyecto.estado !== filtroEstado) return false; return !termino || `${proyecto.nombre} ${proyecto.cliente_nombre || ''} ${proyecto.jefe_nombre} ${proyecto.areas}`.toLocaleLowerCase('es').includes(termino) }) }, [proyectos, busqueda, filtroEstado])

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-lg font-semibold text-foreground">Proyectos</h1><p className="mt-0.5 text-xs text-muted-foreground">{proyectos.length} {proyectos.length === 1 ? 'proyecto' : 'proyectos'}</p></div>{puedeGestionar && !formularioAbierto && <button type="button" onClick={abrirFormulario} className="flex w-fit items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9]"><Plus size={16} /> Nuevo proyecto</button>}</section>
      {error && <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">{error}</div>}
      {exito && <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300">{exito}</div>}
      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:flex-row sm:items-center"><div className="relative min-w-0 flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar proyectos..." className="h-9 w-full rounded-lg border border-transparent bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#7c3aed]" /></div><select value={filtroEstado} onChange={(evento) => setFiltroEstado(evento.target.value as FiltroEstado)} className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-[#7c3aed]"><option value="TODOS">Todos los estados</option>{estados.map((estado) => <option key={estado.value} value={estado.value}>{estado.label}</option>)}</select><span className="px-1 text-xs text-muted-foreground">{proyectosFiltrados.length} resultados</span></section>
      {cargando ? <div className="overflow-hidden rounded-xl border border-border bg-card">{[1, 2, 3, 4].map((item) => <div key={item} className="h-20 animate-pulse border-b border-border/60 last:border-0" />)}</div> : proyectosFiltrados.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-14 text-center"><FolderKanban size={28} className="mx-auto mb-3 text-muted-foreground" /><p className="text-sm text-muted-foreground">{proyectos.length === 0 ? 'Todavía no hay proyectos.' : 'No hay proyectos que coincidan con el filtro.'}</p>{proyectos.length === 0 && puedeGestionar && <button type="button" onClick={abrirFormulario} className="mt-4 text-sm font-medium text-[#c4b5fd] hover:underline">Crear el primero</button>}</div> : <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="hidden border-b border-border bg-muted/20 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.5fr)_140px_140px_110px_24px]"><span>Proyecto</span><span>Líder</span><span>Equipo</span><span>Entrega</span><span /></div>{proyectosFiltrados.map((proyecto) => <ProyectoRow key={proyecto.id} proyecto={proyecto} />)}</section>}
      {formularioAbierto && <ModalProyecto formulario={formulario} setFormulario={setFormulario} candidatos={candidatos} clientes={clientes} busqueda={busquedaPersonas} setBusqueda={setBusquedaPersonas} candidatosFiltrados={candidatosFiltrados} guardando={guardando} error={error} esAdmin={esAdmin} onClose={() => setFormularioAbierto(false)} onSubmit={crearProyecto} onCambiarParticipante={cambiarParticipante} onCambiarRol={cambiarRol} />}
    </div>
  )
}
