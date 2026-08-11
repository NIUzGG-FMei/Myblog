<script lang="ts">
import { onMount } from "svelte";
import Icon from "@/components/common/Icon.svelte";
import type { NativeComment, NativeCommentListResponse } from "@/types/comment";

interface Props {
	path: string;
	turnstileSiteKey?: string;
}

let { path, turnstileSiteKey = "" }: Props = $props();

let comments = $state<NativeComment[]>([]);
let loading = $state(true);
let loadError = $state("");
let displayName = $state("");
let contact = $state("");
let content = $state("");
let website = $state("");
let formStartedAt = $state(Date.now());
let turnstileToken = $state("");
let submitting = $state(false);
let submitMessage = $state("");
let submitState = $state<"idle" | "success" | "error">("idle");
let turnstileContainer: HTMLDivElement | undefined;
let turnstileWidgetId: string | undefined;
let replyTarget = $state<NativeComment | null>(null);

interface CommentThread {
	top: NativeComment;
	replies: NativeComment[];
}

function buildThreads(allComments: NativeComment[]): CommentThread[] {
	const tops = allComments.filter((comment) => !comment.parentId);
	const byId = new Map<string, NativeComment>();
	for (const comment of allComments) byId.set(comment.id, comment);
	const repliesByTop = new Map<string, NativeComment[]>();
	for (const comment of allComments) {
		if (!comment.parentId) continue;
		let parent = byId.get(comment.parentId);
		if (!parent) continue;
		while (parent.parentId) {
			const grandparent = byId.get(parent.parentId);
			if (!grandparent) break;
			parent = grandparent;
		}
		const list = repliesByTop.get(parent.id) || [];
		list.push(comment);
		repliesByTop.set(parent.id, list);
	}
	return tops
		.map((top) => ({
			top,
			replies: (repliesByTop.get(top.id) || []).sort((a, b) =>
				a.createdAt.localeCompare(b.createdAt),
			),
		}))
		.sort((a, b) => b.top.createdAt.localeCompare(a.top.createdAt));
}

let threads = $state<CommentThread[]>([]);

let runtimeError = $state("");

function reportRuntimeError(event: ErrorEvent | PromiseRejectionEvent): void {
	const message =
		event instanceof PromiseRejectionEvent
			? String(event.reason)
			: `${event.message} @ ${event.filename}:${event.lineno}`;
	if (!runtimeError) runtimeError = message;
}

function startReply(comment: NativeComment): void {
	replyTarget = comment;
}

function cancelReply(): void {
	replyTarget = null;
}

function formatDate(value: string): string {
	return new Intl.DateTimeFormat(document.documentElement.lang || "zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

async function parseResponse(
	response: Response,
): Promise<Record<string, unknown>> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}

async function loadComments(silent = false): Promise<void> {
	if (!silent) loading = true;
	loadError = "";
	try {
		const response = await fetch(
			`/api/comments/?path=${encodeURIComponent(path)}`,
			{ headers: { Accept: "application/json" } },
		);
		const data = (await response.json()) as NativeCommentListResponse & {
			message?: string;
		};
		if (!response.ok) throw new Error(data.message || "评论加载失败");
		comments = data.comments;
		threads = buildThreads(comments);
	} catch (error) {
		loadError = error instanceof Error ? error.message : "评论加载失败";
	} finally {
		loading = false;
	}
}

function resetTurnstile(): void {
	turnstileToken = "";
	if (turnstileWidgetId) window.turnstile?.reset(turnstileWidgetId);
}

async function submitComment(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (submitting) return;
	submitting = true;
	submitMessage = "";
	submitState = "idle";

	try {
		const response = await fetch("/api/comments/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contact,
				content,
				displayName,
				formStartedAt,
				parentId: replyTarget?.id || null,
				path,
				turnstileToken,
				website,
			}),
		});
		const data = await parseResponse(response);
		if (!response.ok) {
			throw new Error(
				typeof data.message === "string" ? data.message : "评论提交失败",
			);
		}

		if (data.comment) {
			comments = [data.comment as NativeComment, ...comments];
			threads = buildThreads(comments);
		}
		contact = "";
		content = "";
		formStartedAt = Date.now();
		submitState = "success";
		submitMessage = "评论发布成功";
		replyTarget = null;
		void loadComments(true);
	} catch (error) {
		submitState = "error";
		submitMessage = error instanceof Error ? error.message : "评论提交失败";
	} finally {
		submitting = false;
		resetTurnstile();
	}
}

function loadTurnstile(): Promise<void> {
	if (window.turnstile) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(
			"script[data-firefly-turnstile]",
		);
		if (existing) {
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener(
				"error",
				() => reject(new Error("人机验证加载失败")),
				{ once: true },
			);
			return;
		}

		const script = document.createElement("script");
		script.src =
			"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		script.async = true;
		script.defer = true;
		script.dataset.fireflyTurnstile = "";
		script.addEventListener("load", () => resolve(), { once: true });
		script.addEventListener(
			"error",
			() => reject(new Error("人机验证加载失败")),
			{ once: true },
		);
		document.head.append(script);
	});
}

