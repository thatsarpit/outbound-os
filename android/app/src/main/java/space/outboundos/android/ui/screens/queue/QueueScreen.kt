package space.outboundos.android.ui.screens.queue

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import space.outboundos.android.model.Channel
import space.outboundos.android.model.ThreadPage
import space.outboundos.android.model.ThreadSummary
import space.outboundos.android.ui.components.ChannelIcon
import space.outboundos.android.ui.components.EmptyState
import space.outboundos.android.ui.components.ErrorBanner
import space.outboundos.android.ui.components.LoadingState
import space.outboundos.android.ui.components.ThreadCard
import space.outboundos.android.ui.theme.OutboundOsTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueScreen(
    state: QueueUiState,
    onChannel: (Channel?) -> Unit,
    onSearch: (String) -> Unit,
    onRefresh: () -> Unit,
    onOpenThread: (Long) -> Unit,
    onOpenDashboard: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Needs reply")
                        Text(
                            "${state.page.needsReply} waiting · ${state.page.unread} unread",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onRefresh, enabled = !state.refreshing) {
                        Icon(Icons.Outlined.Refresh, "Refresh queue")
                    }
                    IconButton(onClick = onOpenDashboard) {
                        Icon(Icons.Outlined.OpenInBrowser, "Open web dashboard")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Outlined.Logout, "Sign out")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        floatingActionButton = {
            // The FAB advances to the first item: the most useful one-thumb
            // action while an operator is repeatedly working the queue.
            FloatingActionButton(
                onClick = { state.page.threads.firstOrNull()?.let { onOpenThread(it.leadId) } },
                containerColor = if (state.page.threads.isEmpty()) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primary,
                contentColor = if (state.page.threads.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onPrimary,
            ) {
                Icon(Icons.Outlined.ArrowForward, "Open next conversation")
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { insets ->
        Column(Modifier.fillMaxSize().padding(insets)) {
            SearchBar(
                inputField = {
                    SearchBarDefaults.InputField(
                        query = state.search,
                        onQueryChange = onSearch,
                        onSearch = { },
                        expanded = false,
                        onExpandedChange = { },
                        placeholder = { Text("Search conversations") },
                        leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    )
                },
                expanded = false,
                onExpandedChange = { },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            ) { }

            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                FilterChip(
                    selected = state.channel == null,
                    onClick = { onChannel(null) },
                    label = { Text("All") },
                )
                listOf(Channel.WhatsApp, Channel.Email, Channel.IndiaMart).forEach { channel ->
                    FilterChip(
                        selected = state.channel == channel,
                        onClick = { onChannel(channel) },
                        label = { Text(channel.label) },
                        leadingIcon = { ChannelIcon(channel) },
                    )
                }
            }

            state.error?.let {
                ErrorBanner(it, onRetry = onRefresh, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
            }

            when {
                state.loading -> LoadingState("Loading conversations")
                state.page.threads.isEmpty() -> EmptyState(
                    title = if (state.search.isBlank()) "Queue clear" else "No matching conversations",
                    detail = if (state.search.isBlank()) "Nothing needs a reply right now." else "Try a shorter search or another channel.",
                )
                else -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(360.dp),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 12.dp, top = 4.dp, end = 12.dp, bottom = 96.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.page.threads, key = { it.leadId }) { thread ->
                        ThreadCard(thread, onClick = { onOpenThread(thread.leadId) })
                    }
                }
            }
        }
    }
}

private val previewThread = ThreadSummary(
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
    lastMessage = "Preview enquiry text appears here.",
    lastMessageAt = "2026-09-01T09:30:00Z",
    lastInboundAt = "2026-09-01T09:30:00Z",
    lastOutboundAt = null,
    messageCount = 1,
)

@Preview(showBackground = true, widthDp = 412, heightDp = 820, name = "Queue — phone")
@Composable
private fun QueueScreenPreview() {
    OutboundOsTheme(dynamicColor = false) {
        QueueScreen(
            state = QueueUiState(loading = false, page = ThreadPage(listOf(previewThread), total = 1, unread = 1, needsReply = 1)),
            onChannel = {}, onSearch = {}, onRefresh = {}, onOpenThread = {}, onOpenDashboard = {}, onLogout = {},
        )
    }
}

@Preview(showBackground = true, widthDp = 900, heightDp = 700, name = "Queue — expanded")
@Composable
private fun QueueExpandedPreview() {
    OutboundOsTheme(dynamicColor = false) {
        QueueScreen(
            state = QueueUiState(loading = false, page = ThreadPage(listOf(previewThread, previewThread.copy(leadId = 2, channel = Channel.Email)), total = 2, unread = 1, needsReply = 2)),
            onChannel = {}, onSearch = {}, onRefresh = {}, onOpenThread = {}, onOpenDashboard = {}, onLogout = {},
        )
    }
}
