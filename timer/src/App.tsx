import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  ActivityWidget,
  WidgetProvider,
  storage,
  layoutCompact,
  TAMANO_BURBUJA,
  MARGEN_ABIERTO,
  type Actividad,
  type CompactOverride,
  type WidgetUsuario,
  API_BASE_URL,
} from 'paredes-cano-shared'

const MARGEN_PANEL_ABIERTO = 24

async function resizeTauriWindow(width: number, height: number) {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const { LogicalSize } = await import('@tauri-apps/api/dpi')
    await getCurrentWindow().setSize(new LogicalSize(width, height))
  } catch (e) { console.error('[tauri] resize failed', e) }
}

async function positionTauriWindowBottomRight(margin = 16) {
  try {
    const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window')
    const { LogicalPosition } = await import('@tauri-apps/api/dpi')
    const win = getCurrentWindow()
    const monitor = await currentMonitor()
    if (!monitor) return
    const scale = monitor.scaleFactor || 1
    const area = monitor.workArea ? monitor.workArea.size : monitor.size
    const outer = await win.outerSize()
    const winW = Math.round(outer.width / scale)
    const winH = Math.round(outer.height / scale)
    await win.setPosition(new LogicalPosition(
      Math.round(area.width / scale) - winW - margin,
      Math.round(area.height / scale) - winH - margin,
    ))
  } catch (e) { console.error('[tauri] position failed', e) }
}

async function showWindow() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().show()
  } catch (e) { console.error('[tauri] show failed', e) }
}

async function hideWindow() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().hide()
  } catch (e) { console.error('[tauri] hide failed', e) }
}

let overrideActual: CompactOverride | null = null
let ventanaPosicionada = false

async function aplicarVentanaCompacta(
  abierto: boolean,
  antesDeRedimensionar?: (override: CompactOverride | null) => void,
): Promise<CompactOverride | null> {
  const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window')
  const { LogicalSize, PhysicalPosition } = await import('@tauri-apps/api/dpi')
  const win = getCurrentWindow()
  const previa = layoutCompact(!abierto)
  const offsetPrevia = overrideActual?.burbuja ?? previa.burbuja
  const nueva = layoutCompact(abierto)
  const outer = await win.outerPosition()
  const scale = await win.scaleFactor()

  const burbujaPantallaX = outer.x + Math.round(offsetPrevia.x * scale)
  const burbujaPantallaY = outer.y + Math.round(offsetPrevia.y * scale)

  let override: CompactOverride | null = null
  let nx: number
  let ny: number

  if (!abierto) {
    nx = burbujaPantallaX - Math.round(nueva.burbuja.x * scale)
    ny = burbujaPantallaY - Math.round(nueva.burbuja.y * scale)
  } else {
    const monitor = await currentMonitor()
    const area = monitor
      ? monitor.workArea ?? { position: { x: 0, y: 0 }, size: monitor.size }
      : { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } }
    const wPhys = Math.round(nueva.ventana.w * scale)
    const hPhys = Math.round(nueva.ventana.h * scale)
    const margenAbierto = nueva.burbuja.x
    const cabeDerecha =
      burbujaPantallaX - margenAbierto * scale + wPhys <= area.position.x + area.size.width
    const cabeAbajo =
      burbujaPantallaY - nueva.burbuja.y * scale + hPhys <= area.position.y + area.size.height
    const offX = cabeDerecha ? nueva.burbuja.x : nueva.alternativa.x
    const offY = cabeAbajo ? nueva.burbuja.y : nueva.alternativa.y
    override = {
      burbuja: { x: offX, y: offY },
      panel: { x: MARGEN_PANEL_ABIERTO, y: cabeAbajo ? MARGEN_ABIERTO + TAMANO_BURBUJA + 10 : MARGEN_ABIERTO },
      panelArriba: !cabeAbajo,
    }
    nx = burbujaPantallaX - Math.round(offX * scale)
    ny = burbujaPantallaY - Math.round(offY * scale)
  }

  overrideActual = override
  if (antesDeRedimensionar) {
    flushSync(() => antesDeRedimensionar(override))
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_window_bounds', {
      x: nx,
      y: ny,
      width: Math.round(nueva.ventana.w * scale),
      height: Math.round(nueva.ventana.h * scale),
    })
  } catch {
    await win.setSize(new LogicalSize(nueva.ventana.w, nueva.ventana.h))
    await win.setPosition(new PhysicalPosition(nx, ny))
  }
  return override
}

