package space.outboundos.android.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Message
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import space.outboundos.android.model.Channel
import space.outboundos.android.ui.theme.LocalChannelColors

@Composable
fun channelColor(channel: Channel): Color {
    val colors = LocalChannelColors.current
    return when (channel) {
        Channel.WhatsApp -> colors.whatsapp
        Channel.Email -> colors.email
        Channel.IndiaMart -> colors.indiaMart
        Channel.Other -> androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
    }
}

@Composable
fun ChannelIcon(channel: Channel, modifier: Modifier = Modifier, contentDescription: String? = channel.label) {
    val icon = when (channel) {
        Channel.WhatsApp -> Icons.Outlined.Message
        Channel.Email -> Icons.Outlined.Email
        Channel.IndiaMart -> Icons.Outlined.Storefront
        Channel.Other -> Icons.Outlined.Forum
    }
    Icon(icon, contentDescription = contentDescription, tint = channelColor(channel), modifier = modifier)
}
