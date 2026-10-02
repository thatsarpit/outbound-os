/* ── Entity Types (derived from prisma/schema.prisma) ── */

export interface User {
  id: number
  name: string
  email: string
  /** Bare digits. Present when the user can sign in with a one-time code. */
  phone?: string | null
  role: 'admin' | 'manager' | 'agent' | 'viewer'
  enabled: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Lead {
  id: number
  externalId: string | null
  name: string
  company: string | null
  mobile: string
  waUsername?: string | null
  waUserId?: string | null
  email: string | null
  country: string | null
  product: string | null
  quantity: string | null
  strength: string | null
  brand: string | null
  source: string
  importBatchId: number | null
  status: LeadStatus
  isOnWhatsApp: boolean | null
  assignedAccount: number
  emailStatus: string
  assignedEmailAccountId: number | null
  telegramPeer: string | null
  telegramStatus: string
  assignedTelegramAccountId: number | null
  assignedToId: number | null
  assignedTo: User | null
  followupCount: number
  emailFollowupCount: number
  maxFollowups: number
  lastMessageAt: string | null
  lastEmailAt: string | null
  repliedAt: string | null
  score: number
  replySpeed: string | null
  engagementLevel: string
  consumedAt: string | null
  leadTier: LeadTier | null
  notes: string | null
  tags: string | null
  lastError: string | null
  lastErrorAt: string | null
  lastReplyIntent: string | null
  aiInsights: string | null
  enrichedData: string | null
  dealValue: number | null
  convertedAt: string | null
  poolId: number | null
  createdAt: string
  updatedAt: string
  messages?: Message[]
  leadNotes?: LeadNote[]
  leadTasks?: LeadTask[]
}

export interface LeadInsightEntities {
  productMentioned: string | null
  quantityMentioned: string | null
  locationMentioned: string | null
  priceMentioned: string | null
  objection: string | null
}

export interface LeadAiInsight {
  intent: string
  urgency: 'high' | 'medium' | 'low' | string
  nextAction: string | null
  summary: string | null
  entities: LeadInsightEntities | null
  channel?: 'whatsapp' | 'email' | string | null
  detectedAt?: string | null
}

export interface LeadInsightsResponse {
  leadId: number
  lastReplyIntent: string | null
  aiInsights: LeadAiInsight | null
}

export interface LeadEnrichmentData {
  website: string | null
  companySize: string | null
  industry: string | null
  description: string | null
  buyerType: string | null
  gstHint: string | null
  confidence: 'high' | 'medium' | 'low' | string | null
  enrichedAt?: string | null
}

export interface LeadEnrichmentResponse {
  enrichedData: LeadEnrichmentData | null
  cached?: boolean
}

export type LeadStatus =
  | 'new'
  | 'wa_unavailable'
  | 'contacted'
  | 'replied'
  | 'engaged'
  | 'closed'
  | 'paused'

export type LeadTier = 'HOT' | 'WARM' | 'COLD'

export interface Message {
  id: number
  leadId: number
  direction: 'outbound' | 'inbound'
  channel: 'whatsapp' | 'email' | 'imessage' | 'telegram'
  content: string
  waAccount: number
  emailAccountId: number | null
  status: string
  pricingCategory?: string | null
  pricingType?: string | null
  billable?: boolean | null
  retryCount: number
  maxRetries: number
  campaignId: number | null
  scheduledAt: string | null
  sentAt: string | null
  createdAt: string
  emailSubject: string | null
  emailMessageId: string | null
  emailInReplyTo: string | null
  mediaUrl: string | null
  mediaType: string | null
  mediaCaption: string | null
  mediaFilename: string | null
}

export interface Campaign {
  id: number
  name: string
  description: string | null
  channel: 'whatsapp' | 'email' | 'both' | 'imessage'
  messageTemplate: string
  emailSubject: string | null
  emailTemplateId: number | null
  senderAccountId: number | null
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed'
  targetFilter: string | null
  variantBTemplate: string | null
  variantBSubject: string | null
  variantACount: number
  variantBCount: number
  variantAReplies: number
  variantBReplies: number
  totalLeads: number
  sentCount: number
  failedCount: number
  replyCount: number
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CampaignLead {
  id: number
  campaignId: number
  leadId: number
  status: 'pending' | 'sent' | 'failed' | 'replied'
  sentAt: string | null
  variant: 'A' | 'B'
}

export interface WhatsAppAccount {
  id: number
  name: string
  phone: string
  status: string
  waAccountType: 'cloud_api'
  enabled: boolean
  autoSleep: boolean
  personaName: string
  personaGender: string
  personaTitle: string
  companyName: string
  companyCity: string
  companyIndustry: string
  companyCerts: string
  companyUSP: string
  hourlyLimit: number
  dailyLimit: number
  maxFollowups: number
  followupDelays: string
  messagesSentToday: number
  /** Who delivers this account's messages. */
  provider: WhatsAppProvider
  providerLabel?: string
  /** Free text inside Meta's 24-hour window is possible. */
  sessionReady?: boolean
  /** Approved templates (first contact, re-engagement) are possible. */
  templatesReady?: boolean
  templateLanguage: string
  metaWabaId: string
  metaPhoneNumberId?: string
  metaConfigured?: boolean
  aisensyProjectId: string
  projectApiConfigured: boolean
  campaignApiConfigured: boolean
  defaultCampaignName: string
  lastResetAt: string
  createdAt: string
}

export type WhatsAppProvider = 'meta' | 'aisensy'

export interface EmailAccount {
  id: number
  name: string
  email: string
  provider: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  senderName: string
  signature: string
  dailyLimit: number
  hourlyLimit: number
  sentToday: number
  enabled: boolean
  status: string
  lastError: string | null
  lastSyncAt: string | null
  whatsappAccountId: number | null
  hasSmtpPass?: boolean
  hasImapPass?: boolean
  createdAt: string
  updatedAt: string
}

export interface EmailTemplate {
  id: number
  name: string
  subject: string
  htmlBody: string
  textBody: string
  variables: string
  category: string
  createdAt: string
  updatedAt: string
}

export interface LeadNote {
  id: number
  leadId: number
  content: string
  type: 'note' | 'call' | 'meeting' | 'email_manual'
  createdAt: string
}

export interface LeadTask {
  id: number
  leadId: number
  title: string
  dueAt: string | null
  done: boolean
  createdAt: string
}

export interface LeadPool {
  id: number
  name: string
  slug: string
  description: string | null
  isDefault: boolean
  color: string | null
  leadCount: number
  whatsappCount: number
  emailCount: number
  createdAt: string
  updatedAt: string
}

export interface LeadPoolAccounts {
  whatsapp: Pick<WhatsAppAccount, 'id' | 'name' | 'phone' | 'status' | 'enabled'>[]
  email: Pick<EmailAccount, 'id' | 'name' | 'email' | 'status' | 'enabled'>[]
}

export interface ActivityLog {
  id: number | string
  type: string
  message: string
  accountId?: number | null
  leadId?: number | null
  meta?: string | null
  data?: Record<string, unknown> | null
  createdAt?: string
  timestamp?: string
}

export interface ImportBatch {
  id: number
  filename: string
  totalRows: number
  imported: number
  duplicates: number
  failed: number
  status: 'processing' | 'completed' | 'failed'
  createdAt: string
}

export interface WebhookSubscription {
  id: number
  name: string
  url: string
  events: string
  secret: string
  enabled: boolean
  lastTriggeredAt: string | null
  failCount: number
  createdAt: string
}

export interface WebhookSource {
  id: number
  name: string
  source: string
  apiKey: string
  fieldMap: string
  enabled: boolean
  lastReceivedAt: string | null
  totalReceived: number
  createdAt: string
}

export interface MediaFile {
  id: number
  filename: string
  originalName: string
  mimeType: string
  size: number
  path: string
  createdAt: string
}

export interface SystemConfig {
  key: string
  value: string
}

/* ── API Response Types ── */

export interface ApiError {
  error: string
  code?: string
  details?: string
}

export interface AuthResponse {
  token: string
  user: User
  capabilities?: Record<string, boolean>
  expiresIn?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pages: number
}

export interface OverviewStats {
  totalLeads: number
  activeLeads: number
  repliedLeads: number
  closedLeads: number
  totalCampaigns: number
  activeCampaigns: number
  messagesSentToday: number
  replyRate: number
  pipelineValue: number
  conversionRate: number
}

export interface AnalyticsData {
  funnel: { stage: string; count: number; pct: number }[]
  agentLeaderboard: {
    id: number
    name: string
    assigned: number
    closed: number
    dealValue: number
    conversionRate: number
  }[]
  dailyTrend: { date: string; count: number }[]
  topProducts: { product: string; count: number }[]
  pipeline: { status: string; count: number; pct: number }[]
  kpi: {
    totalLeads: number
    closedDeals: number
    conversionRate: number
    totalDealValue: number
    avgDealValue: number
    replyRate: number
  }
}

export interface TimelineEvent {
  id: string
  type: 'message' | 'note' | 'task' | 'status_change' | 'created'
  timestamp: string
  data: Record<string, unknown>
}

export interface InboxThread {
  leadId: number
  leadName: string
  leadCompany: string | null
  lastMessage: string
  lastMessageAt: string
  unread: boolean
  channel: 'whatsapp' | 'email' | 'imessage' | 'telegram'
  messageCount: number
}

export type InboxChannel = 'whatsapp' | 'email' | 'imessage' | 'telegram'

export interface InboxChannelHealthItem {
  status: 'ready' | 'limited' | 'offline'
  total: number
  detail: string
  campaignReady?: number
  projectReady?: number
  online?: number
  verified?: number
  inbound?: number
  connected?: number
}

export interface InboxChannelHealth {
  whatsapp: InboxChannelHealthItem
  imessage: InboxChannelHealthItem
  email: InboxChannelHealthItem
  telegram: InboxChannelHealthItem
  inbound: {
    publicWebhookConfigured: boolean
    detail: string
  }
}

export type InboxThreadState =
  | 'all'
  | 'needs_reply'
  | 'assigned'
  | 'unassigned'
  | 'resolved'
  | 'open'

export type InboxMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'synced'

export interface InboxSenderAccount {
  id: number
  channel: InboxChannel
  name: string
  email: string | null
  senderName: string | null
  signature?: string | null
  enabled: boolean
  status: string
  isVerified?: boolean
  assignedToId?: number | null
}

export type SenderOption = InboxSenderAccount

export interface InboxThreadSummary {
  id?: number
  leadId: number
  name?: string
  leadName: string
  company?: string | null
  leadCompany: string | null
  email?: string | null
  leadEmail: string | null
  mobile?: string | null
  leadMobile: string | null
  leadTelegramPeer: string | null
  status?: LeadStatus | string
  threadState?: InboxThreadState
  assignmentState?: 'assigned' | 'unassigned' | 'assigned_to_me'
  channel: InboxChannel
  threadKey: string
  subject: string | null
  senderDisplay: string | null
  senderAccountId: number | null
  assignedEmailAccountId: number | null
  assignedToId: number | null
  unread: boolean
  replyNeeded: boolean
  lastMessage: string
  lastMessagePreview?: string
  lastMessageAt: string
  lastInboundAt: string | null
  lastOutboundAt: string | null
  messageCount: number
  messages?: Array<{
    content: string
    direction: string
    createdAt: string
  }>
}

export interface InboxMessage {
  id: number
  leadId: number
  channel: InboxChannel
  direction: 'outbound' | 'inbound'
  content: string
  subject: string | null
  status: InboxMessageStatus
  pricingCategory?: string | null
  pricingType?: string | null
  billable?: boolean | null
  createdAt: string
  sentAt: string | null
  senderAccountId: number | null
  senderDisplay: string | null
  emailAccountId: number | null
  emailMessageId: string | null
  emailInReplyTo: string | null
  waAccount: number | null
  providerMessageId?: string | null
  replyToMessageId: number | null
  mediaUrl: string | null
  mediaType: string | null
  mediaCaption: string | null
  mediaFilename: string | null
}

export interface InboxThreadDetail extends InboxThreadSummary {
  messages: InboxMessage[]
  senderAccount: InboxSenderAccount | null
  availableSenderAccounts?: InboxSenderAccount[]
  threadStatus?: 'open' | 'waiting' | 'resolved' | 'archived'
  assignedUserId?: number | null
  assignedUserName?: string | null
}

export interface InboxThreadListResponse {
  threads: InboxThreadSummary[]
  total: number
  page: number
  pages: number
  unread: number
  needsReply: number
}

export interface InboxSendPayload {
  leadId: number
  channel: InboxChannel
  text?: string
  subject?: string | null
  body?: string | null
  htmlBody?: string | null
  accountId?: number | null
  replyToMessageId?: number | null
  templateId?: number | null
  attachmentIds?: number[]
  cc?: string
  bcc?: string
  scheduledAt?: string
  idempotencyKey?: string
}

export interface MediaFile {
  id: number
  filename: string
  originalName: string
  mimeType: string
  size: number
  path: string
  createdAt: string
}

export interface InboxSendResponse {
  success: boolean
  message?: InboxMessage
  thread?: InboxThreadDetail
  error?: string
}
