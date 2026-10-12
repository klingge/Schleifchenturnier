export type Session = {
  authenticated: true;
  csrf: string;
} & (
  | { role: "operator"; eventId: null }
  | { role: "organizer"; eventId: string | null }
);

export type SessionResponse = Session | { authenticated: false };
export type RefreshSession = () => Promise<SessionResponse>;

export type OrganizerKey = {
  id: string;
  label: string;
  version: number;
  revoked_at: string | null;
  event_id: string | null;
  event_name: string | null;
  used_at: string | null;
  created_at: string;
  updated_at: string;
};
