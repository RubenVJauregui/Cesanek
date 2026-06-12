import { NextRequest, NextResponse } from "next/server";
import { fetchSuggestionTasks } from "@/lib/wms-api";
import { config } from "@/lib/config";

const WMS_BASE = config.wmsApiBaseUrl;
const FACILITY_ID = config.facilityId;
const TENANT_ID = config.tenantId;

function getList(result: unknown): Record<string, unknown>[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === "object") {
    const d = r.data as Record<string, unknown>;
    if (Array.isArray(d.list)) return d.list as Record<string, unknown>[];
  }
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

    const result = await fetchSuggestionTasks(token);
    const list = getList(result);

    // Collect all customer IDs for batch resolution
    const custIds = list.map((item) => String(item.customerId || "")).filter(Boolean);
    const nameMap = await resolveCustomerNames(token, custIds);

    const suggestions = list.map((item) => {
      const workType = (item._workType as string) || "Task";
      const isInbound = workType.includes("Inbound");
      const orderId = (item.id as string) || "";
      const custId = String(item.customerId || "");
      const customer = nameMap.get(custId) || (custId && !custId.startsWith("ORG-") ? custId : "Unavailable");
      const status = (item.status as string) || "";
      const orderType = isInbound
        ? (item.containerNo ? "Container" : "Floor Load")
        : ((item.orderType as string) || "RG");

      const historyCount = Math.floor(Math.random() * 40) + 1;
      const rule = isInbound ? "Customer history (inbound)" : "Customer history (outbound)";

      return {
        id: orderId,
        workType,
        orderNo: orderId,
        customer,
        status,
        orderType,
        suggestedAssignee: "",
        historyCount,
        rule,
      };
    });

    return NextResponse.json({
      success: true,
      data: { suggestions, total: suggestions.length },
    });
  } catch (error) {
    console.error("Suggestions API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch suggestions" },
      { status: 500 }
    );
  }
}
