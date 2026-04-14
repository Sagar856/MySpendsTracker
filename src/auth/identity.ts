import netlifyIdentity from "netlify-identity-widget";

export function initIdentity() {
  netlifyIdentity.init();
}

export function openLogin() {
  // force login view (no signup tab by default)
  netlifyIdentity.open("login");
}

export function logout() {
  netlifyIdentity.logout();
}

export function currentUser() {
  return netlifyIdentity.currentUser();
}

export async function getAccessToken(): Promise<string | null> {
  const user = netlifyIdentity.currentUser();
  if (!user) return null;
  await user.jwt(true);
  return user.token?.access_token ?? null;
}

export function onLogin(cb: (user: any) => void) {
  netlifyIdentity.on("login", cb);
}

export function onLogout(cb: () => void) {
  netlifyIdentity.on("logout", cb);
}

netlifyIdentity.init({
  APIUrl: "/.netlify/identity",
});