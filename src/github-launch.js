// A top-level POST lets the Edge set a first-party HttpOnly cookie before OAuth.
// Never put the LINE ID token, GitHub code or PKCE verifier in a link/storage.
export function launchGithub(endpoint, payload) {
  // Stay in the same browsing context on LINE/iOS. `noreferrer` must not be
  // used here: it can turn the POST Origin into null and fail the origin check.
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = endpoint;
  form.target = '_self';
  form.rel = 'noopener';
  form.hidden = true;
  const input = document.createElement('input');
  input.name = 'payload';
  input.type = 'hidden';
  input.value = JSON.stringify(payload);
  form.appendChild(input);
  document.body.appendChild(form);
  try {
    form.submit();
  } finally {
    input.value = '';
    form.remove();
  }
  return { launched: true };
}
