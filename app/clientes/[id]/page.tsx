'use client'

// Ficha del cliente por URL directa (enlace profundo, marcador de página).
//
// La vista principal vive dentro de /clientes; esta ruta es el mismo componente
// para poder enlazar a un cliente concreto. Funciona SIN proyecto: las bolsas
// vienen del Excel del cliente.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { MainLayout } from '@/components/main-layout'
import { ClienteGestion } from '@/components/cliente-gestion'
import { SettingsClientePresupuestos } from '@/components/settings-cliente-presupuestos'
import { colorDeCliente, type ClienteCartera } from '@/components/cartera-ui'
import { useAuth } from '@/lib/auth-context'

export default function ClienteDetallePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { usuario, cargando } = useAuth()
  const clienteId = Number(params?.id)

  const [cliente, setCliente] = useState<ClienteCartera | null>(null)
  const [cargandoCliente, setCargandoCliente] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verPresupuestos, setVerPresupuestos] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [ficha, cartera] = await Promise.all([
        fetch(`/api/clientes/${clienteId}`),
        fetch('/api/clientes/cartera'),
      ])
      if (!ficha.ok) throw new Error('No se pudo cargar el cliente.')
      const cuerpoFicha = await ficha.json()
      const basico: { id: number; nombre: string; area_nombre: string; area_id: number } = cuerpoFicha.cliente ?? cuerpoFicha
      // La cartera trae los agregados reales; la ficha minima solo el contacto.
      const completo = (await cartera.json()).clientes?.find((c: ClienteCartera) => c.id === clienteId) ?? null
      setCliente(
        completo ?? {
          id: basico.id,
          nombre: basico.nombre,
          area_id: basico.area_id,
          area_nombre: basico.area_nombre,
          ruc: null,
          correo: null,
          telefono: null,
          direccion: null,
          horasContratadas: 0,
          horasConsumidas: 0,
          horasPorAprobar: 0,
          horasDisponibles: 0,
          horasExcedidas: 0,
          desviacion: 0,
          desviacionPorcentaje: null,
          servicios: [],
          serviciosConteo: 0,
          estado: 'SIN_PRESUPUESTO',
          ultimaActividad: null,
          horasContratadasCampo: 0,
        }
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error.')
    } finally {
      setCargandoCliente(false)
    }
  }, [clienteId])

  useEffect(() => {
    if (cargando || !usuario || !Number.isInteger(clienteId) || clienteId <= 0) return
    void cargar()
  }, [cargando, usuario, clienteId, cargar])

  if (cargando || cargandoCliente) {
    return (
      <MainLayout title="Cliente" subtitle="">
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Cargando...
        </p>
      </MainLayout>
    )
  }

  if (!cliente) {
    return (
      <MainLayout title="Cliente" subtitle="">
        <div className="space-y-3">
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error ?? 'No se encontró el cliente.'}
          </p>
          <Link href="/clientes" className="inline-flex items-center gap-1.5 text-sm text-[#c4b5fd] hover:underline">
            <ArrowLeft size={14} /> Volver a clientes
          </Link>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout title={cliente.nombre} subtitle={`${cliente.area_nombre} · gestión integral`} ancho="ancho">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/clientes" className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
            <ArrowLeft size={12} /> Clientes
          </Link>
          <button
            type="button"
            onClick={() => setVerPresupuestos((v) => !v)}
            className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
          >
            Presupuestos ({verPresupuestos ? 'ocultar' : 'ver'})
          </button>
        </div>

        <ClienteGestion
          cliente={cliente}
          onVolver={() => router.push('/clientes')}
          onEditar={() => router.push('/clientes')}
          onImportarPresupuesto={(c) => { setVerPresupuestos(true); void cargar() }}
        />

        {verPresupuestos && (
          <SettingsClientePresupuestos
            cliente={{ id: cliente.id, nombre: cliente.nombre }}
            onCerrar={() => setVerPresupuestos(false)}
          />
        )}
      </div>
    </MainLayout>
  )
}
