export interface WebhookSource {
  id: number
  name: string
  source: string
  enabled: boolean
  totalReceived: number
  lastReceivedAt: string | null
  createdAt: string
  importSupplierId: number | null
  importTags: string
}

export type ReceiptState = 'created' | 'matched' | 'conflict'

export interface ConnectorReceipt {
  id: number
  externalId: string
  leadId: number | null
  state: ReceiptState
  reason: string | null
  recordJson: string
  createdAt: string
}

export interface ConnectorReceiptPage {
  records: ConnectorReceipt[]
  total: number
  page: number
  pages: number
}
