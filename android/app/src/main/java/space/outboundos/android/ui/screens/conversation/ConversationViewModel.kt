package space.outboundos.android.ui.screens.conversation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import space.outboundos.android.data.repository.OutboundRepository
import space.outboundos.android.model.Channel
import space.outboundos.android.model.Conversation
import space.outboundos.android.model.Draft
import space.outboundos.android.model.Lead

data class ConversationUiState(
    val loading: Boolean = true,
    val conversation: Conversation? = null,
    val lead: Lead? = null,
    val composerText: String = "",
    val composerSubject: String = "",
    val generatingDraft: Boolean = false,
    val draft: Draft? = null,
    val draftSheetOpen: Boolean = false,
    val sending: Boolean = false,
    val actionInProgress: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

class ConversationViewModel(
    private val leadId: Long,
    private val repository: OutboundRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ConversationUiState())
    val state: StateFlow<ConversationUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.conversation == null, error = null) }
            runCatching {
                coroutineScope {
                    val conversation = async { repository.conversation(leadId) }
                    val lead = async { runCatching { repository.lead(leadId) }.getOrNull() }
                    conversation.await() to lead.await()
                }
            }.onSuccess { (conversation, lead) ->
                _state.update {
                    it.copy(
                        loading = false,
                        conversation = conversation,
                        lead = lead,
                        composerSubject = it.composerSubject.ifBlank { replySubject(conversation.summary.subject) },
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(loading = false, error = error.message ?: "Could not load the conversation") }
            }
        }
    }

    fun setComposerText(value: String) = _state.update { it.copy(composerText = value, error = null) }
    fun setComposerSubject(value: String) = _state.update { it.copy(composerSubject = value, error = null) }
    fun dismissNotice() = _state.update { it.copy(notice = null) }

    fun generateDraft() {
        val conversation = state.value.conversation ?: return
        viewModelScope.launch {
            _state.update { it.copy(generatingDraft = true, error = null) }
            runCatching {
                repository.generateDraft(
                    leadId,
                    conversation.summary.channel,
                    state.value.composerSubject.takeIf { conversation.summary.channel == Channel.Email },
                )
            }.onSuccess { draft ->
                val senderId = conversation.availableSenders
                    .firstOrNull { it.channel == conversation.summary.channel && it.enabled }
                    ?.id
                _state.update {
                    it.copy(
                        generatingDraft = false,
                        draft = draft.copy(accountId = senderId),
                        draftSheetOpen = true,
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(generatingDraft = false, error = error.message ?: "Could not generate a draft") }
            }
        }
    }

    fun editDraftText(value: String) = _state.update { state ->
        state.copy(draft = state.draft?.copy(text = value), error = null)
    }

    fun editDraftSubject(value: String) = _state.update { state ->
        state.copy(draft = state.draft?.copy(subject = value), error = null)
    }

    fun dismissDraft() = _state.update { it.copy(draftSheetOpen = false) }

    fun approveDraft() {
        val draft = state.value.draft ?: return
        send(draft)
    }

    fun sendManual() {
        val current = state.value
        val conversation = current.conversation ?: return
        if (current.composerText.isBlank()) {
            _state.update { it.copy(error = "Write a reply first") }
            return
        }
        send(
            Draft(
                leadId = leadId,
                channel = conversation.summary.channel,
                text = current.composerText,
                subject = current.composerSubject.takeIf { conversation.summary.channel == Channel.Email },
                accountId = conversation.availableSenders.firstOrNull { it.channel == conversation.summary.channel }?.id,
            ),
        )
    }

    private fun send(draft: Draft) {
        val conversation = state.value.conversation ?: return
        when {
            draft.text.isBlank() -> {
                _state.update { it.copy(error = "Write a reply first") }
                return
            }
            draft.channel == Channel.Email && draft.subject.isNullOrBlank() -> {
                _state.update { it.copy(error = "Email replies need a subject") }
                return
            }
            draft.channel == Channel.Email && conversation.availableSenders.none { it.channel == Channel.Email && it.enabled } -> {
                _state.update { it.copy(error = "No enabled email sender is available for this lead") }
                return
            }
            draft.channel == Channel.IndiaMart && conversation.summary.conversationId == null -> {
                _state.update { it.copy(error = "This lead is not linked to an IndiaMART conversation") }
                return
            }
        }
        viewModelScope.launch {
            _state.update { it.copy(sending = true, error = null) }
            runCatching { repository.sendDraft(draft, conversation.summary.conversationId) }
                .onSuccess {
                    _state.update {
                        it.copy(
                            sending = false,
                            draftSheetOpen = false,
                            draft = null,
                            composerText = "",
                            notice = "Reply sent",
                        )
                    }
                    load()
                }
                .onFailure { error ->
                    _state.update { it.copy(sending = false, error = error.message ?: "Reply failed") }
                }
        }
    }

    fun assignSelf() = threadAction("Conversation assigned") { repository.assignSelf(leadId) }
    fun toggleResolved() {
        val resolved = state.value.conversation?.summary?.threadState == "resolved"
        threadAction(if (resolved) "Conversation reopened" else "Conversation resolved") {
            if (resolved) repository.reopen(leadId) else repository.resolve(leadId)
        }
    }

    private fun threadAction(success: String, action: suspend () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(actionInProgress = true, error = null) }
            runCatching { action() }
                .onSuccess {
                    _state.update { it.copy(actionInProgress = false, notice = success) }
                    load()
                }
                .onFailure { error ->
                    _state.update { it.copy(actionInProgress = false, error = error.message ?: "Action failed") }
                }
        }
    }
}

private fun replySubject(subject: String?): String = when {
    subject.isNullOrBlank() -> ""
    subject.startsWith("Re:", ignoreCase = true) -> subject
    else -> "Re: $subject"
}
