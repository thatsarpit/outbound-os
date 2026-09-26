package space.outboundos.android.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import space.outboundos.android.MainActivity

object NotificationDeepLinks {
    const val ENQUIRIES_CHANNEL_ID = "new_enquiries"

    /**
     * Push providers should use this PendingIntent for a new-enquiry alert.
     * It routes straight to history + composer; there is no intermediate home
     * screen, preserving the one-tap notification contract.
     */
    fun threadPendingIntent(context: Context, leadId: Long): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("outboundos://thread/$leadId"), context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            context,
            leadId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                ENQUIRIES_CHANNEL_ID,
                "New enquiries",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Enquiries that need a prompt human reply"
                enableVibration(true)
            },
        )
    }
}
