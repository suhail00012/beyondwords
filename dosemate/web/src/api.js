const BASE = "/api";

export async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || JSON.stringify(j);
    } catch {
      msg = await res.text();
    }
    throw new Error(msg || String(res.status));
  }
  if (res.status === 204) return null;
  return res.json();
}

export const apiMembers = {
  list: () => api("/members"),
  create: (body) => api("/members", { method: "POST", body }),
  update: (id, body) => api(`/members/${id}`, { method: "PUT", body }),
  remove: (id) => api(`/members/${id}`, { method: "DELETE" }),
};

export const apiMedicines = {
  list: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return api("/medicines" + (q ? `?${q}` : ""));
  },
  create: (body) => api("/medicines", { method: "POST", body }),
  update: (id, body) => api(`/medicines/${id}`, { method: "PUT", body }),
  remove: (id) => api(`/medicines/${id}`, { method: "DELETE" }),
};

export const apiDoses = {
  list: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return api("/doses" + (q ? `?${q}` : ""));
  },
  create: (body) => api("/doses", { method: "POST", body }),
};

export const analyzePhoto = (photo) =>
  api("/analyze", { method: "POST", body: { photo } });
