import { useEffect, useState } from "react";
import { currentUser, onLogin, onLogout } from "../auth/identity";
import LoginPage from "../pages/LoginPage";

const DISABLE_AUTH = import.meta.env.VITE_DISABLE_AUTH === "true"; // disabled

export default function AuthGate({ children }: { children: React.ReactNode }) {
  if (DISABLE_AUTH) return <>{children}</>;  // disabled

  const [user, setUser] = useState<any>(() => currentUser());

  useEffect(() => {
    onLogin((u) => setUser(u));
    onLogout(() => setUser(null));
  }, []);

  if (!user) return <LoginPage />;
  return <>{children}</>;
}