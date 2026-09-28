/**
 * Brand mark.
 *
 * Monochrome and geometric. It inherits `currentColor` so it works in ink on
 * paper, paper on ink, and inside a link that changes colour on hover — the
 * previous mark hardcoded a mint fill and a white block, so it disappeared on
 * any surface that was not the old dark background.
 *
 * The outer form is the customer record; the diagonal cut is the next action
 * leaving it. The arrow is knocked out of one solid path instead of being
 * painted with a background colour, so the mark remains genuinely one-colour
 * on paper, ink, favicons and large-format use.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
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
