import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthGate from "./components/AuthGate";
import AppShell from "./components/AppShell";
import TransactionsPage from "./pages/TransactionsPage";
import MonthlyDashboardPage from "./pages/MonthlyDashboardPage";
import InvestmentDashboardPage from "./pages/InvestmentDashboardPage";
import LoansDashboardPage from "./pages/LoansDashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/transactions" replace />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/dashboard/monthly" element={<MonthlyDashboardPage />} />
            <Route path="/dashboard/investments" element={<InvestmentDashboardPage />} />
            <Route path="/dashboard/loans" element={<LoansDashboardPage />} />
          </Routes>
        </AppShell>
      </AuthGate>
    </BrowserRouter>
  );
}