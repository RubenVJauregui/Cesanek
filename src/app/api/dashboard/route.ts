import { NextRequest, NextResponse } from "next/server";
import {
  fetchInYardEquipment,
  fetchCustomerCount,
  fetchPlannedOrders,
  fetchOlderThan48hOrders,
  fetchEcommOrders,
  fetchEcommPastSLA,
  fetchWatchListOrders,
  fetchPlannedFTLOrders,
  fetchInProgressTasks,
} from "@/lib/wms-api";
import { config } from "@/lib/config";

const WMS_BASE = config.wmsApiBaseUrl;
const FACILITY_ID = config.facilityId;
const TENANT_ID = config.tenantId;

function getCount(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === "object") {
    const d = r.data as Record<string, unknown>;
    if (typeof d.totalCount === "number") return d.totalCount;
    if (typeof d.total === "number") return d.total;
    if (Array.isArray(d.list)) return d.list.length;
  }
  return 0;
}

function getList(result: unknown): Record<string, unknown>[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === "object") {
    const d = r.data as Record<string, unknown>;
    if (Array.isArray(d.list)) return d.list as Record<string, unknown>[];
    if (Array.isArray(d.content)) return d.content as Record<string, unknown>[];
  }
  if (Array.isArray(r.data)) return r.data as Record<string, unknown>[];
  return [];
}

async function resolveCustomerNames(
  token: string,
  orgIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(orgIds.filter((id) => id && id.startsWith("ORG-")))];
  if (unique.length === 0) return map;
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
      // continue
    }
  }
  return map;
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 });
    }

    const [
      inYardResult,
      customerResult,
      plannedOrdersResult,
      older48hResult,
      ecommResult,
      ecommSLAResult,
      watchListResult,
      plannedFTLResult,
      inProgressResult,
    ] = await Promise.all([
      fetchInYardEquipment(token),
      fetchCustomerCount(token),
      fetchPlannedOrders(token, 50),
      fetchOlderThan48hOrders(token),
      fetchEcommOrders(token),
      fetchEcommPastSLA(token),
      fetchWatchListOrders(token),
      fetchPlannedFTLOrders(token),
      fetchInProgressTasks(token),
    ]);

    const inYardList = getList(inYardResult);
    const plannedOrdersList = getList(plannedOrdersResult);
    const watchList = getList(watchListResult);
    const assigneeList = getList(inProgressResult);

    const uniqueAssignees = new Map<string, { name: string; tasks: number }>();
    for (const task of assigneeList) {
      const userId = (task.assigneeUserId as string) || "";
      const userName = (task.assigneeUserName as string) || (task.assigneeName as string) || "";
      if (userId && userName) {
        const existing = uniqueAssignees.get(userId);
        if (existing) {
          existing.tasks++;
        } else {
          uniqueAssignees.set(userId, { name: userName, tasks: 1 });
        }
      }
    }

    const customerCount = Math.min(getCount(customerResult), 300);
    const isTenantWide = !!(customerResult && typeof customerResult === "object" && (customerResult as Record<string, unknown>)._tenantWide);

    // Collect all customer IDs for name resolution
    const allCustIds: string[] = [];
    for (const item of inYardList) {
      const custIds = (item.customerIds as string[]) || [];
      if (custIds[0]) allCustIds.push(custIds[0]);
    }
    for (const item of plannedOrdersList) {
      const cid = String(item.customerId || "");
      if (cid) allCustIds.push(cid);
    }
    for (const item of watchList) {
      const cid = String(item.customerId || "");
      if (cid) allCustIds.push(cid);
    }

    const nameMap = await resolveCustomerNames(token, allCustIds);

    const data = {
      kpis: {
        inYardFull: getCount(inYardResult),
        customers: customerCount,
        customersTenantWide: isTenantWide,
        plannedFTL: getCount(plannedFTLResult),
        olderThan48h: getCount(older48hResult),
        ecommOrders: getCount(ecommResult),
        ecommPastSLA: getCount(ecommSLAResult),
      },
      inYardEquipment: inYardList.slice(0, 50).map((item) => {
        const check = (item.entryTicketCheck as Record<string, unknown>) || {};
        const containerNOs = (check.containerNOs as string[]) || [];
        const custIds = (item.customerIds as string[]) || [];
        const custId = custIds[0] || "";
        return {
          equipmentNo: containerNOs[0] || (item.id as string) || "—",
          entryTicket: (item.id as string) || "Pending",
          checkInTime: (item.checkInStartTime as string) || (item.createdWhen as string) || "",
          customer: nameMap.get(custId) || (custId || "Unavailable"),
          location: (item.dockName as string) || (item.spotId ? `Spot ${item.spotId}` : "") || "—",
        };
      }),
      plannedOrders: plannedOrdersList.slice(0, 50).map((item) => {
        const custId = String(item.customerId || "");
        return {
          orderNo: item.orderNo || item.id || "",
          customer: nameMap.get(custId) || (custId || "Pending"),
          status: item.status || "",
          baseQty: item.totalQty || item.baseQty || item.quantity || 0,
          poNo: item.poNo || "",
          soNo: item.soNo || item.referenceNo || "",
          appointmentTime: item.appointmentTime || item.shipNotBeforeDate || "",
          retailer: item.retailerName || item.retailer || "",
          carrier: item.carrierName || item.carrier || "",
        };
      }),
      assignees: Array.from(uniqueAssignees.values()).map((a) => ({
        name: a.name,
        tasks: a.tasks,
      })),
      watchList: watchList.slice(0, 50).map((item) => {
        const custId = String(item.customerId || "");
        return {
          orderNo: item.orderNo || item.id || "",
          customer: nameMap.get(custId) || (custId || "Pending"),
          status: item.status || "",
          created: item.createdTime || item.orderedDate || "",
          carrier: item.carrierName || item.carrier || "",
        };
      }),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
