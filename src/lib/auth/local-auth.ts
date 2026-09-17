// Deliberately minimal: one set of credentials, from env vars, plain
// comparison. That's acceptable ONLY because this is a local/dev tool for
// one person. Before this app is ever exposed beyond your own machine,
// swap this file's contents for Supabase Auth (email/password or magic
// link) — the login route and session cookie stay, only what backs
// verifyCredentials() changes.
export function verifyCredentials(email: string, password: string): boolean {
  const validEmail = process.env.LOCAL_AUTH_EMAIL;
  const validPassword = process.env.LOCAL_AUTH_PASSWORD;

  if (!validEmail || !validPassword) {
    throw new Error(
      'LOCAL_AUTH_EMAIL / LOCAL_AUTH_PASSWORD are not set — copy .env.example to .env and set them.'
    );
  }

  return email === validEmail && password === validPassword;
}
