package space.outboundos.android.navigation

object Routes {
    const val Queue = "queue"
    const val Stalled = "stalled"
    const val ConversationPattern = "conversation/{leadId}"

    fun conversation(leadId: Long) = "conversation/$leadId"
}
