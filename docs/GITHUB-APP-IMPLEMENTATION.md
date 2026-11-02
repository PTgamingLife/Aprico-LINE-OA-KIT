# GitHub App integration checkpoint — 2026-11-02

Implemented and tested the first stage: GitHub App OAuth + selected repository binding + integration with the existing direct-API deployer. This is not the future GitHub Actions deployment engine.

- 117 Node tests pass; production Vite build passes. No paid AI request or customer deployment was made.
- New endpoint `line-oa-kit-github` v2 and existing `line-oa-kit-studio` v37 deployed. Existing remote v36 sources matched HEAD before changes; unrelated dependencies preserved. OAuth redirects back to the GitHub Pages UI, avoiding Supabase default-domain HTML rewriting.
- Anonymous status requests and unsigned GitHub webhooks both return 401.
- OAuth launch is an origin-checked top-level POST, sets an HttpOnly Secure SameSite=Lax first-party cookie, then redirects to GitHub. Callback requires that cookie, a one-use hashed state, and PKCE S256. No token in links or browser storage.
- Bindings are scoped to a verified LINE subject and project. Browser-supplied installation IDs have no authority. User token is held only during callback to discover repositories and then discarded. It must expire; no refresh token is stored.
- Installation token requests specify one repository ID and required permissions. The deployer checks the repository ID, target URLs and existing resources before writing. Token revocation is attempted after preflight/task completion; no silent retry/fallback to a manual token when App access fails.
- Gate `LINE_OA_KIT_GITHUB_ENABLED` must stay unset until schema, App credentials and isolated real authorization tests are complete.

## Remaining external steps

1. Schema `supabase/github-app.sql` is **not applied**. Supabase `apply_migration` confirmation expired twice; stopped retrying. A read-only check confirmed both new tables absent. Do not bypass the confirmation via a different SQL writer.
2. Platform owner must register the GitHub App and store six settings per `GITHUB-APP-SETUP.md`. Never request secret values in chat.
3. Obtain a fresh native Supabase schema-change confirmation, apply the reviewed SQL, verify function ownership/RLS/grants and test single-use binding in a rolled-back transaction. Run security advisors after applying.
4. Only after schema readiness, enable App integration and run real OAuth/installation/revocation tests using a dedicated non-customer repo. Do not run the paused Test build or spend AI credits merely to test authorization.
5. Actions deployment remains separate work: trusted workflow, least permissions, task-scoped credentials/OIDC, progress reporting and idempotency. Do not call the current API deployer Actions.

Pre-existing `docs/SALES-POLICY-DRAFT.md` edits are unrelated and must remain uncommitted.

## Owner setup follow-up

Owner reported App setup complete. Read-only CLI secret metadata confirms all six `LINE_OA_KIT_GITHUB_*` configuration names exist; `ENABLED` remains absent. Secret values were not read, so this is not credential-validity verification. Public GitHub App API confirms ID 5574298, slug `aprico-ai-studio-builder`, owner PTgamingLife. Its response currently reports empty `permissions` and `events`; inspect the App's Permissions & events before activation rather than assuming write permissions were granted.

A fresh schema apply confirmation again returned expired, with no DDL applied. Asked the owner whether the native confirmation was visible; do not keep resubmitting or bypass it with another writer. OAuth and installation-token tests remain pending the schema and configuration gates.

## Schema and App readiness completed

After the owner confirmed readiness to approve, `aprico_github_app_owner_scoped_connection` applied successfully through the native migration tool. Verified both tables have RLS enabled and no anon/authenticated SELECT access; both RPCs are SECURITY INVOKER, callable by service_role only. A rolled-back fixture transaction passed wrong-owner initiation, wrong-owner selection, unlisted repo, expired selection, valid exact-target binding, repeated selection rejection, and verifier/choices clearing. No fixture records were retained.

Security advisor reports only INFO `rls_enabled_no_policy` for these intentionally server-only tables. This is expected: no browser role has table grants, and no permissive browser policies should be added. Existing unrelated findings were not changed.

Inspected the App in the owner's GitHub session. All repository permissions were initially No access; saved exactly Administration/Contents/Pages write, with mandatory Metadata read. Verified fixed callback URI, wildcard matching off, active webhook at the expected URL, and user-token expiration enabled. Public App API confirms these saved permissions. No private key or client secret values were opened. Proof screenshot is a gitignored local QA artifact.

`LINE_OA_KIT_GITHUB_ENABLED=true` is now set to allow the owner to perform the real connection test. Opened the public build center; the Chrome session needs LINE login. Final real OAuth, client-secret validity and installation-token checks still require the owner's LINE login and selection of a dedicated repository. Nothing has called paid AI, deployed a customer project, or installed the App across all repositories. Actions engine remains future work.
