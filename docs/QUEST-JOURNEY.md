# Build-center quest journey

The build center presents one human action per square and one combined automatic
square. GitHub can use the existing verified GitHub App binding, with an explicit
limited-token fallback. Supabase still requires deployment credentials. There is
no new Supabase OAuth or GitHub Actions deployment engine in this interface release.

## Secretary equipment room

- The left panel shows the verified LINE display name, project, OA name, grid size,
  and percentage calculated from individual required actions. Typing and saving
  are separate points; a link click never stands in for a server authorization.
- Eight equipment groups surround a modular SVG secretary. Users can select male
  or female appearance; only presentation changes, never authorization or progress.
  Completed equipment becomes solid on the character; incomplete equipment is ghosted.
  Supabase is named 儲物戒. Uniform and voice/knowledge are saved-design milestones,
  not extra points counted a second time in the build checklist.
- Every required journey page belongs to one equipment group. Selecting an item
  opens a native task dialog. Future tasks stay gated; old completed tasks remain
  viewable. The automatic stage and phone acceptance are grouped under the badge.
- Each detail has an adjacent phone diagram and a three-part, replayable tutorial:
  go to the setting, perform this action, return to Aprico. Controls include pause,
  previous/next, and direct segment selection. Images are clearly illustrative,
  use masked example data, and link to relevant official documentation.
- Reduced-motion preferences disable pointing/materialization motion. Nested
  tutorial dialogs close without cancelling the parent task or resetting its state.
- Appearance and nonsecret requirement notes are local to the device/project UUID.
  Notes are explicitly labeled local notes, not AI replies or executed modifications;
  recognizable credential formats are rejected and only allowlisted fields persist.
  Actual input settings still use the original owner-scoped cloud-save API.
- The proposed NT$1,680 / 1,680-point ledger, AI chat modifications, and automatic
  runtime AI service have NOT been connected in this frontend release. Existing
  payment, five-build entitlements, platform budget, and scheduled messages are unchanged.

### Release validation

- Unit coverage: equipment partitioning, no premature completion, appearance
  allowlist, note bounds/credential filtering, all detail tutorial scenes, granular
  progress, deployment-scoped acceptance, and no client-forged authorization.
- Mocked browser QA: male/female switching, appearance survives reload, click equipment
  to open its task dialog, blocked future equipment, tutorial modal/segment control,
  notes without paid API calls, and completion changing 27% to 28.3%.
- 390px viewport: document client/scroll widths both 375px; no horizontal overflow.
  Verification used mock projects only; no real generation, payment or deployment ran.

## User experience

- One field, account preparation, or credential action per page, with an illustrated
  phone guide. Existing accounts can use the acknowledgement button.
- A numbered map shows saved inputs, user acknowledgements, verified targets, and
  user-reported acceptance with distinct evidence labels. Future squares are locked.
- Non-secret settings remain in the existing owner-scoped cloud project. Map position
  and account acknowledgements are browser-local, keyed by project UUID. Cross-device
  acknowledgements are not claimed to be synced. No credentials/plan/intents are saved
  to browser storage or URLs. Credentials clear on refresh/navigation/submission.
- Explicit target verification happens BEFORE the AI build request. Unsupported AI
  runtime/health modules are rejected before any AI credit can be consumed.
- After target review and explicit consent, the existing generator and deployer are
  coordinated in the same automatic square. Technical logs/source are collapsed.
- Recheck exact bot ID/repository/project before publishing. A changed target stops
  the task rather than silently switching accounts. Never automatically retry a paid
  or uncertain request. Existing matching drafts can deploy even with zero credits.
- Keep the page open through generation and deployment handoff. Refresh cannot
  reconstruct the one-time consent or credentials; resume requires renewed consent.
- Use webhook, website/message/menu/optional LIFF tests remain separate human actions.
  The completion badge says user testing was reported, not independent system proof.

## API boundary

`deploy_target_check` is an authenticated studio action behind existing verified LINE
identity, project ownership, and build entitlement gates. It uses only the saved
project/configuration, not a caller-supplied target. It performs the existing read-only
preflight (plus LINE token verification POST), returns sanitized plan/revisions,
never starts AI/deployment, never persists credentials, and clears credential copies.
The subsequent existing deploy_prepare/start still repeat validation and revision
checks. No auth, grant, payment, credit, or campaign permissions were widened.

## Verification

- Node tests cover progress, storage whitelist, target changes, explicit consent,
  existing draft reuse, unsupported module rejection, and no-write target preflight.
- Local mocked browser flow completed all 23 non-LIFF squares. No real AI request,
  paid action, customer deployment, or real credentials were used.
- 390px responsive test: document client/scroll width both 375px, no horizontal overflow.
- Reloaded mocked page invoked only build_jobs and deploy_status, not generation.
- Existing teaching images are labeled illustrative, not actual account screenshots.
- Studio was v34 before this change; new v35 read-only action preserves original files.
- Full Actions orchestration is separate from the existing App/direct API deployment.
  Do not relabel a saved URL as platform authorization.
