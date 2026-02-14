import { bootstrap } from "../../bootstrap";
import type { RequestContext } from "./types";

const { unsubscribeController } = bootstrap();

export const routes: Record<
  string,
  (req: RequestContext) => Promise<unknown>
> = {
  "POST email/unsubscribe": unsubscribeController.handle.bind(unsubscribeController),
  "GET email/unsubscribe": unsubscribeController.handle.bind(unsubscribeController),
};
