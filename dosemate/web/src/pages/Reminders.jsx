import { useEffect, useState, useRef } from "react";
import { useI18n } from "../i18n-context.jsx";
import { apiMedicines, apiDoses } from "../api.js";
import { nextDoseTime } from "../dosing.js";

export default function Reminders() {
  const { t } = useI18n();
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [meds, setMeds] = useState([]);
  const [status, setStatus] = useState("");
  const notifiedRef = useRef(new Set());

  useEffect(() => {
    apiMedicines.list({ active: "true" }).then(setMeds).catch(console.error);
  }, []);

  const enable = async () => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    const p = await Notification.requestPermission();
    setPermission(p);
  };

  // poll every 30s for due doses and fire a notification
  useEffect(() => {
    if (permission !== "granted") return;
    const check = async () => {
      try {
        const list = await apiMedicines.list({ active: "true" });
        for (const m of list) {
          const next = nextDoseTime(m.last_dose_at, m.frequency_hours);
          const due = !next || new Date(next).getTime() <= Date.now();
          if (due) {
            const key = `${m.id}-${m.last_dose_at || "start"}`;
            if (!notifiedRef.current.has(key)) {
              notifiedRef.current.add(key);
              new Notification("💊 DoseMate", {
                body: `${m.name} — ${t("due_now")} (${m.person_name || ""})`,
              });
              setStatus(m.name + " — " + t("due_now"));
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [permission]);

  return (
    <>
      <h2>{t("reminders_title")}</h2>
      <div className="card">
        {permission === "granted" ? (
          <div style={{ textAlign: "center", color: "var(--green)", fontWeight: 700 }}>
            ✅ {t("notif_enabled")}
          </div>
        ) : permission === "denied" ? (
          <div className="warn">{t("notif_denied")}</div>
        ) : (
          <button className="btn" onClick={enable}>
            🔔 {t("enable_notif")}
          </button>
        )}
        {status && (
          <div className="card" style={{ marginTop: 14, marginBottom: 0, background: "var(--blue-soft)" }}>
            💊 {status}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>{t("nav_home")}</h3>
        {meds.length === 0 ? (
          <div className="empty" style={{ padding: "12px" }}>{t("no_due")}</div>
        ) : (
          meds.map((m) => {
            const next = nextDoseTime(m.last_dose_at, m.frequency_hours);
            const due = !next || new Date(next).getTime() <= Date.now();
            return (
              <div className="log-row" key={m.id}>
                <div>
                  <div className="l">{m.name}</div>
                  <div className="s">{m.person_name || "—"}</div>
                </div>
                <div className="s">{due ? "🔴 " + t("due_now") : "⏳ " + new Date(next).toLocaleTimeString()}</div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
