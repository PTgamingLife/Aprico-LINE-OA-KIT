# Build-center quest journey

2026-11-02. The build center presents one human action per square and one combined
automatic square. No new GitHub App, Supabase OAuth, or Actions deployment engine
is claimed: it uses the existing limited-token/direct-API deployment engine.

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
- GitHub Actions/OAuth setup is a separate future implementation requiring registered
  integration credentials. Do not relabel a saved URL as platform authorization.
