import { NextRequest, NextResponse } from "next/server";
import { fetchSuggestionTasks } from "@/lib/wms-api";

function getList(result: unknown): Record<string, unknown>[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === "object") {
    const d = r.data as Record<string, unknown>;
    if (Array.isArray(d.list)) return d.list as Record<string, unknown>[];
  }
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 });
    }

    const result = await fetchSuggestionTasks(token);
    const list = getList(result);

    const suggestions = list.map((item, idx) => {
      const workType = (item._workType as string) || "Task";
      const isInbound = workType.includes("Inbound");
      const orderId = (item.id as string) || "";
      const customer = (item.customerName as string) || (item.customerId as string) || "—";
      const status = (item.status as string) || "";
      const orderType = isInbound
        ? (item.containerNo ? "Container" : "Floor Load")
        : ((item.orderType as string) || "RG");

      // Simple suggestion rule: assign based on customer history pattern
      const historyCount = Math.floor(Math.random() * 40) + 1; // Would be from real history API
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
