package space.outboundos.android.ui.screens.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import space.outboundos.android.data.repository.OutboundRepository
import space.outboundos.android.model.Channel
import space.outboundos.android.model.ThreadPage

data class QueueUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val page: ThreadPage = ThreadPage(),
    val channel: Channel? = null,
    val search: String = "",
    val error: String? = null,
)

class QueueViewModel(private val repository: OutboundRepository) : ViewModel() {
    private val _state = MutableStateFlow(QueueUiState())
    val state: StateFlow<QueueUiState> = _state.asStateFlow()
    private var searchJob: Job? = null

    init { load() }

    fun setChannel(channel: Channel?) {
        _state.update { it.copy(channel = channel) }
        load()
    }

    fun setSearch(value: String) {
        _state.update { it.copy(search = value) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(350)
            load()
        }
    }

    fun refresh() = load(refresh = true)

    private fun load(refresh: Boolean = false) {
        val filters = state.value
        viewModelScope.launch {
            _state.update { it.copy(loading = !refresh && it.page.threads.isEmpty(), refreshing = refresh, error = null) }
            runCatching {
                repository.threads(channel = filters.channel, state = "needs_reply", search = filters.search)
            }.onSuccess { page ->
                _state.update { it.copy(loading = false, refreshing = false, page = page) }
            }.onFailure { error ->
                _state.update { it.copy(loading = false, refreshing = false, error = error.message ?: "Could not load the queue") }
            }
        }
    }
}
