# Outbound OS for Android

Native Android client for the phone-sized work in Outbound OS: triaging new enquiries, replying quickly, reviewing conversation history, approving AI drafts, and spotting conversations that have gone quiet.

Everything here is Android-only. There is no shared/iOS UI layer.

## Build

Requirements:

- Android Studio with Android SDK 37 installed
- JDK 17
- Gradle 9.4.1 (the checked-in build uses Android Gradle Plugin 9.2.0)

This environment could not generate a Gradle wrapper because its sandbox blocks the local socket Gradle uses for cache file-lock coordination. From a normal development shell, generate it once and then build:

```bash
cd android
gradle wrapper --gradle-version 9.4.1
./gradlew :app:assembleDebug
```

Android Studio can also open this `android/` directory and sync it directly.

The server address is a generated `BuildConfig` value, used for the API and for "Open dashboard". It defaults to the hosted `https://app.outboundos.space/`; **self-hosted installs build with their own address**, e.g. `-PoutboundOsBaseUrl=https://crm.example.com/`. Point a debug build at a local server with:

```bash
./gradlew :app:assembleDebug \
  -PoutboundOsBaseUrl=http://10.0.2.2:3001/
```

The debug manifest permits cleartext HTTP for emulator/local development. Release builds do not.

## Implemented

- Email/password and phone OTP authentication against the real `/api/auth/*` contracts.
- JWT bearer injection from Preferences DataStore. A 401 clears the observed session and returns the UI to sign-in.
- Needs-reply queue with search, channel filters, refresh, dense channel-aware cards and a one-thumb “open next” FAB.
- Conversation detail with chronological WhatsApp, email and IndiaMART history, lead/contact context, call intent, assign, resolve/reopen, manual reply and a first-enabled-sender fallback.
- AI draft generation through `POST /api/leads/:id/ai-reply`, editable approval in a `ModalBottomSheet`, and send through `POST /api/inbox/send`. Nothing is sent by draft generation alone.
- Stalled view for open conversations where the last activity was outbound and the buyer has been quiet for at least 24 hours. It also loads the real overview and system health endpoints for a compact manager glance.
- Notification navigation contract: `NotificationDeepLinks.threadPendingIntent()` opens `outboundos://thread/{leadId}` directly into the conversation. If signed out, the pending destination survives authentication.
- Material 3 dynamic colour on Android 12+, restrained product fallback palettes below Android 12, dedicated light/dark schemes, fixed cross-surface channel colours, 4/7/10dp shapes, edge-to-edge layout, NavigationBar on phones and NavigationRail on larger windows.
- Predictive back through Navigation Compose plus `android:enableOnBackInvokedCallback="true"`. Material's modal sheet handles its own predictive dismissal.
- Compose previews for auth, queue (phone and expanded), conversation, draft approval, and stalled screens.
- Defensive response decoding. The leads response reads `{ leads: [...] }` (not `data`), and list fields that arrive as non-arrays become empty lists. Individual malformed list entries are dropped instead of crashing the screen.

## Intentionally not in the phone app

Campaign construction, bulk import, workspace configuration and template editing stay in the web dashboard. These are high-density setup tasks involving wide forms, comparison and bulk selection; squeezing them onto a phone would make both the operator flows and the Android interaction model worse. Queue and stalled screens link to `https://app.outboundos.space` for those jobs.

The app also does not offer a generic “new campaign/outbound compose” flow, data dashboards beyond the stalled glance, or attachment/template tooling. The Android product stays centred on a conversation already needing attention.

Unknown channels (including any legacy iMessage thread returned by the backend) render with neutral identity and are read-only in this scoped build. They are never mislabeled WhatsApp; sending remains available on the web dashboard.

## Stubbed or awaiting integration

