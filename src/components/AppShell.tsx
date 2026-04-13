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

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-md text-sm whitespace-nowrap ${
          isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const user = currentUser();

  return (
    <div className="min-h-screen bg-muted/30 overflow-x-hidden">
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/transactions" className="font-semibold shrink-0">
            Finance
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <span className="text-sm text-muted-foreground hidden md:inline">
              {user?.email}
            </span>
            <Button variant="outline" onClick={logout} className="h-9">
              Logout
            </Button>
          </div>
        </div>

        {/* Mobile navigation (md hidden) */}
        <div className="md:hidden border-t">
          <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 py-2 overflow-x-auto">
            <nav className="flex gap-2 min-w-max">
              {nav.map((n) => (
                <NavItem key={n.to} to={n.to} label={n.label} />
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 py-4 grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-4 min-w-0">
        {/* Desktop sidebar */}
        <aside className="hidden md:block bg-background border rounded-lg p-3 h-fit min-w-0">
          <div className="text-xs text-muted-foreground px-2 pb-2">
            Navigation
          </div>
          <Separator />
          <nav className="pt-2 flex flex-col gap-2">
            {nav.map((n) => (
              <NavItem key={n.to} to={n.to} label={n.label} />
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="bg-background border rounded-lg p-3 sm:p-4 min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}