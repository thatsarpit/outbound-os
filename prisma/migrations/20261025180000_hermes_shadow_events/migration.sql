-- Capture only newly persisted inbound records, never historical backfill or sends.
-- SQLite triggers participate in the caller's business transaction, including rollback.
CREATE TABLE "HermesEventBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationKey" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" BIGINT NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" BIGINT,
  "lastStatus" INTEGER,
  "createdAt" BIGINT NOT NULL,
  "completedAt" BIGINT,
  -- This never-deployed migration is extended in place; keep schema.prisma in parity.
  "completionReceiptHash" TEXT
);
CREATE INDEX "HermesEventBatch_state_nextAttemptAt_idx" ON "HermesEventBatch"("state", "nextAttemptAt");
-- A successful HTTP receipt is not proof the agent has completed its draft.
CREATE UNIQUE INDEX "HermesEventBatch_active_conversation" ON "HermesEventBatch"("conversationKey")
  WHERE "state" IN ('pending', 'leased', 'accepted', 'blocked');

CREATE TABLE "HermesInboundEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "conversationKey" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "accountId" INTEGER,
  "leadId" INTEGER,
  "messageId" INTEGER,
  "receiptId" INTEGER,
  "createdAt" BIGINT NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  "batchId" TEXT,
  CONSTRAINT "HermesInboundEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HermesEventBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HermesInboundEvent_batchId_conversationKey_createdAt_idx" ON "HermesInboundEvent"("batchId", "conversationKey", "createdAt");

CREATE TRIGGER "hermes_inbound_message_insert" AFTER INSERT ON "Message"
WHEN NEW."direction" = 'inbound' AND (
  NEW."channel" = 'whatsapp' OR
  (NEW."channel" = 'email' AND NEW."emailInboundKind" = 'human' AND NEW."status" <> 'partial')
)
BEGIN
  INSERT OR IGNORE INTO "HermesInboundEvent" ("id", "eventType", "conversationKey", "channel", "accountId", "leadId", "messageId")
  VALUES ('message:' || NEW."id" || ':received', 'message.received',
    NEW."channel" || ':' || COALESCE(CASE WHEN NEW."channel" = 'email' THEN NEW."emailAccountId" ELSE NEW."waAccount" END, 0) || ':lead:' || NEW."leadId",
    NEW."channel", CASE WHEN NEW."channel" = 'email' THEN NEW."emailAccountId" ELSE NEW."waAccount" END, NEW."leadId", NEW."id");
END;

-- Emit only a newly usable human email, not read/ack changes to historical usable content.
CREATE TRIGGER "hermes_inbound_email_upgrade" AFTER UPDATE OF "status", "emailInboundKind" ON "Message"
WHEN NEW."direction" = 'inbound' AND NEW."channel" = 'email' AND NEW."emailInboundKind" = 'human' AND NEW."status" <> 'partial'
  AND COALESCE(OLD."direction" = 'inbound' AND OLD."channel" = 'email'
    AND OLD."emailInboundKind" = 'human' AND OLD."status" <> 'partial', 0) = 0
BEGIN
  INSERT OR IGNORE INTO "HermesInboundEvent" ("id", "eventType", "conversationKey", "channel", "accountId", "leadId", "messageId")
  VALUES ('message:' || NEW."id" || ':received', 'message.received',
    'email:' || COALESCE(NEW."emailAccountId", 0) || ':lead:' || NEW."leadId", 'email', NEW."emailAccountId", NEW."leadId", NEW."id");
END;

-- Held receipts have no lead. They require owner review, not automated customer replies.
CREATE TRIGGER "hermes_unmatched_receipt_insert" AFTER INSERT ON "InboundEmailReceipt"
WHEN NEW."state" = 'unmatched' AND NEW."messageId" IS NULL
BEGIN
  INSERT OR IGNORE INTO "HermesInboundEvent" ("id", "eventType", "conversationKey", "channel", "accountId", "receiptId")
  VALUES ('receipt:' || NEW."id" || ':unmatched', 'inbound.receipt_unmatched',
    'email:' || COALESCE(NEW."emailAccountId", 0) || ':receipt:' || NEW."id", 'email', NEW."emailAccountId", NEW."id");
END;
-- Only a newly unmatched, unlinked receipt qualifies; historical retry writes must not backfill.
CREATE TRIGGER "hermes_unmatched_receipt_update" AFTER UPDATE OF "state", "messageId" ON "InboundEmailReceipt"
WHEN NEW."state" = 'unmatched' AND NEW."messageId" IS NULL
  AND COALESCE(OLD."state" = 'unmatched' AND OLD."messageId" IS NULL, 0) = 0
BEGIN
  INSERT OR IGNORE INTO "HermesInboundEvent" ("id", "eventType", "conversationKey", "channel", "accountId", "receiptId")
  VALUES ('receipt:' || NEW."id" || ':unmatched', 'inbound.receipt_unmatched',
    'email:' || COALESCE(NEW."emailAccountId", 0) || ':receipt:' || NEW."id", 'email', NEW."emailAccountId", NEW."id");
END;
