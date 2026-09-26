package space.outboundos.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import space.outboundos.android.data.repository.OutboundRepository
import space.outboundos.android.ui.screens.auth.AuthViewModel
import space.outboundos.android.ui.screens.conversation.ConversationViewModel
import space.outboundos.android.ui.screens.queue.QueueViewModel
import space.outboundos.android.ui.screens.stalled.StalledViewModel

class OutboundViewModelFactory(
    private val repository: OutboundRepository,
    private val leadId: Long? = null,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when {
        modelClass.isAssignableFrom(AuthViewModel::class.java) -> AuthViewModel(repository) as T
        modelClass.isAssignableFrom(QueueViewModel::class.java) -> QueueViewModel(repository) as T
        modelClass.isAssignableFrom(StalledViewModel::class.java) -> StalledViewModel(repository) as T
        modelClass.isAssignableFrom(ConversationViewModel::class.java) ->
            ConversationViewModel(requireNotNull(leadId), repository) as T
        else -> error("Unknown ViewModel: ${modelClass.name}")
    }
}
