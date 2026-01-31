export interface User {
  id: string;
  plexUsername: string;
  displayName?: string;
  email?: string;
  tvtimeUsername?: string;
  isAdmin: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
