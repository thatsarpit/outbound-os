package space.outboundos.android.ui.screens.stalled

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import space.outboundos.android.model.Channel
import space.outboundos.android.model.OverviewStats
import space.outboundos.android.model.SystemHealth
import space.outboundos.android.model.ThreadSummary
import space.outboundos.android.ui.components.EmptyState
import space.outboundos.android.ui.components.ErrorBanner
import space.outboundos.android.ui.components.LoadingState
import space.outboundos.android.ui.components.ThreadCard
import space.outboundos.android.ui.theme.OutboundOsTheme
import space.outboundos.android.ui.theme.LocalStatusColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StalledScreen(
    state: StalledUiState,
    onRefresh: () -> Unit,
    onOpenThread: (Long) -> Unit,
    onOpenDashboard: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warningColor = LocalStatusColors.current.warning
    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Stalled")
                        Text(
                            "Waiting on buyers for 24h+",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onRefresh) { Icon(Icons.Outlined.Refresh, "Refresh") }
                    IconButton(onClick = onOpenDashboard) { Icon(Icons.Outlined.OpenInBrowser, "Open web dashboard") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { insets ->
        when {
            state.loading -> LoadingState("Checking quiet conversations", Modifier.padding(insets))
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(insets),
                contentPadding = PaddingValues(start = 12.dp, top = 8.dp, end = 12.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item { ManagerGlance(state) }
                state.error?.let { item { ErrorBanner(it, onRetry = onRefresh) } }
                if (state.items.isEmpty() && state.error == null) {
                    item { EmptyState("Nothing stalled", "No open conversations are waiting on a buyer for more than 24 hours.") }
                } else {
                    items(state.items, key = { it.thread.leadId }) { item ->
                        Column {
                            Text(
                                if (item.quietHours < 48) "Quiet ${item.quietHours}h" else "Quiet ${item.quietHours / 24}d",
                                modifier = Modifier.padding(start = 4.dp, bottom = 4.dp),
                                style = MaterialTheme.typography.labelMedium,
                                color = warningColor,
                            )
                            ThreadCard(item.thread, onClick = { onOpenThread(item.thread.leadId) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ManagerGlance(state: StalledUiState) {
    val warningColor = LocalStatusColors.current.warning
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.WarningAmber, null, tint = warningColor)
                Column {
                    Text("Manager glance", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Live counts from the workspace",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                GlanceValue("Stalled", state.items.size.toString())
                state.overview?.let {
                    GlanceValue("Pending", it.pending.toString())
                    GlanceValue("New today", it.newToday.toString())
                }
                state.health?.let { GlanceValue("System", it.overall.replaceFirstChar(Char::uppercase)) }
            }
        }
    }
}

@Composable
private fun GlanceValue(label: String, value: String) {
    Column {
        Text(value, style = MaterialTheme.typography.titleMedium)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private val stalledPreviewThread = ThreadSummary(
    leadId = 1,
    leadName = "Preview contact",
    leadCompany = "Example company",
    leadEmail = null,
    leadMobile = "+91 ••••• ••000",
    channel = Channel.IndiaMart,
    subject = null,
    senderDisplay = "Preview buyer",
    conversationId = 1,
    unread = false,
    replyNeeded = false,
    threadState = "open",
    lastMessage = "Placeholder outbound follow-up.",
    lastMessageAt = "2026-08-30T09:00:00Z",
    lastInboundAt = "2026-08-28T09:00:00Z",
    lastOutboundAt = "2026-08-30T09:00:00Z",
    messageCount = 3,
)

@Preview(showBackground = true, widthDp = 412, heightDp = 820, name = "Stalled — phone")
@Composable
private fun StalledScreenPreview() {
    OutboundOsTheme(dynamicColor = false) {
        StalledScreen(
            state = StalledUiState(
                loading = false,
                items = listOf(StalledThread(stalledPreviewThread, 48)),
                overview = OverviewStats(),
                health = SystemHealth("ok"),
            ),
            onRefresh = {}, onOpenThread = {}, onOpenDashboard = {},
        )
    }
}
