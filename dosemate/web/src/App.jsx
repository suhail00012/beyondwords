import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { useI18n } from "./i18n-context.jsx";
import Disclaimer from "./components/Disclaimer.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AddMedicine from "./pages/AddMedicine.jsx";
import FamilyProfiles from "./pages/FamilyProfiles.jsx";
import History from "./pages/History.jsx";
import Reminders from "./pages/Reminders.jsx";

function TopBar() {
  const { t, toggle } = useI18n();
  return (
    <div className="topbar">
      <div className="brand">
        <h1>💊 {t("appName")}</h1>
        <span>{t("tagline")}</span>
      </div>
      <button className="lang-btn" onClick={toggle}>
        {t("lang")}
      </button>
    </div>
  );
}

function BottomNav() {
  const { t } = useI18n();
  const item = (to, icon, label) => (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) => (isActive ? "active" : "")}
    >
      <span className="ic">{icon}</span>
      <span>{t(label)}</span>
    </NavLink>
  );
  return (
    <nav className="bottom-nav">
      {item("/", "🏠", "nav_home")}
      {item("/add", "➕", "nav_add")}
      {item("/family", "👨‍👩‍👧", "nav_family")}
      {item("/history", "📋", "nav_history")}
      {item("/reminders", "🔔", "nav_reminders")}
    </nav>
  );
}

export default function App() {
  const loc = useLocation();
  // Show disclaimer on dose-related screens (everywhere except reminders)
  const showDisclaimer = loc.pathname !== "/reminders";
  return (
    <div className="app">
      <TopBar />
      <main className="page">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/add" element={<AddMedicine />} />
          <Route path="/family" element={<FamilyProfiles />} />
          <Route path="/history" element={<History />} />
          <Route path="/reminders" element={<Reminders />} />
        </Routes>
      </main>
      {showDisclaimer && <Disclaimer />}
      <BottomNav />
    </div>
  );
}
