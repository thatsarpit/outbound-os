package space.outboundos.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow
import space.outboundos.android.navigation.OutboundApp

class MainActivity : ComponentActivity() {
    private val pendingLeadId = MutableStateFlow<Long?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        captureDeepLink(intent)

        val repository = (application as OutboundOsApplication).container.repository
        setContent {
            val pending = pendingLeadId.collectAsStateWithLifecycle().value
            OutboundApp(
                repository = repository,
                pendingLeadId = pending,
                onPendingLeadConsumed = { pendingLeadId.value = null },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        captureDeepLink(intent)
    }

    private fun captureDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "outboundos" || uri.host != "thread") return
        pendingLeadId.value = uri.lastPathSegment?.toLongOrNull()?.takeIf { it > 0 }
    }
}
