# Speech — design, not built

Design only. Nothing in this document is implemented; `web-preload-api.ts` still contains zero
occurrences of `speech`, so all seventeen members resolve to `undefined` through
`createFallbackProxy`. The bump deferred it because the shape does not fit the namespace proxy the
other twelve patches use: the preload's 17 members do not correspond to the 8 `speech.*` RPC names,
and 6 are event subscriptions the proxy cannot serve.

Both halves are answerable. The push channel exists upstream, and the web client already reads it.

## The three surfaces

| surface | preload members | wire today |
| --- | --- | --- |
| model management | 5 | 3 RPC methods, one of which serves two members by projection |
| the OpenAI key | 3 | none |
| dictation | 9 | 4 RPC methods, none of which pushes |

## Name adapter

Sources: `src/preload/api/speech-api.ts` (the 17), `src/main/runtime/rpc/methods/speech.ts` (the 8),
`src/main/ipc/speech.ts` (the desktop handlers each member mirrors).

| preload member | RPC | note |
| --- | --- | --- |
| `getCatalog()` | `speech.models.list` | project `RuntimeSpeechSetupState.models[]` → `SpeechModelManifest[]` |
| `getModelStates()` | `speech.models.list` | same call, project → `SpeechModelState[]` |
| `downloadModel(id)` | `speech.models.download` | fire-and-forget host-side; resolves on `{started:true}` |
| `deleteModel(id)` | `speech.models.delete` | |
| `cancelDownload(id)` | **none** | no runtime method; unused by the renderer — leave on the fallback |
| `getOpenAiApiKeyStatus()` | **none** | needs a new family, below |
| `saveOpenAiApiKey(k)` | **none** | same |
| `clearOpenAiApiKey()` | **none** | same |
| `startDictation(modelId, hotwords, sessionId)` | `speech.dictation.start` | `sessionId` → `dictationId`; **`hotwords` has no RPC parameter and is dropped** |
| `feedAudio(samples, rate, sessionId)` | `speech.dictation.chunk` | Float32Array → Int16LE → base64 |
| `stopDictation(sessionId)` | `speech.dictation.finish` | returns `{text}`; see "the batch answer" |
| `onPartialTranscript(cb)` | streaming, below | |
| `onFinalTranscript(cb)` | streaming, below | |
| `onReady(cb)` | streaming, below | unused by the renderer |
| `onStopped(cb)` | streaming, below | |
| `onError(cb)` | streaming, below | |
| `onDownloadProgress(cb)` | **poll** `speech.models.list` | upstream's own design: `downloadMobileSpeechModel`'s comment says progress is read back "via `listMobileSpeechModels` polling" |

Two of the eight RPC methods have no preload member. `speech.dictation.setup` writes
`settings.voice`, which the web client already reaches through `settings.*`; `speech.dictation.cancel`
is the mobile abort path, and the desktop shape aborts by calling `stopDictation` and discarding.
Leave both unrouted.

Fifteen of the seventeen are actually called by the renderer. `cancelDownload` and `onReady` have
zero call sites in `src/renderer/src` — do not route them, and say so in the patch header rather
than implying seventeen work.

## The streaming surface

**The push channel is `runtime.clientEvents.subscribe`, and it is already wired end to end.**

- Host: `defineStreamingMethod` in `src/main/runtime/rpc/core.ts`; the subscription is
  `CLIENT_EVENT_METHODS` in `rpc/methods/client-events.ts`, fed by `runtime.onClientEvent`.
- Transport: `WebRuntimeClient.subscribe()` opens a child socket and pumps frames
  (`web-runtime-client.ts:132`).
- Preload: `runtimeEnvironments.subscribe` already forwards to it (`web-preload-api.ts:1732`), and
  `nativeChat.subscribe` (`:1445`) is the precedent for an `on*`-shaped member built on that.
- Renderer: `src/renderer/src/runtime/runtime-client-events.ts` holds one subscription per
  environment and fans out by event type — **an overlay file we already own.**

So the streaming design is one event variant, not a new transport:

1. Add a `speechDictation` variant to `RuntimeClientEvent` (`src/shared/runtime-client-events.ts`)
   carrying `{ dictationId, phase: 'ready'|'partial'|'final'|'stopped'|'error', text?, error? }`.
2. Emit it from the callback `startMobileDictation` already installs
   (`orca-runtime.ts:14703-14718`). That callback currently *swallows* every event into
   `session.partialText` / `finalTexts` / `errors`; emitting alongside the buffer keeps the mobile
   batch contract intact.
3. In the web preload, back the five `on*` members with the existing shared subscription, filtered
   by `dictationId`. Each returns its unsubscribe synchronously, as `plugins.onChanged` does.

