export const guestbookTypes = ["visit", "feedback", "request"] as const;
export type GuestbookNoteType = (typeof guestbookTypes)[number];

export const guestbookColors = ["lemon", "mint", "sky", "blush"] as const;
export type GuestbookNoteColor = (typeof guestbookColors)[number];

export const guestbookStatuses = [
	"published",
	"pending",
	"rejected",
	"deleted",
] as const;
export type GuestbookNoteStatus = (typeof guestbookStatuses)[number];

export interface GuestbookNote {
	id: string;
	content: string;
	displayName: string;
	anonymous: boolean;
	type: GuestbookNoteType;
	color: GuestbookNoteColor;
	createdAt: string;
}

export interface GuestbookAdminNote extends GuestbookNote {
	status: GuestbookNoteStatus;
	moderationReason: string | null;
	reviewedAt: string | null;
	privateContactAvailable: boolean;
}

export interface GuestbookListResponse {
	notes: GuestbookNote[];
	nextCursor: string | null;
}

export interface GuestbookConfig {
	pageSize: number;
	maxContentLength: number;
	maxDisplayNameLength: number;
	turnstileSiteKey: string;
	defaultType: GuestbookNoteType;
	defaultColor: GuestbookNoteColor;
	colors: Record<GuestbookNoteColor, { label: string; value: string }>;
	types: Record<GuestbookNoteType, { label: string; icon: string }>;
}
