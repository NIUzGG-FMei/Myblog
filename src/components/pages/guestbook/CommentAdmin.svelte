<script lang="ts">
import { onMount } from "svelte";
import Icon from "@/components/common/Icon.svelte";
import type { AdminCommentItem } from "@/types/comment";

let comments = $state<AdminCommentItem[]>([]);
let loading = $state(true);
let errorMessage = $state("");
let pathFilter = $state("");
let activePathFilter = $state("");
let statusFilter = $state<"all" | "published" | "deleted">("published");
let replyForId = $state<string | null>(null);
let replyContent = $state("");

const statusOptions: Array<{ value: "all" | "published" | "deleted"; label: string }> = [
	{ value: "published", label: "已发布" },
	{ value: "deleted", label: "已删除" },
	{ value: "all", label: "全部" },
];

async function parseResponse(
	response: Response,
): Promise<Record<string, unknown>> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}

async function loadComments(): Promise<void> {
	loading = true;
	errorMessage = "";
	replyForId = null;
	try {
		const query = new URLSearchParams();
		if (activePathFilter) query.set("path", activePathFilter);
		if (statusFilter !== "all") query.set("status", statusFilter);
		const response = await fetch(`/api/guestbook/admin/comments/?${query.toString()}`, {
			headers: { Accept: "application/json" },
		});
		const data = await parseResponse(response);
		if (!response.ok) {
			throw new Error(
				typeof data.message === "string" ? data.message : "评论列表加载失败",
			);
		}
		comments = (data.comments as AdminCommentItem[]) || [];
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "评论列表加载失败";
	} finally {
		loading = false;
	}
}

function switchStatus(status: "all" | "published" | "deleted"): void {
	if (status === statusFilter) return;
	statusFilter = status;
	void loadComments();
}

function applyFilter(): void {
	activePathFilter = pathFilter.trim();
	void loadComments();
}

function startReply(id: string): void {
	replyForId = replyForId === id ? null : id;
	replyContent = "";
}

async function submitReply(id: string): Promise<void> {
	const content = replyContent.trim();
	if (content.length < 2) {
		errorMessage = "回复内容需为 2 至 500 个字符";
		return;
	}
	errorMessage = "";
	try {
		const response = await fetch(`/api/guestbook/admin/comments/${id}/reply/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content }),
		});
		const data = await parseResponse(response);
		if (!response.ok) {
			throw new Error(
				typeof data.message === "string" ? data.message : "回复失败",
			);
		}
		replyForId = null;
		replyContent = "";
		void loadComments();
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "回复失败";
	}
}

async function deleteComment(id: string): Promise<void> {
	if (!window.confirm("确定删除这条评论吗？它的所有回复也会一并删除。")) {
		return;
	}
	try {
		const response = await fetch(`/api/guestbook/admin/comments/${id}/`, {
			method: "DELETE",
		});
		if (!response.ok) {
			const data = await parseResponse(response);
			errorMessage =
				typeof data.message === "string" ? data.message : "删除评论失败";
			return;
		}
		void loadComments();
	} catch {
		errorMessage = "删除评论失败";
	}
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

onMount(() => {
	void loadComments();
});
</script>

<section class="comment-admin" aria-label="评论管理">
	<nav class="status-tabs" aria-label="评论状态">
		{#each statusOptions as option}
			<button type="button" class:active={statusFilter === option.value} onclick={() => switchStatus(option.value)}>{option.label}</button>
		{/each}
	</nav>
	<div class="filter-row">
		<input
			bind:value={pathFilter}
			placeholder="按文章地址筛选，例如 /posts/detr/"
			onkeydown={(event) => {
				if (event.key === "Enter") applyFilter();
			}}
		/>
		<button type="button" onclick={applyFilter}>筛选</button>
		<button type="button" class="clear-filter" onclick={() => { pathFilter = ""; activePathFilter = ""; void loadComments(); }}>
			全部
		</button>
		<span class="comment-total">{comments.length} 条</span>
	</div>

	{#if errorMessage}
		<div class="admin-error" role="alert">{errorMessage}</div>
	{/if}

	{#if loading}
		<div class="admin-empty"><span class="spinner" aria-hidden="true"></span>正在加载</div>
	{:else if comments.length === 0}
		<div class="admin-empty">没有找到评论</div>
	{:else}
		<div class="comment-list">
			{#each comments as comment (comment.id)}
				<article class="comment-row" class:is-deleted={comment.status === "deleted"}>
					<div class="comment-row-meta">
						<a href={comment.path} target="_blank" rel="noopener noreferrer" class="comment-path">{comment.path}</a>
						<span class="comment-who">
							{comment.isAuthor ? "博主" : comment.displayName}
							{#if comment.isAuthor}<span class="author-badge">作者回复</span>{/if}
							{#if comment.parentId}<span class="reply-mark">回复</span>{/if}
						</span>
						<time datetime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
						{#if comment.status === "deleted"}<span class="deleted-mark">已删除</span>{/if}
					</div>
					<p class="comment-row-content">{comment.content || "（内容已删除）"}</p>
					{#if comment.contact}
						<p class="comment-row-contact"><Icon icon="material-symbols:lock" /> 联系方式：{comment.contact}</p>
					{/if}
					<div class="comment-row-actions">
						{#if comment.status === "published"}
							<button type="button" class="quiet-action" onclick={() => startReply(comment.id)}>
								<Icon icon="material-symbols:reply" /> {replyForId === comment.id ? "取消回复" : "回复"}
							</button>
							<button type="button" class="delete-action" onclick={() => deleteComment(comment.id)}>
								<Icon icon="material-symbols:delete" /> 删除
							</button>
						{/if}
					</div>
					{#if replyForId === comment.id}
						<div class="reply-box">
							<textarea bind:value={replyContent} maxlength="500" rows="3" placeholder="以作者身份回复这条评论…"></textarea>
							<div class="reply-box-actions">
								<span class="reply-counter">{Array.from(replyContent).length}/500</span>
								<button type="button" class="submit-reply" onclick={() => submitReply(comment.id)}>
									<Icon icon="material-symbols:send" /> 发布回复
								</button>
							</div>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>
