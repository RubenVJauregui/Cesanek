import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

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

function get48HoursAgo() {
  const d = new Date(Date.now() - 48 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19);
}

function getTodayStart() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${formatter.format(now)}T00:00:00`;
}

export async function POST(req: NextRequest) {
  try {
    const { token, kpi } = await req.json();
    if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

    if (kpi === "inYardFull") {
      const results: Record<string, unknown>[] = [];
      for (const status of ["Gate Checked In", "Window Checked In", "Dock Checked In"]) {
        const res = await fetch(`${WMS_BASE}/wms-bam/entry-ticket/search-by-paging`, {
          method: "POST",
          headers: getHeaders(token),
          body: JSON.stringify({ status, pageNo: 1, pageSize: 200 }),
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
            if (!hasActivities) {
              const containerNOs = (check.containerNOs as string[]) || [];
              results.push({
                entryTicket: item.id,
                containerNo: containerNOs[0] || "—",
                carrier: check.carrierName || check.company || "—",
                equipmentType: check.equipmentType || "—",
                status: item.status,
                spot: item.spotId ? `Spot ${item.spotId}` : (item.dockName || "—"),
                checkInTime: item.checkInStartTime || item.createdWhen || "",
                devanned: "No (no activity started)",
              });
            }
          }
        }
      }
      return NextResponse.json({ success: true, data: { rows: results, total: results.length } });
    }

    if (kpi === "customers") {
      const res = await fetch(`${WMS_BASE}/mdm/customer/search-by-paging`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({ status: "ACTIVE", pageSize: 50, currentPage: 1 }),
      });
      if (!res.ok) return NextResponse.json({ success: true, data: { rows: [], total: 0, tenantWide: true } });
      const json = await res.json();
      const list = json?.data?.list || [];
      const total = json?.data?.totalCount || 0;
      const rows = (list as Record<string, unknown>[]).map((c) => ({
        id: c.id || c.customerId || "—",
        name: c.customerName || c.name || "—",
        status: c.status || "—",
        code: c.customerCode || c.code || "—",
      }));
      return NextResponse.json({ success: true, data: { rows, total, tenantWide: true } });
    }

    if (kpi === "plannedFTL") {
      const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({ statuses: ["PLANNED"], orderType: "RG", pageNo: 1, pageSize: 50 }),
      });
      if (!res.ok) return NextResponse.json({ success: true, data: { rows: [], total: 0 } });
      const json = await res.json();
      const list = json?.data?.list || [];
      const total = json?.data?.totalCount || 0;
      const rows = (list as Record<string, unknown>[]).map((o) => ({
        orderNo: o.id || "—",
        customer: o.customerName || o.customerId || "—",
        status: o.status || "—",
        orderType: o.orderType || "—",
        carrier: o.carrierName || o.carrierId || "—",
        poNo: o.poNo || "—",
        createdTime: o.createdTime || o.orderedDate || "",
      }));
      return NextResponse.json({ success: true, data: { rows, total } });
    }

    if (kpi === "olderThan48h") {
      const cutoff = get48HoursAgo();
      const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({ statuses: ["OPEN", "IMPORTED", "COMMITTED"], orderedDateTo: cutoff, pageNo: 1, pageSize: 50 }),
      });
      if (!res.ok) return NextResponse.json({ success: true, data: { rows: [], total: 0 } });
      const json = await res.json();
      const list = json?.data?.list || [];
      const total = json?.data?.totalCount || 0;
      const rows = (list as Record<string, unknown>[]).map((o) => ({
        orderNo: o.id || "—",
        customer: o.customerName || o.customerId || "—",
        status: o.status || "—",
        orderType: o.orderType || "—",
        carrier: o.carrierName || o.carrierId || "—",
        orderedDate: o.orderedDate || o.createdTime || "",
      }));
      return NextResponse.json({ success: true, data: { rows, total } });
    }

    if (kpi === "ecommOrders") {
      const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({ statuses: ["PLANNED", "PLANNING"], orderType: "DS", pageNo: 1, pageSize: 50 }),
      });
      if (!res.ok) return NextResponse.json({ success: true, data: { rows: [], total: 0 } });
      const json = await res.json();
      const list = json?.data?.list || [];
      const total = json?.data?.totalCount || 0;
      const rows = (list as Record<string, unknown>[]).map((o) => ({
        orderNo: o.id || "—",
        customer: o.customerName || o.customerId || "—",
        status: o.status || "—",
        orderType: o.orderType || "DS",
        carrier: o.carrierName || o.carrierId || "—",
        shipNoLaterDate: o.shipNoLaterDate || "—",
      }));
      return NextResponse.json({ success: true, data: { rows, total } });
    }

    if (kpi === "ecommPastSLA") {
      const from = getTodayStart();
      const res = await fetch(`${WMS_BASE}/wms/outbound/order/search-by-paging`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({ statuses: ["PLANNED", "PLANNING"], orderType: "DS", shipNoLaterDateTo: from, pageNo: 1, pageSize: 50 }),
      });
      if (!res.ok) return NextResponse.json({ success: true, data: { rows: [], total: 0 } });
      const json = await res.json();
      const list = json?.data?.list || [];
      const total = json?.data?.totalCount || 0;
      const rows = (list as Record<string, unknown>[]).map((o) => ({
        orderNo: o.id || "—",
        customer: o.customerName || o.customerId || "—",
        status: o.status || "—",
        orderType: o.orderType || "DS",
        carrier: o.carrierName || o.carrierId || "—",
        shipNoLaterDate: o.shipNoLaterDate || "—",
        createdTime: o.createdTime || "",
      }));
      return NextResponse.json({ success: true, data: { rows, total } });
    }

    return NextResponse.json({ error: "Unknown KPI" }, { status: 400 });
  } catch (error) {
    console.error("KPI detail error:", error);
    return NextResponse.json({ error: "Failed to fetch KPI detail" }, { status: 500 });
  }
}
