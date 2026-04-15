import netlifyIdentity from "netlify-identity-widget";

let initialized = false;

export function initIdentity() {
  if (initialized) return;
  initialized = true;

  netlifyIdentity.init({
    APIUrl: "/.netlify/identity",
  });

  // Close the widget immediately after login so user doesn't see the "Logged in as" view
  netlifyIdentity.on("login", () => {
    netlifyIdentity.close();
  });

  // Optional: also close on logout
  netlifyIdentity.on("logout", () => {
    netlifyIdentity.close();
  });
}

export function openLogin() {
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