import { APIGatewayProxyEvent } from "aws-lambda";
import type { RequestContext } from "./types";

export function parseRequest(event: APIGatewayProxyEvent): RequestContext {
  const path = event.resource || event.path || "";

  let body: Record<string, unknown> | null = null;
  if (event.body) {
    try {
      body = JSON.parse(event.body) as Record<string, unknown>;
    } catch {
      body = null;
    }
  }

  const pathParams: Record<string, string> = {};
  if (event.pathParameters) {
    for (const [key, value] of Object.entries(event.pathParameters)) {
      if (value !== undefined) pathParams[key] = value;
    }
  }

  const query: Record<string, string> = {};
  if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined) query[key] = value;
    }
  }

  return {
    method: event.httpMethod,
    path,
    pathParams,
    query,
    body,
  };
}
