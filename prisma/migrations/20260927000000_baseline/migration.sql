-- Full schema as of the first Outbound OS release. Earlier installs built their
-- database with `prisma db push`, so the migration history they carried could
-- not recreate the schema from an empty database. This baseline can.

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'agent',
    "phone" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lead" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "indiamartId" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "country" TEXT,
    "product" TEXT,
    "quantity" TEXT,
    "strength" TEXT,
    "brand" TEXT,
    "source" TEXT NOT NULL DEFAULT 'indiamart',
    "importBatchId" INTEGER,
    "indiaMartAccountId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'new',
    "assignedToId" INTEGER,
    "isOnWhatsApp" BOOLEAN,
    "assignedAccount" INTEGER NOT NULL DEFAULT 0,
    "emailStatus" TEXT NOT NULL DEFAULT 'none',
    "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
    "emailOptOutAt" DATETIME,
    "emailMarketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "emailMarketingConsentAt" DATETIME,
    "emailMarketingConsentSource" TEXT,
    "assignedEmailAccountId" INTEGER,
    "imessageStatus" TEXT NOT NULL DEFAULT 'none',
    "assignedIMessageAccountId" INTEGER,
    "imessageFollowupCount" INTEGER NOT NULL DEFAULT 0,
    "lastImessageAt" DATETIME,
    "telegramPeer" TEXT,
    "telegramStatus" TEXT NOT NULL DEFAULT 'none',
    "assignedTelegramAccountId" INTEGER,
    "followupCount" INTEGER NOT NULL DEFAULT 0,
    "emailFollowupCount" INTEGER NOT NULL DEFAULT 0,
    "maxFollowups" INTEGER NOT NULL DEFAULT 5,
    "lastMessageAt" DATETIME,
    "lastEmailAt" DATETIME,
    "repliedAt" DATETIME,
    "score" INTEGER NOT NULL DEFAULT 0,
    "replySpeed" TEXT,
    "engagementLevel" TEXT NOT NULL DEFAULT 'none',
    "consumedAt" DATETIME,
    "leadTier" TEXT,
    "leadTierUpdatedAt" DATETIME,
    "notes" TEXT,
    "tags" TEXT,
    "lastError" TEXT,
    "lastErrorAt" DATETIME,
    "lastReplyIntent" TEXT,
    "aiInsights" TEXT,
    "enrichedData" TEXT,
    "dealValue" REAL,
    "convertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "poolId" INTEGER,
    CONSTRAINT "Lead_indiaMartAccountId_fkey" FOREIGN KEY ("indiaMartAccountId") REFERENCES "IndiaMartAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedIMessageAccountId_fkey" FOREIGN KEY ("assignedIMessageAccountId") REFERENCES "IMessageAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedTelegramAccountId_fkey" FOREIGN KEY ("assignedTelegramAccountId") REFERENCES "TelegramAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "LeadPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "content" TEXT NOT NULL,
    "waAccount" INTEGER NOT NULL DEFAULT 0,
    "emailAccountId" INTEGER,
    "imessageAccountId" INTEGER,
    "telegramAccountId" INTEGER,
    "indiaMartAccountId" INTEGER,
    "indiaMartConversationId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "campaignId" INTEGER,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waMessageId" TEXT,
    "ackStatus" INTEGER NOT NULL DEFAULT 0,
    "ackUpdatedAt" DATETIME,
    "waCampaignName" TEXT,
    "waTemplateParams" TEXT,
    "emailSubject" TEXT,
    "emailHtmlBody" TEXT,
    "emailMessageId" TEXT,
    "emailInReplyTo" TEXT,
    "imessageMessageId" TEXT,
    "telegramMessageId" TEXT,
    "providerMessageId" TEXT,
    "providerCampaignId" TEXT,
    "providerCreatedAt" DATETIME,
    "providerStatusReason" TEXT,
    "idempotencyKey" TEXT,
    "automationKey" TEXT,
    "emailCc" TEXT,
    "emailBcc" TEXT,
    "templateVariant" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mediaCaption" TEXT,
    "mediaFilename" TEXT,
    CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_imessageAccountId_fkey" FOREIGN KEY ("imessageAccountId") REFERENCES "IMessageAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_telegramAccountId_fkey" FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_indiaMartAccountId_fkey" FOREIGN KEY ("indiaMartAccountId") REFERENCES "IndiaMartAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_indiaMartConversationId_fkey" FOREIGN KEY ("indiaMartConversationId") REFERENCES "IndiaMartConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhatsAppNumberCheck" (
    "tenantId" INTEGER,
    "phone" TEXT NOT NULL PRIMARY KEY,
    "isRegistered" BOOLEAN NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Campaign" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "poolId" INTEGER,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "messageTemplate" TEXT NOT NULL,
    "emailSubject" TEXT,
    "emailTemplateId" INTEGER,
    "senderAccountId" INTEGER,
    "waCampaignName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "targetFilter" TEXT,
    "variantBTemplate" TEXT,
    "variantBSubject" TEXT,
    "variantACount" INTEGER NOT NULL DEFAULT 0,
    "variantBCount" INTEGER NOT NULL DEFAULT 0,
    "variantAReplies" INTEGER NOT NULL DEFAULT 0,
    "variantBReplies" INTEGER NOT NULL DEFAULT 0,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CampaignLead" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "variant" TEXT NOT NULL DEFAULT 'A',
    CONSTRAINT "CampaignLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WhatsAppAccount" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "role" TEXT NOT NULL DEFAULT 'outreach',
    "waAccountType" TEXT NOT NULL DEFAULT 'cloud_api',
    "aisensyProjectId" TEXT NOT NULL DEFAULT '',
    "aisensyApiKey" TEXT NOT NULL DEFAULT '',
    "aisensyCampaignApiKey" TEXT NOT NULL DEFAULT '',
    "defaultCampaignName" TEXT NOT NULL DEFAULT '',
    "cloudApiToken" TEXT NOT NULL DEFAULT '',
    "cloudApiPhoneId" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoSleep" BOOLEAN NOT NULL DEFAULT true,
    "personaName" TEXT NOT NULL DEFAULT '',
    "personaGender" TEXT NOT NULL DEFAULT '',
    "personaTitle" TEXT NOT NULL DEFAULT 'sales representative',
    "companyName" TEXT NOT NULL DEFAULT '',
    "companyCity" TEXT NOT NULL DEFAULT '',
    "companyIndustry" TEXT NOT NULL DEFAULT '',
    "companyCerts" TEXT NOT NULL DEFAULT '',
    "companyUSP" TEXT NOT NULL DEFAULT '',
    "hourlyLimit" INTEGER NOT NULL DEFAULT 2,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "newLeadsPerDay" INTEGER NOT NULL DEFAULT 5,
    "maxFollowups" INTEGER NOT NULL DEFAULT 5,
    "followupDelays" TEXT NOT NULL DEFAULT '[0,240,1440,2880,4320]',
    "messagesSentToday" INTEGER NOT NULL DEFAULT 0,
    "newLeadsContactedToday" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "accountId" INTEGER,
    "leadId" INTEGER,
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '[]',
    "secret" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" DATETIME,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT NOT NULL DEFAULT '',
    "variables" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT NOT NULL DEFAULT 'outreach',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WebhookSource" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "fieldMap" TEXT NOT NULL DEFAULT '{}',
    "poolId" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastReceivedAt" DATETIME,
    "totalReceived" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'note',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadTask" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" DATETIME,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'custom',
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT NOT NULL,
    "smtpPass" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL DEFAULT '',
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapUser" TEXT NOT NULL DEFAULT '',
    "imapPass" TEXT NOT NULL DEFAULT '',
    "senderName" TEXT NOT NULL DEFAULT '',
    "signature" TEXT NOT NULL DEFAULT '',
    "whatsappAccountId" INTEGER,
    "dailyLimit" INTEGER NOT NULL DEFAULT 200,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 30,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailAccount_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadPool" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserPool" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "poolId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'agent',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPool_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPool_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "LeadPool" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadPoolWhatsApp" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "poolId" INTEGER NOT NULL,
    "whatsappAccountId" INTEGER NOT NULL,
    CONSTRAINT "LeadPoolWhatsApp_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "LeadPool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadPoolWhatsApp_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadPoolEmail" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "poolId" INTEGER NOT NULL,
    "emailAccountId" INTEGER NOT NULL,
    CONSTRAINT "LeadPoolEmail_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "LeadPool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadPoolEmail_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitation" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'agent',
    "poolId" INTEGER,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdById" INTEGER NOT NULL,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "LeadPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IMessageAccount" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "serverUrl" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "appleId" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastPingAt" DATETIME,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 15,
    "dailyLimit" INTEGER NOT NULL DEFAULT 100,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TelegramAccount" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "apiId" INTEGER NOT NULL,
    "apiHash" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "session" TEXT NOT NULL DEFAULT '',
    "pendingSession" TEXT NOT NULL DEFAULT '',
    "phoneCodeHash" TEXT NOT NULL DEFAULT '',
    "telegramUserId" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "manualOnly" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastError" TEXT,
    "lastConnectedAt" DATETIME,
    "dailyLimit" INTEGER NOT NULL DEFAULT 40,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL DEFAULT '',
    "workEmail" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "teamSize" TEXT NOT NULL DEFAULT '',
    "monthlyLeadVolume" TEXT NOT NULL DEFAULT '',
    "primaryChannel" TEXT NOT NULL DEFAULT '',
    "currentWorkflow" TEXT NOT NULL DEFAULT '',
    "painPoint" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'website',
    "status" TEXT NOT NULL DEFAULT 'new',
    "ipHash" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IndiaMartAccount" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sellerPhone" TEXT NOT NULL DEFAULT '',
    "glusrId" TEXT NOT NULL DEFAULT '',
    "connectorMode" TEXT NOT NULL DEFAULT 'browser',
    "cookie" TEXT NOT NULL DEFAULT '',
    "browserProfileDir" TEXT NOT NULL DEFAULT '',
    "targetPoolId" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastError" TEXT,
    "lastErrorAt" DATETIME,
    "lastPollAt" DATETIME,
    "lastLeadAt" DATETIME,
    "chatSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "chatSendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "chatStatus" TEXT NOT NULL DEFAULT 'disabled',
    "chatLastSyncAt" DATETIME,
    "chatLastMessageAt" DATETIME,
    "chatLastError" TEXT,
    "chatCursor" TEXT,
    "maxLeadsPerPoll" INTEGER NOT NULL DEFAULT 50,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IndiaMartAccount_targetPoolId_fkey" FOREIGN KEY ("targetPoolId") REFERENCES "LeadPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndiaMartConversation" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "indiaMartAccountId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "remoteConversationId" TEXT NOT NULL,
    "buyerGlid" TEXT NOT NULL DEFAULT '',
    "buyerName" TEXT NOT NULL DEFAULT '',
    "buyerCompany" TEXT NOT NULL DEFAULT '',
    "buyerCountry" TEXT NOT NULL DEFAULT '',
    "buyerMobile" TEXT NOT NULL DEFAULT '',
    "product" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessagePreview" TEXT NOT NULL DEFAULT '',
    "lastMessageAt" DATETIME,
    "lastInboundAt" DATETIME,
    "lastOutboundAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "syncCursor" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IndiaMartConversation_indiaMartAccountId_fkey" FOREIGN KEY ("indiaMartAccountId") REFERENCES "IndiaMartAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IndiaMartConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "requestIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "billingEmail" TEXT,
    "country" TEXT,
    "gstin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "maxSeats" INTEGER,
    "maxWhatsAppNumbers" INTEGER,
    "maxMailboxes" INTEGER,
    "maxMonthlyMessages" INTEGER,
    "maxLeads" INTEGER,
    "features" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "interval" TEXT NOT NULL DEFAULT 'month',
    "externalId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "provider" TEXT,
    "providerSubId" TEXT,
    "providerCustomerId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "trialEndsAt" DATETIME,
    "cancelAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "subscriptionId" INTEGER,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "placeOfSupply" TEXT,
    "taxRate" INTEGER,
    "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" DATETIME,
    "dueAt" DATETIME,
    "paidAt" DATETIME,
    "providerInvoiceId" TEXT,
    "pdfUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "method" TEXT,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "failureReason" TEXT,
    "capturedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UsageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProvisioningJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" TEXT,
    "nextAction" TEXT,
    "lastError" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProvisioningJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "leadId" INTEGER,
    "customerId" INTEGER,
    "supplierId" INTEGER,
    "paymentMethodId" INTEGER,
    "orderNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "customerName" TEXT NOT NULL,
    "customerCompany" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "country" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "incoterms" TEXT,
    "portOfDestination" TEXT,
    "paymentTerms" TEXT,
    "feeMode" TEXT NOT NULL DEFAULT 'absorb',
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "fxRateToInr" INTEGER,
    "amountReceivedInr" INTEGER,
    "procurementCostInr" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesOrder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER,
    "productName" TEXT NOT NULL,
    "strength" TEXT,
    "packing" TEXT,
    "hsnCode" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "lineTotal" INTEGER NOT NULL DEFAULT 0,
    "procurementUnitCost" INTEGER NOT NULL DEFAULT 0,
    "procurementTotal" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SalesOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "orderId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "taxRate" INTEGER,
    "placeOfSupply" TEXT,
    "issuedAt" DATETIME,
    "dueAt" DATETIME,
    "paidAt" DATETIME,
    "pdfUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "orderId" INTEGER NOT NULL,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastStatusRaw" TEXT,
    "lastCheckedAt" DATETIME,
    "lastError" TEXT,
    "shippedAt" DATETIME,
    "estimatedDelivery" DATETIME,
    "deliveredAt" DATETIME,
    "packageCount" INTEGER,
    "weightGrams" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "leadId" INTEGER,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "gstin" TEXT,
    "taxId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notifyChannel" TEXT NOT NULL DEFAULT 'both',
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "lifetimeValue" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" DATETIME,
    "notes" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderNotification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "orderId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recipient" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "templateName" TEXT,
    "error" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderNotification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "name" TEXT NOT NULL,
    "feeBps" INTEGER NOT NULL DEFAULT 0,
    "feeFixed" INTEGER NOT NULL DEFAULT 0,
    "passOnByDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "name" TEXT NOT NULL,
    "matchTag" TEXT,
    "matchPriority" INTEGER NOT NULL DEFAULT 100,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "name" TEXT NOT NULL,
    "strength" TEXT,
    "packing" TEXT,
    "hsnCode" TEXT,
    "sku" TEXT,
    "defaultUnit" TEXT NOT NULL DEFAULT 'box',
    "sellPrice" INTEGER,
    "sellCurrency" TEXT NOT NULL DEFAULT 'USD',
    "costInr" INTEGER,
    "supplierId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "paymentMethodId" INTEGER,
    CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_leadTier_idx" ON "Lead"("leadTier");

-- CreateIndex
CREATE INDEX "Lead_score_idx" ON "Lead"("score");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_convertedAt_idx" ON "Lead"("convertedAt");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_assignedAccount_idx" ON "Lead"("assignedAccount");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "Lead_poolId_idx" ON "Lead"("poolId");

-- CreateIndex
CREATE INDEX "Lead_assignedTelegramAccountId_idx" ON "Lead"("assignedTelegramAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_tenantId_indiamartId_key" ON "Lead"("tenantId", "indiamartId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_tenantId_mobile_key" ON "Lead"("tenantId", "mobile");

-- CreateIndex
CREATE INDEX "Message_leadId_idx" ON "Message"("leadId");

-- CreateIndex
CREATE INDEX "Message_status_idx" ON "Message"("status");

-- CreateIndex
CREATE INDEX "Message_scheduledAt_idx" ON "Message"("scheduledAt");

-- CreateIndex
CREATE INDEX "Message_channel_idx" ON "Message"("channel");

-- CreateIndex
CREATE INDEX "Message_imessageAccountId_idx" ON "Message"("imessageAccountId");

-- CreateIndex
CREATE INDEX "Message_telegramAccountId_idx" ON "Message"("telegramAccountId");

-- CreateIndex
CREATE INDEX "Message_templateVariant_idx" ON "Message"("templateVariant");

-- CreateIndex
CREATE INDEX "Message_waMessageId_idx" ON "Message"("waMessageId");

-- CreateIndex
CREATE INDEX "Message_providerCampaignId_idx" ON "Message"("providerCampaignId");

-- CreateIndex
CREATE INDEX "Message_ackStatus_idx" ON "Message"("ackStatus");

-- CreateIndex
CREATE INDEX "Message_indiaMartAccountId_idx" ON "Message"("indiaMartAccountId");

-- CreateIndex
CREATE INDEX "Message_indiaMartConversationId_idx" ON "Message"("indiaMartConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_indiaMartAccountId_providerMessageId_key" ON "Message"("channel", "indiaMartAccountId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_indiaMartAccountId_idempotencyKey_key" ON "Message"("channel", "indiaMartAccountId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_tenantId_imessageMessageId_key" ON "Message"("tenantId", "imessageMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_telegramAccountId_telegramMessageId_key" ON "Message"("telegramAccountId", "telegramMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_tenantId_automationKey_key" ON "Message"("tenantId", "automationKey");

-- CreateIndex
CREATE INDEX "CampaignLead_campaignId_idx" ON "CampaignLead"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignLead_status_idx" ON "CampaignLead"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignLead_campaignId_leadId_key" ON "CampaignLead"("campaignId", "leadId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_type_createdAt_idx" ON "ActivityLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_leadId_idx" ON "ActivityLog"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookSource_source_key" ON "WebhookSource"("source");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_tenantId_email_key" ON "EmailAccount"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "LeadPool_tenantId_slug_key" ON "LeadPool"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "UserPool_poolId_idx" ON "UserPool"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPool_userId_poolId_key" ON "UserPool"("userId", "poolId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadPoolWhatsApp_poolId_whatsappAccountId_key" ON "LeadPoolWhatsApp"("poolId", "whatsappAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadPoolEmail_poolId_emailAccountId_key" ON "LeadPoolEmail"("poolId", "emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_createdAt_idx" ON "Invitation"("createdAt");

-- CreateIndex
CREATE INDEX "TelegramAccount_enabled_idx" ON "TelegramAccount"("enabled");

-- CreateIndex
CREATE INDEX "TelegramAccount_status_idx" ON "TelegramAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccount_apiId_phoneNumber_key" ON "TelegramAccount"("apiId", "phoneNumber");

-- CreateIndex
CREATE INDEX "AccessRequest_createdAt_idx" ON "AccessRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AccessRequest_status_idx" ON "AccessRequest"("status");

-- CreateIndex
CREATE INDEX "AccessRequest_workEmail_idx" ON "AccessRequest"("workEmail");

-- CreateIndex
CREATE INDEX "AccessRequest_company_idx" ON "AccessRequest"("company");

-- CreateIndex
CREATE INDEX "IndiaMartAccount_enabled_idx" ON "IndiaMartAccount"("enabled");

-- CreateIndex
CREATE INDEX "IndiaMartAccount_targetPoolId_idx" ON "IndiaMartAccount"("targetPoolId");

-- CreateIndex
CREATE INDEX "IndiaMartConversation_indiaMartAccountId_lastMessageAt_idx" ON "IndiaMartConversation"("indiaMartAccountId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "IndiaMartConversation_leadId_idx" ON "IndiaMartConversation"("leadId");

-- CreateIndex
CREATE INDEX "IndiaMartConversation_buyerGlid_idx" ON "IndiaMartConversation"("buyerGlid");

-- CreateIndex
CREATE INDEX "IndiaMartConversation_status_idx" ON "IndiaMartConversation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IndiaMartConversation_indiaMartAccountId_remoteConversationId_key" ON "IndiaMartConversation"("indiaMartAccountId", "remoteConversationId");

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_expiresAt_idx" ON "PhoneOtp"("phone", "expiresAt");

-- CreateIndex
CREATE INDEX "PhoneOtp_expiresAt_idx" ON "PhoneOtp"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_planId_currency_interval_key" ON "PlanPrice"("planId", "currency", "interval");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_provider_providerSubId_key" ON "Subscription"("provider", "providerSubId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_status_idx" ON "Payment"("invoiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_periodStart_idx" ON "UsageRecord"("tenantId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_tenantId_metric_periodStart_key" ON "UsageRecord"("tenantId", "metric", "periodStart");

-- CreateIndex
CREATE INDEX "ProvisioningJob_tenantId_status_idx" ON "ProvisioningJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProvisioningJob_kind_status_idx" ON "ProvisioningJob"("kind", "status");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE INDEX "SalesOrder_leadId_idx" ON "SalesOrder"("leadId");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");

-- CreateIndex
CREATE INDEX "SalesOrder_supplierId_idx" ON "SalesOrder"("supplierId");

-- CreateIndex
CREATE INDEX "SalesOrder_createdAt_idx" ON "SalesOrder"("createdAt");

-- CreateIndex
CREATE INDEX "SalesOrder_tenantId_status_idx" ON "SalesOrder"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_tenantId_orderNumber_key" ON "SalesOrder"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "SalesOrderItem_orderId_idx" ON "SalesOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");

-- CreateIndex
CREATE INDEX "SalesInvoice_orderId_idx" ON "SalesInvoice"("orderId");

-- CreateIndex
CREATE INDEX "SalesInvoice_status_idx" ON "SalesInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_tenantId_number_key" ON "SalesInvoice"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_leadId_key" ON "Customer"("leadId");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_lastOrderAt_idx" ON "Customer"("lastOrderAt");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_tenantId_status_idx" ON "Customer"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OrderNotification_orderId_idx" ON "OrderNotification"("orderId");

-- CreateIndex
CREATE INDEX "OrderNotification_customerId_idx" ON "OrderNotification"("customerId");

-- CreateIndex
CREATE INDEX "OrderNotification_status_idx" ON "OrderNotification"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderNotification_orderId_event_channel_key" ON "OrderNotification"("orderId", "event", "channel");

-- CreateIndex
CREATE INDEX "PaymentMethod_enabled_idx" ON "PaymentMethod"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_tenantId_name_key" ON "PaymentMethod"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Supplier_enabled_idx" ON "Supplier"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_name_key" ON "Supplier"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_name_strength_key" ON "Product"("tenantId", "name", "strength");

