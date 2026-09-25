'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Edit3,
  Layers3,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { esAdministrador, esJefeDeArea } from '@/lib/permisos'
import type { ProyectoDetalle, RolProyecto } from '@/lib/proyectos'
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

const inputClase = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#7c3aed]'

function headers() {
  const token = localStorage.getItem('pc_token')
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function iniciales(nombre: string) {
  return nombre.trim().split(/\s+/).map((parte) => parte[0]).slice(0, 2).join('').toUpperCase()
}

function fecha(valor: string | null) {
  if (!valor) return 'Sin fecha'
  const date = new Date(`${valor.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? valor : date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function duracion(segundos: number | null) {
  const total = Math.max(0, Number(segundos || 0))
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  return horas === 0 ? `${minutos} min` : `${horas} h ${minutos.toString().padStart(2, '0')} min`
}

function claseEstado(estado: string) {
  if (estado === 'EN_CURSO') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
  if (estado === 'PAUSADO') return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
  if (estado === 'COMPLETADO') return 'border-sky-400/25 bg-sky-400/10 text-sky-300'
  if (estado === 'CANCELADO') return 'border-rose-400/25 bg-rose-500/10 text-rose-300'
  return 'border-violet-400/25 bg-violet-400/10 text-violet-300'
}

function etiquetaRol(rol: string) {
  return rol === 'LIDER' ? 'Líder' : rol === 'COORDINADOR' ? 'Coordinador' : rol === 'ESPECIALISTA' ? 'Especialista' : 'Colaborador'
}

export function ProyectoDetalleView({ id }: { id: number }) {
  const { usuario } = useAuth()
  const esAdmin = esAdministrador(usuario)
  const [proyecto, setProyecto] = useState<ProyectoDetalle | null>(null)
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [clientes, setClientes] = useState<ClienteCandidato[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [eliminando, setEliminando] = useState<number | null>(null)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [nuevoUsuario, setNuevoUsuario] = useState('')
  const [nuevoRol, setNuevoRol] = useState<RolProyecto>('ESPECIALISTA')
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [jefeId, setJefeId] = useState('')
  const [estado, setEstado] = useState('PLANIFICACION')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const puedeEditar = Boolean(proyecto && (esAdmin || (esJefeDeArea(usuario) && proyecto.jefe_id === usuario?.id)))

  const sincronizar = useCallback((actual: ProyectoDetalle) => {
    setNombre(actual.nombre)
    setDescripcion(actual.descripcion || '')
    setClienteId(actual.cliente_id ? String(actual.cliente_id) : '')
    setJefeId(String(actual.jefe_id))
    setEstado(actual.estado)
    setFechaInicio(actual.fecha_inicio || '')
    setFechaFin(actual.fecha_fin || '')
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const token = localStorage.getItem('pc_token')
      const cabeceras = token ? { Authorization: `Bearer ${token}` } : undefined
      const res = await fetch(`/api/proyectos/${id}`, { headers: cabeceras })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setProyecto(null); setError(data.error || 'No se pudo cargar el proyecto.'); return }
      setProyecto(data as ProyectoDetalle)
      sincronizar(data as ProyectoDetalle)
      if (esAdmin || esJefeDeArea(usuario)) {
        const resCandidatos = await fetch('/api/proyectos/candidatos', { headers: cabeceras })
        const dataCandidatos = await resCandidatos.json().catch(() => ({}))
        if (resCandidatos.ok) { setCandidatos(Array.isArray(dataCandidatos.usuarios) ? dataCandidatos.usuarios : []); setClientes(Array.isArray(dataCandidatos.clientes) ? dataCandidatos.clientes : []) }
      }
    } catch { setError('No se pudo conectar con el servidor.') } finally { setCargando(false) }
  }, [id, sincronizar, usuario])

  useEffect(() => { void cargar() }, [cargar])

  const participantesIds = useMemo(() => new Set(proyecto?.participantes.map((participante) => participante.usuario_id) || []), [proyecto])
  const candidatosDisponibles = useMemo(() => candidatos.filter((candidato) => !participantesIds.has(candidato.id) && candidato.id !== Number(jefeId)), [candidatos, participantesIds, jefeId])
  const jefesDisponibles = useMemo(() => candidatos.filter((candidato) => candidato.rol === 'JEFE_AREA'), [candidatos])
  const totalHoras = useMemo(() => proyecto?.actividades.reduce((total, actividad) => total + Number(actividad.duracion_segundos || 0), 0) || 0, [proyecto])

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (!proyecto || !puedeEditar) return
    setGuardando(true); setError(''); setExito('')
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ nombre: nombre.trim(), descripcion: descripcion.trim(), cliente_id: clienteId || null, jefe_id: esAdmin ? Number(jefeId) : undefined, estado, fecha_inicio: fechaInicio || null, fecha_fin: fechaFin || null }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudieron guardar los cambios.'); return }
      setExito('Cambios guardados.'); setEditando(false); await cargar()
    } catch { setError('No se pudo conectar con el servidor.') } finally { setGuardando(false) }
  }

  const agregarParticipante = async (evento: FormEvent) => {
    evento.preventDefault()
    if (!proyecto || !nuevoUsuario) return
    setAgregando(true); setError(''); setExito('')
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}/participantes`, { method: 'POST', headers: headers(), body: JSON.stringify({ usuario_id: Number(nuevoUsuario), rol_proyecto: nuevoRol }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo agregar el participante.'); return }
      setNuevoUsuario(''); setExito('Participante agregado.'); await cargar()
    } catch { setError('No se pudo conectar con el servidor.') } finally { setAgregando(false) }
  }

  const quitarParticipante = async (participanteId: number, nombreParticipante: string) => {
    if (!proyecto || !window.confirm(`¿Quitar a ${nombreParticipante} del proyecto?`)) return
    setEliminando(participanteId); setError(''); setExito('')
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}/participantes`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ usuario_id: participanteId }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo quitar al participante.'); return }
      setExito('Participante eliminado.'); await cargar()
    } catch { setError('No se pudo conectar con el servidor.') } finally { setEliminando(null) }
  }

  if (cargando) return <div className="space-y-4"><div className="h-6 w-32 animate-pulse rounded bg-muted" /><div className="h-40 animate-pulse rounded-xl border border-border bg-card" /><div className="h-64 animate-pulse rounded-xl border border-border bg-card" /></div>
  if (!proyecto) return <div className="space-y-4"><Link href="/proyectos" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Volver</Link><div className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error || 'Proyecto no encontrado.'}</div></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/proyectos" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Proyectos</Link><div className="flex items-center gap-2">{puedeEditar && <button type="button" onClick={() => setEditando((valor) => !valor)} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium', editando ? 'border-[#7c3aed]/30 bg-[#7c3aed]/10 text-[#c4b5fd]' : 'border-border bg-card text-foreground hover:bg-muted')}><Edit3 size={15} /> {editando ? 'Cancelar edición' : 'Editar'}</button>}{usuario?.rol !== 'admin' && ['PLANIFICACION', 'EN_CURSO', 'PAUSADO'].includes(proyecto.estado) && <Link href={`/actividades?proyecto=${proyecto.id}`} className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9]"><Clock3 size={15} /> Registrar actividad</Link>}</div></div>
      {error && <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">{error}</div>}
      {exito && <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300">{exito}</div>}

      <section className="rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/10 text-[#c4b5fd]"><BriefcaseBusiness size={18} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold text-foreground">{proyecto.nombre}</h1><span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', claseEstado(proyecto.estado))}>{estado}</span></div><p className="mt-1 text-xs text-muted-foreground">ID #{proyecto.id} · Líder: {proyecto.jefe_nombre}</p></div></div><div className="text-left sm:text-right"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cliente</p><p className="mt-1 text-sm text-foreground">{proyecto.cliente_nombre || 'Sin cliente'}</p></div></div><div className="mt-5 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-3"><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Inicio</p><p className="mt-1 flex items-center gap-1.5 text-xs text-foreground"><CalendarDays size={13} /> {fecha(proyecto.fecha_inicio)}</p></div><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Entrega</p><p className="mt-1 flex items-center gap-1.5 text-xs text-foreground"><CalendarDays size={13} /> {fecha(proyecto.fecha_fin)}</p></div><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Áreas</p><p className="mt-1 flex items-center gap-1.5 text-xs text-foreground"><Layers3 size={13} /> {proyecto.areas_detalle.map((area) => area.nombre).join(', ') || 'Sin áreas'}</p></div></div></section>

      {editando && puedeEditar && <section className="rounded-xl border border-border bg-card p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-foreground">Editar datos</h2><button type="button" onClick={() => setEditando(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button></div><form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-foreground">Nombre</span><input required value={nombre} onChange={(evento) => setNombre(evento.target.value)} className={inputClase} /></label><label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Estado</span><div className="relative"><select value={estado} onChange={(evento) => setEstado(evento.target.value)} className={`${inputClase} appearance-none pr-8`}>{estados.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /></div></label><label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Jefe</span>{esAdmin ? <select value={jefeId} onChange={(evento) => setJefeId(evento.target.value)} className={inputClase}><option value="">Selecciona...</option>{jefesDisponibles.map((candidato) => <option key={candidato.id} value={candidato.id}>{candidato.nombre}</option>)}</select> : <input disabled value={proyecto.jefe_nombre} className={`${inputClase} opacity-60`} />}</label><label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Cliente</span><select value={clienteId} onChange={(evento) => setClienteId(evento.target.value)} className={inputClase}><option value="">Sin cliente</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Inicio</span><input type="date" value={fechaInicio} onChange={(evento) => setFechaInicio(evento.target.value)} className={inputClase} /></label><label className="block"><span className="mb-1.5 block text-xs font-medium text-foreground">Entrega</span><input type="date" value={fechaFin} onChange={(evento) => setFechaFin(evento.target.value)} className={inputClase} /></label><label className="block sm:col-span-2 lg:col-span-3"><span className="mb-1.5 block text-xs font-medium text-foreground">Descripción</span><textarea rows={3} value={descripcion} onChange={(evento) => setDescripcion(evento.target.value)} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#7c3aed]" /></label><div className="flex justify-end sm:col-span-2 lg:col-span-3"><button type="submit" disabled={guardando} className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50">{guardando ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{guardando ? 'Guardando...' : 'Guardar cambios'}</button></div></form></section>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center gap-2"><BriefcaseBusiness size={16} className="text-[#c4b5fd]" /><h2 className="text-sm font-semibold text-foreground">Descripción</h2></div><p className="mt-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">{proyecto.descripcion || 'Sin descripción registrada.'}</p><div className="mt-5 border-t border-border/70 pt-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resumen</p><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">Personas</p><p className="mt-1 font-medium text-foreground">{proyecto.participantes.length}</p></div><div><p className="text-muted-foreground">Tiempo registrado</p><p className="mt-1 font-medium text-foreground">{duracion(totalHoras)}</p></div></div></div></section>
        <section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><UsersRound size={16} className="text-[#c4b5fd]" /><h2 className="text-sm font-semibold text-foreground">Equipo</h2></div><span className="text-xs text-muted-foreground">{proyecto.participantes.length} personas</span></div><div className="mt-4 space-y-2">{proyecto.participantes.map((participante) => <div key={participante.usuario_id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5"><div className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{iniciales(participante.nombre)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-foreground">{participante.nombre}</p><p className="truncate text-[11px] text-muted-foreground">{participante.area_nombre}{participante.cargo ? ` · ${participante.cargo}` : ''}</p></div><span className="text-[10px] text-muted-foreground">{etiquetaRol(participante.rol_proyecto)}</span>{puedeEditar && participante.rol_proyecto !== 'LIDER' && <button type="button" disabled={eliminando === participante.usuario_id} onClick={() => quitarParticipante(participante.usuario_id, participante.nombre)} className="text-muted-foreground hover:text-rose-300 disabled:opacity-50" aria-label={`Quitar a ${participante.nombre}`}><Trash2 size={14} /></button>}</div>)}</div>{puedeEditar && <form onSubmit={agregarParticipante} className="mt-4 flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row"><select required value={nuevoUsuario} onChange={(evento) => setNuevoUsuario(evento.target.value)} className={`${inputClase} min-w-0 flex-1`}><option value="">Agregar persona...</option>{candidatosDisponibles.map((candidato) => <option key={candidato.id} value={candidato.id}>{candidato.nombre} · {candidato.area_nombre}</option>)}</select><select value={nuevoRol} onChange={(evento) => setNuevoRol(evento.target.value as RolProyecto)} className={`${inputClase} sm:w-36`}>{roles.map((rol) => <option key={rol.value} value={rol.value}>{rol.label}</option>)}</select><button type="submit" disabled={!nuevoUsuario || agregando} className="flex items-center justify-center gap-1.5 rounded-lg border border-[#7c3aed]/30 px-3 py-2 text-xs font-semibold text-[#c4b5fd] hover:bg-[#7c3aed]/10 disabled:opacity-50">{agregando ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} Agregar</button></form>}</section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock3 size={16} className="text-[#c4b5fd]" /><h2 className="text-sm font-semibold text-foreground">Actividades</h2></div><span className="text-xs text-muted-foreground">{proyecto.actividades.length} registros · {duracion(totalHoras)}</span></div>{proyecto.actividades.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">No hay actividades vinculadas.</p> : <div className="mt-4 divide-y divide-border/60">{proyecto.actividades.map((actividad) => <div key={actividad.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex min-w-0 items-center gap-3"><div className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{iniciales(actividad.usuario_nombre)}</div><div className="min-w-0"><p className="truncate text-xs font-medium text-foreground">{actividad.usuario_nombre}</p><p className="truncate text-[11px] text-muted-foreground">{actividad.descripcion || 'Sin descripción'} · {fecha(actividad.inicio)}</p></div></div><div className="flex items-center gap-3 text-xs text-muted-foreground"><span>{actividad.estado.replaceAll('_', ' ').toLocaleLowerCase('es')}</span><span className="font-medium text-foreground">{duracion(actividad.duracion_segundos)}</span></div></div>)}</div>}</section>
    </div>
  )
}
