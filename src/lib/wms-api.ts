import { config } from "./config";

const WMS_BASE = config.wmsApiBaseUrl;
const FACILITY_ID = config.facilityId;
const TENANT_ID = config.tenantId;

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-facility-id": FACILITY_ID,
    "x-tenant-id": TENANT_ID,
  };
}

function getTodayRange(tz: string) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = formatter.format(now);
  return {
    from: `${todayStr}T00:00:00`,
    to: `${todayStr}T23:59:59`,
  };
}

function get48HoursAgo() {
  const d = new Date(Date.now() - 48 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19);
}

export async function fetchInYardEquipment(token: string) {
  // "In-Yard FULL Equipment — Full containers not devanned"
  // Strict filter: entry-tickets where:
  //   1. Status is in-yard (Gate/Window/Dock Checked In)
  //   2. equipmentType (in entryTicketCheck) contains "Container"
  //   3. No activities = receipt work not started = definitely not devanned
  // This avoids overcounting trailers, tractors, box trucks, or already-devanned containers.
  const results: Record<string, unknown>[] = [];
  for (const status of ["Gate Checked In", "Window Checked In", "Dock Checked In"]) {
    const res = await fetch(`${WMS_BASE}/wms-bam/entry-ticket/search-by-paging`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({
        status,
        pageNo: 1,
        pageSize: 200,
      }),
    });
    if (!res.ok) continue;
    const json = await res.json();
    const list = json?.data?.list;
    if (Array.isArray(list)) {
      for (const item of list) {
        const check = (item.entryTicketCheck as Record<string, unknown>) || {};
        const eqType = String(check.equipmentType || "");
        const isContainer = eqType.toLowerCase().includes("container");
        const hasContainerNOs = Array.isArray(check.containerNOs) && (check.containerNOs as string[]).length > 0;
        if (!isContainer && !hasContainerNOs) continue;

        const activities = item.entryTicketActivities;
        const hasActivities = Array.isArray(activities) && activities.length > 0;
        // No activities = devanning not started = provably full
        if (!hasActivities) {
          results.push(item);
        }
      }
    }
  }
  return { data: { list: results, totalCount: results.length } };
}

export async function fetchCustomerCount(token: string) {
  // Customer endpoint is tenant-wide (not facility-scoped).
  // Returns null to signal "unavailable at facility level".
  const res = await fetch(`${WMS_BASE}/mdm/customer/search-by-paging`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      status: "ACTIVE",
      pageSize: 1,
      currentPage: 1,
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return { ...json, _tenantWide: true };
}

export async function fetchPlannedOrders(token: string, pageSize = 10) {
  const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      statuses: ["PLANNED", "PLANNING"],
      pageNo: 1,
      pageSize,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchOlderThan48hOrders(token: string) {
  const cutoff = get48HoursAgo();
  const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      statuses: ["OPEN", "IMPORTED", "COMMITTED"],
      orderedDateTo: cutoff,
      pageNo: 1,
      pageSize: 1,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchEcommOrders(token: string) {
  const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      statuses: ["PLANNED", "PLANNING"],
      orderType: "DS",
      pageNo: 1,
      pageSize: 1,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchEcommPastSLA(token: string) {
  const { from } = getTodayRange(config.timezone);
  const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      statuses: ["PLANNED", "PLANNING"],
      orderType: "DS",
      shipNoLaterDateTo: from,
      pageNo: 1,
      pageSize: 1,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchWatchListOrders(token: string) {
  const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      statuses: ["BLOCKED", "COMMIT_FAILED", "PICKING", "PARTIAL_SHIPPED", "EXCEPTION"],
      pageNo: 1,
      pageSize: 50,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchPlannedFTLOrders(token: string) {
  const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      statuses: ["PLANNED"],
      orderType: "RG",
      pageNo: 1,
      pageSize: 1,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchSuggestionTasks(token: string) {
  // Fetch assignable work: open receipts + planned orders (limited to reasonable count)
  const [receiptsRes, ordersRes] = await Promise.all([
    fetch(`${WMS_BASE}/wms/inbound/receipt/search-by-paging`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({
        statuses: ["OPEN", "IMPORTED"],
        pageNo: 1,
        pageSize: 30,
      }),
    }),
    fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({
        statuses: ["PLANNED", "PLANNING"],
        pageNo: 1,
        pageSize: 30,
      }),
    }),
  ]);

  const results: Record<string, unknown>[] = [];

  if (receiptsRes.ok) {
    const rJson = await receiptsRes.json();
    const list = rJson?.data?.list;
    if (Array.isArray(list)) {
      for (const item of list) {
        results.push({ ...item, _workType: "Inbound RN" });
      }
    }
  }

  if (ordersRes.ok) {
    const oJson = await ordersRes.json();
    const list = oJson?.data?.list;
    if (Array.isArray(list)) {
      for (const item of list) {
        results.push({ ...item, _workType: "Outbound Order" });
      }
    }
  }

  return { data: { list: results, totalCount: results.length } };
}

export async function fetchInProgressTasks(token: string) {
  const res = await fetch(`${WMS_BASE}/wms/outbound/pick-task/search-by-paging`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      statuses: ["IN_PROGRESS", "PICKING"],
      pageNo: 1,
      pageSize: 200,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}
