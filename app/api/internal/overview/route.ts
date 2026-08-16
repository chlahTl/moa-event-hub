import { authorizeSuperAdminRequest } from "../../../auth";
import {
  getInternalOverview,
  normalizeInternalAnalyticsRange,
} from "../../../../lib/internal-analytics";
import { internalApiError } from "../../../../lib/api-response";

export async function GET(request: Request) {
  const authorization = await authorizeSuperAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const url = new URL(request.url);
    const data = await getInternalOverview(
      normalizeInternalAnalyticsRange(url.searchParams.get("range")),
      url.searchParams.get("query") ?? "",
    );
    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("Failed to load internal overview", error);
    return internalApiError("운영 현황을 불러오지 못했습니다.");
  }
}
