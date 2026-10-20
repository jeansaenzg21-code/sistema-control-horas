import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold text-foreground">404</h1>
      <p className="text-sm text-muted-foreground">No se encontró la página que buscas.</p>
      <Link href="/" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        Volver al inicio
      </Link>
    </div>
  )
}