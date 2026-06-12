import { config } from "./config";

export async function login(username: string, password: string) {
  const res = await fetch(`${config.iamBaseUrl}/auth/exchange-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      username,
      password,
    }),
  });

  if (!res.ok) {
    throw new Error("Authentication failed");
  }

  const body = await res.json();
  if (String(body.code) !== "0") {
    throw new Error(body.msg || "Login failed");
  }

  return {
    accessToken: body.data.access_token,
    refreshToken: body.data.refresh_token,
    expiresIn: body.data.expires_in,
  };
}

export function decodeToken(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      userId: payload.data?.user_id,
      userName: payload.data?.user_name,
      tenantId: payload.data?.tenant_id || payload.data?.company_code,
    };
  } catch {
    return null;
  }
}
