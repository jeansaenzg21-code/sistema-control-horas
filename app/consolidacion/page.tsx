'use client'

import { MainLayout } from '@/components/main-layout'
import { ConsolidationTable } from '@/components/consolidation-table'

export default function Consolidacion() {
  return (
    <MainLayout title="Consolidación" subtitle="Horas consolidadas de todos los consultores">
      <ConsolidationTable />
    </MainLayout>
  )
}