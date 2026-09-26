package space.outboundos.android.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

data class ChannelColors(
    val whatsapp: Color,
    val email: Color,
    val indiaMart: Color,
)

data class StatusColors(
    val success: Color,
    val warning: Color,
    val danger: Color,
)

val LocalChannelColors = staticCompositionLocalOf {
    ChannelColors(WhatsApp, Email, IndiaMart)
}

val LocalStatusColors = staticCompositionLocalOf {
    StatusColors(Success, Warning, Danger)
}

private val LightScheme = lightColorScheme(
    primary = Ink,
    onPrimary = Paper,
    primaryContainer = SurfaceRaisedLight,
    onPrimaryContainer = Ink,
    secondary = Focus,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFEEF0FE),
    onSecondaryContainer = Color(0xFF17216E),
    error = Danger,
    onError = Color.White,
    background = Paper,
    onBackground = Ink,
    surface = SurfaceLight,
    onSurface = Ink,
    surfaceVariant = SurfaceRaisedLight,
    onSurfaceVariant = TextSecondaryLight,
    outline = BorderLight,
    outlineVariant = Color(0xFFEFEFF2),
    surfaceTint = Color.Transparent,
)

private val DarkScheme = darkColorScheme(
    primary = TextPrimaryDark,
    onPrimary = Ink,
    primaryContainer = SurfaceRaisedDark,
    onPrimaryContainer = TextPrimaryDark,
    secondary = FocusDark,
    onSecondary = Color(0xFF11153D),
    secondaryContainer = Color(0xFF33355E),
    onSecondaryContainer = Color(0xFFE4E6FF),
    error = DangerDark,
    onError = Color(0xFF2A1618),
    background = Night,
    onBackground = TextPrimaryDark,
    surface = SurfaceDark,
    onSurface = TextPrimaryDark,
    surfaceVariant = SurfaceRaisedDark,
    onSurfaceVariant = TextSecondaryDark,
    outline = BorderDark,
    outlineVariant = Color(0xFF26262E),
    surfaceTint = Color.Transparent,
)

@Composable
fun OutboundOsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val base = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && darkTheme ->
            dynamicDarkColorScheme(context)
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            dynamicLightColorScheme(context)
        darkTheme -> DarkScheme
        else -> LightScheme
    }

    // Material You remains visible in selected navigation, focus and container
    // tones. Primary actions stay ink-first, matching the product's one-job-per-
    // colour rule; channel and status colours remain semantic and fixed.
    val scheme = if (darkTheme) {
        base.copy(
            primary = TextPrimaryDark,
            onPrimary = Ink,
            background = Night,
            onBackground = TextPrimaryDark,
            surface = SurfaceDark,
            onSurface = TextPrimaryDark,
            error = DangerDark,
            onError = Color(0xFF2A1618),
            surfaceTint = Color.Transparent,
        )
    } else {
        base.copy(
            primary = Ink,
            onPrimary = Paper,
            background = Paper,
            onBackground = Ink,
            surface = SurfaceLight,
            onSurface = Ink,
            error = Danger,
            onError = Color.White,
            surfaceTint = Color.Transparent,
        )
    }
    val channels = ChannelColors(WhatsApp, Email, IndiaMart)
    val statuses = if (darkTheme) {
        StatusColors(SuccessDark, WarningDark, DangerDark)
    } else {
        StatusColors(Success, Warning, Danger)
    }

    androidx.compose.runtime.CompositionLocalProvider(
        LocalChannelColors provides channels,
        LocalStatusColors provides statuses,
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = OutboundTypography,
            shapes = OutboundShapes,
            content = content,
        )
    }
}
