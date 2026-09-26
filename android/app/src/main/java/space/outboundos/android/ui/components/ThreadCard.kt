package space.outboundos.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import space.outboundos.android.model.ThreadSummary
import space.outboundos.android.util.formatRelativeTime

@Composable
fun ThreadCard(thread: ThreadSummary, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = 92.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row {
            // A narrow rule makes the channel mix scannable without filling
            // every row with decorative colour.
            Box(Modifier.width(3.dp).fillMaxHeight().heightIn(min = 92.dp).background(channelColor(thread.channel)))
            Column(Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (thread.unread) {
                        Box(
                            Modifier.padding(end = 7.dp).width(6.dp).heightIn(min = 6.dp)
                                .background(MaterialTheme.colorScheme.secondary, MaterialTheme.shapes.extraSmall),
                        )
                    }
                    Text(
                        thread.leadName,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = if (thread.unread) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    ChannelIcon(thread.channel, Modifier.padding(start = 8.dp), thread.channel.label)
                    Text(
                        formatRelativeTime(thread.lastMessageAt),
                        modifier = Modifier.padding(start = 8.dp).widthIn(min = 26.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                (thread.subject ?: thread.leadCompany ?: thread.senderDisplay)?.let { subtitle ->
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Row(
                    modifier = Modifier.padding(top = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        thread.lastMessage.ifBlank { "No message preview" },
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (thread.replyNeeded) {
                        AssistChip(onClick = onClick, label = { Text("Reply") })
                    }
                }
            }
        }
    }
}
