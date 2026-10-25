import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n-context.jsx";
import { apiMedicines, apiMembers, analyzePhoto } from "../api.js";
import { isBaby, weightBasedMl, weightRefTable } from "../dosing.js";

export default function AddMedicine() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [members, setMembers] = useState([]);
  const [photo, setPhoto] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [detectMsg, setDetectMsg] = useState("");
  const [form, setForm] = useState({
    name: "",
    form: "tablet",
    dose_amount: 1,
    dose_unit: "tablets",
    frequency_hours: 8,
    duration_days: 5,
    person_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    active: true,
  });

  useEffect(() => {
    apiMembers.list().then(setMembers).catch(console.error);
  }, []);

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const detect = async () => {
    if (!photo) return;
    setAnalyzing(true);
    setDetectMsg("");
    try {
      const r = await analyzePhoto(photo);
      setForm((f) => ({
        ...f,
        name: r.name || f.name,
        form: r.form || f.form,
      }));
      setDetectMsg(t("detected") + (r.dose_suggestion ? " — " + r.dose_suggestion : ""));
    } catch (e) {
      setDetectMsg("AI error: " + e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const selectedMember = members.find((m) => String(m.id) === String(form.person_id));
  const baby = selectedMember ? isBaby(selectedMember.age) : false;

  const onPersonChange = (id) => {
    const member = members.find((m) => String(m.id) === String(id));
    setForm((f) => ({
      ...f,
      person_id: id,
      // baby mode -> mL by weight
      dose_unit: member && isBaby(member.age) ? "mL" : f.dose_unit,
      dose_amount: member && isBaby(member.age) && member.weight
        ? weightBasedMl(member.weight, form.form)
        : f.dose_amount,
    }));
  };

  const onFormChange = (newForm) => {
    setForm((f) => {
      const member = members.find((m) => String(m.id) === String(f.person_id));
      const babyMode = member && isBaby(member.age);
      let unit = newForm === "syrup" || newForm === "drops" ? "mL" : "tablets";
      let amount = f.dose_amount;
      if (babyMode && member?.weight) amount = weightBasedMl(member.weight, newForm);
      return { ...f, form: newForm, dose_unit: unit, dose_amount: amount };
    });
  };

  const save = async () => {
    if (!form.name || !form.person_id) {
      alert((lang === "hi" ? "नाम और सदस्य भरें" : "Enter name & member"));
      return;
    }
    const payload = { ...form, photo };
    await apiMedicines.create(payload);
    nav("/");
  };

  return (
    <>
      <h2>{t("add_title")}</h2>
      <div className="card">
        <label>{t("upload_photo")}</label>
        {photo && <img src={photo} className="photo-preview" alt="medicine" />}
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
        <button
          className="btn btn-ghost"
          style={{ marginTop: 10 }}
          disabled={!photo || analyzing}
          onClick={detect}
        >
          {analyzing ? t("analyzing") : "🤖 " + t("analyze")}
        </button>
        {detectMsg && (
          <div className="meta" style={{ fontSize: 13, marginTop: 8, color: "var(--blue-dark)" }}>
            {detectMsg}
          </div>
        )}
      </div>

      <div className="card">
        <label>{t("medicine_name")}</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

        <label>{t("form")}</label>
        <select value={form.form} onChange={(e) => onFormChange(e.target.value)}>
          <option value="tablet">Tablet</option>
          <option value="syrup">Syrup</option>
          <option value="drops">Drops</option>
          <option value="injection">Injection</option>
        </select>

        <div className="row">
          <div>
            <label>{t("dose_amount")}</label>
            <input
              type="number"
              step="0.1"
              value={form.dose_amount}
              onChange={(e) => setForm({ ...form, dose_amount: e.target.value })}
            />
          </div>
          <div>
            <label>{t("dose_unit")}</label>
            <select
              value={form.dose_unit}
              onChange={(e) => setForm({ ...form, dose_unit: e.target.value })}
            >
              <option value="tablets">{t("tablets")}</option>
              <option value="mL">{t("ml")}</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div>
            <label>{t("frequency")}</label>
            <input
              type="number"
              value={form.frequency_hours}
              onChange={(e) => setForm({ ...form, frequency_hours: e.target.value })}
            />
          </div>
          <div>
            <label>{t("duration")}</label>
            <input
              type="number"
              value={form.duration_days}
              onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
            />
          </div>
        </div>

        <label>{t("who_for")}</label>
        <select value={form.person_id} onChange={(e) => onPersonChange(e.target.value)}>
          <option value="">{t("select_member")}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.age}y{m.weight ? `, ${m.weight}kg` : ""})
              {isBaby(m.age) ? " 🍼" : ""}
            </option>
          ))}
        </select>

        {baby && (
          <>
            <div className="warn" style={{ marginTop: 10 }}>{t("child_warning")}</div>
            <div className="meta" style={{ fontSize: 13, marginTop: 8, color: "var(--muted)" }}>
              {t("weight_ref")} · {selectedMember?.weight}kg →{" "}
              <b>{weightBasedMl(selectedMember?.weight, form.form)} mL</b>
            </div>
            <details style={{ marginTop: 8 }}>
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
                  {weightRefTable(form.form)
                    .filter((r) => r.weight % 3 === 0)
                    .map((r) => (
                      <tr key={r.weight}>
                        <td>{r.weight}</td>
                        <td style={{ textAlign: "right" }}>{r.ml}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          </>
        )}

        <div className="row">
          <div>
            <label>{t("start_date")}</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            <label>{t("end_date")}</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
        </div>
      </div>

      <button className="btn" onClick={save} disabled={!form.name || !form.person_id}>
        💾 {t("save")}
      </button>
    </>
  );
}
