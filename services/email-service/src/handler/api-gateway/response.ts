import { APIGatewayProxyResult } from "aws-lambda";

export function response(
  statusCode: number,
  body: unknown
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function errorResponse(error: unknown): APIGatewayProxyResult {
  const message = error instanceof Error ? error.message : String(error);
  return response(500, { error: "INTERNAL_SERVER_ERROR", message });
}
