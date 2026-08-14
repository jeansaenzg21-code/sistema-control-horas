'use client'

import { MainLayout } from '@/components/main-layout'
import { ApprovalList } from '@/components/approval-list'

export default function Aprobaciones() {
  return (
    <MainLayout
      title="Aprobaciones"
      subtitle="Revisa y gestiona el estado de tus registros"
    >
      <ApprovalList />
    </MainLayout>
  )
}