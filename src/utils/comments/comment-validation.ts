import { normalizePlainText } from "@/utils/guestbook/guestbook-validation";

export interface CommentSubmission {
	content: string;
	displayName: string;
	contact: string;
	formStartedAt: number;
	path: string;
	parentId: string | null;
	turnstileToken: string;
}

type ValidationResult =
	| { ok: true; data: CommentSubmission }
	| { ok: false; message: string };

const htmlPattern = /<\/?[a-z][^>]*>/iu;
const urlPattern =
	/(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|cn|net|org|top|xyz)\b)/iu;

export function normalizeCommentPath(value: unknown): string {
	const path = normalizePlainText(value);
	if (
		!path.startsWith("/") ||
		path.length > 300 ||
		path.includes("?") ||
		path.includes("#")
	) {
		return "";
	}
	return path;
}

export function validateCommentSubmission(
	value: unknown,
	now: number = Date.now(),
): ValidationResult {
	if (!value || typeof value !== "object") {
		return { ok: false, message: "请求内容格式不正确" };
	}

	const body = value as Record<string, unknown>;
	if (normalizePlainText(body.website)) {
		return { ok: false, message: "无法提交此评论" };
	}

	const formStartedAt = Number(body.formStartedAt);
	if (
		!Number.isFinite(formStartedAt) ||
		now - formStartedAt < 1500 ||
		now - formStartedAt > 7_200_000
	) {
		return { ok: false, message: "请稍后重新填写并提交" };
	}

	const path = normalizeCommentPath(body.path);
	if (!path) return { ok: false, message: "评论页面地址无效" };

	const content = normalizePlainText(body.content);
	const contentLength = Array.from(content).length;
	if (contentLength < 2 || contentLength > 500) {
		return { ok: false, message: "评论内容需为 2 至 500 个字符" };
	}
	if (htmlPattern.test(content) || urlPattern.test(content)) {
		return { ok: false, message: "评论暂不支持 HTML 或链接" };
	}

	const submittedName = normalizePlainText(body.displayName);
	if (Array.from(submittedName).length > 24) {
		return { ok: false, message: "昵称不能超过 24 个字符" };
	}

	const turnstileToken = normalizePlainText(body.turnstileToken);
	if (turnstileToken.length > 2048) {
		return { ok: false, message: "人机验证令牌无效" };
	}

	const parentId = normalizePlainText(body.parentId);
	if (parentId.length > 100) {
		return { ok: false, message: "回复对象无效" };
	}

	const contact = normalizePlainText(body.contact);
	if (contact.length > 200) {
		return { ok: false, message: "联系方式不能超过 200 个字符" };
	}

	return {
		ok: true,
		data: {
			content,
			displayName: submittedName || "匿名",
			contact,
			formStartedAt,
			path,
			parentId: parentId || null,
			turnstileToken,
		},
	};
}
