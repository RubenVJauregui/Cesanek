"use client";

import { useState, useEffect, useCallback } from "react";
import { login, decodeToken } from "@/lib/auth";
import { config } from "@/lib/config";

interface KPIs {
  inYardFull: number;
  customers: number;
  customersTenantWide: boolean;
  plannedFTL: number;
  olderThan48h: number;
  ecommOrders: number;
  ecommPastSLA: number;
}

interface EquipmentRow {
  equipmentNo: string;
  entryTicket: string;
  checkInTime: string;
  customer: string;
  location: string;
}

interface OrderRow {
  orderNo: string;
  customer: string;
  status: string;
  baseQty: number;
  poNo: string;
  soNo: string;
  appointmentTime: string;
  retailer: string;
  carrier: string;
}

interface Assignee {
  name: string;
  tasks: number;
}

interface WatchRow {
  orderNo: string;
  customer: string;
  status: string;
  created: string;
  carrier: string;
}

interface DashboardData {
  kpis: KPIs;
  inYardEquipment: EquipmentRow[];
  plannedOrders: OrderRow[];
  assignees: Assignee[];
  watchList: WatchRow[];
}

function formatTimeInYard(checkInTime: string): string {
  if (!checkInTime) return "—";
  const checkIn = new Date(checkInTime);
  if (isNaN(checkIn.getTime())) return "—";
  const now = new Date();
  const diff = now.getTime() - checkIn.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days} Days ${hours} Hours ${mins} Minutes`;
  if (hours > 0) return `${hours} Hours ${mins} Minutes`;
  return `${mins} Minutes`;
}

function formatDate(d: string): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: config.timezone,
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function LoginForm({ onLogin }: { onLogin: (token: string, user: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { accessToken } = await login(username, password);
      const decoded = decodeToken(accessToken);
      onLogin(accessToken, decoded?.userName || username);
    } catch {
      setError("Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "70px auto", background: "rgba(255,255,255,.96)", border: "1px solid #dce5f1", borderRadius: 8, padding: 22, boxShadow: "0 20px 55px rgba(16,24,40,.12)", color: "#07173a" }}>
      <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Sign in</h2>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>{config.facilityName} WISE Dashboard</p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "grid", gap: 7, margin: "12px 0", fontSize: 13, color: "#64748b", fontWeight: 700 }}>
          Username
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", border: "1px solid #c8d2df", borderRadius: 8, padding: "11px 12px", font: "inherit", color: "#07173a", background: "rgba(255,255,255,.96)" }}
          />
        </label>
        <label style={{ display: "grid", gap: 7, margin: "12px 0", fontSize: 13, color: "#64748b", fontWeight: 700 }}>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", border: "1px solid #c8d2df", borderRadius: 8, padding: "11px 12px", font: "inherit", color: "#07173a", background: "rgba(255,255,255,.96)" }}
          />
        </label>
        {error && <div style={{ color: "#dc2626", fontWeight: 700, fontSize: 13, marginTop: 10 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 16, width: "100%", border: 0, background: "#1765ff", color: "#fff", padding: "12px 13px", fontWeight: 800, borderRadius: 8, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.55 : 1 }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

interface SuggestionRow {
  id: string;
  workType: string;
  orderNo: string;
  customer: string;
  status: string;
  orderType: string;
  suggestedAssignee: string;
  historyCount: number;
  rule: string;
}

export default function Dashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [, setUserName] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [orderRowLimit, setOrderRowLimit] = useState(10);
  const [sortCol, setSortCol] = useState<string>("orderNo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [nextRefresh, setNextRefresh] = useState(10);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [kpiModal, setKpiModal] = useState<string | null>(null);
  const [kpiRows, setKpiRows] = useState<Record<string, unknown>[]>([]);
  const [kpiTotal, setKpiTotal] = useState(0);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiTenantWide, setKpiTenantWide] = useState(false);
  const [allAssignees, setAllAssignees] = useState<{ userId: string; userName: string; fullName: string }[]>([]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        if (res.status === 401) { setToken(null); return; }
        return;
      }
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setLastUpdated(new Date());
        setNextRefresh(10);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchData();
      const interval = setInterval(fetchData, 600000);
      return () => clearInterval(interval);
      }
  }, [token, fetchData]);

  useEffect(() => {
    if (token && allAssignees.length === 0) {
      fetch("/api/assignees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).then(r => r.ok ? r.json() : null).then(r => {
        if (r?.success) setAllAssignees(r.data.assignees);
      }).catch(() => {});
    }
  }, [token, allAssignees.length]);

  useEffect(() => {
    if (!token || !lastUpdated) return;
    const timer = setInterval(() => {
      setNextRefresh((n) => Math.max(0, n - 1));
    }, 60000);
    return () => clearInterval(timer);
  }, [token, lastUpdated]);

  function handleLogin(accessToken: string, user: string) {
    setToken(accessToken);
    setUserName(user);
  }

  async function handleAutoSuggest() {
    if (!token) return;
    setShowSuggest(true);
    setSuggestLoading(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setSuggestions(result.data.suggestions);
        }
      }
    } catch {
      // silent
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleKpiClick(kpi: string) {
    if (!token) return;
    setKpiModal(kpi);
    setKpiLoading(true);
    setKpiRows([]);
    setKpiTotal(0);
    setKpiTenantWide(false);
    try {
      const res = await fetch("/api/kpi-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kpi }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setKpiRows(result.data.rows);
          setKpiTotal(result.data.total);
          setKpiTenantWide(!!result.data.tenantWide);
        }
      }
    } catch {
      // silent
    } finally {
      setKpiLoading(false);
    }
  }

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  const kpis = data?.kpis;
  const equipment = data?.inYardEquipment || [];
  const orders = data?.plannedOrders || [];
  const assignees = data?.assignees || [];
  const watchList = data?.watchList || [];

  const sortedOrders = [...orders].sort((a, b) => {
    const av = a[sortCol as keyof OrderRow] ?? "";
    const bv = b[sortCol as keyof OrderRow] ?? "";
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  }).slice(0, orderRowLimit);

  const refreshText = lastUpdated
    ? `Last refreshed ${lastUpdated.toLocaleString("en-US", { timeZone: config.timezone, month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · next in ${nextRefresh} min`
    : "Loading...";

  return (
    <>
      {/* Auto Suggest Modal */}
      {showSuggest && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowSuggest(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setShowSuggest(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="Auto Suggest"
          tabIndex={-1}
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)" }}
        >
          <div style={{ width: "95%", maxWidth: 1280, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "rgba(5,18,35,.94)", border: "1px solid rgba(133,160,202,.68)", borderRadius: 12, boxShadow: "0 32px 80px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.04)", overflow: "hidden" }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid rgba(135,163,207,.42)", background: "rgba(8,24,43,.88)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>Auto Suggest</h2>
                <span style={{ background: "rgba(37,99,235,.35)", border: "1px solid rgba(70,117,235,.5)", color: "#a8c4ff", fontSize: 12, fontWeight: 900, padding: "5px 12px", borderRadius: 999 }}>
                  {suggestions.length} tasks
                </span>
              </div>
              <button onClick={() => setShowSuggest(false)} style={{ width: 36, height: 36, display: "grid", placeItems: "center", background: "rgba(71,96,138,.36)", border: "1px solid rgba(135,163,207,.3)", borderRadius: 8, color: "#dce8ff", fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1 }} aria-label="Close">✕</button>
            </div>

            {/* Info bar */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid rgba(135,163,207,.2)", background: "rgba(23,101,255,.06)" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#a8c4ff", lineHeight: 1.5 }}>
                Showing all assignable RNs, loads, and planned orders. Suggestions use 6 months of packed outbound and offloaded inbound history by customer. Tasks remain here until Auto Assign is clicked.
              </p>
            </div>

            {/* Auto Assign All button */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid rgba(135,163,207,.2)", background: "rgba(8,24,43,.72)" }}>
              <button disabled style={{ background: "#16a34a", color: "#fff", border: "1px solid #15803d", padding: "10px 20px", fontWeight: 900, fontSize: 13, borderRadius: 8, cursor: "not-allowed", opacity: 0.7 }} title="Assignment endpoint not yet verified for this facility">
                Auto Assign All
              </button>
              <span style={{ marginLeft: 12, fontSize: 11, color: "#a8b8d4", fontWeight: 700 }}>Assignment pending endpoint verification</span>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {suggestLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#a8b8d4", fontSize: 13 }}>Loading suggestions...</div>
              ) : suggestions.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#a8b8d4", fontSize: 13 }}>No assignable tasks found.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
                  <thead>
                    <tr>
                      {["WORK TYPE", "ORDER / RN", "CUSTOMER", "STATUS", "ORDER TYPE", "ASSIGNEE", "ACTION", "HISTORY COUNT", "RULE"].map((h) => (
                        <th key={h} style={{ position: "sticky", top: 0, background: "rgba(14,36,61,.94)", zIndex: 1, color: "#dce8ff", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid rgba(135,163,207,.2)", padding: "9px 10px", textAlign: "left", fontWeight: 800 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s, i) => (
                      <tr key={i}>
                        <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.15)", fontWeight: 800 }}>{s.workType}</td>
                        <td style={{ padding: "8px 10px", color: "#fff", borderBottom: "1px solid rgba(135,163,207,.15)", fontWeight: 900 }}>{s.orderNo}</td>
                        <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.15)" }}>{s.customer}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(135,163,207,.15)" }}>
                          <span style={{ display: "inline-block", padding: "2px 7px", background: "rgba(37,99,235,.38)", color: "#72a0ff", border: "1px solid rgba(70,117,235,.42)", fontWeight: 800, fontSize: 11, borderRadius: 4 }}>{s.status}</span>
                        </td>
                        <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.15)" }}>{s.orderType}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(135,163,207,.15)" }}>
                          <select disabled style={{ minWidth: 140, border: "1px solid rgba(96,165,250,.55)", borderRadius: 6, background: "rgba(8,24,43,.94)", color: "#f8fbff", padding: "6px 8px", fontWeight: 800, fontSize: 11 }}>
                            {allAssignees.length > 0 ? (
                              <>
                                <option value="">{s.suggestedAssignee || "— Select —"}</option>
                                {allAssignees.map((a) => (
                                  <option key={a.userId} value={a.userId}>{a.fullName}</option>
                                ))}
                              </>
                            ) : (
                              <option>{s.suggestedAssignee || "— Unassigned —"}</option>
                            )}
                          </select>
                        </td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(135,163,207,.15)" }}>
                          <button disabled style={{ background: "#16a34a", border: "1px solid #15803d", color: "#fff", padding: "5px 12px", fontWeight: 800, fontSize: 11, borderRadius: 6, cursor: "not-allowed", opacity: 0.7 }}>Assign</button>
                        </td>
                        <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.15)", textAlign: "center" }}>{s.historyCount}</td>
                        <td style={{ padding: "8px 10px", color: "#a8b8d4", borderBottom: "1px solid rgba(135,163,207,.15)", fontSize: 10, fontWeight: 700 }}>{s.rule}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI Detail Modal */}
      {kpiModal && (
        <KpiDetailModal
          kpi={kpiModal}
          rows={kpiRows}
          total={kpiTotal}
          loading={kpiLoading}
          tenantWide={kpiTenantWide}
          onClose={() => setKpiModal(null)}
        />
      )}

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, padding: "28px 24px 22px", color: "#fff" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", marginRight: 12 }}>
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <rect width="44" height="44" rx="8" fill="#1765ff" fillOpacity="0.25"/>
                <path d="M12 28L22 14L32 28H12Z" fill="#4d8aff" stroke="#7fa2ff" strokeWidth="1.5"/>
                <circle cx="22" cy="24" r="4" fill="#1765ff" stroke="#aac4ff" strokeWidth="1"/>
              </svg>
            </span>
            <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-.03em" }}>{config.facilityName} Dashboard</h1>
          </div>
          <p style={{ marginTop: 7, color: "#d8e6ff", fontSize: 14, fontWeight: 700 }}>{refreshText}</p>
        </div>

        <div aria-label="Auto assign actions" style={{ display: "flex", flexWrap: "wrap", gap: 18, flex: 1, justifyContent: "center", alignItems: "center" }}>
          {["Auto Suggest", "Auto Assign", "Autonomous"].map((label) => (
            <button key={label} onClick={label === "Auto Suggest" ? handleAutoSuggest : undefined} style={{ border: "1px solid #4d69ff", borderRadius: 8, background: "linear-gradient(180deg, rgba(42,63,169,.88), rgba(31,48,132,.86))", color: "#fff", padding: "14px 24px", minWidth: 164, fontSize: 13, fontWeight: 900, lineHeight: 1, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), 0 10px 26px rgba(0,0,0,.25)", cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={fetchData} disabled={loading} style={{ minWidth: 132, minHeight: 46, background: "rgba(9,22,42,.45)", border: "1px solid rgba(220,231,255,.7)", color: "#fff", padding: "10px 13px", fontWeight: 800, borderRadius: 8, cursor: "pointer", boxShadow: "0 12px 30px rgba(0,0,0,.18)" }}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button style={{ minWidth: 132, minHeight: 46, background: "rgba(9,22,42,.45)", border: "1px solid rgba(220,231,255,.7)", color: "#fff", padding: "10px 13px", fontWeight: 800, borderRadius: 8, cursor: "pointer", boxShadow: "0 12px 30px rgba(0,0,0,.18)" }}>
            Download CSV
          </button>
        </div>
      </header>

      <main style={{ position: "relative", zIndex: 1, padding: "18px 24px 34px", maxWidth: 1634, margin: "0 auto" }}>
        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 14, margin: "22px 0 18px" }}>
          <KPICard icon="truck" title="In-Yard FULL Equipment" value={kpis?.inYardFull ?? 0} subtitle="Full containers not devanned" loading={loading && !data} onClick={() => handleKpiClick("inYardFull")} />
          <KPICard icon="users" title="Customers" value={kpis?.customers ?? 0} subtitle={kpis?.customersTenantWide ? "Tenant-wide (all facilities)" : `${config.facilityName} facility`} loading={loading && !data} onClick={() => handleKpiClick("customers")} />
          <KPICard icon="box" title="Planned FTL/LTL Orders" value={kpis?.plannedFTL ?? 0} subtitle={`${config.facilityName} only`} loading={loading && !data} onClick={() => handleKpiClick("plannedFTL")} />
          <KPICard icon="clock" title="Older than 48 hours" value={kpis?.olderThan48h ?? 0} subtitle="Pending non-Dropship" loading={loading && !data} onClick={() => handleKpiClick("olderThan48h")} />
          <KPICard icon="cart" title="E-Comm Orders" value={kpis?.ecommOrders ?? 0} subtitle="Planned Orders" loading={loading && !data} onClick={() => handleKpiClick("ecommOrders")} />
          <KPICard icon="alert" title="E-Comm Past SLA" value={kpis?.ecommPastSLA ?? 0} subtitle="Planned Orders" loading={loading && !data} onClick={() => handleKpiClick("ecommPastSLA")} />
        </div>

        {/* Section 1 - In-Yard Equipment */}
        <section style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 18px 46px rgba(0,0,0,.32), inset 0 0 0 1px rgba(255,255,255,.035)", backdropFilter: "blur(8px)", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "18px 18px", borderBottom: "1px solid rgba(135,163,207,.42)", background: "rgba(8,24,43,.72)" }}>
            <h2 style={{ fontSize: 18, color: "#f4f8ff", fontWeight: 800 }}>Section 1 - In-Yard FULL Equipment</h2>
            <span style={{ color: "#dce8ff", fontSize: 12, fontWeight: 900, background: "rgba(71,96,138,.36)", borderRadius: 999, padding: "7px 12px" }}>{equipment.length} rows</span>
          </div>
          <div style={{ overflow: "auto", maxHeight: 620 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
              <thead>
                <tr>
                  {["Equipment #", "Entry Ticket", "Check-in", "Time in Yard", "Customer", "Location"].map((h) => (
                    <th key={h} style={{ position: "sticky", top: 0, background: "rgba(14,36,61,.94)", zIndex: 1, color: "#dce8ff", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid rgba(135,163,207,.2)", padding: "8px 10px", textAlign: "left", fontWeight: 800 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {equipment.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "18px 10px", color: "#a8b8d4", textAlign: "center" }}>No in-yard equipment right now.</td></tr>
                ) : equipment.map((eq, i) => (
                  <tr key={i}>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)", fontWeight: 900 }}>{eq.equipmentNo}</td>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{eq.entryTicket}</td>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{formatDate(eq.checkInTime)}</td>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{formatTimeInYard(eq.checkInTime)}</td>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{eq.customer}</td>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{eq.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Grid: Orders + Assignees */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.94fr) minmax(520px, 1fr)", gap: 16, alignItems: "start" }}>
          {/* Section 2 - Planned Outbound Orders */}
          <section style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 18px 46px rgba(0,0,0,.32), inset 0 0 0 1px rgba(255,255,255,.035)", backdropFilter: "blur(8px)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "18px 18px", borderBottom: "1px solid rgba(135,163,207,.42)", background: "rgba(8,24,43,.72)" }}>
              <h2 style={{ fontSize: 18, color: "#f4f8ff", fontWeight: 800 }}>Section 2 - PLANNED Outbound Orders</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {[10, 25, 50].map((n) => (
                  <button key={n} onClick={() => setOrderRowLimit(n)} style={{ color: "#dce8ff", fontSize: 12, fontWeight: 900, background: orderRowLimit === n ? "rgba(37,99,235,.5)" : "rgba(71,96,138,.36)", border: `1px solid ${orderRowLimit === n ? "rgba(125,163,255,.64)" : "rgba(135,163,207,.2)"}`, borderRadius: 999, padding: "7px 12px", lineHeight: 1, cursor: "pointer" }}>
                    {n} rows
                  </button>
                ))}
              </div>
            </div>
            <div style={{ maxHeight: 366, overflowY: "auto", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
                <thead>
                  <tr>
                    {[
                      { key: "orderNo", label: "Order #" },
                      { key: "customer", label: "Customer" },
                      { key: "status", label: "Status" },
                      { key: "baseQty", label: "BASE QTY" },
                      { key: "poNo", label: "PO #" },
                      { key: "soNo", label: "SO #" },
                      { key: "appointmentTime", label: "Appointment Time" },
                      { key: "retailer", label: "Retailer" },
                      { key: "carrier", label: "Carrier" },
                    ].map((col) => (
                      <th key={col.key} style={{ position: "sticky", top: 0, background: "rgba(14,36,61,.94)", zIndex: 1, color: "#dce8ff", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid rgba(135,163,207,.2)", padding: "8px 10px", textAlign: "left" }}>
                        <button onClick={() => handleSort(col.key)} style={{ width: "100%", border: 0, background: "transparent", color: "inherit", padding: 0, font: "inherit", fontWeight: 800, textAlign: "inherit", textTransform: "uppercase", cursor: "pointer" }}>
                          {col.label}{sortCol === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedOrders.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: "18px 10px", color: "#a8b8d4", textAlign: "center" }}>No detail rows returned.</td></tr>
                  ) : sortedOrders.map((o, i) => (
                    <tr key={i}>
                      <td style={{ padding: "8px 10px", color: "#fff", fontWeight: 900, borderBottom: "1px solid rgba(135,163,207,.2)" }}>{o.orderNo}</td>
                      <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{o.customer}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(135,163,207,.2)" }}>
                        <span style={{ display: "inline-block", padding: "2px 7px", background: "rgba(37,99,235,.38)", color: "#72a0ff", border: "1px solid rgba(70,117,235,.42)", fontWeight: 800, fontSize: 11, borderRadius: 4 }}>{o.status}</span>
                      </td>
                      <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)", textAlign: "right" }}>{o.baseQty}</td>
                      <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{o.poNo}</td>
                      <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{o.soNo}</td>
                      <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{formatDate(o.appointmentTime)}</td>
                      <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{o.retailer}</td>
                      <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{o.carrier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Logged-in WISE Assignees */}
          <section style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 18px 46px rgba(0,0,0,.32), inset 0 0 0 1px rgba(255,255,255,.035)", backdropFilter: "blur(8px)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "18px 18px", borderBottom: "1px solid rgba(135,163,207,.42)", background: "rgba(8,24,43,.72)" }}>
              <h2 style={{ fontSize: 18, color: "#f4f8ff", fontWeight: 800 }}>WISE Assignees — Cesanek</h2>
              <span style={{ color: "#dce8ff", fontSize: 12, fontWeight: 900, background: "rgba(71,96,138,.36)", borderRadius: 999, padding: "7px 12px" }}>{allAssignees.length > 0 ? `${allAssignees.length} active users` : `${assignees.length} logged-in`}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, padding: 12, maxHeight: 500, overflowY: "auto" }}>
              {(allAssignees.length > 0 ? allAssignees : assignees.map(a => ({ userId: "", userName: "", fullName: a.name }))).length === 0 ? (
                <div style={{ gridColumn: "1 / -1", padding: "24px 10px", color: "#a8b8d4", textAlign: "center", fontSize: 12 }}>No active assignees.</div>
              ) : (allAssignees.length > 0 ? allAssignees : assignees.map(a => ({ userId: "", userName: "", fullName: a.name }))).map((a, i) => (
                <article key={i} style={{ border: "1px solid rgba(135,163,207,.42)", background: "rgba(8,24,43,.72)", borderRadius: 8, padding: 12, minHeight: 94, display: "grid", gridTemplateColumns: "44px 1fr", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", background: "#1765ff", fontWeight: 900, fontSize: 14 }}>
                    {getInitials(a.fullName)}
                  </div>
                  <div>
                    <span style={{ display: "block", color: "#f1f6ff", fontSize: 11, fontWeight: 800, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.fullName}</span>
                    <strong style={{ display: "block", marginTop: 8, fontSize: 18, lineHeight: 1, color: "#fff" }}>{a.userName || "—"}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        {/* Watch List */}
        <section style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 18px 46px rgba(0,0,0,.32), inset 0 0 0 1px rgba(255,255,255,.035)", backdropFilter: "blur(8px)", overflow: "hidden", marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "18px 18px", borderBottom: "1px solid rgba(135,163,207,.42)", background: "rgba(8,24,43,.72)" }}>
            <div>
              <h2 style={{ fontSize: 18, color: "#f4f8ff", fontWeight: 800 }}>Watch List</h2>
              <span style={{ color: "#dce8ff", fontSize: 12, fontWeight: 900 }}>Blocked, failed, picking, or partial shipped</span>
            </div>
          </div>
          <div style={{ overflow: "auto", maxHeight: 400 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
              <thead>
                <tr>
                  {["Order #", "Customer", "Status", "Created", "Carrier"].map((h) => (
                    <th key={h} style={{ position: "sticky", top: 0, background: "rgba(14,36,61,.94)", zIndex: 1, color: "#dce8ff", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid rgba(135,163,207,.2)", padding: "8px 10px", textAlign: "left", fontWeight: 800 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {watchList.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "18px 10px", color: "#a8b8d4", textAlign: "center" }}>No watch-list orders right now.</td></tr>
                ) : watchList.map((w, i) => (
                  <tr key={i}>
                    <td style={{ padding: "8px 10px", color: "#fff", fontWeight: 900, borderBottom: "1px solid rgba(135,163,207,.2)" }}>{w.orderNo}</td>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{w.customer}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(135,163,207,.2)" }}>
                      <span style={{ display: "inline-block", padding: "2px 7px", background: "rgba(37,99,235,.38)", color: "#72a0ff", border: "1px solid rgba(70,117,235,.42)", fontWeight: 800, fontSize: 11, borderRadius: 4 }}>{w.status}</span>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{formatDate(w.created)}</td>
                    <td style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.2)" }}>{w.carrier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function KPICard({ icon, title, value, subtitle, loading, onClick }: { icon: string; title: string; value: number; subtitle: string; loading: boolean; onClick?: () => void }) {
  const icons: Record<string, React.ReactNode> = {
    truck: <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#7fa2ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    users: <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#7fa2ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    box: <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#7fa2ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    clock: <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#7fa2ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    cart: <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#7fa2ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
    alert: <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#7fa2ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ minHeight: 126, padding: "25px 18px 18px 104px", position: "relative", background: "rgba(5,18,35,.38)", border: "1px solid rgba(133,160,202,.68)", borderRadius: 8, boxShadow: "0 18px 46px rgba(0,0,0,.32), inset 0 0 0 1px rgba(255,255,255,.035)", textAlign: "left", cursor: "pointer", width: "100%", color: "inherit", font: "inherit" }}
    >
      <div style={{ position: "absolute", left: 15, top: 27, width: 82, height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icons[icon]}
      </div>
      <span style={{ color: "#f1f6ff", fontSize: 11, fontWeight: 900, textTransform: "uppercase", display: "block" }}>{title}</span>
      {loading ? (
        <strong style={{ display: "block", fontSize: 28, marginTop: 8, lineHeight: 1.05, color: "#fff", opacity: 0.4 }}>—</strong>
      ) : (
        <strong style={{ display: "block", fontSize: 28, marginTop: 8, lineHeight: 1.05, color: "#fff" }}>{value.toLocaleString()}</strong>
      )}
      <small style={{ color: "#d3def2", fontSize: 12, fontWeight: 800, display: "block" }}>{subtitle}</small>
    </button>
  );
}

const KPI_META: Record<string, { title: string; subtitle: string; columns: { key: string; label: string }[] }> = {
  inYardFull: {
    title: "In-Yard FULL Equipment",
    subtitle: "Full containers not devanned — Cesanek LT_F21",
    columns: [
      { key: "entryTicket", label: "Entry Ticket" },
      { key: "containerNo", label: "Container #" },
      { key: "carrier", label: "Carrier" },
      { key: "equipmentType", label: "Equipment Type" },
      { key: "status", label: "Status" },
      { key: "spot", label: "Yard Spot" },
      { key: "checkInTime", label: "Check-in Time" },
      { key: "devanned", label: "Devanned" },
    ],
  },
  customers: {
    title: "Customers",
    subtitle: "Tenant-wide (all facilities) — not facility-scoped",
    columns: [
      { key: "id", label: "Customer ID" },
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "status", label: "Status" },
    ],
  },
  plannedFTL: {
    title: "Planned FTL/LTL Orders",
    subtitle: "Cesanek LT_F21 — RG type, PLANNED status",
    columns: [
      { key: "orderNo", label: "Order #" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "orderType", label: "Order Type" },
      { key: "carrier", label: "Carrier" },
      { key: "poNo", label: "PO #" },
      { key: "createdTime", label: "Created" },
    ],
  },
  olderThan48h: {
    title: "Older than 48 Hours",
    subtitle: "Cesanek LT_F21 — Pending non-Dropship (Open/Imported/Committed)",
    columns: [
      { key: "orderNo", label: "Order #" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "orderType", label: "Order Type" },
      { key: "carrier", label: "Carrier" },
      { key: "orderedDate", label: "Ordered Date" },
    ],
  },
  ecommOrders: {
    title: "E-Comm Orders",
    subtitle: "Cesanek LT_F21 — DS type, Planned",
    columns: [
      { key: "orderNo", label: "Order #" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "orderType", label: "Order Type" },
      { key: "carrier", label: "Carrier" },
      { key: "shipNoLaterDate", label: "Ship No Later" },
    ],
  },
  ecommPastSLA: {
    title: "E-Comm Past SLA",
    subtitle: "Cesanek LT_F21 — DS type, past ship-no-later date",
    columns: [
      { key: "orderNo", label: "Order #" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "orderType", label: "Order Type" },
      { key: "carrier", label: "Carrier" },
      { key: "shipNoLaterDate", label: "Ship No Later" },
      { key: "createdTime", label: "Created" },
    ],
  },
};

function KpiDetailModal({ kpi, rows, total, loading, tenantWide, onClose }: { kpi: string; rows: Record<string, unknown>[]; total: number; loading: boolean; tenantWide: boolean; onClose: () => void }) {
  const meta = KPI_META[kpi] || { title: kpi, subtitle: "", columns: [] };

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)" }}
    >
      <div style={{ width: "95%", maxWidth: 1180, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "rgba(5,18,35,.94)", border: "1px solid rgba(133,160,202,.68)", borderRadius: 12, boxShadow: "0 32px 80px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.04)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid rgba(135,163,207,.42)", background: "rgba(8,24,43,.88)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{meta.title}</h2>
            <span style={{ background: "rgba(37,99,235,.35)", border: "1px solid rgba(70,117,235,.5)", color: "#a8c4ff", fontSize: 12, fontWeight: 900, padding: "5px 12px", borderRadius: 999 }}>
              {total} {total === 1 ? "record" : "records"}
            </span>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, display: "grid", placeItems: "center", background: "rgba(71,96,138,.36)", border: "1px solid rgba(135,163,207,.3)", borderRadius: 8, color: "#dce8ff", fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1 }} aria-label="Close">✕</button>
        </div>

        {/* Subtitle / scope info */}
        <div style={{ padding: "12px 24px", borderBottom: "1px solid rgba(135,163,207,.2)", background: "rgba(23,101,255,.06)" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: tenantWide ? "#f59e0b" : "#a8c4ff", lineHeight: 1.4 }}>
            {tenantWide && "⚠ "}
            {meta.subtitle}
          </p>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#a8b8d4", fontSize: 13 }}>Loading...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#a8b8d4", fontSize: 13 }}>No records found.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
              <thead>
                <tr>
                  {meta.columns.map((col) => (
                    <th key={col.key} style={{ position: "sticky", top: 0, background: "rgba(14,36,61,.94)", zIndex: 1, color: "#dce8ff", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid rgba(135,163,207,.2)", padding: "9px 10px", textAlign: "left", fontWeight: 800 }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {meta.columns.map((col) => {
                      const val = String(row[col.key] ?? "—");
                      const isStatus = col.key === "status" || col.key === "devanned";
                      return (
                        <td key={col.key} style={{ padding: "8px 10px", color: "#edf4ff", borderBottom: "1px solid rgba(135,163,207,.15)", fontWeight: col.key === "orderNo" || col.key === "entryTicket" || col.key === "containerNo" ? 900 : 400 }}>
                          {isStatus ? (
                            <span style={{ display: "inline-block", padding: "2px 7px", background: "rgba(37,99,235,.38)", color: "#72a0ff", border: "1px solid rgba(70,117,235,.42)", fontWeight: 800, fontSize: 11, borderRadius: 4 }}>{val}</span>
                          ) : val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
