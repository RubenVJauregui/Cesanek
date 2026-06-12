import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

const WMS_BASE = config.wmsApiBaseUrl;
const IAM_BASE = config.iamBaseUrl;
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

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

    // Get facility-scoped users from MDM (defaultFacilityId = LT_F21)
    const mdmRes = await fetch(`${WMS_BASE}/mdm/user/search`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({ facilityIds: [FACILITY_ID], defaultFacilityId: FACILITY_ID }),
    });
    if (!mdmRes.ok) {
      return NextResponse.json({ success: true, data: { assignees: [], total: 0 } });
    }
    const mdmData = await mdmRes.json();
    const mdmList: Record<string, unknown>[] = mdmData?.data || [];
    const total = mdmList.length;
    const userIds = mdmList.map((u) => String(u.userId)).filter(Boolean).slice(0, 200);

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, data: { assignees: [], total: 0 } });
    }

    // Resolve names from IAM in batches of 50
    const assignees: { userId: string; userName: string; firstName: string; lastName: string; fullName: string }[] = [];
    for (let i = 0; i < userIds.length; i += 50) {
      const batch = userIds.slice(i, i + 50);
      const iamRes = await fetch(`${IAM_BASE}/users/search-by-page`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: batch, currentPage: 1, pageSize: 50 }),
      });
      if (!iamRes.ok) continue;
      const iamData = await iamRes.json();
      const iamList = iamData?.data?.list || iamData?.data?.content || [];
      for (const u of iamList as Record<string, unknown>[]) {
        const status = String(u.userStatus || "");
        if (status !== "ACTIVE") continue;
        const first = String(u.firstName || "");
        const last = String(u.lastName || "");
        const full = [first, last].filter(Boolean).join(" ") || String(u.userName || u.id || "");
        assignees.push({
          userId: String(u.id || ""),
          userName: String(u.userName || ""),
          firstName: first,
          lastName: last,
          fullName: full,
        });
      }
    }

    // Sort alphabetically by full name
    assignees.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return NextResponse.json({ success: true, data: { assignees, total } });
  } catch (error) {
    console.error("Assignees API error:", error);
    return NextResponse.json({ error: "Failed to fetch assignees" }, { status: 500 });
  }
}
