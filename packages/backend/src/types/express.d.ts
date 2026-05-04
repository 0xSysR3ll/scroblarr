import { User } from "@entities/User";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      /** Set by `auth` / `adminAuth` when `X-API-Key` matches the instance API key. */
      apiKeyAuth?: boolean;
    }
  }
}

export {};
