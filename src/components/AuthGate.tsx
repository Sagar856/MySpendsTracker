import { useEffect, useState } from "react";
import { currentUser, onLogin, onLogout } from "../../netlify/functions/identity";
import LoginPage from "../pages/LoginPage";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(() => currentUser());

  useEffect(() => {
    onLogin((u) => setUser(u));
    onLogout(() => setUser(null));
  }, []);

  if (!user) return <LoginPage />;
  return <>{children}</>;
}