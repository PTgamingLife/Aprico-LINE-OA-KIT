// LINE's in-app browser keeps old copies of pages. Each build carries a number; on load the
// page asks the server (never cached) for the current one and, if it is newer, reloads itself
// once with ?v=<number> so LINE fetches the new page. No action needed from the visitor.
const BUILT = String(__BUILD__);

export async function stayFresh() {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    const latest = String((await res.json()).build ?? '');
    if (!/^\d+$/.test(latest) || latest === BUILT) return;
    const url = new URL(location.href);
    if (url.searchParams.get('v') === latest) return; // already tried once; do not loop
    url.searchParams.set('v', latest);
    location.replace(url.href);
  } catch {
    // Offline or blocked: keep showing what we have.
  }
}
stayFresh();
