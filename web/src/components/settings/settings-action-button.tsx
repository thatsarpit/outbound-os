import { Save } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * The consistent "Save X" affordance every Settings section uses for its
 * primary mutation. Extracted from the former monolithic settings.tsx.
 */
export function ActionButton({
  onClick,
  pending,
  label,
  secondary = false,
  disabled = false,
}: {
  onClick: () => void
  pending: boolean
  label: string
  secondary?: boolean
  disabled?: boolean
}) {
  return (
    <Button
      variant={secondary ? 'secondary' : 'primary'}
      isLoading={pending}
      onClick={onClick}
      disabled={disabled}
      leftIcon={pending ? undefined : <Save className="h-4 w-4" />}
    >
      {label}
    </Button>
  )
}
