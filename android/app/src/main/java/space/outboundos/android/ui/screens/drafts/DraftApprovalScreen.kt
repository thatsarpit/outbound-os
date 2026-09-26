package space.outboundos.android.ui.screens.drafts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import space.outboundos.android.model.Channel
import space.outboundos.android.model.Draft
import space.outboundos.android.ui.components.ChannelIcon
import space.outboundos.android.ui.theme.OutboundOsTheme

@Composable
fun DraftApprovalScreen(
    draft: Draft,
    sending: Boolean,
    onTextChange: (String) -> Unit,
    onSubjectChange: (String) -> Unit,
    onApprove: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ChannelIcon(draft.channel)
            Column {
                Text("Review draft", style = MaterialTheme.typography.titleLarge)
                Text(
                    "Nothing is sent until you approve.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (draft.channel == Channel.Email) {
            OutlinedTextField(
                value = draft.subject.orEmpty(),
                onValueChange = onSubjectChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Subject") },
                singleLine = true,
            )
        }
        OutlinedTextField(
            value = draft.text,
            onValueChange = onTextChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Reply") },
            minLines = 5,
            maxLines = 12,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), enabled = !sending) {
                Icon(Icons.Outlined.Close, null)
                Text("Keep editing", Modifier.padding(start = 6.dp))
            }
            Button(
                onClick = onApprove,
                modifier = Modifier.weight(1f),
                enabled = draft.text.isNotBlank() && (!draft.subject.isNullOrBlank() || draft.channel != Channel.Email) && !sending,
            ) {
                Icon(Icons.Outlined.Check, null)
                Text(if (sending) "Sending…" else "Approve & send", Modifier.padding(start = 6.dp))
            }
        }
    }
}

@Preview(showBackground = true, widthDp = 412, name = "Draft approval")
@Composable
private fun DraftApprovalScreenPreview() {
    OutboundOsTheme(dynamicColor = false) {
        Surface {
            DraftApprovalScreen(
                draft = Draft(1, Channel.Email, "This is placeholder draft copy for layout review.", "Re: Preview enquiry"),
                sending = false,
                onTextChange = {}, onSubjectChange = {}, onApprove = {}, onDismiss = {},
            )
        }
    }
}