Rejected alternative: a dedicated `speech.dictation.subscribe` streaming method. It works, but
`WebRuntimeClient.subscribe` opens a **child WebSocket per subscription** (only file watches share
the main socket), so a dictation toggle would cost a socket handshake before the first syllable.
The clientEvents socket is already open.

## The batch answer

`finishMobileDictation` returns the whole transcript as one string
(`[...finalTexts, partialText].join(' ')`). With streaming added, that string is a duplicate of what
the client already received. The adapter must **not** replay it as a final transcript — resolve
`stopDictation` on it and drop it, or the last utterance lands twice. Without streaming it is the
only text the client ever sees, which is why a preload-only version of this patch would produce
dictation with no live feedback.

## The OpenAI key family

Three members, no wire. `src/main/speech/openai-api-key-store.ts` imports only
`shared/secret-store` and `node:fs`, and `setSecretStore(new ElectronSecretStore())` runs at
`src/main/index.ts:887` — the same startup block as the speech factories — so a new
`speech.openai.{status,save,clear}` family is reachable from the runtime graph without pulling
`electron` in and without breaking `config/runtime-electron-baseline.txt`.

**These three must stay off `MOBILE_RPC_METHOD_ALLOWLIST`.** The existing eight `speech.*` are on it
(`runtime-rpc.ts:408-415`) because upstream put them there; a key-minting method is the category
AGENTS.md names as privilege escalation. The negative case belongs in
`mobile-rpc-allowlist.test.ts` beside `cli.*` and `usage.*`.

## Constraints a build must respect

- **One dictation per host.** `this.mobileDictation` is a single slot and
  `startMobileDictation` throws `dictation_already_active`. Two browser tabs collide; a desktop
  window does not, because it uses a `desktop:` owner through `ipc/speech.ts` instead.
- **`hotwords` is lost.** The desktop writes a hotwords file and passes its path to
  `SttService.startDictation`; the RPC schema (`DictationStart`) has no such field. Either widen it
  or accept lower accuracy for terms in the workspace vocabulary — do not pretend it is carried.
- **Audio rate.** `use-audio-capture.ts:187` uses a 4096-sample `ScriptProcessorNode` at the
  AudioContext's native rate — roughly 85 ms and ~11 KB of base64 Int16 per chunk, ~12 chunks a
  second, through the E2EE JSON-RPC socket. The chunk schema's own ceiling is 5 s of 16 kHz audio,
  so size is not the risk; call rate is. `WebRuntimeSubscriptionHandle.sendBinary` is the fallback
  if it proves too chatty — that is the path terminal frames already take.
- **Microphone.** The browser owns `getUserMedia`; the macOS TCC dance in `ipc/speech.ts:122-134`
  is desktop-only and correctly absent from this design.
- **No stub.** `getSpeechSttService` throws `speech_unavailable` on a host with no factories
  installed. Route the rejection; do not answer a fake ready state.

## Two owners

`patches/`: `src/shared/runtime-client-events.ts` (the event variant),
`src/main/runtime/orca-runtime.ts` (the emit), `src/renderer/src/web/web-preload-api.ts` (the
namespace), `src/main/runtime/rpc/methods/index.ts` (the OpenAI family), and
`src/main/runtime/mobile-rpc-allowlist.test.ts` (the negative case).

`src/`: the RPC handler module for the OpenAI family, and the adapter that projects
`RuntimeSpeechSetupState` onto `SpeechModelManifest[]` / `SpeechModelState[]` — it is called from
the preload and must be unit-testable without a browser.

`src/renderer/src/runtime/runtime-client-events.ts` is already an overlay file; the fan-out for the
new variant goes there, not in a patch.

## Unverified

- That `setSpeechServiceFactories(electronSpeechServiceFactories)` (`index.ts:912`) executes under
  `orca serve`. Read from source — it sits in the same block as
  `shouldCoupleToDevParent = is.dev && !isServeMode`, with no serve branch above it. Not run.
- That a local sherpa-onnx model loads and transcribes inside the Linux AppImage at all. Nothing in
  this repo has ever exercised the speech worker on the artifact.
- Latency of partial transcripts over the shared clientEvents socket. The socket is shared with
  terminal side effects and SSH state; whether a partial arrives fast enough to feel live is
  measured, not reasoned.
- Whether `SttService`'s callback fires a `stopped` event on every termination path. The desktop
  handler treats it as authoritative for cleanup; the runtime's callback ignores it entirely today,
  so the variant's `stopped` phase is specified against the desktop handler, not observed.
- The renderer's dictation store was read only for its call sites. Whether `DictationController`
  tolerates a partial arriving after `stopDictation` resolved was not checked.