async function startTauriDrag() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  } catch (e) { console.error('[tauri] drag failed', e) }
}

export function App() {
  const [usuario, setUsuario] = useState<WidgetUsuario | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [actividadActual, setActividadActual] = useState<Actividad | null>(null)
  const [override, setOverride] = useState<CompactOverride | null>(null)
  const [tiempoPausaMs, setTiempoPausaMs] = useState<number | null>(null)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const usuarioRef = useRef<WidgetUsuario | null>(null)

  useEffect(() => { usuarioRef.current = usuario }, [usuario])

  const activateWidget = useCallback(async (u: WidgetUsuario, t: string) => {
    setUsuario(u)
    setToken(t)
    await storage.set('pc_token', t)
    overrideActual = null
    setOverride(null)
    const colapsada = layoutCompact(false).ventana
    await resizeTauriWindow(colapsada.w, colapsada.h)
    if (!ventanaPosicionada) {
      ventanaPosicionada = true
      await positionTauriWindowBottomRight()
    }
    await showWindow()
  }, [])

  const deactivateWidget = useCallback(async () => {
    setUsuario(null)
    setToken(null)
    await storage.remove('pc_token')
    await hideWindow()
  }, [])

  const syncWidget = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/widget/sync`, {
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) return
      const data = await res.json()
      const rol = String(data.usuario?.rol || '').toUpperCase()
      if (rol === 'ADMIN' || rol === 'ADMINISTRACION') {
        if (usuarioRef.current) await deactivateWidget()
        return
      }
      if (data.synced && data.token && data.usuario) {
        const u: WidgetUsuario = {
          id: data.usuario.id,
          nombre: data.usuario.nombre,
          usuario: data.usuario.usuario,
          rol: data.usuario.rol,
        }
        if (!usuarioRef.current || usuarioRef.current.id !== u.id) {
          await activateWidget(u, data.token)
        } else {
          // Mismo usuario: no se re-activa, porque reactivar reinicia el tamaño y
          // la posicion de la ventana. Pero SI se vuelve a mostrar. Sin esto, si
          // la ventana se oculto por una carrera con el `hide` del arranque (o
          // porque Windows se la llevo), se quedaba oculta para siempre: el poll
          // ve al mismo usuario, no repetia activateWidget y nadie llamaba a
          // showWindow.
          await showWindow()
        }
      } else if (usuarioRef.current) {
        await deactivateWidget()
      }
    } catch {
      // servidor no disponible: mantener estado actual
    }
  }, [activateWidget, deactivateWidget])

  useEffect(() => {
    let es: EventSource | null = null
    try {
      es = new EventSource(`${API_BASE_URL}/api/auth/stream`)
      es.addEventListener('auth-changed', (evento) => {
        try {
          const data = JSON.parse((evento as MessageEvent).data) as { tipo?: string }
          if (data.tipo === 'login') {
            syncWidget()
          } else if (data.tipo === 'logout' && usuarioRef.current) {
            deactivateWidget()
          }
        } catch {}
      })
    } catch {}
    return () => {
      es?.close()
    }
  }, [syncWidget, deactivateWidget])

  useEffect(() => {
    let cancelado = false
    const arrancar = async () => {
      // El ocultado se ESPERA antes de sincronizar.
      //
      // Antes `hideWindow()` se lanzaba sin await y `restore()` corria en
      // paralelo: el `hide` y el `show` de activateWidget compitian por la misma
      // ventana. Si el hide caia despues, la ventana se quedaba oculta y ya nadie
      // la volvia a mostrar.
      await hideWindow()
      if (cancelado) return
      await syncWidget()
      if (cancelado) return
      syncIntervalRef.current = setInterval(syncWidget, 30000)
    }
    void arrancar()
    return () => {
      cancelado = true
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [syncWidget, activateWidget])

  const cargarActividad = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/actividades/actual`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (res.status === 401) {
        await deactivateWidget()
        return
      }
      if (res.ok) {
        const data = await res.json()
        setActividadActual(data || null)
        if (data && data.estado === 'PAUSADA') {
          const dur = Number(data.duracion_segundos || 0)
          const pausas = Number(data.pausa_acumulada_segundos || 0)
          setTiempoPausaMs(Math.max(0, (dur - pausas) * 1000))
        } else if (!data || data.estado === 'EN_CURSO') {
          setTiempoPausaMs(null)
        }
      }
    } catch {}
  }, [token, deactivateWidget])

  useEffect(() => {
    if (!token || !usuario) return
    cargarActividad()

    let fuente: EventSource | null = null
    let temporizador: ReturnType<typeof setTimeout> | null = null
    let seguridad: ReturnType<typeof setInterval> | null = null
    let intento = 0
    let cerrado = false

    const abrir = () => {
      if (cerrado) return
      if (fuente) {
        try {
          fuente.close()
        } catch {}
        fuente = null
      }
      const es = new EventSource(
        `${API_BASE_URL}/api/actividades/stream?usuario_id=${usuario.id}&token=${encodeURIComponent(token)}`,
      )
      fuente = es

      es.onopen = () => {
        intento = 0
        if (seguridad) {
          clearInterval(seguridad)
          seguridad = null
        }
      }
      es.addEventListener('activity-changed', () => {
        cargarActividad()
      })
      es.onerror = () => {
        if (cerrado || fuente !== es) return
        try {
          es.close()
        } catch {}
        fuente = null
        // El widget es una app de escritorio: si el servidor cae, reconectar
        // cada 3 s sin limite abre y cierra conexiones sin parar. Se reconecta
        // con espera creciente y algo de dispersion.
        intento += 1
        const espera = Math.min(60_000, 2000 * 2 ** Math.min(intento, 10))
        const jitter = espera * 0.25 * (Math.random() * 2 - 1)
        temporizador = setTimeout(abrir, Math.max(500, Math.round(espera + jitter)))
        if (!seguridad) {
          // Mientras no haya stream, una consulta de seguridad cada 60 s. Antes
          // habia una cada 30 s aunque el stream estuviera perfecto.
          seguridad = setInterval(() => {
            if (!fuente) cargarActividad()
          }, 60_000)
        }
      }
    }

    abrir()

    return () => {
      cerrado = true
      if (temporizador) clearTimeout(temporizador)
      if (seguridad) clearInterval(seguridad)
      if (fuente) {
        try {
          fuente.close()
        } catch {}
      }
    }
  }, [token, usuario, cargarActividad])

  const pausarActividad = useCallback(async () => {
    if (!actividadActual || !token) return
    try {
      await fetch(`${API_BASE_URL}/api/actividades/${actividadActual.id}/pausar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const elapsed = Math.max(0, Date.now() - new Date(actividadActual.inicio).getTime())
      const pausas = (actividadActual.pausa_acumulada_segundos || 0) * 1000
      setTiempoPausaMs(Math.max(0, elapsed - pausas))
      setActividadActual((prev) => (prev ? {
        ...prev,
        estado: 'PAUSADA',
      } : null))
    } catch {}
  }, [actividadActual, token])

  const reanudarActividad = useCallback(async () => {
    if (!actividadActual || !token) return
    try {
      await fetch(`${API_BASE_URL}/api/actividades/${actividadActual.id}/continuar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      setTiempoPausaMs(null)
      setActividadActual((prev) => (prev ? { ...prev, estado: 'EN_CURSO' } : null))
    } catch {}
  }, [actividadActual, token])

  const finalizarActividad = useCallback(async () => {
    if (!actividadActual || !token) return
    try {
      await fetch(`${API_BASE_URL}/api/actividades/${actividadActual.id}/finalizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      setTiempoPausaMs(null)
      setActividadActual(null)
    } catch {}
  }, [actividadActual, token])

  const handlePanelToggle = useCallback(async (abierto: boolean) => {
    if (!abierto) await new Promise((r) => setTimeout(r, 100))
    try {
      await aplicarVentanaCompacta(abierto, setOverride)
    } catch (e) {
      console.error('[tauri] panel toggle failed', e)
    }
  }, [])

  if (!usuario) return null

  return (
    <WidgetProvider
      value={{
        actividadActual,
        usuario,
        tiempoPausaMs,
        pausarActividad,
        reanudarActividad,
        finalizarActividad,
      }}
    >
      <ActivityWidget
        compact
        compactOverride={override}
        onPanelToggle={handlePanelToggle}
        startDrag={startTauriDrag}
      />
    </WidgetProvider>
  )
}
