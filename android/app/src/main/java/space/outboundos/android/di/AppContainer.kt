package space.outboundos.android.di

import android.content.Context
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import space.outboundos.android.BuildConfig
import space.outboundos.android.data.local.TokenStore
import space.outboundos.android.data.network.AuthInterceptor
import space.outboundos.android.data.network.OutboundApi
import space.outboundos.android.data.repository.NetworkOutboundRepository
import space.outboundos.android.data.repository.OutboundRepository
import java.util.concurrent.TimeUnit

// One process-wide API graph and four ViewModels do not justify generated DI.
// Keeping construction here makes auth/session ownership explicit and avoids a
// second annotation-processing toolchain; this can migrate to Hilt if the graph
// gains scoped databases, workers, or feature modules.
class AppContainer(context: Context) {
    private val tokenStore = TokenStore(context.applicationContext)
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }
    private val httpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(tokenStore))
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    private val api = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(httpClient)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(OutboundApi::class.java)

    val repository: OutboundRepository = NetworkOutboundRepository(api, tokenStore)
}
