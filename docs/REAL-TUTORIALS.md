# Actual-screen tutorial rollout

Updated 2026-11-05. The build center now renders the tutorial directly inside
each detail card, without a play-to-open step. Enlargement is optional.

## Playback

- Real screenshots are displayed as images with independent red SVG annotations.
  The sequence shows page context, a focused crop, then a reminder to return.
  This is a screenshot walkthrough, **not a recorded interaction video**.
- An IntersectionObserver starts the inline walkthrough only when visible.
  Timers stop offscreen, while that walkthrough is enlarged, and on unmount.
- One pass stops after three segments. Pause, replay and segment navigation remain.
- Reduced-motion preferences disable autoplay. Playback never acknowledges a
  task, submits credentials, runs a build, spends credits or changes any account.
- Aprico-local tasks highlight the actual input/button in the card rather than
  rendering an imitation of the page.

## Assets and provenance

Files are stored under `public/tutorials/real/`. Local screenshots were captured
from the real GitHub responsive UI at a requested 390 × 844 viewport. The public
PTgamingLife account/repository are examples, not defaults for customer projects.
Source pixels are unchanged; cropping and arrows are rendered by the viewer.

| File | Original source |
| --- | --- |
| github-create-mobile.jpg | https://github.com/new (empty unsubmitted form) |
| github-create-options-mobile.jpg | https://github.com/new (README on; never submitted) |
| github-repository-mobile.jpg | https://github.com/PTgamingLife/Aprico-LINE-OA-KIT |
| github-app-install.png | https://docs.github.com/assets/cb-118277/images/github-apps/install-app.png |
| github-app-authorize.png | https://docs.github.com/assets/cb-106378/images/github-apps/authorize-app.png |
| supabase-project-create-standard.png | https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/public/img/guides/integrations/appsmith/create-project-supabase-01.png |
| supabase-url.png | https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/public/img/guides/auth-workos/supabase-project-settings-url.png |
| line-channel-secret.png | https://developers.line.biz/media/messaging-api/verify-webhook-signature/channel-secret-en.png |
| line-channels.png | https://developers.line.biz/media/messaging-api/getting-started/console-home-en.png |
| line-webhook.png | https://developers.line.biz/media/messaging-api/build-bot/webhook-url-example-com.png |
| line-liff-list.webp | https://developers.line.biz/media/liff/order-of-liff-apps-en.webp |

Every screenshot includes attribution, a link to original instructions and
context where the official screenshot differs from Aprico or current mobile UI.
GitHub's example install screenshot has All repositories selected: our red box
and instructions explicitly direct Only select repositories. Its sample App
permissions must not be treated as Aprico's permission list.
The Supabase project screenshot is an older actual desktop UI. The URL screenshot
shows a Project URL field, not today's Connect workflow. LINE Channel ID currently
shows the prerequisite channel-selection screen, not the Basic settings ID field.
The LIFF screenshot shows the list, not its add/edit form. These limitations are
explicitly disclosed in each affected card.

## Remaining capture work

Do not call this a complete real-video library. No corresponding safe screenshot
is currently provided for GitHub/Supabase signup and verification, manual GitHub
PAT creation, Supabase Access Token creation, LINE long-lived Access Token,
or LINE OA Manager rich-menu editing. Those cards disclose that the screenshot
is pending and keep their written instructions/official links. Never substitute
an unrelated screenshot or an AI-generated console image for these tasks.

The signed-in Supabase Token page was **not inspected**: automatic approval review
blocked the attempted DOM read due to potential credential exposure. Do not retry
that route through another tool. Complete these captures using safe public
examples or separate explicit authorization and a plan that excludes credentials.
No private account token, secret, project usage, or customer content is included.

## Verification

- Asset existence, attribution, annotation bounds, camera bounds, deployment-key
  handling and explicit missing-image fallbacks are covered by the journey tests.
- Browser observed the first inline tutorial advance to segment 2 and display
  Pause without pressing Play. Later offscreen cards remained at segment 1.
- Subsequent mobile validation could not finish after the browser tool changed:
  Windows Computer Use stopped because it could not reliably determine the
  current browser URL. This is not a passed final mobile check.
