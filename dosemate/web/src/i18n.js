// Bilingual strings (English + Hindi). Access via useI18n() in components.
export const STRINGS = {
  appName: { en: "DoseMate", hi: "DoseMate" },
  tagline: { en: "Family Dose Tracker", hi: "परिवार की दवा ट्रैकर" },
  // nav
  nav_home: { en: "Home", hi: "होम" },
  nav_add: { en: "Add Medicine", hi: "दवा जोड़ें" },
  nav_family: { en: "Family", hi: "परिवार" },
  nav_history: { en: "History", hi: "इतिहास" },
  nav_reminders: { en: "Reminders", hi: "रिमाइंडर" },
  // dashboard
  todays_doses: { en: "Today's Doses", hi: "आज की डोज़" },
  no_medicines: {
    en: "No medicines yet. Tap “Add Medicine” to start.",
    hi: "अभी कोई दवा नहीं। “दवा जोड़ें” दबाकर शुरू करें।",
  },
  next_dose: { en: "Next dose", hi: "अगली डोज़" },
  due_now: { en: "Due now", hi: "अभी दें" },
  overdue: { en: "Overdue", hi: "देरी हो गई" },
  mark_taken: { en: "Dose liya", hi: "दवा लिया" },
  no_more_today: { en: "All caught up for today", hi: "आज सब हो गया" },
  // add medicine
  add_title: { en: "Add Medicine", hi: "दवा जोड़ें" },
  upload_photo: { en: "Upload medicine photo", hi: "दवा की फ़ोटो अपलोड करें" },
  analyzing: { en: "Analyzing photo…", hi: "फ़ोटो जाँची जा रही है…" },
  analyze: { en: "Detect with AI", hi: "AI से पहचानें" },
  medicine_name: { en: "Medicine name", hi: "दवा का नाम" },
  form: { en: "Form", hi: "रूप" },
  dose_amount: { en: "Dose amount", hi: "डोज़ मात्रा" },
  dose_unit: { en: "Unit", hi: "इकाई" },
  frequency: { en: "Frequency (every X hours)", hi: "आवृत्ति (हर X घंटे)" },
  duration: { en: "Course duration (days)", hi: "कोर्स अवधि (दिन)" },
  who_for: { en: "Who is it for?", hi: "किसके लिए?" },
  start_date: { en: "Start date", hi: "शुरू तारीख" },
  end_date: { en: "End date", hi: "खत्म तारीख" },
  save: { en: "Save", hi: "सेव" },
  select_member: { en: "Select a family member", hi: "सदस्य चुनें" },
  detected: { en: "AI detected — edit if needed", hi: "AI पहचाना — ज़रूरत हो तो बदलें" },
  tablets: { en: "tablets", hi: "गोली" },
  ml: { en: "mL", hi: "mL" },
  // family
  family_title: { en: "Family Profiles", hi: "परिवार प्रोफ़ाइल" },
  add_member: { en: "Add Member", hi: "सदस्य जोड़ें" },
  name: { en: "Name", hi: "नाम" },
  age: { en: "Age (years)", hi: "उम्र (वर्ष)" },
  weight: { en: "Weight (kg)", hi: "वज़न (किग्रा)" },
  baby_mode: { en: "Baby / Child mode", hi: "बच्चा मोड" },
  baby_hint: {
    en: "Dose in mL, weight-based reference shown.",
    hi: "mL में डोज़, वज़न अनुसार संदर्भ दिखेगा।",
  },
  child_warning: {
    en: "⚠ This medicine is being given to a child under 2 years. Confirm the dose with a doctor.",
    hi: "⚠ यह दवा 2 साल से कम उम्र के बच्चे को दी जा रही है। डोज़ डॉक्टर से पुष्टि करें।",
  },
  weight_ref: { en: "Weight-based reference (paracetamol)", hi: "वज़न आधारित संदर्भ (पैरासिटामोल)" },
  // history
  history_title: { en: "Dose History", hi: "डोज़ इतिहास" },
  filter_person: { en: "Filter by person", hi: "सदस्य अनुसार छानें" },
  all: { en: "All", hi: "सभी" },
  from: { en: "From", hi: "से" },
  to: { en: "To", hi: "तक" },
  total_doses: { en: "Total doses taken", hi: "कुल डोज़ ली" },
  total_ml: { en: "Total syrup given", hi: "कुल सिरप दी" },
  course_progress: { en: "Course completion", hi: "कोर्स पूर्णता" },
  no_logs: { en: "No dose logs yet.", hi: "अभी कोई लॉग नहीं।" },
  // reminders
  reminders_title: { en: "Dose Reminders", hi: "रिमाइंडर" },
  enable_notif: { en: "Enable notifications", hi: "सूचना चालू करें" },
  notif_enabled: { en: "Notifications enabled", hi: "सूचना चालू है" },
  notif_denied: {
    en: "Notifications blocked. Enable from browser settings.",
    hi: "सूचना बंद है। ब्राउज़र सेटिंग से चालू करें।",
  },
  no_due: { en: "No doses due right now.", hi: "अभी कोई डोज़ बाकी नहीं।" },
  // disclaimer (persistent on every dose screen)
  disclaimer: {
    en: "Ye medical advice nahi hai. Dose doctor se confirm karein.",
    hi: "ये मेडिकल एडवाइस नहीं है। डोज़ डॉक्टर से कन्फ़र्म करें।",
  },
  // generic
  cancel: { en: "Cancel", hi: "रद्द" },
  delete: { en: "Delete", hi: "हटाएँ" },
  edit: { en: "Edit", hi: "बदलें" },
  active: { en: "Active", hi: "चालू" },
  inactive: { en: "Inactive", hi: "बंद" },
  confirm_delete: { en: "Delete this entry?", hi: "इस प्रविष्टि को हटाएँ?" },
  no_members: { en: "No family members yet.", hi: "अभी कोई सदस्य नहीं।" },
  baby: { en: "Baby", hi: "बच्चा" },
  adult: { en: "Adult", hi: "वयस्क" },
  loading: { en: "Loading…", hi: "लोड हो रहा है…" },
  lang: { en: "हिन्दी", hi: "EN" },
};

export function t(key, lang) {
  const e = STRINGS[key];
  if (!e) return key;
  return e[lang] || e.en || key;
}
