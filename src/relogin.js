// LINE ID tokens last about an hour, but the page can stay "logged in" far longer. When the
// token is out of date we sign in again quietly instead of showing 「登入已失效」.
export function tokenExpired(liff, skewSeconds = 60) {
  try {
    const t = liff.getDecodedIDToken();
    return !t?.exp || t.exp * 1000 < Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

/** Sign in again, keeping the current address. Returns false when it was just tried. */
export function relogin(liff) {
  try {
    const key = 'aprico-relogin',
      last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 60000) return false;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // Without storage we cannot guard against a loop, so do not try.
    return false;
  }
  try {
    liff.logout();
  } catch {
    // Already signed out.
  }
  if (liff.isInClient?.()) location.reload();
  else liff.login({ redirectUri: location.href });
  return true;
}
