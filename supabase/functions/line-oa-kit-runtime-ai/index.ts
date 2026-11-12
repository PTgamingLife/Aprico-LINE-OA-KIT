import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { runtimeAI } from '../_shared/runtime-ai.ts';
import { oawApi } from '../_shared/oaw-api.ts';

// OAW template apps call /status, /design and /digest under this function.
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
  return OAW_ROUTES.has(route) ? oawApi(req, db, key) : runtimeAI(req, db, key);
});
