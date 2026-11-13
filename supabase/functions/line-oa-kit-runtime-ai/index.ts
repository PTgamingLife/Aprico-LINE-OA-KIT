import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { runtimeAI } from '../_shared/runtime-ai.ts';
import { oawApi } from '../_shared/oaw-api.ts';
import { oawConnect } from '../_shared/oaw-connect.ts';
import { healthScan } from '../_shared/oaw-health.ts';
import { billingReminders } from '../_shared/oaw-billing.ts';

// OAW template apps call /status, /design, /digest, /connect and /health-scan under this function.
const OAW_ROUTES = new Set(['status', 'design', 'digest']);

Deno.serve((req) => {
  // Both routes bill the subscription quota and run on Claude.
  const key = Deno.env.get('ANTHROPIC_API_KEY') || '';
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const route = new URL(req.url).pathname.split('/').pop() ?? '';
  if (route === 'health-scan') return healthScan(req, db, key);
  if (route === 'billing-reminders')
    return billingReminders(req, db, (to, messages) =>
      fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('LINE_OA_KIT_MESSAGING_ACCESS_TOKEN') || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, messages }),
      }),
    );
  if (route === 'connect') {
    // Notices go to the owner in the Aprico OA, where the revoke button is handled.
    const token = Deno.env.get('LINE_OA_KIT_MESSAGING_ACCESS_TOKEN') || '';
    return oawConnect(req, db, (to, messages) =>
      fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, messages }),
      }),
    );
  }
  return OAW_ROUTES.has(route) ? oawApi(req, db, key) : runtimeAI(req, db, key);
});
