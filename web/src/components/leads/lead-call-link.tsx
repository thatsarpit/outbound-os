import { Phone } from 'lucide-react'
import { leadPhoneHref } from '../../../../shared/leadPhone.js'
import { Button } from '@/components/ui/button'

export function LeadCallLink({ phone, iconOnly = false }: {
  phone?: string | null
  iconOnly?: boolean
}) {
  const href = leadPhoneHref(phone)
  if (!href) return null

  return (
    <Button asChild variant={iconOnly ? 'ghost' : 'secondary'} size="sm" className={iconOnly ? 'size-11 px-0' : 'min-h-11 lg:min-h-8'}>
      <a href={href} aria-label={`Call ${phone}`} title={`Call ${phone}`}>
        <Phone className={iconOnly ? 'size-5' : 'size-4'} aria-hidden="true" />
        {!iconOnly && 'Call'}
      </a>
    </Button>
  )
}
