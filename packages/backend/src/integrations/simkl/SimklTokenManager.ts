import { UserRepository } from "@repositories/UserRepository";

export class SimklTokenManager {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.simklAccessToken) {
      throw new Error("Simkl not linked for this user");
    }

    return user.simklAccessToken;
  }
}
