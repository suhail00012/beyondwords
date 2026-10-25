import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n-context.jsx";
import { apiMedicines, apiDoses } from "../api.js";
import { nextDoseTime, formatCountdown } from "../dosing.js";

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Dashboard() {
  const { t } = useI18n();
  const nav = useNavigate();
  const now = useNow();
  const [meds, setMeds] = useState([]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await apiMedicines.list({ active: "true" });
    setMeds(data);
    setLoading(false);
  };
  useEffect(() => {
    load().catch(console.error);
  }, []);

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 1800);
  };

  const markTaken = async (m) => {
    await apiDoses.create({
      medicine_id: m.id,
      person_id: m.person_id,
      amount_given: m.dose_amount,
      unit: m.dose_unit,
    });
    showToast("✓ " + t("mark_taken"));
    load();
  };

  const enriched = useMemo(() => {
    return meds.map((m) => {
      const next = nextDoseTime(m.last_dose_at, m.frequency_hours);
      let status = "future";
      let ms = null;
      if (next) {
        ms = next.getTime() - now;
        status = ms <= 0 ? "overdue" : ms < 30 * 60 * 1000 ? "due" : "future";
      } else {
        // no dose logged yet -> due now (course start)
        status = "due";
        ms = 0;
      }
      return { m, next, status, ms };
    });
  }, [meds, now]);

  if (loading) return <div className="empty">{t("loading")}</div>;

  if (!meds.length) {
    return (
      <>
        <h2>{t("todays_doses")}</h2>
        <div className="empty">
          <p>{t("no_medicines")}</p>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => nav("/add")}>
            ➕ {t("nav_add")}
          </button>
        </div>
      </>
    );
  }

  // sort: overdue/due first
  const ordered = [...enriched].sort((a, b) => (a.ms || 0) - (b.ms || 0));

  return (
    <>
      <h2>{t("todays_doses")}</h2>
      {ordered.map(({ m, next, status, ms }) => {
        const cd = formatCountdown(ms);
        return (
          <div className="card dose-item" key={m.id}>
            <div className="head">
              <div>
                <div className="mname">{m.name}</div>
                <div className="mperson">
                  {m.person_name || "—"} · {m.form}
                </div>
                <div className="meta">
                  {m.dose_amount} {m.dose_unit} · {t("frequency")?.replace(
                    "(every X hours)",
                    ""
                  )?.trim() || "every"} {m.frequency_hours}h
                </div>
              </div>
              <span className={`pill ${m.active ? "pill-active" : "pill-inactive"}`}>
                {m.active ? t("active") : t("inactive")}
              </span>
            </div>
            <div className="countdown">
              {status === "due" || status === "overdue" ? (
                <span className={status === "overdue" ? "overdue" : "due"}>
                  {status === "overdue" ? t("overdue") : t("due_now")}
                </span>
              ) : (
                <span>
                  {t("next_dose")} {cd}
                </span>
              )}
            </div>
            <button
              className={`btn ${status === "overdue" ? "btn-amber" : "btn-green"}`}
              onClick={() => markTaken(m)}
            >
              ✓ {t("mark_taken")}
            </button>
          </div>
        );
      })}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
