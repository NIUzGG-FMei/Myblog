export interface NativeComment {
	id: string;
	path: string;
	displayName: string;
	content: string;
	parentId: string | null;
	isAuthor: boolean;
	createdAt: string;
}

export interface NativeCommentListResponse {
	comments: NativeComment[];
}

export interface AdminCommentItem extends NativeComment {
	status: "published" | "deleted";
	contact: string | null;
}
