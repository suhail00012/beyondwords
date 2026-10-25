import express from "express";
import cors from "cors";
import { migrate, query } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 8000;

/* ---------------- OpenAI Vision analysis ---------------- */
async function analyzeMedicinePhoto(base64DataUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw { status: 503, message: "OpenAI key not configured." };
  }
  const prompt = `You are a medication-identification assistant for a family dose tracker app used in India.
Analyze this photo of a medicine (tablet strip, syrup bottle, drops, injection label).
Return ONLY a JSON object (no markdown fences) with these fields:
{
  "name": "medicine brand or generic name as printed",
  "form": "one of: tablet | syrup | drops | injection",
  "dose_suggestion": "short standard adult dosing note, e.g. '1 tablet every 8 hours' or '10 mL every 6 hours'. Use Hindi+English mix if the label is in Hindi."
}
If you cannot read the label, return {"name":"", "form":"tablet", "dose_suggestion":"Could not read clearly - please enter manually."}.`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this medicine photo and return the JSON object.",
            },
            { type: "image_url", image_url: { url: base64DataUrl } },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw { status: 502, message: `OpenAI error: ${res.status} ${txt}` };
  }
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || "{}";
  content = content.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { name: "", form: "tablet", dose_suggestion: "" };
  }
  return {
    name: parsed.name || "",
    form: ["tablet", "syrup", "drops", "injection"].includes(parsed.form)
      ? parsed.form
      : "tablet",
    dose_suggestion: parsed.dose_suggestion || "",
  };
}

/* ---------------- health ---------------- */
app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ---------------- family members ---------------- */
app.get("/api/members", async (_req, res) => {
  const r = await query(
    "SELECT * FROM family_members ORDER BY is_baby DESC, name ASC"
  );
  res.json(r.rows);
});

app.post("/api/members", async (req, res) => {
  const { name, age, weight, is_baby } = req.body;
  if (!name || age == null) return res.status(400).json({ error: "name & age required" });
  const baby = is_baby == null ? Number(age) < 2 : !!is_baby;
  const r = await query(
    "INSERT INTO family_members (name, age, weight, is_baby) VALUES ($1,$2,$3,$4) RETURNING *",
    [name, Number(age), weight || null, baby]
  );
  res.status(201).json(r.rows[0]);
});

app.put("/api/members/:id", async (req, res) => {
  const { name, age, weight, is_baby } = req.body;
  const baby = is_baby == null ? Number(age) < 2 : !!is_baby;
  const r = await query(
    "UPDATE family_members SET name=$1, age=$2, weight=$3, is_baby=$4 WHERE id=$5 RETURNING *",
    [name, Number(age), weight || null, baby, req.params.id]
  );
  if (!r.rowCount) return res.status(404).json({ error: "not found" });
  res.json(r.rows[0]);
});

app.delete("/api/members/:id", async (req, res) => {
  await query("DELETE FROM family_members WHERE id=$1", [req.params.id]);
  res.status(204).end();
});

/* ---------------- medicines ---------------- */
app.get("/api/medicines", async (req, res) => {
  const { person_id, active } = req.query;
  let sql = `SELECT m.*, fm.name AS person_name,
      (SELECT MAX(timestamp) FROM dose_logs dl WHERE dl.medicine_id = m.id) AS last_dose_at
    FROM medicines m
    LEFT JOIN family_members fm ON fm.id = m.person_id`;
  const cond = [];
  const params = [];
  if (person_id) {
    params.push(person_id);
    cond.push(`m.person_id = $${params.length}`);
  }
  if (active !== undefined) {
    params.push(active === "true");
    cond.push(`m.active = $${params.length}`);
  }
  if (cond.length) sql += " WHERE " + cond.join(" AND ");
  sql += " ORDER BY m.created_at DESC";
  const r = await query(sql, params);
  res.json(r.rows);
});

