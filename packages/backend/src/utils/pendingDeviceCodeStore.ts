export interface PendingDeviceCodeInput {
  device_code: string;
  user_code: string;
  expires_in: number;
}

interface PendingDeviceCode {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
}

export function createPendingDeviceCodeStore(providerName: string) {
  const pendingByUserId = new Map<string, PendingDeviceCode>();

  function remember(userId: string, pin: PendingDeviceCodeInput): void {
    const now = Date.now();
    for (const [pendingUserId, pending] of pendingByUserId) {
      if (pending.expiresAt <= now) {
        pendingByUserId.delete(pendingUserId);
      }
    }

    pendingByUserId.set(userId, {
      deviceCode: pin.device_code,
      userCode: pin.user_code,
      expiresAt: now + pin.expires_in * 1000,
    });
  }

  function resolve(userId: string, userCode: string): string {
    const pending = pendingByUserId.get(userId);
    if (!pending || pending.expiresAt <= Date.now()) {
      pendingByUserId.delete(userId);
      throw new Error(
        `${providerName} device code expired. Generate a new one to try again.`
      );
    }

    if (pending.userCode !== userCode) {
      throw new Error(
        `${providerName} PIN code does not match the active authorization`
      );
    }

    return pending.deviceCode;
  }

  function clear(userId: string): void {
    pendingByUserId.delete(userId);
  }

  return { remember, resolve, clear };
}
