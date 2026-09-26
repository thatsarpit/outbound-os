type BrandMarkProps = {
  className?: string
}

/**
 * Outbound OS mark — a rounded container with an outbound arrow knocked out of
 * it. Drawn as a single path with `evenodd`, so the arrow is a genuine hole
 * rather than a shape filled with a background colour. That means the mark is
 * monochrome `currentColor` and renders correctly on any surface in either
 * theme; the previous version had a hardcoded white block that disappeared on
 * a light ground.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Outbound OS"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M11 3H21A8 8 0 0 1 29 11V21A8 8 0 0 1 21 29H11A8 8 0 0 1 3 21V11A8 8 0 0 1 11 3ZM13 9.5H22.5V19H19.5V14.6L12.1 22L10 19.9L17.4 12.5H13V9.5Z"
      />
    </svg>
  )
}
