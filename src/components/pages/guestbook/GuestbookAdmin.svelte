<script lang="ts">
import { onMount } from "svelte";
import Icon from "@/components/common/Icon.svelte";
import CommentAdmin from "@/components/pages/guestbook/CommentAdmin.svelte";
import type { GuestbookAdminNote, GuestbookNoteStatus } from "@/types/guestbook";

const statuses: Array<{ value: GuestbookNoteStatus; label: string }> = [
	{ value: "pending", label: "待审核" },
	{ value: "published", label: "已发布" },
	{ value: "rejected", label: "已驳回" },
	{ value: "deleted", label: "已删除" },
];

let authenticated = $state<boolean | null>(null);
let password = $state("");
let loginError = $state("");
let loggingIn = $state(false);
let activeTab = $state<"notes" | "comments">("notes");

let activeStatus = $state<GuestbookNoteStatus>("pending");
let notes = $state<GuestbookAdminNote[]>([]);
let nextCursor = $state<string | null>(null);
let loading = $state(true);
let loadingMore = $state(false);
let errorMessage = $state("");
let contactById = $state<Record<string, string | "loading" | "none">>({});

async function checkSession(): Promise<void> {
	try {
		const response = await fetch("/api/guestbook/admin/session/", {
			headers: { Accept: "application/json" },
		});
		const data = (await response.json()) as { authenticated?: boolean };
		authenticated = data.authenticated === true;
		if (authenticated) void loadNotes();
	} catch {
		authenticated = false;
	}
}

async function login(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (loggingIn) return;
	loggingIn = true;
	loginError = "";
	try {
		const response = await fetch("/api/guestbook/admin/login/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password }),
		});
		const data = (await response.json()) as { message?: string };
		if (!response.ok) throw new Error(data.message || "登录失败");
		password = "";
		authenticated = true;
		void loadNotes();
	} catch (error) {
		loginError = error instanceof Error ? error.message : "登录失败";
	} finally {
		loggingIn = false;
	}
}

async function logout(): Promise<void> {
	await fetch("/api/guestbook/admin/logout/", { method: "POST" });
	authenticated = false;
	notes = [];
	activeTab = "notes";
	activeStatus = "pending";
}

function switchTab(tab: "notes" | "comments"): void {
	activeTab = tab;
}

async function loadNotes(append = false): Promise<void> {
	if (append) loadingMore = true;
	else loading = true;
	errorMessage = "";
	try {
		const params = new URLSearchParams({ status: activeStatus });
		if (append && nextCursor) params.set("cursor", nextCursor);
		const response = await fetch(`/api/guestbook/admin/notes/?${params.toString()}`, {
			headers: { Accept: "application/json" },
		});
		const data = (await response.json()) as { notes?: GuestbookAdminNote[]; nextCursor?: string | null; message?: string };
		if (!response.ok) throw new Error(data.message || "审核队列加载失败");
		notes = append ? [...notes, ...(data.notes || [])] : (data.notes || []);
		nextCursor = data.nextCursor || null;
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "审核队列加载失败";
	} finally {
		loading = false;
		loadingMore = false;
	}
}

async function revealContact(note: GuestbookAdminNote): Promise<void> {
	if (!note.privateContactAvailable || contactById[note.id]) return;
	contactById = { ...contactById, [note.id]: "loading" };
	try {
		const response = await fetch(`/api/guestbook/admin/notes/${note.id}/contact/`, { headers: { Accept: "application/json" } });
		const data = (await response.json()) as { contact?: string; message?: string };
		if (!response.ok) throw new Error(data.message || "无法读取联系方式");
		contactById = { ...contactById, [note.id]: data.contact || "none" };
	} catch {
		contactById = { ...contactById, [note.id]: "none" };
	}
}

