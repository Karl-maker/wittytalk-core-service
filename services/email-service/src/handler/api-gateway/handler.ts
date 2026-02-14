import { APIGatewayProxyEvent } from "aws-lambda";
import { parseRequest } from "./parse-request";
import { routes } from "./routes";
import { response, errorResponse } from "./response";

function normalizePath(path: string): string {
  let p = path.startsWith("/v1/") ? path.substring(3) : path;
  if (p.startsWith("/")) p = p.substring(1);
  return p;
}

function findRouteHandler(
  method: string,
  path: string
): ((req: import("./types").RequestContext) => Promise<unknown>) | null {
  const normalized = normalizePath(path);
  const pathWithoutQuery = normalized.split("?")[0];
  const key = `${method} ${pathWithoutQuery}`;
  return routes[key] ?? null;
}

export async function apiHandler(event: APIGatewayProxyEvent) {
  try {
    const req = parseRequest(event);
    const actualPath = event.path || req.path;
    const normalizedPath = normalizePath(actualPath);

    const handler = findRouteHandler(req.method, normalizedPath);
    if (!handler) {
      return response(404, { message: "Not found" });
    }

    const result = await handler(req);
    return response(200, result);
  } catch (err) {
    console.error("API error:", err);
    return errorResponse(err);
  }
}
