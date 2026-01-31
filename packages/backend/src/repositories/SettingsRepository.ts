import { Repository } from "typeorm";
import { dataSource } from "@config/database";
import { Settings } from "@entities/Settings";

export class SettingsRepository {
  private repository: Repository<Settings>;

  constructor() {
    this.repository = dataSource.getRepository(Settings);
  }

  async get(key: string): Promise<string | null> {
    const setting = await this.repository.findOne({ where: { key } });
    return setting?.value || null;
  }

  async set(key: string, value: string): Promise<void> {
    const existing = await this.repository.findOne({ where: { key } });
    if (existing) {
      existing.value = value;
      await this.repository.save(existing);
    } else {
      const setting = this.repository.create({ key, value });
      await this.repository.save(setting);
    }
  }

  async getAll(): Promise<Record<string, string>> {
    const settings = await this.repository.find();
    const result: Record<string, string> = {};
    for (const setting of settings) {
      if (setting.value) {
        result[setting.key] = setting.value;
      }
    }
    return result;
  }

  async delete(key: string): Promise<void> {
    const setting = await this.repository.findOne({ where: { key } });
    if (setting) {
      await this.repository.remove(setting);
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.repository.delete(keys);
  }
}
