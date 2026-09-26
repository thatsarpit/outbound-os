package space.outboundos.android.ui.screens.stalled

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
import space.outboundos.android.model.OverviewStats
import space.outboundos.android.model.SystemHealth
import space.outboundos.android.model.ThreadSummary
import space.outboundos.android.util.hoursSince
import space.outboundos.android.util.parseInstantOrNull

data class StalledThread(val thread: ThreadSummary, val quietHours: Long)

data class StalledUiState(
    val loading: Boolean = true,
    val items: List<StalledThread> = emptyList(),
    val overview: OverviewStats? = null,
    val health: SystemHealth? = null,
    val error: String? = null,
)

class StalledViewModel(private val repository: OutboundRepository) : ViewModel() {
    private val _state = MutableStateFlow(StalledUiState())
    val state: StateFlow<StalledUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching {
                coroutineScope {
                    val threads = async { repository.threads(state = "open") }
                    val overview = async { runCatching { repository.overview() }.getOrNull() }
                    val health = async { runCatching { repository.health() }.getOrNull() }
                    Triple(threads.await(), overview.await(), health.await())
                }
            }.onSuccess { (page, overview, health) ->
                val items = page.threads.mapNotNull { thread ->
                    val outbound = parseInstantOrNull(thread.lastOutboundAt) ?: return@mapNotNull null
                    val inbound = parseInstantOrNull(thread.lastInboundAt)
                    val quiet = hoursSince(thread.lastOutboundAt) ?: return@mapNotNull null
                    // "Stalled" is intentionally narrow: we sent last and have
                    // heard nothing for 24h. A newer inbound belongs in Needs
                    // Reply instead. The 24h assumption is documented for owner review.
                    if (quiet >= 24 && (inbound == null || outbound.isAfter(inbound))) {
                        StalledThread(thread, quiet)
                    } else null
                }.sortedByDescending { it.quietHours }
                _state.update { it.copy(loading = false, items = items, overview = overview, health = health) }
            }.onFailure { error ->
                _state.update { it.copy(loading = false, error = error.message ?: "Could not load stalled conversations") }
            }
        }
    }
}
