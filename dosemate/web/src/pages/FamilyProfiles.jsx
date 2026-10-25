import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context.jsx";
import { apiMembers } from "../api.js";
import { isBaby, weightRefTable } from "../dosing.js";

export default function FamilyProfiles() {
  const { t } = useI18n();
  const [members, setMembers] = useState([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", age: "", weight: "" });
  const [editingId, setEditingId] = useState(null);

  const load = () =>
    apiMembers.list().then(setMembers).catch((e) => console.error("members load", e));
  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setDraft({ name: "", age: "", weight: "" });
    setAdding(false);
    setEditingId(null);
  };

  const save = async () => {
    if (!draft.name || draft.age === "") return;
    const body = { name: draft.name, age: Number(draft.age), weight: draft.weight || null };
    if (editingId) await apiMembers.update(editingId, body);
    else await apiMembers.create(body);
    reset();
    load();
  };

  const edit = (m) => {
    setEditingId(m.id);
    setAdding(true);
    setDraft({ name: m.name, age: m.age, weight: m.weight || "" });
  };

  const remove = async (m) => {
    if (!confirm(t("confirm_delete"))) return;
    await apiMembers.remove(m.id);
    load();
  };

  return (
    <>
      <h2>{t("family_title")}</h2>
      {members.length === 0 && !adding && <div className="empty">{t("no_members")}</div>}

      {members.map((m) => (
        <div className="card" key={m.id}>
          <div className="head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {m.name} {isBaby(m.age) && "🍼"}
              </div>
              <div className="meta">
                {m.age} {t("age")?.includes("year") ? "yrs" : "वर्ष"}
                {m.weight ? ` · ${m.weight} kg` : ""} · {isBaby(m.age) ? t("baby") : t("adult")}
              </div>
              {isBaby(m.age) && (
                <div style={{ fontSize: 12, color: "var(--blue-dark)", marginTop: 6 }}>
                  {t("baby_hint")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => edit(m)}>
                ✏️
              </button>
              <button className="btn btn-red btn-sm" onClick={() => remove(m)}>
                🗑️
              </button>
            </div>
          </div>
          {isBaby(m.age) && m.weight && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 13, color: "var(--blue)", cursor: "pointer" }}>
                {t("weight_ref")}
              </summary>
              <table style={{ width: "100%", fontSize: 12, marginTop: 6 }}>
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th style={{ textAlign: "left" }}>kg</th>
                    <th>mL</th>
                  </tr>
                </thead>
                <tbody>
                  {weightRefTable("syrup")
                    .filter((r) => r.weight <= 12)
                    .map((r) => (
                      <tr key={r.weight} style={r.weight === Number(m.weight) ? { background: "var(--blue-soft)" } : {}}>
                        <td>{r.weight}</td>
                        <td style={{ textAlign: "right" }}>{r.ml}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      ))}

      {adding && (
        <div className="card">
          <label>{t("name")}</label>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="row">
            <div>
              <label>{t("age")}</label>
              <input
                type="number"
                value={draft.age}
                onChange={(e) => setDraft({ ...draft, age: e.target.value })}
              />
            </div>
            <div>
              <label>{t("weight")}</label>
              <input
                type="number"
                step="0.1"
                value={draft.weight}
                onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
              />
            </div>
          </div>
          {draft.age !== "" && isBaby(Number(draft.age)) && (
            <div className="warn" style={{ marginTop: 10 }}>{t("baby_hint")}</div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={reset}>
              {t("cancel")}
            </button>
            <button className="btn" onClick={save}>
              {t("save")}
            </button>
          </div>
        </div>
      )}

      {!adding && (
        <button className="btn" onClick={() => setAdding(true)}>
          ➕ {t("add_member")}
        </button>
      )}
    </>
  );
}