async function initializeTurnstile(): Promise<void> {
	if (!turnstileSiteKey) return;
	try {
		await loadTurnstile();
		if (!turnstileContainer || !window.turnstile) return;
		turnstileWidgetId = window.turnstile.render(turnstileContainer, {
			action: "comment-submit",
			callback: (token: string) => {
				turnstileToken = token;
			},
			"error-callback": () => {
				turnstileToken = "";
			},
			"expired-callback": () => {
				turnstileToken = "";
			},
			sitekey: turnstileSiteKey,
			theme: document.documentElement.classList.contains("dark")
				? "dark"
				: "light",
		});
	} catch (error) {
		submitState = "error";
		submitMessage = error instanceof Error ? error.message : "人机验证加载失败";
	}
}

onMount(() => {
	formStartedAt = Date.now();
	const errorListener = (event: ErrorEvent | PromiseRejectionEvent) => {
		reportRuntimeError(event);
	};
	window.addEventListener("error", errorListener);
	window.addEventListener("unhandledrejection", errorListener);
	void loadComments();
	if (turnstileSiteKey) void initializeTurnstile();
	return () => {
		window.removeEventListener("error", errorListener);
		window.removeEventListener("unhandledrejection", errorListener);
		if (turnstileWidgetId) window.turnstile?.remove(turnstileWidgetId);
	};
});
</script>

