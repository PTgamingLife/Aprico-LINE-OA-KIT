# Aprico introduction campaign — active

Last verified: 2026-10-31 15:55 Asia/Taipei.

## Approved audience and schedule

- Aprico OA: @228srwlt (Messaging Channel 2010626491).
- Card 1, all friends: 2026-10-31 09:00 +08:00.
- Card 2, all friends: 2026-11-01 09:00 +08:00.
- New friends: first card promptly after a signed follow event; second card 24 hours
  after LINE accepts the first.
- User selected option 2: global broadcasts and new-friend messages run concurrently.
  Duplicates between those two flows during the overlap are explicitly accepted.
  Within the welcome sequence, replayed follow events do not restart the sequence.
- LINE message quota usage is authorized; no AI API is used.

## Verified production state

- control.enabled and control.welcome_enabled are true.
- Enabled at 2026-10-30 23:54:22.972524 Taipei.
- Cron job 11, aprico-intro-delivery, active, every minute.
- line-oa-kit-intro v1: source read back matches repository.
- line-assistant v46: source read back matches repository. Original assistant,
  owner commands, trial routing, and channel HMAC isolation preserved.
- Card 1 accepted by LINE at 2026-10-31 09:00:03.004678 Taipei, one attempt.
  Job f46f165c-4a6e-482d-808d-be5ed0f92dbd,
  request cde2e786-a0c4-4c3e-bd9c-bfbb9daaa757.
  DO NOT RESEND or reset this job.
- Card 2 job 5bfd813a-2da9-4c02-aed4-016280b3a056 remains pending, zero attempts,
  scheduled 2026-11-01 09:00 Taipei.
- One real new-friend first card was accepted at 2026-10-31 13:41:11.742007 Taipei.
  Its second card is pending for 2026-11-01 13:41:11.742007 Taipei.
  No raw friend ID is recorded in this document.
- Recent cron ticks return idle normally while no job is due.
- Accepted means the LINE API accepted a request, not proof of delivery or reading.

## Verification and safety

- 92/92 Node tests passed; Vite build passed.
- tests/intro-db.sql ran successfully in a transaction and rolled back, no HTTP.
- Both frozen cards passed real LINE validation before activation.
- Read-only preflight found basicId @228srwlt, estimated 5 friends, remaining 196
  messages. Every real send rechecks identity, quota, and format.
- Unauthenticated POST to line-oa-kit-intro returns 403.
- All four new tables have RLS enabled; anon/authenticated cannot SELECT.
- Security advisors found only intentional deny-all/no-policy INFO notices for the
  new tables; unrelated pre-existing shared-project warnings were not modified.
- Claims and begin-send are atomic; network calls occur outside DB locks.
- Stable job UUID is the LINE retry key. Ambiguous sends become unknown and are
  never automatically retried. Interrupted senders also become unknown.
- Signed follow/unfollow enrollment is persisted before acknowledging the webhook.
  Failure to persist returns 503; sends run in the background.
- Unfollow cancels pending/preflight welcome jobs. Unblocking does not restart them.
- Cron uses a random hashed single-use 90-second nonce, not a permanent admin key.
- Sender windows are bounded; quota/network preflight failures defer at most six
  attempts before blocking. Do not raise limits or force retries without approval.
- The separate read-only follower eligibility probe v2 stays disabled (403).

## Follow-up

App heartbeat automation aprico performs one read-only verification of card 2 on
2026-11-01 at 09:10 Taipei. It may report accepted or an actionable failure, but
cannot resend, create jobs, or change quota. Actual messaging is Supabase cron;
it does not depend on Codex being open.

## Operations

Do not rerun the activation script: its first-send deadline is intentionally past.
The seed is idempotent and never resets accepted jobs; it does not grant permission
to change an existing campaign. Read the job ledger before any operational change.

For an explicitly requested stop, disable control.enabled and welcome_enabled;
use cron.unschedule for this exact job only. Keep the ledger for audit rather than
deleting records or bypassing deduplication. Do not change other shared-project jobs.

The follower-list endpoint returned 403 for this OA, so full per-user dedup across
global broadcasts is unavailable. Do not substitute website members as all friends.
Reference: https://developers.line.biz/en/docs/messaging-api/getting-user-ids/

Historical note: DDL confirmations initially expired; a later explicitly approved
submission succeeded. The approval blocker is resolved.
