package space.outboundos.android.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import space.outboundos.android.ui.components.ErrorBanner
import space.outboundos.android.ui.theme.OutboundOsTheme

@Composable
fun AuthScreen(
    state: AuthUiState,
    onMethod: (AuthMethod) -> Unit,
    onEmail: (String) -> Unit,
    onPassword: (String) -> Unit,
    onPhone: (String) -> Unit,
    onCode: (String) -> Unit,
    onEditPhone: () -> Unit,
    onSubmit: () -> Unit,
) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().padding(20.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(Modifier.fillMaxWidth().widthIn(max = 440.dp)) {
                Text("Outbound OS", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "Handle the conversations that need you.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(20.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = CardDefaults.outlinedCardBorder(),
                    elevation = CardDefaults.cardElevation(0.dp),
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(
                                selected = state.method == AuthMethod.Password,
                                onClick = { onMethod(AuthMethod.Password) },
                                label = { Text("Email") },
                                leadingIcon = { Icon(Icons.Outlined.Login, null) },
                            )
                            FilterChip(
                                selected = state.method == AuthMethod.Otp,
                                onClick = { onMethod(AuthMethod.Otp) },
                                label = { Text("Phone code") },
                                leadingIcon = { Icon(Icons.Outlined.Key, null) },
                            )
                        }
                        HorizontalDivider()
                        if (state.method == AuthMethod.Password) {
                            OutlinedTextField(
                                value = state.email,
                                onValueChange = onEmail,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Work email") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                            )
                            OutlinedTextField(
                                value = state.password,
                                onValueChange = onPassword,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Password") },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                            )
                        } else if (state.otpStep == OtpStep.Phone) {
                            OutlinedTextField(
                                value = state.phone,
                                onValueChange = onPhone,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Phone number") },
                                supportingText = { Text("Include the country code") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                            )
                        } else {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = onEditPhone) { Icon(Icons.Outlined.ArrowBack, "Edit phone number") }
                                Text(state.phone, style = MaterialTheme.typography.bodyMedium)
                            }
                            OutlinedTextField(
                                value = state.code,
                                onValueChange = onCode,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("One-time code") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                            )
                        }
                        state.info?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        state.error?.let { ErrorBanner(it) }
                        Button(
                            onClick = onSubmit,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.loading,
                        ) {
                            Text(if (state.loading) "Please wait…" else if (state.method == AuthMethod.Otp && state.otpStep == OtpStep.Phone) "Send code" else "Sign in")
                        }
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true, name = "Auth — light")
@Composable
private fun AuthScreenPreview() {
    OutboundOsTheme(dynamicColor = false) {
        AuthScreen(AuthUiState(email = "preview@example.com"), {}, {}, {}, {}, {}, {}, {})
    }
}

@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Auth — dark")
@Composable
private fun AuthScreenDarkPreview() {
    OutboundOsTheme(dynamicColor = false) {
        AuthScreen(AuthUiState(method = AuthMethod.Otp, phone = "+91 ••••• ••000"), {}, {}, {}, {}, {}, {}, {})
    }
}
