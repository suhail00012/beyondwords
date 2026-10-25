// Age & weight-based dosing helpers.

export const isBaby = (ageYears) => Number(ageYears) < 2;
export const isChild = (ageYears) => Number(ageYears) < 12;

// Paracetamol reference: 10-15 mg/kg. We use 12.5 mg/kg midpoint.
// syrup 120mg/5mL => 24 mg/mL ; drops 100mg/mL
const PARACETAMOL_MGKG = 12.5;
export const FORM_MG_PER_ML = {
  syrup: 24,
  drops: 100,
  injection: 100,
};

export function weightBasedMl(weightKg, form) {
  const mgPerMl = FORM_MG_PER_ML[form] || FORM_MG_PER_ML.syrup;
  const totalMg = Number(weightKg || 0) * PARACETAMOL_MGKG;
  return +(totalMg / mgPerMl).toFixed(2);
}

// Reference table rows for the baby mode UI.
export function weightRefTable(form = "syrup") {
  const rows = [];
  for (let w = 3; w <= 30; w += 1) {
    rows.push({ weight: w, ml: weightBasedMl(w, form) });
  }
  return rows;
}

// Next dose time = last logged dose + frequency_hours.
export function nextDoseTime(lastDoseAt, frequencyHours) {
  if (!lastDoseAt) return null;
  return new Date(new Date(lastDoseAt).getTime() + Number(frequencyHours) * 3600 * 1000);
}

// Doses expected over a full course (for progress bar).
export function expectedTotalDoses(frequencyHours, durationDays) {
  if (!frequencyHours || !durationDays) return null;
  const perDay = 24 / Number(frequencyHours);
  return Math.max(1, Math.round(perDay * Number(durationDays)));
}

export function formatCountdown(ms) {
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function fmtDate(d, lang) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString(lang === "hi" ? "hi-IN" : "en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}
