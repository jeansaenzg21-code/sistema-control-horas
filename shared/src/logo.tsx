import { cn } from './utils'

export function Logo({
  size = 40,
  className,
  radius,
  innerRatio = 0.6,
}: {
  size?: number
  className?: string
  radius?: number
  innerRatio?: number
}) {
  const radio = radius ?? size / 2
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: radio,
        background: 'linear-gradient(135deg, #3b0764 0%, #1e1b4b 100%)',
      }}
    >
      <img
        src="/logo.png"
        alt="Paredes Cano"
        style={{ width: size * innerRatio, height: size * innerRatio, objectFit: 'contain', borderRadius: radio }}
        draggable={false}
      />
    </div>
  )
}
