package space.outboundos.android.navigation

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.PauseCircleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import androidx.navigation.NavType
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.map
import space.outboundos.android.data.repository.OutboundRepository
import space.outboundos.android.model.Session
import space.outboundos.android.ui.OutboundViewModelFactory
import space.outboundos.android.ui.components.LoadingState
import space.outboundos.android.ui.screens.auth.AuthScreen
import space.outboundos.android.ui.screens.auth.AuthViewModel
import space.outboundos.android.ui.screens.conversation.ConversationScreen
import space.outboundos.android.ui.screens.conversation.ConversationViewModel
import space.outboundos.android.ui.screens.queue.QueueScreen
import space.outboundos.android.ui.screens.queue.QueueViewModel
import space.outboundos.android.ui.screens.stalled.StalledScreen
import space.outboundos.android.ui.screens.stalled.StalledViewModel
import space.outboundos.android.ui.theme.OutboundOsTheme

@Composable
fun OutboundApp(
    repository: OutboundRepository,
    pendingLeadId: Long?,
    onPendingLeadConsumed: () -> Unit,
) {
    val nullableSession = remember(repository) {
        repository.session.map<Session, Session?> { it }
    }
    val session: Session? by nullableSession.collectAsStateWithLifecycle(initialValue = null)

    OutboundOsTheme {
        when {
            session == null -> Surface(Modifier.fillMaxSize()) { LoadingState("Opening Outbound OS") }
            session?.isAuthenticated == false -> AuthRoute(repository)
            else -> AuthenticatedNavigation(repository, pendingLeadId, onPendingLeadConsumed)
        }
    }
}

@Composable
private fun AuthRoute(repository: OutboundRepository) {
    val viewModel: AuthViewModel = viewModel(factory = OutboundViewModelFactory(repository))
    val state by viewModel.state.collectAsStateWithLifecycle()
    AuthScreen(
        state = state,
        onMethod = viewModel::setMethod,
        onEmail = viewModel::setEmail,
        onPassword = viewModel::setPassword,
        onPhone = viewModel::setPhone,
        onCode = viewModel::setCode,
        onEditPhone = viewModel::editPhone,
        onSubmit = viewModel::submit,
    )
}

private data class MainDestination(val route: String, val label: String)

private val mainDestinations = listOf(
    MainDestination(Routes.Queue, "Queue"),
    MainDestination(Routes.Stalled, "Stalled"),
)

@Composable
private fun AuthenticatedNavigation(
    repository: OutboundRepository,
    pendingLeadId: Long?,
    onPendingLeadConsumed: () -> Unit,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val showMainNavigation = mainDestinations.any { destination ->
        currentDestination?.hierarchy?.any { it.route == destination.route } == true
    }
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current

    LaunchedEffect(pendingLeadId) {
        pendingLeadId?.takeIf { it > 0 }?.let { leadId ->
            navController.navigate(Routes.conversation(leadId)) { launchSingleTop = true }
            onPendingLeadConsumed()
        }
    }

    val graph: @Composable (Modifier) -> Unit = { modifier ->
        // Campaign construction, bulk import, workspace configuration and
        // template editing intentionally have no destinations. They are wide,
        // setup-heavy tasks; the dashboard link is the honest mobile affordance.
        NavHost(navController = navController, startDestination = Routes.Queue, modifier = modifier) {
            composable(Routes.Queue) {
                val viewModel: QueueViewModel = viewModel(factory = OutboundViewModelFactory(repository))
                val state by viewModel.state.collectAsStateWithLifecycle()
                QueueScreen(
                    state = state,
                    onChannel = viewModel::setChannel,
                    onSearch = viewModel::setSearch,
                    onRefresh = viewModel::refresh,
                    onOpenThread = { navController.navigate(Routes.conversation(it)) },
                    onOpenDashboard = { uriHandler.openUri("https://app.outboundos.space") },
                    onLogout = { scope.launch { repository.logout() } },
                )
            }
            composable(Routes.Stalled) {
                val viewModel: StalledViewModel = viewModel(factory = OutboundViewModelFactory(repository))
                val state by viewModel.state.collectAsStateWithLifecycle()
                StalledScreen(
                    state = state,
                    onRefresh = viewModel::refresh,
                    onOpenThread = { navController.navigate(Routes.conversation(it)) },
                    onOpenDashboard = { uriHandler.openUri("https://app.outboundos.space") },
                )
            }
            composable(
                route = Routes.ConversationPattern,
                arguments = listOf(navArgument("leadId") { type = NavType.LongType }),
                deepLinks = listOf(navDeepLink { uriPattern = "outboundos://thread/{leadId}" }),
            ) { entry ->
                val leadId = requireNotNull(entry.arguments?.getLong("leadId")).takeIf { it > 0 } ?: return@composable
                val viewModel: ConversationViewModel = viewModel(
                    viewModelStoreOwner = entry,
                    factory = OutboundViewModelFactory(repository, leadId),
                )
                val state by viewModel.state.collectAsStateWithLifecycle()
                ConversationScreen(
                    state = state,
                    onUp = { navController.navigateUp() },
                    onCall = { phone ->
                        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(phone)}")))
                    },
                    onRefresh = viewModel::load,
                    onComposerText = viewModel::setComposerText,
                    onComposerSubject = viewModel::setComposerSubject,
                    onGenerateDraft = viewModel::generateDraft,
                    onSendManual = viewModel::sendManual,
                    onDraftText = viewModel::editDraftText,
                    onDraftSubject = viewModel::editDraftSubject,
                    onApproveDraft = viewModel::approveDraft,
                    onDismissDraft = viewModel::dismissDraft,
                    onAssignSelf = viewModel::assignSelf,
                    onToggleResolved = viewModel::toggleResolved,
                    onNoticeShown = viewModel::dismissNotice,
                )
            }
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (maxWidth >= 600.dp) {
            Row(Modifier.fillMaxSize()) {
                if (showMainNavigation) {
                    NavigationRail {
                        Spacer(Modifier.weight(1f))
                        mainDestinations.forEachIndexed { index, destination ->
                            NavigationRailItem(
                                selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true,
                                onClick = { navController.navigateMain(destination.route) },
                                icon = { Icon(if (index == 0) Icons.Outlined.Inbox else Icons.Outlined.PauseCircleOutline, destination.label) },
                                label = { androidx.compose.material3.Text(destination.label) },
                            )
                        }
                        Spacer(Modifier.weight(1f))
                    }
                }
                graph(Modifier.weight(1f))
            }
        } else {
            Scaffold(
                contentWindowInsets = WindowInsets(0, 0, 0, 0),
                bottomBar = {
                    if (showMainNavigation) {
                        NavigationBar {
                            mainDestinations.forEachIndexed { index, destination ->
                                NavigationBarItem(
                                    selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true,
                                    onClick = { navController.navigateMain(destination.route) },
                                    icon = { Icon(if (index == 0) Icons.Outlined.Inbox else Icons.Outlined.PauseCircleOutline, destination.label) },
                                    label = { androidx.compose.material3.Text(destination.label) },
                                )
                            }
                        }
                    }
                },
                containerColor = MaterialTheme.colorScheme.background,
            ) { padding -> graph(Modifier.padding(padding)) }
        }
    }
}

private fun androidx.navigation.NavHostController.navigateMain(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
