import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://dosemate:dosemate@db:5432/dosemate",
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS family_members (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  weight NUMERIC(6,2),
  is_baby BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS medicines (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  form TEXT NOT NULL,
  photo TEXT,
  dose_amount NUMERIC(10,3) NOT NULL,
  dose_unit TEXT NOT NULL,
  frequency_hours INTEGER NOT NULL,
  duration_days INTEGER,
  person_id INTEGER REFERENCES family_members(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dose_logs (
  id SERIAL PRIMARY KEY,
  medicine_id INTEGER REFERENCES medicines(id) ON DELETE CASCADE,
  person_id INTEGER REFERENCES family_members(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount_given NUMERIC(10,3) NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function migrate() {
  await pool.query(SCHEMA);
}

export function query(text, params) {
  return pool.query(text, params);
}

export default pool;
