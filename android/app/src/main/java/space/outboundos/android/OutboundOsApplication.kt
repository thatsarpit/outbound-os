package space.outboundos.android

import android.app.Application
import space.outboundos.android.di.AppContainer
import space.outboundos.android.notifications.NotificationDeepLinks

class OutboundOsApplication : Application() {
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        NotificationDeepLinks.createChannel(this)
    }
}
