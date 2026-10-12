import type { User } from "@entities/User";
import type { UserRepository } from "@repositories/UserRepository";
import type { Request, Response } from "express";

/** Returns req.user or sends 401 Unauthorized. */
export function requireRequestUser(req: Request, res: Response): User | null {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return user;
}

/** Returns a DB-fresh user for req.user, or sends 401. */
export async function requireFreshUser(
  req: Request,
  res: Response,
  userRepository: UserRepository
): Promise<User | null> {
  const user = requireRequestUser(req, res);
  if (!user) {
    return null;
  }

  const freshUser = await userRepository.findById(user.id);
  if (!freshUser) {
    res.status(401).json({ error: "User not found" });
    return null;
  }
  return freshUser;
}
