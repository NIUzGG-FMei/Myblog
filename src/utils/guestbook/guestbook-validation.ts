import {
	type GuestbookNoteColor,
	type GuestbookNoteType,
	guestbookColors,
	guestbookTypes,
} from "@/types/guestbook";

export interface GuestbookSubmission {
	content: string;
	anonymous: boolean;
	displayName: string;
	contact: string;
	type: GuestbookNoteType;
	color: GuestbookNoteColor;
	turnstileToken: string;
}

export type ModerationDecision = {
	status: "published" | "pending" | "rejected";
	reason: string | null;
};

type ValidationResult =
	| { ok: true; data: GuestbookSubmission }
	| { ok: false; message: string };

const urlPattern =
	/(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|cn|net|org|top|xyz)\b)/iu;
const htmlPattern = /<\/?[a-z][^>]*>/iu;

const severeTerms = [
	"儿童色情",
	"恋童",
	"强奸视频",
	"杀人教程",
	"虐杀视频",
	"枪支交易",
	"毒品交易",
];

const reviewTerms = [
	"色情",
	"成人视频",
	"约炮",
	"裸聊",
	"血腥",
	"暴力",
	"博彩",
	"代刷",
	"返利",
	"加微信",
	"加qq",
	"推广",
	"广告合作",
];

export function normalizePlainText(value: unknown): string {
	if (typeof value !== "string") return "";
	return (
		value
			.normalize("NFKC")
			.replace(/\r\n?/gu, "\n")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: 移除 C0 控制字符防止注入，见 https://www.w3.org/TR/xml/#charsets
			.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/gu, "")
			.replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
			.trim()
	);
}

function characterLength(value: string): number {
	return Array.from(value).length;
}

export function validateSubmission(
	value: unknown,
	now: number = Date.now(),
): ValidationResult {
	if (!value || typeof value !== "object") {
		return { ok: false, message: "请求内容格式不正确" };
	}

	const body = value as Record<string, unknown>;
	if (normalizePlainText(body.website)) {
		return { ok: false, message: "无法提交此便签" };
	}

	const startedAt = Number(body.formStartedAt);
	if (
		!Number.isFinite(startedAt) ||
		now - startedAt < 3000 ||
		now - startedAt > 7_200_000
	) {
		return { ok: false, message: "请稍后重新填写并提交" };
	}

	const content = normalizePlainText(body.content);
	const contentLength = characterLength(content);
	if (contentLength < 2 || contentLength > 300) {
		return { ok: false, message: "便签内容需为 2 至 300 个字符" };
	}
	if (htmlPattern.test(content) || urlPattern.test(content)) {
		return { ok: false, message: "便签内容暂不支持 HTML 或链接" };
	}

	const anonymous = body.anonymous !== false;
	const displayName = anonymous ? "匿名" : normalizePlainText(body.displayName);
	if (
		!anonymous &&
		(characterLength(displayName) < 1 || characterLength(displayName) > 24)
	) {
		return { ok: false, message: "个人称呼需为 1 至 24 个字符" };
	}

	const contact = anonymous ? "" : normalizePlainText(body.contact);
	if (contact && contact.length > 200) {
		return { ok: false, message: "联系方式不能超过 200 个字符" };
	}

	const type = body.type as GuestbookNoteType;
	const color = body.color as GuestbookNoteColor;
	if (!guestbookTypes.includes(type)) {
		return { ok: false, message: "便签类型不正确" };
	}
	if (!guestbookColors.includes(color)) {
		return { ok: false, message: "便签颜色不正确" };
	}

	const turnstileToken = normalizePlainText(body.turnstileToken);
	if (turnstileToken.length > 2048) {
		return { ok: false, message: "人机验证令牌无效" };
	}

	return {
		ok: true,
		data: {
			content,
			anonymous,
			displayName,
			contact,
			type,
			color,
			turnstileToken,
		},
	};
}

export function moderateContent(content: string): ModerationDecision {
	const canonical = content
		.toLocaleLowerCase("zh-CN")
		.replace(/[\s\p{P}\p{S}_]+/gu, "");

	if (severeTerms.some((term) => canonical.includes(term))) {
		return { status: "rejected", reason: "high_risk_content" };
	}

	const suspicious =
		reviewTerms.some((term) => canonical.includes(term)) ||
		/(.)\1{7,}/u.test(canonical) ||
		/([!！?？])\1{5,}/u.test(content);
	if (suspicious) {
		return { status: "pending", reason: "rule_review_required" };
	}

	return { status: "published", reason: null };
}
