import { createSessionAuth } from "@middleware/resolveRequestAuth";

export const adminAuth = createSessionAuth({ requireAdmin: true });
