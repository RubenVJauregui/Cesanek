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

async function resolveCustomerNames(
  token: string,
  orgIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(orgIds.filter((id) => id && id.startsWith("ORG-")))];
  if (unique.length === 0) return map;

  // Batch resolve in chunks of 50
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    try {
      const res = await fetch(`${WMS_BASE}/mdm/customer/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-facility-id": FACILITY_ID,
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({ orgIds: batch }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const list = json?.data;
      if (Array.isArray(list)) {
        for (const c of list) {
          const orgId = c.orgId as string;
          const name = (c.name || c.customerName || "") as string;
          if (orgId && name) map.set(orgId, name);
        }
      }
    } catch {
      // continue on failure
    }
  }
  return map;
}

async function fetchAllPages(
  token: string,
  url: string,
  body: Record<string, unknown>,
  maxRows = 1000
): Promise<{ list: Record<string, unknown>[]; totalCount: number }> {
  const pageSize = Math.min(maxRows, 200);
  const firstRes = await fetch(url, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({ ...body, pageNo: 1, pageSize }),
  });
  if (!firstRes.ok) return { list: [], totalCount: 0 };
  const firstJson = await firstRes.json();
  const totalCount = firstJson?.data?.totalCount || 0;
  const firstList: Record<string, unknown>[] = firstJson?.data?.list || [];

  if (firstList.length >= totalCount || firstList.length >= maxRows) {
    return { list: firstList.slice(0, maxRows), totalCount: Math.min(totalCount, maxRows) };
  }

  const allRows = [...firstList];
  const totalPages = Math.min(Math.ceil(Math.min(totalCount, maxRows) / pageSize), 10);
  for (let page = 2; page <= totalPages && allRows.length < maxRows; page++) {
    const res = await fetch(url, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({ ...body, pageNo: page, pageSize }),
    });
    if (!res.ok) break;
    const json = await res.json();
    const list = json?.data?.list || [];
    if (list.length === 0) break;
    allRows.push(...list);
  }
  const finalList = allRows.slice(0, maxRows);
  return { list: finalList, totalCount: finalList.length };
}

export async function POST(req: NextRequest) {
  try {
    const { token, kpi } = await req.json();
    if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

    if (kpi === "inYardFull") {
      const results: Record<string, unknown>[] = [];
      const customerOrgIds: string[] = [];
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
              const custIds = (item.customerIds as string[]) || [];
              const custId = custIds[0] || "";
              customerOrgIds.push(custId);
              results.push({
                entryTicket: item.id,
                containerNo: containerNOs[0] || "—",
                _customerId: custId,
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

      const nameMap = await resolveCustomerNames(token, customerOrgIds);
      const rows = results.map((r) => {
        const resolved = nameMap.get(r._customerId as string) || (r._customerId ? String(r._customerId) : "Unavailable");
        return {
          entryTicket: r.entryTicket,
          containerNo: r.containerNo,
          customer: resolved,
          equipmentType: r.equipmentType,
          status: r.status,
          spot: r.spot,
          checkInTime: r.checkInTime,
          devanned: r.devanned,
        };
      });

      return NextResponse.json({ success: true, data: { rows, total: rows.length } });
    }

    if (kpi === "customers") {
      const { list, totalCount } = await fetchAllPages(
        token,
        `${WMS_BASE}/mdm/customer/search-by-paging`,
        { status: "ACTIVE", currentPage: 1 },
        300
      );
      const rows = list.map((c) => ({
        id: c.orgId || c.id || "—",
        name: c.name || c.customerName || "—",
        status: c.status || "—",
        code: c.customerCode || c.code || "—",
      }));
      return NextResponse.json({ success: true, data: { rows, total: rows.length, tenantWide: true } });
    }

    if (kpi === "plannedFTL") {
      const { list, totalCount } = await fetchAllPages(
        token,
        `${WMS_BASE}/wms/outbound/order/search-by-paging`,
        { statuses: ["PLANNED"], orderType: "RG" },
        300
      );
      const custIds = list.map((o) => String(o.customerId || ""));
      const nameMap = await resolveCustomerNames(token, custIds);
      const rows = list.map((o) => ({
        orderNo: o.id || "—",
        customer: nameMap.get(String(o.customerId || "")) || String(o.customerId || "Pending"),
        status: o.status || "—",
        orderType: o.orderType || "—",
        carrier: o.carrierName || o.carrierId || "—",
        poNo: o.poNo || "—",
        createdTime: o.createdTime || o.orderedDate || "",
      }));
      return NextResponse.json({ success: true, data: { rows, total: rows.length } });
    }

    if (kpi === "olderThan48h") {
      const cutoff = get48HoursAgo();
      const { list, totalCount } = await fetchAllPages(
        token,
        `${WMS_BASE}/wms/outbound/order/search-by-paging`,
        { statuses: ["OPEN", "IMPORTED", "COMMITTED"], orderedDateTo: cutoff },
        300
      );
      const custIds = list.map((o) => String(o.customerId || ""));
      const nameMap = await resolveCustomerNames(token, custIds);
      const rows = list.map((o) => ({
        orderNo: o.id || "—",
        customer: nameMap.get(String(o.customerId || "")) || String(o.customerId || "Pending"),
        status: o.status || "—",
        orderType: o.orderType || "—",
        carrier: o.carrierName || o.carrierId || "—",
        orderedDate: o.orderedDate || o.createdTime || "",
      }));
      return NextResponse.json({ success: true, data: { rows, total: rows.length } });
    }

    if (kpi === "ecommOrders") {
      const { list, totalCount } = await fetchAllPages(
        token,
        `${WMS_BASE}/wms/outbound/order/search-by-paging`,
        { statuses: ["PLANNED", "PLANNING"], orderType: "DS" },
        300
      );
      const custIds = list.map((o) => String(o.customerId || ""));
      const nameMap = await resolveCustomerNames(token, custIds);
      const rows = list.map((o) => ({
        orderNo: o.id || "—",
        customer: nameMap.get(String(o.customerId || "")) || String(o.customerId || "Pending"),
        status: o.status || "—",
        orderType: o.orderType || "DS",
        carrier: o.carrierName || o.carrierId || "—",
        shipNoLaterDate: o.shipNoLaterDate || "—",
      }));
      return NextResponse.json({ success: true, data: { rows, total: rows.length } });
    }

    if (kpi === "ecommPastSLA") {
      const from = getTodayStart();
      const { list, totalCount } = await fetchAllPages(
        token,
        `${WMS_BASE}/wms/outbound/order/search-by-paging`,
        { statuses: ["PLANNED", "PLANNING"], orderType: "DS", shipNoLaterDateTo: from },
        300
      );
      const custIds = list.map((o) => String(o.customerId || ""));
      const nameMap = await resolveCustomerNames(token, custIds);
      const rows = list.map((o) => ({
        orderNo: o.id || "—",
        customer: nameMap.get(String(o.customerId || "")) || String(o.customerId || "Pending"),
        status: o.status || "—",
        orderType: o.orderType || "DS",
        carrier: o.carrierName || o.carrierId || "—",
        shipNoLaterDate: o.shipNoLaterDate || "—",
        createdTime: o.createdTime || "",
      }));
      return NextResponse.json({ success: true, data: { rows, total: rows.length } });
    }

    return NextResponse.json({ error: "Unknown KPI" }, { status: 400 });
  } catch (error) {
    console.error("KPI detail error:", error);
    return NextResponse.json({ error: "Failed to fetch KPI detail" }, { status: 500 });
  }
}
