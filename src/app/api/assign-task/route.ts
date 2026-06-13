import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

const WMS_BASE = config.wmsApiBaseUrl;
const FACILITY_ID = config.facilityId;
const TENANT_ID = config.tenantId;

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-facility-id": FACILITY_ID,
    "x-tenant-id": TENANT_ID,
  };
}

function fail(message: string) {
  return NextResponse.json({ success: false, message });
}

export async function POST(req: NextRequest) {
  try {
    const { token, rowId, workType, orderType, assigneeId, assigneeName } = await req.json();
    if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });
    if (!rowId || !assigneeId) return NextResponse.json({ error: "Missing row or assignee" }, { status: 400 });

    if (workType === "Inbound RN" || workType === "In-Yard ET") {
      const searchBody = workType === "Inbound RN"
        ? { receiptIds: [rowId], pageNo: 1, pageSize: 10 }
        : { entryIds: [rowId], pageNo: 1, pageSize: 10 };
      const searchRes = await fetch(`${WMS_BASE}/wms-bam/inbound/receive-task/search-by-paging`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(searchBody),
      });
      if (!searchRes.ok) return fail("No existing receive task is ready to assign yet.");
      const searchJson = await searchRes.json();
      const tasks = searchJson?.data?.list || [];
      const taskIds = Array.isArray(tasks) ? tasks.map((t: Record<string, unknown>) => String(t.id || "")).filter(Boolean) : [];
      if (taskIds.length === 0) return fail("No existing receive task is ready to assign yet.");

      const assignRes = await fetch(`${WMS_BASE}/wms/inbound/receive-task/batch-update`, {
        method: "PUT",
        headers: headers(token),
        body: JSON.stringify(taskIds.map((id: string) => ({ id, assigneeUserId: assigneeId, applyAssigneeToAllTaskSteps: true, priority: "MIDDLE" }))),
      });
      const assignJson = await assignRes.json().catch(() => ({}));
      if (assignRes.ok && (String(assignJson.code) === "0" || assignJson.success !== false)) {
        return NextResponse.json({ success: true, message: `Assigned to ${assigneeName || "selected assignee"}` });
      }
      return fail(assignJson.msg || "Receive task assignment could not be completed.");
    }

    if (workType === "Outbound Order" && orderType === "DS") {
      const searchRes = await fetch(`${WMS_BASE}/wms/outbound/pick-task/search-by-paging`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ orderIds: [rowId], taskType: "PICK_DROPSHIP", pageNo: 1, pageSize: 10 }),
      });
      if (!searchRes.ok) return fail("No existing pick task is ready to assign yet.");
      const searchJson = await searchRes.json();
      const tasks = searchJson?.data?.list || [];
      const taskIds = Array.isArray(tasks) ? tasks.map((t: Record<string, unknown>) => String(t.id || "")).filter(Boolean) : [];
      if (taskIds.length === 0) return fail("No existing pick task is ready to assign yet.");

      const assignRes = await fetch(`${WMS_BASE}/wms/outbound/pick-task/batch-assignment`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ taskIds, assigneeUserId: assigneeId, includesTaskSteps: true, priority: "MIDDLE" }),
      });
      const assignJson = await assignRes.json().catch(() => ({}));
      if (assignRes.ok && (String(assignJson.code) === "0" || assignJson.success !== false)) {
        return NextResponse.json({ success: true, message: `Assigned to ${assigneeName || "selected assignee"}` });
      }
      return fail(assignJson.msg || "Pick task assignment could not be completed.");
    }

    return fail("This row is review-only or not ready for assignment.");
  } catch (error) {
    console.error("Assign task error:", error);
    return NextResponse.json({ error: "Assignment could not be completed" }, { status: 500 });
  }
}
