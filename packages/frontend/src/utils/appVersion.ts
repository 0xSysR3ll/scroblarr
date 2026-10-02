export function getAppVersion(): string {
  const fromEnv = (
    import.meta.env.VITE_APP_VERSION as string | undefined
  )?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return "develop-local";
}

export function getAppVersionForClients(): string {
  return getAppVersion().replace(/^v/, "");
}