app.post("/api/medicines", async (req, res) => {
  const {
    name, form, photo, dose_amount, dose_unit, frequency_hours,
    duration_days, person_id, start_date, end_date, active,
  } = req.body;
  if (!name || !form || dose_amount == null || !dose_unit || !frequency_hours)
    return res.status(400).json({ error: "missing required fields" });
  const r = await query(
    `INSERT INTO medicines
      (name, form, photo, dose_amount, dose_unit, frequency_hours, duration_days,
       person_id, start_date, end_date, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      name, form, photo || null, Number(dose_amount), dose_unit,
      Number(frequency_hours), duration_days || null, person_id || null,
      start_date || null, end_date || null, active == null ? true : !!active,
    ]
  );
  res.status(201).json(r.rows[0]);
});

app.put("/api/medicines/:id", async (req, res) => {
  const {
    name, form, photo, dose_amount, dose_unit, frequency_hours,
    duration_days, person_id, start_date, end_date, active,
  } = req.body;
  const r = await query(
    `UPDATE medicines SET
      name=$1, form=$2, photo=$3, dose_amount=$4, dose_unit=$5, frequency_hours=$6,
      duration_days=$7, person_id=$8, start_date=$9, end_date=$10, active=$11
     WHERE id=$12 RETURNING *`,
    [
      name, form, photo || null, Number(dose_amount), dose_unit,
      Number(frequency_hours), duration_days || null, person_id || null,
      start_date || null, end_date || null, active == null ? true : !!active,
      req.params.id,
    ]
  );
  if (!r.rowCount) return res.status(404).json({ error: "not found" });
  res.json(r.rows[0]);
});

app.delete("/api/medicines/:id", async (req, res) => {
  await query("DELETE FROM medicines WHERE id=$1", [req.params.id]);
  res.status(204).end();
});

/* ---------------- dose logs ---------------- */
app.get("/api/doses", async (req, res) => {
  const { person_id, medicine_id, from, to } = req.query;
  let sql = `SELECT dl.*, m.name AS medicine_name, fm.name AS person_name
      FROM dose_logs dl
      LEFT JOIN medicines m ON m.id = dl.medicine_id
      LEFT JOIN family_members fm ON fm.id = dl.person_id`;
  const cond = [];
  const params = [];
  if (person_id) {
    params.push(person_id);
    cond.push(`dl.person_id = $${params.length}`);
  }
  if (medicine_id) {
    params.push(medicine_id);
    cond.push(`dl.medicine_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    cond.push(`dl.timestamp >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    cond.push(`dl.timestamp <= $${params.length}`);
  }
  if (cond.length) sql += " WHERE " + cond.join(" AND ");
  sql += " ORDER BY dl.timestamp DESC";
  const r = await query(sql, params);
  res.json(r.rows);
});

app.post("/api/doses", async (req, res) => {
  const { medicine_id, person_id, amount_given, unit, timestamp } = req.body;
  if (medicine_id == null || amount_given == null || !unit)
    return res.status(400).json({ error: "medicine_id, amount_given, unit required" });
  const r = await query(
    `INSERT INTO dose_logs (medicine_id, person_id, amount_given, unit, timestamp)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      medicine_id,
      person_id || null,
      Number(amount_given),
      unit,
      timestamp || new Date().toISOString(),
    ]
  );
  res.status(201).json(r.rows[0]);
});

/* ---------------- analyze photo ---------------- */
app.post("/api/analyze", async (req, res) => {
  const { photo } = req.body;
  if (!photo) return res.status(400).json({ error: "photo (base64 data URL) required" });
  try {
    const result = await analyzeMedicinePhoto(photo);
    res.json(result);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || String(e) });
  }
});

async function start() {
  await migrate();
  app.listen(PORT, "0.0.0.0", () =>
    console.log(`DoseMate API on 0.0.0.0:${PORT}`)
  );
}

start().catch((e) => {
  console.error("Failed to start:", e);
  process.exit(1);
});
