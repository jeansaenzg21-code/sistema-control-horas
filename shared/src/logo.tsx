import { cn } from './utils'

interface LogoProps {
  size?: number
  className?: string
}

export function Logo({ size = 40, className }: LogoProps) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#3b0764] to-[#1e1b4b] shadow-[0_4px_20px_rgba(59,7,100,0.45)]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="/logo.png"
        alt="Paredes Cano"
        width={size * 0.94}
        height={size * 0.94}
        draggable={false}
        className="object-contain"
      />
    </div>
  )
}
