package space.outboundos.android.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import space.outboundos.android.data.repository.OutboundRepository

enum class AuthMethod { Password, Otp }
enum class OtpStep { Phone, Code }

data class AuthUiState(
    val method: AuthMethod = AuthMethod.Password,
    val otpStep: OtpStep = OtpStep.Phone,
    val email: String = "",
    val password: String = "",
    val phone: String = "",
    val code: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
)

class AuthViewModel(private val repository: OutboundRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    fun setMethod(value: AuthMethod) = _state.update { it.copy(method = value, error = null, info = null) }
    fun setEmail(value: String) = _state.update { it.copy(email = value, error = null) }
    fun setPassword(value: String) = _state.update { it.copy(password = value, error = null) }
    fun setPhone(value: String) = _state.update { it.copy(phone = value, error = null) }
    fun setCode(value: String) = _state.update { it.copy(code = value.take(8), error = null) }
    fun editPhone() = _state.update { it.copy(otpStep = OtpStep.Phone, code = "", error = null) }

    fun submit() {
        val snapshot = state.value
        if (snapshot.loading) return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, info = null) }
            runCatching {
                when (snapshot.method) {
                    AuthMethod.Password -> {
                        require(snapshot.email.isNotBlank()) { "Enter your email" }
                        require(snapshot.password.isNotBlank()) { "Enter your password" }
                        repository.login(snapshot.email, snapshot.password)
                    }
                    AuthMethod.Otp -> when (snapshot.otpStep) {
                        OtpStep.Phone -> {
                            require(snapshot.phone.isNotBlank()) { "Enter your phone number" }
                            repository.requestOtp(snapshot.phone)
                        }
                        OtpStep.Code -> {
                            require(snapshot.code.isNotBlank()) { "Enter the one-time code" }
                            repository.verifyOtp(snapshot.phone, snapshot.code)
                        }
                    }
                }
            }.onSuccess { result ->
                if (snapshot.method == AuthMethod.Otp && snapshot.otpStep == OtpStep.Phone) {
                    _state.update {
                        it.copy(
                            loading = false,
                            otpStep = OtpStep.Code,
                            // The server intentionally does not reveal whether an
                            // account exists; the app preserves that ambiguity.
                            info = (result as? String).orEmpty().ifBlank { "If the number is registered, a code is on its way." },
                        )
                    }
                } else {
                    _state.update { it.copy(loading = false) }
                }
            }.onFailure { error ->
                _state.update { it.copy(loading = false, error = error.message ?: "Sign in failed") }
            }
        }
    }
}
