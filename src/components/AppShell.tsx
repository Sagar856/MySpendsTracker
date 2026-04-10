import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { logout, currentUser } from "../auth/identity";
import { Separator } from "@/components/ui/separator";
import ThemeToggle from "./ThemeToggle";

const nav = [
  { to: "/transactions", label: "Transactions" },
  { to: "/dashboard/monthly", label: "Monthly" },
  { to: "/dashboard/investments", label: "Investments" },
  { to: "/dashboard/loans", label: "Loans" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const user = currentUser();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="mx-auto max-w-6xl p-4 flex items-center justify-between">
          <Link to="/transactions" className="font-semibold">Finance</Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="outline" onClick={logout}>Logout</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-4 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        <aside className="bg-background border rounded-lg p-3 h-fit">
          <div className="text-xs text-muted-foreground px-2 pb-2">Navigation</div>
          <Separator />
          <nav className="pt-2 flex md:flex-col gap-2 flex-wrap">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm ${
                    isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="bg-background border rounded-lg p-4">{children}</main>
      </div>
    </div>
  );
}