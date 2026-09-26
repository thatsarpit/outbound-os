package space.outboundos.android.ui.screens.conversation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.AssignmentInd
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.CheckCircleOutline
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import space.outboundos.android.model.Channel
import space.outboundos.android.model.Conversation
import space.outboundos.android.model.ConversationMessage
import space.outboundos.android.model.Lead
import space.outboundos.android.model.SenderAccount
import space.outboundos.android.model.ThreadSummary
import space.outboundos.android.ui.components.ChannelIcon
import space.outboundos.android.ui.components.EmptyState
import space.outboundos.android.ui.components.ErrorBanner
import space.outboundos.android.ui.components.LoadingState
import space.outboundos.android.ui.screens.drafts.DraftApprovalScreen
import space.outboundos.android.ui.theme.OutboundOsTheme
import space.outboundos.android.util.formatMessageTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(
    state: ConversationUiState,
    onUp: () -> Unit,
    onCall: (String) -> Unit,
    onRefresh: () -> Unit,
    onComposerText: (String) -> Unit,
    onComposerSubject: (String) -> Unit,
    onGenerateDraft: () -> Unit,
    onSendManual: () -> Unit,
    onDraftText: (String) -> Unit,
    onDraftSubject: (String) -> Unit,
    onApproveDraft: () -> Unit,
    onDismissDraft: () -> Unit,
    onAssignSelf: () -> Unit,
    onToggleResolved: () -> Unit,
    onNoticeShown: () -> Unit,
) {
    val snackbar = remember { SnackbarHostState() }
    var menuOpen by remember { mutableStateOf(false) }
    val conversation = state.conversation
    val summary = conversation?.summary

    LaunchedEffect(state.notice) {
        state.notice?.let {
            snackbar.showSnackbar(it)
            onNoticeShown()
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(summary?.leadName ?: "Conversation", maxLines = 1, overflow = TextOverflow.Ellipsis)
                        summary?.let {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                ChannelIcon(it.channel)
                                Text(it.channel.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onUp) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
                },
                actions = {
                    IconButton(
                        onClick = { summary?.leadMobile?.let(onCall) },
                        enabled = !summary?.leadMobile.isNullOrBlank(),
                    ) { Icon(Icons.Outlined.Call, "Call contact") }
                    IconButton(onClick = { menuOpen = true }) { Icon(Icons.Outlined.MoreVert, "Conversation actions") }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("Assign to me") },
                            leadingIcon = { Icon(Icons.Outlined.AssignmentInd, null) },
                            enabled = !state.actionInProgress,
                            onClick = { menuOpen = false; onAssignSelf() },
                        )
                        DropdownMenuItem(
                            text = { Text(if (summary?.threadState == "resolved") "Reopen" else "Resolve") },
                            leadingIcon = { Icon(Icons.Outlined.CheckCircleOutline, null) },
                            enabled = !state.actionInProgress,
                            onClick = { menuOpen = false; onToggleResolved() },
                        )
                        DropdownMenuItem(
                            text = { Text("Refresh") },
                            leadingIcon = { Icon(Icons.Outlined.Refresh, null) },
                            onClick = { menuOpen = false; onRefresh() },
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            if (conversation != null) {
                ReplyComposer(
                    state = state,
                    onText = onComposerText,
                    onSubject = onComposerSubject,
                    onGenerateDraft = onGenerateDraft,
                    onSend = onSendManual,
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { insets ->
        when {
            state.loading -> LoadingState("Loading history", Modifier.padding(insets))
            conversation == null && state.error != null -> Box(Modifier.fillMaxSize().padding(insets).padding(16.dp)) {
                ErrorBanner(state.error, onRetry = onRefresh)
            }
            conversation != null -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(insets),
                contentPadding = PaddingValues(start = 12.dp, top = 8.dp, end = 12.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item { ContactContextCard(conversation, state.lead) }
                state.error?.let { message -> item { ErrorBanner(message) } }
                if (conversation.messages.isEmpty()) {
                    item { EmptyState("No history yet", "Start the conversation from the composer below.") }
                } else {
                    itemsIndexed(conversation.messages, key = { _, message -> message.id }) { index, message ->
                        MessageBubble(
                            message = message,
                            showChannel = index == 0 || conversation.messages[index - 1].channel != message.channel,
                        )
                    }
                }
            }
        }
    }

    if (state.draftSheetOpen && state.draft != null) {
        // Approval is a short, reversible task that benefits from keeping the
        // conversation visible behind it. A modal bottom sheet also participates
        // in Material's predictive-back dismissal; a dialog would obscure context.
        ModalBottomSheet(onDismissRequest = onDismissDraft) {
            DraftApprovalScreen(
                draft = state.draft,
                sending = state.sending,
                onTextChange = onDraftText,
                onSubjectChange = onDraftSubject,
                onApprove = onApproveDraft,
                onDismiss = onDismissDraft,
            )
        }
    }
}

@Composable
private fun ContactContextCard(conversation: Conversation, lead: Lead?) {
    val summary = conversation.summary
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(summary.leadCompany ?: summary.leadName, style = MaterialTheme.typography.titleSmall)
                    Text(
                        listOfNotNull(summary.leadMobile, summary.leadEmail).joinToString(" · ").ifBlank { "No contact details" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                lead?.tier?.let { AssistChip(onClick = {}, label = { Text(it.lowercase().replaceFirstChar(Char::uppercase)) }) }
            }
            val productLine = listOfNotNull(lead?.product, lead?.quantity).joinToString(" · ")
            if (productLine.isNotBlank()) {
                HorizontalDivider()
                Text(productLine, style = MaterialTheme.typography.bodySmall)
            }
            conversation.assignedUserName?.let {
                Text("Assigned to $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ConversationMessage, showChannel: Boolean) {
    val outbound = message.direction == "outbound"
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (outbound) Alignment.End else Alignment.Start,
    ) {
        if (showChannel) {
            Row(
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                ChannelIcon(message.channel)
                Text(message.channel.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Card(
            modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth(if (message.channel == Channel.Email) 0.94f else 0.84f),
            colors = CardDefaults.cardColors(
                containerColor = if (outbound) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface,
            ),
            border = CardDefaults.outlinedCardBorder(),
            elevation = CardDefaults.cardElevation(0.dp),
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 9.dp)) {
                message.subject?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.titleSmall)
                    HorizontalDivider(Modifier.padding(vertical = 6.dp))
                }
                Text(message.content.ifBlank { "Message content unavailable" }, style = MaterialTheme.typography.bodyMedium)
                Row(Modifier.align(Alignment.End).padding(top = 5.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(formatMessageTime(message.sentAt ?: message.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (outbound && message.status.isNotBlank()) {
                        Text(message.status, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReplyComposer(
    state: ConversationUiState,
    onText: (String) -> Unit,
    onSubject: (String) -> Unit,
    onGenerateDraft: () -> Unit,
    onSend: () -> Unit,
) {
    val conversation = state.conversation ?: return
    val summary = conversation.summary
    val channel = summary.channel
    val channelReady = when (channel) {
        Channel.Email -> conversation.availableSenders.any { it.channel == Channel.Email && it.enabled }
        Channel.IndiaMart -> summary.conversationId != null
        Channel.Other -> false
        Channel.WhatsApp -> true
    }
    Surface(
        tonalElevation = 2.dp,
        shadowElevation = 2.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 9.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            if (channel == Channel.Email) {
                OutlinedTextField(
                    value = state.composerSubject,
                    onValueChange = onSubject,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Subject") },
                    singleLine = true,
                )
            }
            OutlinedTextField(
                value = state.composerText,
                onValueChange = onText,
                modifier = Modifier.fillMaxWidth(),
                label = {
                    Text(
                        when {
                            channel == Channel.Other -> "Use the web dashboard for this channel"
                            !channelReady -> "Channel is not ready for this conversation"
                            else -> "Reply"
                        },
                    )
                },
                enabled = channelReady,
                minLines = 1,
                maxLines = 4,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onGenerateDraft,
                    modifier = Modifier.weight(1f),
                    enabled = !state.generatingDraft && !state.sending && channelReady,
                ) {
                    Icon(Icons.Outlined.AutoAwesome, null)
                    Text(if (state.generatingDraft) "Drafting…" else "Draft reply", Modifier.padding(start = 6.dp))
                }
                Button(
                    onClick = onSend,
                    modifier = Modifier.weight(1f),
                    enabled = state.composerText.isNotBlank() &&
                        (channel != Channel.Email || state.composerSubject.isNotBlank()) &&
                        !state.sending && channelReady,
                ) {
                    Icon(Icons.AutoMirrored.Outlined.Send, null)
                    Text(if (state.sending) "Sending…" else channel.sendVerb, Modifier.padding(start = 6.dp), maxLines = 1)
                }
            }
        }
    }
}

private val previewSummary = ThreadSummary(
    leadId = 1,
    leadName = "Preview contact",
    leadCompany = "Example company",
    leadEmail = "preview@example.com",
    leadMobile = "+91 ••••• ••000",
    channel = Channel.WhatsApp,
    subject = null,
    senderDisplay = null,
    conversationId = null,
    unread = true,
    replyNeeded = true,
    threadState = "needs_reply",
    lastMessage = "Could you share the minimum order quantity?",
    lastMessageAt = "2026-09-01T09:30:00Z",
    lastInboundAt = "2026-09-01T09:30:00Z",
    lastOutboundAt = null,
    messageCount = 2,
)

private val previewConversation = Conversation(
    summary = previewSummary,
    messages = listOf(
        ConversationMessage(1, Channel.WhatsApp, "outbound", "Placeholder introduction from the team.", null, "delivered", "2026-08-31T09:00:00Z", "2026-08-31T09:00:00Z"),
        ConversationMessage(2, Channel.WhatsApp, "inbound", "Could you share the minimum order quantity?", null, "read", "2026-09-01T09:30:00Z", null),
    ),
    availableSenders = listOf(SenderAccount(1, Channel.WhatsApp, "Preview sender", null, true, "ready")),
    assignedUserName = "Preview agent",
)

@Preview(showBackground = true, widthDp = 412, heightDp = 860, name = "Conversation — phone")
@Composable
private fun ConversationScreenPreview() {
    OutboundOsTheme(dynamicColor = false) {
        ConversationScreen(
            state = ConversationUiState(loading = false, conversation = previewConversation),
            onUp = {}, onCall = {}, onRefresh = {}, onComposerText = {}, onComposerSubject = {},
            onGenerateDraft = {}, onSendManual = {}, onDraftText = {}, onDraftSubject = {},
            onApproveDraft = {}, onDismissDraft = {}, onAssignSelf = {}, onToggleResolved = {}, onNoticeShown = {},
        )
    }
}
