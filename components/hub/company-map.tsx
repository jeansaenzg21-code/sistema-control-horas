'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Building2, Check, Globe, MapPin, Plus, SearchX } from 'lucide-react'
import type { Empresa } from '@/lib/auth-context'
import styles from './company-map.module.css'

interface CompanyMapProps {
  empresas: Empresa[]
  empresaActiva: Empresa | null
  enteringId: number | null
  canCreate: boolean
  onEnter: (empresaId: number) => void
  onCreate: () => void
}

interface MapNode {
  key: string
  type: 'empresa' | 'create'
  empresa?: Empresa
}

interface ConnectionPath {
  id: string
  from: string
  to: string
  d: string
}

export function CompanyMap({
  empresas,
  empresaActiva,
  enteringId,
  canCreate,
  onEnter,
  onCreate,
}: CompanyMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({})
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [connections, setConnections] = useState<ConnectionPath[]>([])
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const nodes = useMemo<MapNode[]>(() => {
    const companyNodes = empresas.map((empresa) => ({
      key: `empresa-${empresa.id}`,
      type: 'empresa' as const,
      empresa,
    }))
    return canCreate ? [...companyNodes, { key: 'create', type: 'create' as const }] : companyNodes
  }, [empresas, canCreate])

  const measureConnections = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const canvasRect = canvas.getBoundingClientRect()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return

    setDimensions({ width, height })
    const points = nodes.flatMap((node) => {
      const element = nodeRefs.current[node.key]
      if (!element) return []
      const rect = element.getBoundingClientRect()
      return [{
        key: node.key,
        x: rect.left - canvasRect.left + rect.width / 2,
        y: rect.top - canvasRect.top + rect.height / 2,
      }]
    })

    const nextConnections: ConnectionPath[] = []
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      const vertical = window.matchMedia('(max-width: 720px)').matches
      if (vertical) {
        const middleY = (start.y + end.y) / 2
        nextConnections.push({
          id: `${start.key}-${end.key}`,
          from: start.key,
          to: end.key,
          d: `M ${start.x} ${start.y} C ${start.x} ${middleY}, ${end.x} ${middleY}, ${end.x} ${end.y}`,
        })
      } else {
        const bend = Math.max(42, Math.abs(end.x - start.x) * 0.42)
        const controlStartX = start.x + bend
        const controlEndX = end.x - bend
        nextConnections.push({
          id: `${start.key}-${end.key}`,
          from: start.key,
          to: end.key,
          d: `M ${start.x} ${start.y} C ${controlStartX} ${start.y}, ${controlEndX} ${end.y}, ${end.x} ${end.y}`,
        })
      }
    }
    setConnections(nextConnections)
  }, [nodes])

  useLayoutEffect(() => {
    measureConnections()
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measureConnections)
      : null
    resizeObserver?.observe(canvas)
    nodes.forEach((node) => {
      const element = nodeRefs.current[node.key]
      if (element) resizeObserver?.observe(element)
    })
    window.addEventListener('resize', measureConnections)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measureConnections)
    }
  }, [measureConnections, nodes])

  const registerNode = (key: string) => (element: HTMLElement | null) => {
    nodeRefs.current[key] = element
  }

  return (
    <div ref={canvasRef} className={styles.canvas}>
      <svg
        className={styles.connections}
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        aria-hidden="true"
      >
        {connections.map((connection) => (
          <path
            key={connection.id}
            d={connection.d}
            className={hoveredNode && (connection.from === hoveredNode || connection.to === hoveredNode) ? styles.connectionHover : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className={styles.mapNoise} aria-hidden="true" />

      <div className={`${styles.route} ${empresas.length <= 2 ? styles.singleRoute : ''}`} role="list" aria-label="Empresas disponibles">
        {empresas.length === 0 && (
          <div className={styles.noResults}>
            <SearchX size={20} />
            <div>
              <p className={styles.noResultsTitle}>Aún no hay empresas</p>
              <p className={styles.noResultsText}>Crea el primer espacio de trabajo para comenzar.</p>
            </div>
          </div>
        )}

        {empresas.map((empresa) => {
          const key = `empresa-${empresa.id}`
          const activa = empresaActiva?.id === empresa.id
          const entrando = enteringId === empresa.id
          return (
            <article
              key={empresa.id}
              role="listitem"
              onMouseEnter={() => setHoveredNode(key)}
              onMouseLeave={() => setHoveredNode(null)}
              onFocus={() => setHoveredNode(key)}
              onBlur={() => setHoveredNode(null)}
              className={`${styles.card} ${activa ? styles.cardActive : ''}`}
            >
              <div ref={registerNode(key)} className={styles.connectionPoint} aria-hidden="true">
                <span className={styles.connectionDot} />
              </div>
              <div className={styles.cardHeader}>
                <div className={styles.logoWrap}>
                  {empresa.logo ? (
                    <img src={empresa.logo} alt="" className={styles.logo} />
                  ) : (
                    <Building2 size={19} strokeWidth={1.7} />
                  )}
                </div>
                <div className={styles.cardTitleBlock}>
                  <div className={styles.cardTitleLine}>
                    <h2>{empresa.nombre}</h2>
                    {activa && (
                      <span className={styles.activeStatus}>
                        <span className={styles.activeDot} />
                        Activa
                      </span>
                    )}
                  </div>
                  <span className={styles.cardKicker}>Espacio de trabajo</span>
                </div>
              </div>
              {empresa.descripcion && <p className={styles.description}>{empresa.descripcion}</p>}
              <div className={styles.location}>
                {empresa.ciudad && <span><MapPin size={12} />{empresa.ciudad}</span>}
                <span><Globe size={12} />{empresa.pais}</span>
              </div>
              <button
                type="button"
                disabled={activa || enteringId !== null}
                onClick={() => onEnter(empresa.id)}
                className={styles.enterButton}
                aria-label={activa ? `${empresa.nombre} ya está activa` : `Ingresar a ${empresa.nombre}`}
              >
                {activa ? (
                  <><Check size={14} /> Empresa activa</>
                ) : entrando ? (
                  'Entrando...'
                ) : (
                  <>Ingresar <ArrowRight size={14} /></>
                )}
              </button>
            </article>
          )
        })}

        {canCreate && (
          <button
            type="button"
            role="listitem"
            onMouseEnter={() => setHoveredNode('create')}
            onMouseLeave={() => setHoveredNode(null)}
            onFocus={() => setHoveredNode('create')}
            onBlur={() => setHoveredNode(null)}
            onClick={onCreate}
            className={styles.createNode}
          >
            <span ref={registerNode('create')} className={styles.createConnectionPoint} aria-hidden="true">
              <span className={styles.createConnectionDot} />
            </span>
            <span className={styles.createIcon}><Plus size={18} /></span>
            <span className={styles.createCopy}>
              <strong>Crear nueva empresa</strong>
              <small>Agrega otro espacio de trabajo</small>
            </span>
            <ArrowRight size={15} className={styles.createArrow} />
          </button>
        )}
      </div>
    </div>
  )
}
