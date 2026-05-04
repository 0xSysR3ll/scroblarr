/**
 * Checks if a URL is a Plex server URL that requires authentication
 * images.plex.tv is a public CDN and doesn't need authentication
 */
export function isPlexServerUrl(url: string): boolean {
  return (
    (url.includes("plex.direct") ||
      url.includes("/library/metadata/") ||
      (url.includes("plex") && url.includes(":32400"))) &&
    !url.includes("images.plex.tv")
  );
}
