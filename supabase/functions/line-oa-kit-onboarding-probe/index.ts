// Read-only preflight completed 2026-10-30. Aprico follower enumeration returned 403.
// Closed immediately. No scheduled sends or follow automation have been enabled.
Deno.serve(()=>new Response('disabled',{status:403}));
