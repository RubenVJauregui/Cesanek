export const config = {
  wmsApiBaseUrl: process.env.NEXT_PUBLIC_WMS_API_BASE_URL || "https://unis.item.com/api",
  iamBaseUrl: process.env.NEXT_PUBLIC_IAM_BASE_URL || "https://id.item.com",
  facilityId: process.env.NEXT_PUBLIC_FACILITY_ID || "LT_F21",
  facilityName: process.env.NEXT_PUBLIC_FACILITY_NAME || "Cesanek",
  tenantId: process.env.NEXT_PUBLIC_TENANT_ID || "LT",
  timezone: process.env.NEXT_PUBLIC_TIMEZONE || "America/New_York",
};
