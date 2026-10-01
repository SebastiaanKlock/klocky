/** Klocky "K" mark. Colour follows `color` (defaults to the brand blue). */
export function LogoMark({ size = 24, color = '#0a66ff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={color} aria-hidden="true">
      <path d="M0 0H30V100H0Z" />
      <path d="M30 24L54 0H100L38 50H30Z" />
      <path d="M30 76L54 100H100L38 50H30Z" />
      <path d="M100 100V60L60 100Z" />
    </svg>
  );
}
