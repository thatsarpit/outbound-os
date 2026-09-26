package space.outboundos.android.util

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.max

fun parseInstantOrNull(value: String?): Instant? = value
    ?.takeIf { it.isNotBlank() }
    ?.let { runCatching { Instant.parse(it) }.getOrNull() }

fun formatRelativeTime(value: String?, now: Instant = Instant.now()): String {
    val instant = parseInstantOrNull(value) ?: return "Time unavailable"
    val minutes = max(0, Duration.between(instant, now).toMinutes())
    return when {
        minutes < 1 -> "now"
        minutes < 60 -> "${minutes}m"
        minutes < 24 * 60 -> "${minutes / 60}h"
        minutes < 7 * 24 * 60 -> "${minutes / (24 * 60)}d"
        else -> DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
            .withZone(ZoneId.systemDefault())
            .format(instant)
    }
}

fun formatMessageTime(value: String?): String {
    val instant = parseInstantOrNull(value) ?: return ""
    return DateTimeFormatter.ofPattern("d MMM, h:mm a")
        .withZone(ZoneId.systemDefault())
        .format(instant)
}

fun hoursSince(value: String?, now: Instant = Instant.now()): Long? {
    val instant = parseInstantOrNull(value) ?: return null
    return max(0, Duration.between(instant, now).toHours())
}