- Push transport is not wired because there is no approved Firebase project, FCM sender, or alternative push provider configuration in the repository. The notification channel and exact deep-link `PendingIntent` contract are ready for that service. Runtime notification permission should be requested contextually when transport is added, not at first launch before notifications can work.
- There is no approved app icon/Play Store artwork; the current launcher mark is a simple in-product placeholder.
- The backend does not expose a dedicated “stalled” contract. The app's conservative definition is: thread is open, last inbound is older than last outbound (or absent), and last outbound was 24+ hours ago. Product/backend owners should confirm that threshold before release.
- The AI reply response only contains suggestion text. Email subjects are derived from the current thread (`Re:`), and the first enabled sender matching the channel is supplied when available. A backend-provided draft object with sender/subject metadata would remove those client assumptions.
- Coil is included as the image loader in the agreed stack, but current phone DTOs do not provide contact/avatar images worth displaying. It is ready for media/avatar UI when that contract exists.

## Architecture decisions needing owner confirmation

- Dependency injection is a small manual `AppContainer`, not Hilt. There is one process-wide HTTP graph and four ViewModels, so generated DI would add build machinery without a useful scope boundary. Revisit when workers, databases or feature modules arrive.
- `space.outboundos.android` (and `.debug`) is a provisional application ID. Signing, Play registration and the final package name need owner credentials/approval.
- `compileSdk` is 37 because the current Compose BOM requires it; `targetSdk` remains 36 until release policy and Android 17 behavior are reviewed on devices.
- Server authorization remains authoritative. The mobile UI assumes an agent-capable session for reply/assign/resolve; role/capability-specific hiding should follow a confirmed capabilities contract.
- The 24-hour stalled threshold, first-enabled-sender fallback and read-only handling of legacy/unknown channels are product assumptions, not new backend guarantees.

## Verification in this workspace

- All manifest/resource XML files passed `xmllint --noout`.
- Defensive decoding tests were added for the exact `{ leads: [...] }` shape and for non-array lead/thread/message fields.
- Every delivered screen has at least one Compose `@Preview`; auth also has explicit dark preview coverage and queue has phone/expanded previews.
- **Verified building.** `./gradlew :app:assembleDebug` produces a 20 MB debug APK and `:app:testDebugUnitTest` passes (3 tests, 0 failures) on macOS with JDK 25, Gradle 9.4.1 and SDK platform 36.

  Getting there needed five fixes to what was first written:

  1. `compileSdk = 37` — API 37 is not published by the SDK manager, so the project could not build anywhere. Lowered to 36.
  2. Compose BOM `2026.08.00`, `lifecycle 2.11.0` and `activity 1.13.0` all require compiling against that same unpublished API 37. Stepped back to the API-36 generation.
  3. `TextStyle(...)` was called with positional arguments in 11 places. Its positional signature begins with `color`, not `fontFamily`, so family/weight/size bound to the wrong parameters — 30 of the 35 compile errors. Now named arguments.
  4. `"Request failed ($code())"` reached for `HttpException`'s private backing field rather than its `code()` method.
  5. `import androidx.compose.foundation.layout.weight` — `Modifier.weight` is a `RowScope`/`ColumnScope` extension and cannot be imported as a top-level symbol; the import resolved to an internal property.

  Still unverified: nothing has run on a device or emulator, so layout, insets, predictive back and dynamic color are unconfirmed in practice.

## Real-device verification checklist

- Dynamic colour contrast with several wallpapers in both light and dark mode.
- Edge-to-edge and IME behavior on a gesture-navigation phone, three-button navigation phone, and API 26 emulator.
- Predictive back from conversation to queue and while the approval sheet is open.
- Deep-link launch from a posted notification when signed in and signed out.
- `tel:` handoff, notification permission behavior once push transport is added, and process-death restoration.
- Foldable posture/hinge behavior. Width-based NavigationRail support is implemented, but no hinge-aware two-pane layout is claimed.
- Live sends on all three providers using a test workspace, especially IndiaMART `conversationId` and email sender assignment.

## Project map

- `app/src/main/java/space/outboundos/android/navigation/` — session-aware navigation graph and adaptive shell
- `app/src/main/java/space/outboundos/android/data/` — DataStore, Retrofit DTOs, safe serializers and repository
- `app/src/main/java/space/outboundos/android/ui/theme/` — Material 3 colour, type and shape translation
- `app/src/main/java/space/outboundos/android/ui/screens/` — auth, queue, conversation, draft and stalled UI
- `app/src/main/java/space/outboundos/android/notifications/` — notification channel and one-tap thread deep links
- `app/src/test/` — defensive decoding checks
