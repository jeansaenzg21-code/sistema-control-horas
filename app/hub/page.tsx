import { redirect } from 'next/navigation'

/** El selector de empresas se encuentra deshabilitado para todos los usuarios. */
export default function HubDeshabilitado() {
  redirect('/')
}
