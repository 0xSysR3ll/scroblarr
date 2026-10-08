import { createSessionAuth } from "@middleware/resolveRequestAuth";

export const auth = createSessionAuth({ requireAdmin: false });
