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

    // Customer count is tenant-wide, not facility-scoped
    const customerCount = getCount(customerResult);
    const isTenantWide = !!(customerResult && typeof customerResult === "object" && (customerResult as Record<string, unknown>)._tenantWide);

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
        const trailers = (check.trailers as string[]) || [];
        return {
          equipmentNo: containerNOs[0] || (check.tractor as string) || trailers[0] || (item.id as string) || "—",
          entryTicket: (item.id as string) || "Pending",
          checkInTime: (item.checkInStartTime as string) || (item.createdWhen as string) || "",
          customer: (check.carrierName as string) || (check.company as string) || "Pending",
          location: (item.dockName as string) || (item.spotId ? `Spot ${item.spotId}` : "") || "—",
        };
      }),
      plannedOrders: plannedOrdersList.slice(0, 50).map((item) => ({
        orderNo: item.orderNo || item.id || "",
        customer: item.customerName || item.customer || "",
        status: item.status || "",
        baseQty: item.totalQty || item.baseQty || item.quantity || 0,
        poNo: item.poNo || "",
        soNo: item.soNo || item.referenceNo || "",
        appointmentTime: item.appointmentTime || item.shipNotBeforeDate || "",
        retailer: item.retailerName || item.retailer || "",
        carrier: item.carrierName || item.carrier || "",
      })),
      assignees: Array.from(uniqueAssignees.values()).map((a) => ({
        name: a.name,
        tasks: a.tasks,
      })),
      watchList: watchList.slice(0, 50).map((item) => ({
        orderNo: item.orderNo || item.id || "",
        customer: item.customerName || item.customer || "",
        status: item.status || "",
        created: item.createdTime || item.orderedDate || "",
        carrier: item.carrierName || item.carrier || "",
      })),
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
