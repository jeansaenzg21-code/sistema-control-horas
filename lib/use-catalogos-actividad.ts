'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth-context'
import type { Cliente } from './clientes-context'
import { opcionesApi } from './api-cliente'

/**
 * Un servicio con las horas de QUIEN lo consulta, no las del servicio entero.
 * `horas` que llega del servidor es el total de la bolsa; lo que le sirve a la
 * persona para administrarse es su parte, asi que se trae aparte.
 */
export interface ServicioConProgreso {
  id: number
  nombre: string
  origen: string
  horas: string | number
  mis_horas_contratadas: string | number
  mis_horas_consumidas: string | number
}

export interface TipoActividadOpcion {
  id: number
  nombre: string
  codigo?: string | null
}

/**
 * Catálogos que comparten los formularios de registro de actividades: tipos de
 * actividad del área, clientes visibles y bolsas del cliente elegido.
 */
export function useCatalogosActividad(clienteId: number | '') {
  const { usuario, empresaActiva } = useAuth()
  const [tiposDisponibles, setTiposDisponibles] = useState<TipoActividadOpcion[]>([])
  const [servicios, setServicios] = useState<ServicioConProgreso[]>([])
  const [cargandoServicios, setCargandoServicios] = useState(false)
  // El cliente TIENE bolsas activas pero ninguna es de este usuario. Sin esto el
  // desplegable aparece vacío y parece una falla.
  const [sinAsignaciones, setSinAsignaciones] = useState(false)

  // Solo clientes donde la persona tiene al menos una bolsa CONFIRMADA. Se pide
  // al servidor porque el contexto carga todos los clientes de la empresa y usarlo
  // aquí dejaría elegir clientes ajenos. Mientras llega la respuesta no se enseña
  // ninguno: mostrar la lista completa un instante es justo lo que se quiere evitar.
  const [clientesAsignados, setClientesAsignados] = useState<Cliente[]>([])

  useEffect(() => {
    if (!usuario?.id || !empresaActiva?.id) {
      setClientesAsignados([])
      return
    }
    const controller = new AbortController()
    const cargarClientes = async () => {
      try {
        const res = await fetch('/api/clientes?solo_asignados=1', opcionesApi({ signal: controller.signal }))
        if (res.ok) {
          setClientesAsignados((await res.json()) as Cliente[])
        } else {
          setClientesAsignados([])
        }
      } catch {
        if (!controller.signal.aborted) setClientesAsignados([])
      }
    }
    void cargarClientes()
    return () => controller.abort()
  }, [usuario?.id, empresaActiva?.id])

  useEffect(() => {
    if (!usuario?.area_id) return
    const cargarTipos = async () => {
      try {
        const res = await fetch(`/api/tipos-actividad?area_id=${usuario.area_id}`, opcionesApi())
        if (res.ok) {
          const data = await res.json()
          // El servidor ya los deja en orden de código. Aquí solo se hunde el
          // "atrapa todo" de cada área ("Otras Actividades Inherentes",
          // "Otros Inherentes"), que en una lista de 30 actividades
          // específicas quedaría perdido en medio por orden alfabético.
          const esAtrapaTodo = (nombre: string) => nombre.trim().toLowerCase().startsWith('otros')
          const ordenados = [...data].sort((a: TipoActividadOpcion, b: TipoActividadOpcion) => {
            const aFin = esAtrapaTodo(a.nombre)
            const bFin = esAtrapaTodo(b.nombre)
            if (aFin !== bFin) return aFin ? 1 : -1
            if (a.codigo && b.codigo) return a.codigo.localeCompare(b.codigo, 'es', { numeric: true })
            if (a.codigo) return -1
            if (b.codigo) return 1
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

  // Los servicios cuelgan del cliente (cliente -> presupuesto -> servicio), asi
  // que se piden cuando ya hay cliente elegido. El servidor solo devuelve bolsas
  // activas: el origen CONSOLIDADO se queda fuera porque por regla del modulo no
  // genera saldo.
  useEffect(() => {
    if (!clienteId) {
      setServicios([])
      setCargandoServicios(false)
      setSinAsignaciones(false)
      return
    }
    const controller = new AbortController()
    const cargarServicios = async () => {
      setCargandoServicios(true)
      try {
        const res = await fetch(`/api/servicios?cliente_id=${clienteId}`, opcionesApi({ signal: controller.signal }))
        if (res.ok) {
          const data = await res.json()
          const lista = Array.isArray(data?.servicios) ? data.servicios : []
          setServicios(lista)
          setSinAsignaciones(lista.length === 0 && Boolean(data?.sinAsignaciones))
        } else {
          setServicios([])
          setSinAsignaciones(false)
        }
      } catch {
        if (!controller.signal.aborted) {
          setServicios([])
          setSinAsignaciones(false)
        }
      } finally {
        if (!controller.signal.aborted) setCargandoServicios(false)
      }
    }
    void cargarServicios()
    return () => controller.abort()
  }, [clienteId])

  // El filtro por área se mantiene para el ADMINISTRACION: recibe todos los
  // clientes de la empresa y su área puede estar fijada a una división.
  const clientesVisibles = useMemo(
    () =>
      clientesAsignados.filter(
        (cliente) => !usuario?.area_id || cliente.area_id === usuario.area_id,
      ),
    [clientesAsignados, usuario?.area_id],
  )

  return { tiposDisponibles, servicios, cargandoServicios, sinAsignaciones, clientesVisibles }
}
