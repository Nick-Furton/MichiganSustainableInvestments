// Shapes shared by the real (Supabase) and demo data layers.
export type Access = 'admin' | 'member' | 'applicant' | 'none';
export type Status = 'draft' | 'submitted' | 'approved' | 'changes_requested';
export type Session = { userId: string; email: string };

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  class_year: number | null;
  school: string | null;
  major: string | null;
  linkedin_url: string | null;
  headshot_path: string | null;
  bio: string | null;
  show_identity: boolean;
  show_headshot: boolean;
  show_linkedin: boolean;
  show_placements: boolean;
  show_name_on_placements: boolean;
  status: Status;
  review_note: string | null;
  published: unknown | null;
};
export type Placement = { id?: string; firm: string; team: string | null; kind: 'internship' | 'full_time'; year: number | null };
export type ProfileInput = Omit<Profile, 'id' | 'email' | 'status' | 'review_note' | 'published'>;
export type ReviewItem = { profile: Profile; placements: Placement[] };
export type BoardRow = { profile_id: string; full_name: string; email: string; title: string; sort_order: number };

export type ContactMessage = {
  id: string; created_at: string; name: string; email: string; organization: string; topic: string; message: string;
  handled_at: string | null; handled_by: string | null;
};

export interface Api {
  /** Real data layer is configured (Supabase variables present) or demo mode. */
  configured: boolean;
  getSession(): Promise<Session | null>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  access(): Promise<Access>;
  headshotUrl(path: string): string;
  // member
  getMyProfile(userId: string): Promise<{ profile: Profile | null; placements: Placement[]; boardTitle: string | null }>;
  saveProfile(userId: string, existing: Profile | null, input: ProfileInput, status: 'draft' | 'submitted', placements: Placement[], newHeadshot: Blob | null): Promise<Profile>;
  unpublish(): Promise<void>;
  deleteProfile(userId: string, profile: Profile): Promise<void>;
  // admin
  listRoster(): Promise<string[]>;
  addRoster(emails: string[]): Promise<void>;
  removeRoster(email: string): Promise<void>;
  listSubmitted(): Promise<ReviewItem[]>;
  listPublished(): Promise<Profile[]>;
  unpublishProfile(profileId: string, note: string): Promise<void>;
  adminDeleteProfile(profileId: string): Promise<void>;
  approve(profileId: string): Promise<void>;
  requestChanges(profileId: string, note: string): Promise<void>;
  listBoard(): Promise<BoardRow[]>;
  setBoard(profileId: string, title: string, order: number): Promise<void>;
  /** Contact form messages, newest first. null when the contact form is not installed in the database. */
  listMessages(): Promise<ContactMessage[] | null>;
  setMessageHandled(id: string, handled: boolean): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  deleteHandledMessages(): Promise<void>;
  exportAll(): Promise<{ profiles: Record<string, unknown>[]; placements: Record<string, unknown>[] }>;
}
