import { useEffect, useState, useMemo } from "react";
import { useI18n } from "../i18n-context.jsx";
import { apiDoses, apiMembers, apiMedicines } from "../api.js";
import { expectedTotalDoses, fmtDate } from "../dosing.js";

export default function History() {
  const { t, lang } = useI18n();
  const [members, setMembers] = useState([]);
  const [meds, setMeds] = useState([]);
  const [logs, setLogs] = useState([]);
  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    apiMembers.list().then(setMembers).catch(console.error);
    apiMedicines.list().then(setMeds).catch(console.error);
  }, []);

  const load = () => {
    const params = {};
    if (personId) params.person_id = personId;
    if (from) params.from = from;
    if (to) params.to = to + "T23:59:59";
    apiDoses.list(params).then(setLogs).catch(console.error);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [personId, from, to]);

  const stats = useMemo(() => {
    const totalDoses = logs.length;
    const totalMl = logs
      .filter((l) => l.unit === "mL")
      .reduce((s, l) => s + Number(l.amount_given), 0);
    // progress: sum over medicines of doses_taken / expected
    let expected = 0;
    let taken = 0;
    meds.forEach((m) => {
      if (personId && String(m.person_id) !== String(personId)) return;
      const exp = expectedTotalDoses(m.frequency_hours, m.duration_days);
      if (exp) {
        expected += exp;
        taken += logs.filter((l) => l.medicine_id === m.id).length;
      }
    });
    const pct = expected ? Math.min(100, Math.round((taken / expected) * 100)) : 0;
    return { totalDoses, totalMl, pct, expected, taken };
  }, [logs, meds, personId]);

  return (
    <>
      <h2>{t("history_title")}</h2>

      <div className="card">
        <label>{t("filter_person")}</label>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">{t("all")}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="row">
          <div>
            <label>{t("from")}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>{t("to")}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div className="stat">
            <div className="num">{stats.totalDoses}</div>
            <div className="lbl">{t("total_doses")}</div>
          </div>
          <div className="stat">
            <div className="num">{stats.totalMl}</div>
            <div className="lbl">{t("total_ml")}</div>
          </div>
          <div className="stat">
            <div className="num">{stats.pct}%</div>
            <div className="lbl">{t("course_progress")}</div>
          </div>
        </div>
        {(stats.expected > 0) && (
          <>
            <label>{t("course_progress")}</label>
            <div className="progress">
              <span style={{ width: stats.pct + "%" }} />
            </div>
            <div className="meta" style={{ fontSize: 12, marginTop: 6, textAlign: "center" }}>
              {stats.taken} / {stats.expected}
            </div>
          </>
        )}
      </div>

      <div className="card">
        {logs.length === 0 ? (
          <div className="empty" style={{ padding: "16px" }}>{t("no_logs")}</div>
        ) : (
          logs.map((l) => (
            <div className="log-row" key={l.id}>
              <div>
                <div className="l">{l.medicine_name || "—"}</div>
                <div className="s">
                  {l.amount_given} {l.unit} · {l.person_name || "—"}
                </div>
              </div>
              <div className="s">{fmtDate(l.timestamp, lang)}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
