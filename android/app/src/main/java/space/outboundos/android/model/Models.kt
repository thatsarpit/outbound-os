package space.outboundos.android.model

enum class Channel(val wireName: String, val label: String, val sendVerb: String) {
    WhatsApp("whatsapp", "WhatsApp", "Send WhatsApp"),
    Email("email", "Email", "Send email"),
    IndiaMart("indiamart", "IndiaMART", "Send message"),
    Other("other", "Other", "Send message");

    companion object {
        // Unknown providers are neutral instead of being mislabeled WhatsApp.
        fun fromWire(value: String?): Channel = entries.firstOrNull { it.wireName == value } ?: Other
    }
}

data class Session(
    val token: String? = null,
    val userName: String? = null,
    val userEmail: String? = null,
) {
    val isAuthenticated: Boolean get() = !token.isNullOrBlank()
}

data class ThreadSummary(
    val leadId: Long,
    val leadName: String,
    val leadCompany: String?,
    val leadEmail: String?,
    val leadMobile: String?,
    val channel: Channel,
    val subject: String?,
    val senderDisplay: String?,
    val conversationId: Long?,
    val unread: Boolean,
    val replyNeeded: Boolean,
    val threadState: String?,
    val lastMessage: String,
    val lastMessageAt: String,
    val lastInboundAt: String?,
    val lastOutboundAt: String?,
    val messageCount: Int,
)

data class ThreadPage(
    val threads: List<ThreadSummary> = emptyList(),
    val total: Int = 0,
    val unread: Int = 0,
    val needsReply: Int = 0,
)

data class ConversationMessage(
    val id: Long,
    val channel: Channel,
    val direction: String,
    val content: String,
    val subject: String?,
    val status: String,
    val createdAt: String,
    val sentAt: String?,
)

data class SenderAccount(
    val id: Long,
    val channel: Channel,
    val name: String,
    val email: String?,
    val enabled: Boolean,
    val status: String,
)

data class Conversation(
    val summary: ThreadSummary,
    val messages: List<ConversationMessage>,
    val availableSenders: List<SenderAccount>,
    val assignedUserName: String?,
)

data class Lead(
    val id: Long,
    val name: String,
    val company: String?,
    val mobile: String?,
    val email: String?,
    val country: String?,
    val product: String?,
    val quantity: String?,
    val source: String?,
    val status: String?,
    val score: Int?,
    val tier: String?,
    val lastMessageAt: String?,
)

data class Draft(
    val leadId: Long,
    val channel: Channel,
    val text: String,
    val subject: String? = null,
    val accountId: Long? = null,
)

data class OverviewStats(
    val totalLeads: Int = 0,
    val newToday: Int = 0,
    val pending: Int = 0,
    val replied: Int = 0,
)

data class SystemHealth(
    val overall: String = "unknown",
    val issues: List<String> = emptyList(),
)

data class CampaignSummary(
    val id: Long,
    val name: String,
    val status: String,
)