async function moderate(note: GuestbookAdminNote, status: "published" | "rejected"): Promise<void> {
	const response = await fetch(`/api/guestbook/admin/notes/${note.id}/`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ status }),
	});
	if (!response.ok) {
		const data = (await response.json()) as { message?: string };
		errorMessage = data.message || "审核操作失败";
		return;
	}
	notes = notes.filter((item) => item.id !== note.id);
}

async function deleteNote(note: GuestbookAdminNote): Promise<void> {
	if (!window.confirm("确定删除这张便签吗？删除后私密联系方式也会清除。")) return;
	const response = await fetch(`/api/guestbook/admin/notes/${note.id}/`, { method: "DELETE" });
	if (!response.ok) {
		errorMessage = "删除便签失败";
		return;
	}
	notes = notes.filter((item) => item.id !== note.id);
}

function switchStatus(status: GuestbookNoteStatus): void {
	if (status === activeStatus) return;
	activeStatus = status;
	nextCursor = null;
	notes = [];
	void loadNotes();
}

onMount(() => {
	void checkSession();
});
</script>

<section class="admin-shell" data-full-width-page="guestbook" aria-labelledby="admin-title">
	<header class="admin-heading">
		<div>
			<p class="eyebrow">便签墙管理</p>
			<h2 id="admin-title">审核留言</h2>
		</div>
		<div class="heading-actions">
			{#if authenticated}
				<button type="button" class="logout-button" onclick={logout}><Icon icon="material-symbols:logout" /> 退出登录</button>
			{/if}
			<a href="/guestbook/" class="back-link"><Icon icon="fa7-solid:arrow-rotate-left" /> 返回便签墙</a>
		</div>
	</header>

	{#if authenticated === null}
		<div class="login-card">
			<p>正在检查登录状态…</p>
		</div>
	{:else if !authenticated}
		<form class="login-card" onsubmit={login}>
			<h3>管理员登录</h3>
			<p class="login-tip">请输入管理员密码以管理便签和评论。</p>
			<input
				type="password"
				bind:value={password}
				placeholder="管理员密码"
				autocomplete="current-password"
				required
			/>
			{#if loginError}
				<div class="login-error" role="alert">{loginError}</div>
			{/if}
			<button type="submit" disabled={loggingIn}>
				{#if loggingIn}<span class="spinner" aria-hidden="true"></span>正在登录{:else}登录{/if}
			</button>
		</form>
	{:else}
		<nav class="admin-tabs" aria-label="管理功能">
			<button type="button" class:active={activeTab === "notes"} onclick={() => switchTab("notes")}><Icon icon="material-symbols:note-stack" /> 便签墙留言</button>
			<button type="button" class:active={activeTab === "comments"} onclick={() => switchTab("comments")}><Icon icon="material-symbols:forum" /> 文章评论</button>
		</nav>

		{#if activeTab === "comments"}
			<CommentAdmin />
		{:else}
			<nav class="status-tabs" aria-label="审核状态">
		{#each statuses as status}
			<button type="button" class:active={activeStatus === status.value} onclick={() => switchStatus(status.value)}>{status.label}</button>
		{/each}
	</nav>

	{#if errorMessage}
		<div class="admin-error" role="alert">{errorMessage}</div>
	{/if}

	{#if loading}
		<div class="admin-empty"><span class="spinner" aria-hidden="true"></span>正在加载</div>
	{:else if notes.length === 0}
		<div class="admin-empty">这个队列是空的</div>
	{:else}
		<div class="admin-list">
			{#each notes as note (note.id)}
				<article class="admin-note color-{note.color}">
					<div class="admin-note-meta">
						<span class="note-label">{note.type === "visit" ? "到此一游" : note.type === "feedback" ? "反馈" : "需求"}</span>
						<span>{note.displayName}</span>
						<time datetime={note.createdAt}>{new Date(note.createdAt).toLocaleString("zh-CN")}</time>
					</div>
					<p class="admin-content">{note.content || "（内容已删除）"}</p>
					{#if note.moderationReason}
						<p class="moderation-reason">规则标记：{note.moderationReason}</p>
					{/if}
					<div class="admin-actions">
						{#if note.privateContactAvailable}
							<button type="button" class="quiet-action" onclick={() => revealContact(note)}>
								<Icon icon="material-symbols:lock" />
								{contactById[note.id] === "loading" ? "读取中" : "查看私密联系方式"}
							</button>
						{/if}
						{#if activeStatus !== "published" && activeStatus !== "deleted"}
							<button type="button" class="approve-action" onclick={() => moderate(note, "published")}><Icon icon="material-symbols:check" /> 发布</button>
						{/if}
						{#if activeStatus !== "rejected" && activeStatus !== "deleted"}
							<button type="button" class="reject-action" onclick={() => moderate(note, "rejected")}><Icon icon="material-symbols:close" /> 驳回</button>
						{/if}
						{#if activeStatus !== "deleted"}
							<button type="button" class="delete-action" onclick={() => deleteNote(note)}><Icon icon="material-symbols:delete" /> 删除</button>
						{/if}
					</div>
					{#if contactById[note.id] && contactById[note.id] !== "loading" && contactById[note.id] !== "none"}
						<div class="private-contact">
							<span>联系方式：{contactById[note.id]}</span>
						</div>
					{/if}
				</article>
			{/each}
		</div>
		{#if nextCursor}
			<button type="button" class="load-more" disabled={loadingMore} onclick={() => loadNotes(true)}>{loadingMore ? "正在加载" : "加载更多"}</button>
		{/if}
	{/if}
		{/if}
	{/if}
</section>

<style>
	.admin-shell { width: 100%; }
	.admin-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.2rem; }
	.eyebrow { margin: 0 0 0.3rem; color: var(--primary); font-size: 0.75rem; font-weight: 750; }
	.admin-heading h2 { margin: 0; color: var(--content); font-size: 1.8rem; letter-spacing: 0; }
	.back-link { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--content-meta); font-size: 0.82rem; text-decoration: none; }
	.back-link:hover { color: var(--primary); }
	.heading-actions { display: flex; align-items: center; gap: 0.8rem; }
	.logout-button { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.65rem; border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 5px; color: var(--content-meta); background: transparent; cursor: pointer; font: inherit; font-size: 0.78rem; }
	.logout-button:hover { color: #b33b50; }
	.login-card { display: grid; max-width: 22rem; gap: 0.8rem; margin: 2rem auto 0; padding: 1.5rem; border-radius: 8px; background: var(--card-bg); box-shadow: 0 12px 30px color-mix(in srgb, black 9%, transparent); }
	.login-card h3 { margin: 0; color: var(--content); letter-spacing: 0; }
	.login-tip { margin: 0; color: var(--content-meta); font-size: 0.8rem; line-height: 1.6; }
	.login-card input { width: 100%; height: 2.6rem; box-sizing: border-box; padding: 0 0.75rem; border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 5px; outline: 0; color: var(--content); background: color-mix(in srgb, var(--card-bg) 92%, var(--page-bg)); font: inherit; }
	.login-card input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent); }
	.login-card button { display: flex; min-height: 2.6rem; align-items: center; justify-content: center; gap: 0.45rem; border: 0; border-radius: 5px; color: white; background: var(--primary); cursor: pointer; font: inherit; font-weight: 700; }
	.login-card button:disabled { cursor: not-allowed; opacity: 0.55; }
	.login-error { padding: 0.6rem 0.75rem; border-left: 3px solid #c13d55; color: #c13d55; background: color-mix(in srgb, #c13d55 9%, var(--card-bg)); font-size: 0.8rem; }
	.admin-tabs { display: flex; gap: 0.35rem; margin-bottom: 1.2rem; border-bottom: 1px solid color-mix(in srgb, var(--content) 12%, transparent); }
	.admin-tabs button { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.6rem 0.9rem; border: 0; border-bottom: 2px solid transparent; color: var(--content-meta); background: transparent; cursor: pointer; font: inherit; font-size: 0.85rem; white-space: nowrap; }
	.admin-tabs button.active { border-bottom-color: var(--primary); color: var(--content); font-weight: 700; }
	.status-tabs { display: flex; gap: 0.35rem; margin-bottom: 1rem; overflow-x: auto; border-bottom: 1px solid color-mix(in srgb, var(--content) 12%, transparent); }
	.status-tabs button { padding: 0.6rem 0.8rem; border: 0; border-bottom: 2px solid transparent; color: var(--content-meta); background: transparent; cursor: pointer; font: inherit; font-size: 0.85rem; white-space: nowrap; }
	.status-tabs button.active { border-bottom-color: var(--primary); color: var(--content); font-weight: 700; }
	.admin-error { margin-bottom: 1rem; padding: 0.7rem 0.85rem; border-left: 3px solid #c13d55; color: #c13d55; background: color-mix(in srgb, #c13d55 9%, var(--card-bg)); font-size: 0.82rem; }
	.admin-empty { display: flex; min-height: 14rem; align-items: center; justify-content: center; gap: 0.5rem; color: var(--content-meta); }
	.admin-list { display: grid; gap: 0.9rem; }
	.admin-note { padding: 1rem 1.1rem; border-left: 5px solid var(--paper); border-radius: 5px; background: var(--card-bg); box-shadow: 0 5px 18px color-mix(in srgb, black 7%, transparent); }
	.color-lemon { --paper: #e3bd31; }
	.color-mint { --paper: #58a976; }
	.color-sky { --paper: #4b8fc7; }
	.color-blush { --paper: #d7788c; }
	.admin-note-meta { display: flex; align-items: center; gap: 0.6rem; color: var(--content-meta); font-size: 0.74rem; }
	.admin-note-meta time { margin-left: auto; white-space: nowrap; }
	.note-label { padding: 0.18rem 0.4rem; border-radius: 3px; color: var(--content); background: color-mix(in srgb, var(--paper) 24%, transparent); font-weight: 700; }
	.admin-content { margin: 0.75rem 0; color: var(--content); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }
	.moderation-reason { margin: 0 0 0.7rem; color: #a16c12; font-size: 0.75rem; }
	.admin-actions { display: flex; flex-wrap: wrap; gap: 0.45rem; }
	.admin-actions button { display: inline-flex; align-items: center; gap: 0.28rem; min-height: 2rem; padding: 0.35rem 0.6rem; border: 1px solid transparent; border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.75rem; }
	.quiet-action { color: var(--content); background: var(--btn-regular-bg); }
	.approve-action { color: #237846; background: #ddf3e4; }
	.reject-action { color: #96640c; background: #fff0c8; }
	.delete-action { color: #b33b50; background: #ffe4e8; }
	.private-contact { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-top: 0.75rem; padding: 0.65rem 0.75rem; border-radius: 4px; color: var(--content); background: color-mix(in srgb, var(--primary) 7%, var(--card-bg)); font-size: 0.75rem; }
	.load-more { display: block; margin: 1.2rem auto 0; padding: 0.55rem 1rem; border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 5px; color: var(--content); background: var(--card-bg); cursor: pointer; font: inherit; font-size: 0.8rem; }
	.load-more:disabled { cursor: wait; opacity: 0.6; }
	.spinner { display: inline-block; width: 1rem; height: 1rem; border: 2px solid color-mix(in srgb, var(--content) 18%, transparent); border-top-color: var(--content); border-radius: 50%; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (max-width: 600px) { .admin-heading { align-items: start; flex-direction: column; } .admin-note-meta { align-items: start; flex-wrap: wrap; } .admin-note-meta time { width: 100%; margin-left: 0; } }
	@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 1.8s; } }
</style>
