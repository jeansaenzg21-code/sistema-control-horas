'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, ChevronUp, Plus, Search, Settings, Trash2, Upload, UserRound, Users } from 'lucide-react'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import { SettingsUsers } from './settings-users'
import { SettingsImportarPersonal } from './settings-importar-personal'

function etiquetaRol(rol: string): string {
  if (rol === 'admin') return 'Administrador'
  if (rol === 'jefe_area') return 'Jefe de área'
  if (rol === 'supervisor') return 'Supervisor'
  return 'Colaborador'
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase() || '?'
}

function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

export function SettingsAreas() {
  const { areas, cargando, error: errorAreas, crearArea, actualizarArea, eliminarArea } = useAreas()
  const { usuarios, cargarUsuarios } = useAuth()
  const [areaSeleccionada, setAreaSeleccionada] = useState<number | null>(null)
  const [creando, setCreando] = useState(false)
  const [guardandoArea, setGuardandoArea] = useState(false)
  const [errorArea, setErrorArea] = useState('')
  const [guardandoJefe, setGuardandoJefe] = useState(false)
  const [errorJefe, setErrorJefe] = useState('')
  const [exitoJefe, setExitoJefe] = useState('')
  const [busquedaJefe, setBusquedaJefe] = useState('')
  const [jefeSeleccionado, setJefeSeleccionado] = useState<number | null>(null)
  const [jefeGuardado, setJefeGuardado] = useState<number | null>(null)
  const [jefeAbierto, setJefeAbierto] = useState(false)
  const [importando, setImportando] = useState(false)
  const [busquedaGeneral, setBusquedaGeneral] = useState('')

  const area = areaSeleccionada != null ? areas.find((a) => a.id === areaSeleccionada) : null
  const usuariosArea = useMemo(() => {
    return usuarios
      .filter((u) => (
        u.area_id === areaSeleccionada
        && u.activo
        && u.rol !== 'admin'
        && u.rol !== 'socio'
      ))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [areaSeleccionada, usuarios])
  const resultadosBusqueda = useMemo(() => {
    const consulta = normalizarBusqueda(busquedaGeneral.trim())
    if (!consulta) return []
    const terminos = consulta.split(/\s+/).filter(Boolean)
    return usuarios
      .filter((u) => u.rol === 'personal')
      .filter((u) => {
        const areaUsuario = areas.find((a) => a.id === u.area_id)
        const texto = normalizarBusqueda(
          [
            u.nombre,
            u.usuario,
            u.correo ?? '',
            u.cargo ?? '',
            areaUsuario?.nombre ?? '',
            u.area_nombre ?? '',
          ].join(' ')
        )
        return terminos.every((termino) => texto.includes(termino))
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [areas, busquedaGeneral, usuarios])
  const candidatosJefe = useMemo(() => {
    const consulta = normalizarBusqueda(busquedaJefe.trim())
    if (!consulta) return usuariosArea
    const terminos = consulta.split(/\s+/).filter(Boolean)
    return usuariosArea.filter((u) => {
      const texto = normalizarBusqueda(
        [u.nombre, u.usuario, u.correo ?? '', u.cargo ?? '', etiquetaRol(u.rol)].join(' ')
      )
      return terminos.every((termino) => texto.includes(termino))
    })
  }, [busquedaJefe, usuariosArea])
  const jefeSeleccionadoActual = usuariosArea.find((u) => u.id === jefeSeleccionado) ?? null
  const hayCambioJefe = jefeSeleccionado !== jefeGuardado

  useEffect(() => {
    const jefeActual = area?.jefe_id == null ? null : Number(area.jefe_id)
    setJefeSeleccionado(jefeActual)
    setJefeGuardado(jefeActual)
    setJefeAbierto(false)
    setBusquedaJefe('')
    setErrorJefe('')
    setExitoJefe('')
  }, [area?.id, area?.jefe_id])

  const guardarJefe = async () => {
    if (!area || !hayCambioJefe) return
    setGuardandoJefe(true)
    setErrorJefe('')
    setExitoJefe('')
    const resultado = await actualizarArea(area.id, { jefe_id: jefeSeleccionado })
    if (resultado.ok) {
      setJefeGuardado(jefeSeleccionado)
      // El jefe anterior deja de serlo: hay que recargar los usuarios para que
      // vuelva a aparecer como colaborador de la división.
      await cargarUsuarios()
      setExitoJefe(jefeSeleccionado ? 'Jefe de área actualizado.' : 'Jefe de área quitado.')
    } else {
      setErrorJefe(resultado.error || 'No se pudo actualizar el jefe de área.')
    }
    setGuardandoJefe(false)
  }

  const descartarCambioJefe = () => {
    setJefeSeleccionado(jefeGuardado)
    setBusquedaJefe('')
    setErrorJefe('')
    setExitoJefe('')
  }

  const manejarEliminar = async (id: number, nombre: string) => {
    const confirmado = window.confirm(
      `¿Eliminar la división "${nombre}" y todos sus registros?\n\nSe eliminarán sus usuarios, actividades, clientes, proyectos y presupuestos. Esta acción no se puede deshacer.`
    )
    if (!confirmado) return
    const resultado = await eliminarArea(id)
    if (!resultado.ok) {
      window.alert(resultado.error || 'No se pudo eliminar la división.')
      return
    }
    if (areaSeleccionada === id) setAreaSeleccionada(null)
    await cargarUsuarios()
  }

  if (area) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAreaSeleccionada(null)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={15} />
            Volver
          </button>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{area.nombre}</h2>
            <p className="text-sm text-muted-foreground">{area.descripcion || 'Sin descripción'}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Configuración de la división</h3>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre de la división</label>
              <input
                type="text"
                value={area.nombre}
                onChange={(e) => actualizarArea(area.id, { nombre: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
              <input
                type="text"
                value={area.descripcion ?? ''}
                onChange={(e) => actualizarArea(area.id, { descripcion: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <UserRound size={16} className="text-[#c4b5fd]" />
                  <label htmlFor={`buscar-jefe-${area.id}`} className="text-sm font-medium text-foreground">Jefe de área</label>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {area.jefe_nombre ? `Actualmente: ${area.jefe_nombre}` : 'Aún no hay un jefe asignado.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJefeAbierto((abierto) => !abierto)}
                aria-expanded={jefeAbierto}
                aria-controls={`selector-jefe-${area.id}`}
                className="flex flex-none items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {jefeAbierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {jefeAbierto ? 'Cerrar' : area.jefe_nombre ? 'Cambiar jefe' : 'Seleccionar jefe'}
              </button>
            </div>

            {jefeAbierto && (
              <>
            <div id={`selector-jefe-${area.id}`} className="relative mt-3">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id={`buscar-jefe-${area.id}`}
                type="search"
                value={busquedaJefe}
                onChange={(e) => setBusquedaJefe(e.target.value)}
                placeholder="Buscar por nombre o usuario..."
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>

            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setJefeSeleccionado(null)}
                aria-pressed={jefeSeleccionado === null}
                className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
                  jefeSeleccionado === null ? 'bg-[#7c3aed]/10' : 'hover:bg-muted'
                }`}
              >
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <UserRound size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Sin jefe asignado</p>
                  <p className="text-xs text-muted-foreground">Dejar la división sin responsable</p>
                </div>
                {jefeSeleccionado === null && <Check size={16} className="flex-none text-[#c4b5fd]" />}
              </button>

              {candidatosJefe.length > 0 ? candidatosJefe.map((u) => {
                const seleccionado = jefeSeleccionado === u.id
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setJefeSeleccionado(u.id)}
                    aria-pressed={seleccionado}
                    className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
                      seleccionado ? 'bg-[#7c3aed]/10' : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/15 text-xs font-bold uppercase text-[#c4b5fd]">
                      {iniciales(u.nombre)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{u.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground">
                         {etiquetaRol(u.rol)} · {u.cargo || 'Sin cargo'} · @{u.usuario}
                      </p>
                    </div>
                    {seleccionado && <Check size={16} className="flex-none text-[#c4b5fd]" />}
                  </button>
                )
              }) : (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">No hay usuarios activos en esta división.</p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-xs text-muted-foreground">
                <span className="truncate">
                  {jefeSeleccionadoActual ? `Seleccionado: ${jefeSeleccionadoActual.nombre}` : 'Seleccionado: Sin jefe'}
                </span>
                {hayCambioJefe && <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-400">Cambio pendiente</span>}
              </div>
              <div className="flex flex-none gap-2">
                {hayCambioJefe && (
                  <button
                    type="button"
                    onClick={descartarCambioJefe}
                    disabled={guardandoJefe}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Descartar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void guardarJefe()}
                  disabled={!hayCambioJefe || guardandoJefe}
                  className="rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {guardandoJefe ? 'Guardando...' : 'Guardar jefe'}
                </button>
              </div>
            </div>
            {errorJefe && <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{errorJefe}</p>}
            {exitoJefe && !errorJefe && <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">{exitoJefe}</p>}
              </>
            )}
          </div>

           <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => manejarEliminar(area.id, area.nombre)}
              className="flex items-center gap-2 rounded-lg border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
            >
              <Trash2 size={15} />
              Eliminar división
            </button>
          </div>
        </div>

        <SettingsUsers areaId={area.id} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cargando && <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Cargando divisiones...</p>}
      {errorAreas && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{errorAreas}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Divisiones de la empresa</h2>
          <p className="text-sm text-muted-foreground">
            Entra a una división para configurarla y gestionar sus usuarios
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setImportando(true)}
            className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Upload size={16} />
            Importar personal (RRHH)
          </button>
          <button
            onClick={() => {
              setErrorArea('')
              setCreando((v) => !v)
            }}
            className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
          >
            <Plus size={16} />
            Nueva División
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busquedaGeneral}
            onChange={(e) => setBusquedaGeneral(e.target.value)}
            placeholder="Buscar personal por nombre, usuario, cargo o división..."
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
          />
        </div>

        {busquedaGeneral.trim() && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              {resultadosBusqueda.length} {resultadosBusqueda.length === 1 ? 'resultado' : 'resultados'}
            </p>
            {resultadosBusqueda.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                No se encontró personal con ese criterio.
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border bg-background">
                {resultadosBusqueda.map((u) => {
                  const areaUsuario = areas.find((a) => a.id === u.area_id)
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => areaUsuario && setAreaSeleccionada(areaUsuario.id)}
                        disabled={!areaUsuario}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/15 text-xs font-bold uppercase text-[#c4b5fd]">
                          {iniciales(u.nombre)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-foreground">{u.nombre}</span>
                            {!u.activo && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                Inactivo
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            @{u.usuario} · {u.cargo || 'Sin cargo'} · {areaUsuario?.nombre ?? u.area_nombre ?? 'División no disponible'}
                          </span>
                        </span>
                        {areaUsuario && <ChevronRight size={16} className="flex-none text-muted-foreground" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {creando && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            const nombre = String(form.get('nombre') || '').trim()
            const descripcion = String(form.get('descripcion') || '').trim()
            setGuardandoArea(true)
            setErrorArea('')
            const resultado = await crearArea({ nombre, descripcion })
            if (resultado.ok) {
              setCreando(false)
            } else {
              setErrorArea(resultado.error || 'No se pudo crear la división.')
            }
            setGuardandoArea(false)
          }}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h3 className="mb-3 text-sm font-semibold text-foreground">Nueva división</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre</label>
              <input
                name="nombre"
                type="text"
                required
                placeholder="Ej. División Legal"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Descripción</label>
              <input
                name="descripcion"
                type="text"
                placeholder="Descripción breve"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={guardandoArea}
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardandoArea ? 'Guardando...' : 'Crear división'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreando(false)
                setErrorArea('')
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
          {errorArea && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{errorArea}</p>}
        </form>
      )}

      {!busquedaGeneral.trim() && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
         {areas.map((area) => {
           const countUsuarios = usuarios.filter((u) => u.area_id === area.id && u.rol === 'personal').length
           return (
            <div key={area.id} className="flex flex-col rounded-xl border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setAreaSeleccionada(area.id)}
                  className="min-w-0 text-left"
                >
                  <h3 className="truncate text-sm font-semibold text-foreground transition-colors hover:text-[#c4b5fd]">
                    {area.nombre}
                  </h3>
                </button>
                <button
                  type="button"
                  onClick={() => setAreaSeleccionada(area.id)}
                  aria-label={`Configurar ${area.nombre}`}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Settings size={16} />
                </button>
              </div>
              {area.descripcion && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{area.descripcion}</p>
              )}
              {area.jefe_nombre && (
                <p className="mt-1 flex items-center gap-1 truncate text-xs text-[#c4b5fd]">
                  <UserRound size={12} className="shrink-0" />
                  Jefe: {area.jefe_nombre}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-[#7c3aed]/10 px-2 py-0.5 text-[11px] font-medium text-[#c4b5fd]">
                  <Users size={12} />
                  {countUsuarios} {countUsuarios === 1 ? 'usuario' : 'usuarios'}
                </span>

              </div>
            </div>
          )
        })}
        </div>
      )}

      {importando && (
        <SettingsImportarPersonal
          areas={areas.map((a) => ({ id: a.id, nombre: a.nombre }))}
          onClose={() => setImportando(false)}
        />
      )}
    </div>
  )
}
