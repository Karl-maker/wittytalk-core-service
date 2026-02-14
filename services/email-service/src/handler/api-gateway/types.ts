export interface RequestContext {
  method: string;
  path: string;
  pathParams: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown> | null;
}
