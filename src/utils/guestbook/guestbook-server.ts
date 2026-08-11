import type {
	GuestbookAdminNote,
	GuestbookNote,
	GuestbookNoteColor,
	GuestbookNoteStatus,
	GuestbookNoteType,
} from "@/types/guestbook";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type PublicNoteRow = {
	id: string;
	content: string;
	display_name: string;
	is_anonymous: number;
	note_type: GuestbookNoteType;
	color: GuestbookNoteColor;
	created_at: number;
};

export type AdminNoteRow = PublicNoteRow & {
	status: GuestbookNoteStatus;
	moderation_reason: string | null;
	reviewed_at: number | null;
	has_contact: number;
};

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	const binary = atob(padded);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlToText(value: string): string {
	return decoder.decode(base64ToBytes(value));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	return buffer;
}

export function jsonResponse(
	data: unknown,
	status = 200,
	extraHeaders?: Record<string, string>,
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
			"X-Content-Type-Options": "nosniff",
			...extraHeaders,
		},
	});
}

export function publicNoteFromRow(row: PublicNoteRow): GuestbookNote {
	return {
		id: row.id,
		content: row.content,
		displayName: row.display_name,
		anonymous: row.is_anonymous === 1,
		type: row.note_type,
		color: row.color,
		createdAt: new Date(row.created_at).toISOString(),
	};
}

export function adminNoteFromRow(row: AdminNoteRow): GuestbookAdminNote {
	return {
		...publicNoteFromRow(row),
		status: row.status,
		moderationReason: row.moderation_reason,
		reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
		privateContactAvailable: row.has_contact === 1,
	};
}

export function encodeCursor(createdAt: number, id: string): string {
	return bytesToBase64(encoder.encode(JSON.stringify([createdAt, id])))
		.replace(/\+/gu, "-")
		.replace(/\//gu, "_")
		.replace(/=+$/gu, "");
}

export function decodeCursor(cursor: string | null): [number, string] | null {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(base64UrlToText(cursor));
		if (
			Array.isArray(parsed) &&
			parsed.length === 2 &&
			Number.isFinite(parsed[0]) &&
			typeof parsed[1] === "string"
		) {
			return [parsed[0], parsed[1]];
		}
	} catch {
		return null;
	}
	return null;
}

