'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Search, User, CheckCheck, ArrowRight, Settings, LogOut, ChevronDown, DoorOpen, Menu } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useNotificaciones } from '@/lib/notificaciones-context'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title: string
  subtitle?: string
  onAbrirMenu: () => void
}

export function Header({ title, subtitle, onAbrirMenu }: HeaderProps) {
  const { usuario, empresaActiva, logout, salirDeEmpresa } = useAuth()
  const { notificaciones, noLeidas, marcarLeida, marcarTodasLeidas } = useNotificaciones()
  const [notifAbierto, setNotifAbierto] = useState(false)
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false)
  const [saliendoEmpresa, setSaliendoEmpresa] = useState(false)
  const contenedorNotifRef = useRef<HTMLDivElement>(null)
  const contenedorUsuarioRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const manejarClick = (evento: MouseEvent) => {
      if (contenedorNotifRef.current && !contenedorNotifRef.current.contains(evento.target as Node)) {
        setNotifAbierto(false)
      }
      if (contenedorUsuarioRef.current && !contenedorUsuarioRef.current.contains(evento.target as Node)) {
        setMenuUsuarioAbierto(false)
      }
    }
    const manejarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setNotifAbierto(false)
        setMenuUsuarioAbierto(false)
      }
    }
    document.addEventListener('mousedown', manejarClick)
    document.addEventListener('keydown', manejarTecla)
    return () => {
      document.removeEventListener('mousedown', manejarClick)
      document.removeEventListener('keydown', manejarTecla)
    }
  }, [])

  const abrirNotificacion = (notificacion: (typeof notificaciones)[number]) => {
    marcarLeida(notificacion.id)
    setNotifAbierto(false)
    if (notificacion.url) router.push(notificacion.url)
  }

  const irAConfiguracion = () => {
    setMenuUsuarioAbierto(false)
    router.push('/configuracion')
  }

  const manejarSalirEmpresa = async () => {
    setMenuUsuarioAbierto(false)
    setSaliendoEmpresa(true)
    const resultado = await salirDeEmpresa()
    if (resultado.ok) {
      router.replace('/hub')
      router.refresh()
    }
    setSaliendoEmpresa(false)
  }

  const manejarLogout = () => {
    setMenuUsuarioAbierto(false)
    logout()
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="no-print sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b border-border bg-header px-4 py-2 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
          {empresaActiva && (
            <p className="truncate text-[11px] text-[#c4b5fd]">{empresaActiva.nombre}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-1.5 lg:flex">
          <Search size={15} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-36 bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none"
          />
        </div>

        <div className="relative" ref={contenedorNotifRef}>
          <button
            onClick={() => setNotifAbierto((valor) => !valor)}
            className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Notificaciones"
          >
            <Bell size={18} />
            {noLeidas > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#7c3aed] text-[10px] font-bold text-white">
                {noLeidas > 9 ? '9+' : noLeidas}
              </span>
            )}
          </button>

          {notifAbierto && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Notificaciones</span>
                {noLeidas > 0 && (
                  <button
                    onClick={marcarTodasLeidas}
                    className="flex items-center gap-1 text-xs font-medium text-[#c4b5fd] transition-colors hover:text-[#a78bfa]"
                  >
                    <CheckCheck size={13} />
                    Marcar todas como leídas
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notificaciones.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No tienes notificaciones.
                  </div>
                )}
                {notificaciones.map((notificacion) => (
                  <button
                    key={notificacion.id}
                    onClick={() => abrirNotificacion(notificacion)}
                    className={cnItem(notificacion.leida)}
                  >
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {notificacion.titulo}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {notificacion.mensaje}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground/70">
                        {formatearFecha(notificacion.created_at)}
                      </span>
                    </span>
                    {notificacion.url && (
                      <ArrowRight size={14} className="shrink-0 text-muted-foreground/60" />
                    )}
                    {!notificacion.leida && (
                      <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#7c3aed]" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={contenedorUsuarioRef}>
          <button
            onClick={() => setMenuUsuarioAbierto((valor) => !valor)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7c3aed]/20">
              {usuario ? (
                <span className="text-xs font-bold uppercase text-[#c4b5fd]">
                  {usuario.nombre
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')}
                </span>
              ) : (
                <User size={14} className="text-[#c4b5fd]" />
              )}
            </div>
            <span className="hidden text-sm font-medium text-foreground sm:inline">
              {usuario?.nombre || 'Sin sesión'}
            </span>
            <ChevronDown
              size={14}
              className={cn(
                'hidden text-muted-foreground transition-transform sm:block',
                menuUsuarioAbierto && 'rotate-180',
              )}
            />
          </button>

          {menuUsuarioAbierto && usuario && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95">
              <div className="border-b border-border px-4 py-3">
                <p className="truncate text-sm font-semibold text-foreground">{usuario.nombre}</p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {/* `capitalize` no sirve para "Jefe de área": capitalizaría cada
                      palabra. El texto de los roles ya viene escrito como debe
                      mostrarse, así que solo se aplica al cargo libre. */}
                  {usuario.rol === 'admin' ? 'Administrador'
                    : usuario.rol === 'jefe_area' ? 'Jefe de área'
                      : usuario.rol === 'socio' ? 'Socio · solo lectura'
                        : <span className="capitalize">{usuario.cargo || 'Colaborador'}</span>}
                </p>
              </div>

              <div className="p-1">
                <button
                  onClick={irAConfiguracion}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Settings size={16} className="text-muted-foreground" />
                  Configuración
                </button>
                <button
                  type="button"
                  onClick={manejarSalirEmpresa}
                  disabled={saliendoEmpresa || !empresaActiva}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DoorOpen size={16} className="text-muted-foreground" />
                  {saliendoEmpresa ? 'Saliendo...' : 'Salir de empresa'}
                </button>
                <button
                  onClick={manejarLogout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-500 transition-colors hover:bg-muted"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function cnItem(leida: boolean) {
  return leida
    ? 'relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted'
    : 'relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted bg-[#7c3aed]/5'
}

function formatearFecha(fechaISO: string) {
  try {
    const fecha = new Date(fechaISO)
    return fecha.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