<section class="native-comments" aria-label="文章评论">
	<form class="comment-form" onsubmit={submitComment}>
		{#if replyTarget}
			<div class="reply-target">
				<span>正在回复 <strong>{replyTarget.isAuthor ? "博主" : replyTarget.displayName}</strong> 的评论：{replyTarget.content}</span>
				<button type="button" onclick={cancelReply}>取消</button>
			</div>
		{/if}
		<div class="form-row">
			<label>
				<span>昵称 <small>可选</small></span>
				<input
					bind:value={displayName}
					maxlength="24"
					autocomplete="nickname"
					placeholder="匿名"
				/>
			</label>
			<span class="counter">{Array.from(content).length}/500</span>
		</div>

		<label class="contact-field">
			<span>联系方式 <small>可选</small></span>
			<input
				bind:value={contact}
				maxlength="200"
				autocomplete="off"
				placeholder="QQ/WeChat/Email，保护隐私仅作者后台可见"
			/>
		</label>

		<label class="content-field">
			<span>评论内容</span>
			<textarea
				bind:value={content}
				minlength="2"
				maxlength="500"
				rows="4"
				required
				placeholder="写下你的想法"
			></textarea>
		</label>

		<label class="honeypot" aria-hidden="true">
			<span>网站</span>
			<input bind:value={website} tabindex="-1" autocomplete="off" />
		</label>

		{#if turnstileSiteKey}
			<div class="turnstile" bind:this={turnstileContainer}></div>
		{/if}

		<div class="form-actions">
			<p class="submit-status {submitState}" role="status" aria-live="polite">
				{submitMessage}
			</p>
			<button
				type="submit"
				disabled={submitting || Boolean(turnstileSiteKey && !turnstileToken)}
			>
				<Icon icon="material-symbols:send" class="text-lg" />
				{submitting ? "正在发布" : "发布评论"}
			</button>
		</div>
	</form>

	<div class="comment-list" aria-live="polite" aria-busy={loading}>
		{#if runtimeError}
			<div class="list-state error">
				<p>评论组件遇到错误：{runtimeError}</p>
				<button type="button" onclick={() => (runtimeError = "")}>知道了</button>
			</div>
		{:else if loading}
			<p class="list-state">正在加载评论</p>
		{:else if loadError}
			<div class="list-state error">
				<p>{loadError}</p>
				<button type="button" onclick={() => loadComments()}>重新加载</button>
			</div>
		{:else if comments.length === 0}
			<p class="list-state">还没有评论，来发表第一条吧</p>
		{:else}
			{#each threads as thread (thread.top.id)}
				<article class="comment-item">
					<header>
						<div class="comment-author">
							<strong>{thread.top.displayName}</strong>
							{#if thread.top.isAuthor}
								<span class="author-badge">作者回复</span>
							{/if}
						</div>
						<time datetime={thread.top.createdAt}>{formatDate(thread.top.createdAt)}</time>
					</header>
					<p>{thread.top.content}</p>
					<div class="comment-meta">
						<button type="button" class="reply-button" onclick={() => startReply(thread.top)}>回复</button>
					</div>
					{#if thread.replies.length > 0}
						<div class="replies">
							{#each thread.replies as reply (reply.id)}
								<article class="reply-item">
									<header>
										<div class="comment-author">
											<strong>{reply.displayName}</strong>
											{#if reply.isAuthor}
												<span class="author-badge">作者回复</span>
											{/if}
										</div>
										<time datetime={reply.createdAt}>{formatDate(reply.createdAt)}</time>
									</header>
									<p>{reply.content}</p>
									<div class="comment-meta">
										<button type="button" class="reply-button" onclick={() => startReply(reply)}>回复</button>
									</div>
								</article>
							{/each}
						</div>
					{/if}
				</article>
			{/each}
		{/if}
	</div>
</section>

<style>
	.native-comments { width: 100%; }
	.comment-form { position: relative; padding-bottom: 1.25rem; border-bottom: 1px solid color-mix(in srgb, var(--content) 11%, transparent); }
	.form-row { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
	.form-row label { width: min(18rem, 72%); }
	.contact-field { display: block; margin-top: 0.85rem; }
	label > span { display: block; margin-bottom: 0.4rem; color: var(--content); font-size: 0.8rem; font-weight: 650; }
	label small { margin-left: 0.25rem; color: var(--content-meta); font-weight: 400; }
	.counter { padding-bottom: 0.6rem; color: var(--content-meta); font-size: 0.75rem; }
	input, textarea { width: 100%; box-sizing: border-box; border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 5px; outline: 0; color: var(--content); background: color-mix(in srgb, var(--card-bg) 92%, var(--page-bg)); font: inherit; font-size: 0.88rem; transition: border-color 150ms, box-shadow 150ms; }
	input { height: 2.5rem; padding: 0 0.75rem; }
	textarea { min-height: 7rem; padding: 0.75rem; line-height: 1.65; resize: vertical; }
	input:focus, textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent); }
	.content-field { display: block; margin-top: 0.85rem; }
	.honeypot { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
	.turnstile { min-height: 65px; margin-top: 0.85rem; overflow: hidden; }
	.form-actions { display: flex; min-height: 2.75rem; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.9rem; }
	.form-actions button { display: inline-flex; min-height: 2.6rem; flex: 0 0 auto; align-items: center; justify-content: center; gap: 0.45rem; padding: 0.55rem 1rem; border: 0; border-radius: 5px; color: white; background: var(--primary); cursor: pointer; font: inherit; font-size: 0.85rem; font-weight: 700; }
	.form-actions button:disabled { cursor: not-allowed; opacity: 0.55; }
	.submit-status { min-width: 0; margin: 0; color: var(--content-meta); font-size: 0.8rem; }
	.submit-status.success { color: #23824f; }
	.submit-status.error { color: #c13d55; }
	.comment-list { min-height: 6rem; }
	.reply-target { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.85rem; padding: 0.55rem 0.75rem; border-radius: 5px; color: var(--content); background: color-mix(in srgb, var(--primary) 9%, var(--card-bg)); font-size: 0.78rem; }
	.reply-target span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.reply-target strong { color: var(--primary); font-weight: 700; }
	.reply-target button { flex: 0 0 auto; padding: 0.25rem 0.55rem; border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 4px; color: var(--content-meta); background: transparent; cursor: pointer; font: inherit; font-size: 0.75rem; }
	.reply-target button:hover { color: var(--content); }
	.comment-item { padding: 1.05rem 0.15rem; border-bottom: 1px solid color-mix(in srgb, var(--content) 9%, transparent); }
	.comment-item header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
	.comment-author { display: flex; min-width: 0; align-items: center; gap: 0.45rem; }
	.comment-author strong { min-width: 0; overflow: hidden; color: var(--content); font-size: 0.88rem; text-overflow: ellipsis; white-space: nowrap; }
	.author-badge { flex: 0 0 auto; padding: 0.12rem 0.4rem; border-radius: 3px; color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, transparent); font-size: 0.68rem; font-weight: 700; }
	.comment-item time { flex: 0 0 auto; color: var(--content-meta); font-size: 0.7rem; }
	.comment-item p { margin: 0.6rem 0 0; overflow-wrap: anywhere; color: var(--content); font-size: 0.9rem; line-height: 1.7; white-space: pre-wrap; }
	.comment-meta { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.45rem; }
	.reply-button { padding: 0; border: 0; color: var(--content-meta); background: transparent; cursor: pointer; font: inherit; font-size: 0.72rem; }
	.reply-button:hover { color: var(--primary); }
	.replies { margin: 0.7rem 0 0 0.85rem; padding-left: 0.9rem; border-left: 2px solid color-mix(in srgb, var(--content) 12%, transparent); }
	.reply-item { padding: 0.85rem 0.15rem; border-bottom: 1px dashed color-mix(in srgb, var(--content) 8%, transparent); }
	.reply-item:last-child { border-bottom: 0; }
	.list-state { display: flex; min-height: 6rem; align-items: center; justify-content: center; margin: 0; color: var(--content-meta); font-size: 0.85rem; text-align: center; }
	.list-state.error { flex-direction: column; gap: 0.6rem; }
	.list-state.error p { margin: 0; }
	.list-state.error button { padding: 0.45rem 0.75rem; border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 5px; color: var(--content); background: var(--card-bg); cursor: pointer; font: inherit; font-size: 0.8rem; }
	@media (max-width: 520px) {
		.form-row { align-items: stretch; flex-direction: column; gap: 0.35rem; }
		.form-row label { width: 100%; }
		.counter { align-self: end; padding: 0; }
		.form-actions { align-items: stretch; flex-direction: column; }
		.form-actions button { width: 100%; }
	}
	@media (prefers-reduced-motion: reduce) {
		input, textarea { transition: none; }
	}
</style>