export async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256(secret: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
	return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function importContactKey(secret: string): Promise<CryptoKey> {
	const bytes = base64ToBytes(secret);
	if (bytes.byteLength !== 32) {
		throw new Error("CONTACT_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
	}
	return crypto.subtle.importKey("raw", toArrayBuffer(bytes), "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}

export async function encryptContact(
	secret: string,
	contact: string,
): Promise<{ ciphertext: string; iv: string }> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await importContactKey(secret);
	const encrypted = await crypto.subtle.encrypt(
		{ iv, name: "AES-GCM" },
		key,
		encoder.encode(contact),
	);
	return {
		ciphertext: bytesToBase64(new Uint8Array(encrypted)),
		iv: bytesToBase64(iv),
	};
}

export async function decryptContact(
	secret: string,
	ciphertext: string,
	iv: string,
): Promise<string> {
	const key = await importContactKey(secret);
	const decrypted = await crypto.subtle.decrypt(
		{ iv: toArrayBuffer(base64ToBytes(iv)), name: "AES-GCM" },
		key,
		toArrayBuffer(base64ToBytes(ciphertext)),
	);
	return decoder.decode(decrypted);
}

export async function verifyTurnstile(
	secret: string,
	token: string,
	remoteIp: string,
	expectedAction: string,
	expectedHostname: string,
): Promise<boolean> {
	if (!token || token.length > 2048) return false;
	const form = new FormData();
	form.set("secret", secret);
	form.set("response", token);
	if (remoteIp !== "unknown") form.set("remoteip", remoteIp);

	const response = await fetch(
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
		{
			body: form,
			method: "POST",
			signal: AbortSignal.timeout(10_000),
		},
	);
	if (!response.ok) return false;
	const result = (await response.json()) as {
		action?: string;
		hostname?: string;
		success?: boolean;
	};
	const isOfficialTestSecret = secret === "1x0000000000000000000000000000000AA";
	const hostnameMatches =
		result.hostname === expectedHostname ||
		(isOfficialTestSecret &&
			result.hostname === "dummy-key-pass.cloudflare.com");
	return (
		result.success === true &&
		result.action === expectedAction &&
		hostnameMatches
	);
}

export async function checkRateLimit(
	db: GuestbookD1Database,
	ipHash: string,
	contentHash: string,
	now: number,
): Promise<{ allowed: boolean; duplicate: boolean }> {
	const dayAgo = now - 86_400_000;
	const counts = await db
		.prepare(
			`SELECT
				SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS minute_count,
				SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS hour_count,
				COUNT(*) AS day_count
			FROM guestbook_submission_events
			WHERE ip_hash = ? AND created_at >= ?`,
		)
		.bind(now - 60_000, now - 3_600_000, ipHash, dayAgo)
		.first<{ day_count: number; hour_count: number; minute_count: number }>();
	const duplicate = await db
		.prepare(
			"SELECT id FROM guestbook_submission_events WHERE content_hash = ? AND created_at >= ? LIMIT 1",
		)
		.bind(contentHash, dayAgo)
		.first<{ id: number }>();

	return {
		allowed:
			Number(counts?.minute_count || 0) < 1 &&
			Number(counts?.hour_count || 0) < 5 &&
			Number(counts?.day_count || 0) < 20,
		duplicate: Boolean(duplicate),
	};
}

export async function cleanupAbuseData(db: GuestbookD1Database, now: number): Promise<void> {
	const cutoff = now - 30 * 86_400_000;
	await db.batch([
		db.prepare("DELETE FROM guestbook_submission_events WHERE created_at < ?").bind(cutoff),
		db.prepare("UPDATE guestbook_notes SET ip_hash = NULL WHERE created_at < ?").bind(cutoff),
	]);
}

export const ADMIN_SESSION_COOKIE = "firefly_admin";
const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function createAdminSession(
	environment: Env,
): Promise<{ token: string; cookie: string } | null> {
	if (!environment.SESSION) return null;
	const token = crypto.randomUUID();
	await environment.SESSION.put(`admin:${token}`, "1", {
		expirationTtl: ADMIN_SESSION_TTL_SECONDS,
	});
	const cookie = `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
	return { token, cookie };
}

export async function destroyAdminSession(
	request: Request,
	environment: Env,
): Promise<void> {
	if (!environment.SESSION) return;
	const cookie = readAdminSessionToken(request);
	if (!cookie) return;
	await environment.SESSION.delete(`admin:${cookie}`);
}

function readAdminSessionToken(request: Request): string | null {
	const header = request.headers.get("Cookie") || "";
	for (const part of header.split(";")) {
		const trimmed = part.trim();
		if (trimmed.startsWith(`${ADMIN_SESSION_COOKIE}=`)) {
			const token = trimmed.slice(ADMIN_SESSION_COOKIE.length + 1);
			return token.length > 0 ? token : null;
		}
	}
	return null;
}

export async function authenticateAdmin(
	request: Request,
	environment: Env,
): Promise<{ email: string; ok: true } | { message: string; ok: false; status: number }> {
	if (!environment.SESSION) {
		return { message: "管理访问尚未配置", ok: false, status: 503 };
	}
	const token = readAdminSessionToken(request);
	if (!token) return { message: "需要管理员身份", ok: false, status: 401 };
	const session = await environment.SESSION.get(`admin:${token}`);
	if (!session) return { message: "管理员身份已过期，请重新登录", ok: false, status: 401 };
	return { email: "admin", ok: true };
}
