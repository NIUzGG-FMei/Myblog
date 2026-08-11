<script lang="ts">
import { onMount, tick } from "svelte";
import Icon from "@/components/common/Icon.svelte";
import type {
	GuestbookConfig,
	GuestbookListResponse,
	GuestbookNote,
	GuestbookNoteColor,
	GuestbookNoteType,
} from "@/types/guestbook";

interface Props {
	title: string;
	description: string;
	config: GuestbookConfig;
}

let { title, description, config }: Props = $props();

const POSITIONS_KEY = "firefly-note-positions-v1";
const NOTE_WIDTH = 210;
const NOTE_GAP = 16;
const MOBILE_QUERY = "(max-width: 767px)";

interface NotePosition {
	x: number;
	y: number;
	z: number;
}

let notes = $state<GuestbookNote[]>([]);
let nextCursor = $state<string | null>(null);
let activeType = $state<"all" | GuestbookNoteType>("all");
let loading = $state(true);
let loadingMore = $state(false);
let loadError = $state("");

let anonymous = $state(true);
let displayName = $state("");
let contact = $state("");
let content = $state("");
let noteType = $state<GuestbookNoteType>(config.defaultType);
let color = $state<GuestbookNoteColor>(config.defaultColor);
let website = $state("");
let formStartedAt = $state(Date.now());
let turnstileToken = $state("");
let submitting = $state(false);
let submitMessage = $state("");
let submitState = $state<"idle" | "success" | "pending" | "error">("idle");
let turnstileContainer: HTMLDivElement | undefined;
let turnstileWidgetId: string | undefined;

let boardElement: HTMLDivElement | undefined;
let positions = $state<Record<string, NotePosition>>({});
let draggingId = $state<string | null>(null);
let dragState: {
	element: HTMLElement;
	startX: number;
	startY: number;
	originX: number;
	originY: number;
	moved: boolean;
} | null = null;

function loadPositions(): Record<string, NotePosition> {
	try {
		const raw = localStorage.getItem(POSITIONS_KEY);
		return raw ? (JSON.parse(raw) as Record<string, NotePosition>) : {};
	} catch {
		return {};
	}
}

function savePositions(): void {
	try {
		localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
	} catch {
		// localStorage 不可用时忽略，位置仅本次会话生效
	}
}

function isDesktop(): boolean {
	return !window.matchMedia(MOBILE_QUERY).matches;
}

function relayout(): void {
	void tick().then(() => {
		if (!isDesktop()) return;
		layoutNotes();
	});
}

function layoutNotes(): void {
	const board = boardElement;
	if (!board) return;
	const noteElements = Array.from(
		board.querySelectorAll<HTMLElement>(".note[data-note-id]"),
	);
	if (noteElements.length === 0) return;

	const boardWidth = board.getBoundingClientRect().width;
	const columnCount = Math.max(
		1,
		Math.floor((boardWidth - 20) / (NOTE_WIDTH + NOTE_GAP)),
	);
	const columnHeights = new Array<number>(columnCount).fill(0);
	let nextLayer = noteElements.length;
	for (const saved of Object.values(positions)) {
		nextLayer = Math.max(nextLayer, saved.z + 1);
	}

	for (const element of noteElements) {
		const id = element.dataset.noteId;
		if (!id) continue;
		const saved = positions[id];
		if (saved) {
			element.style.left = `${saved.x}px`;
			element.style.top = `${saved.y}px`;
			element.style.zIndex = String(saved.z);
			continue;
		}
		const shortest = columnHeights.indexOf(Math.min(...columnHeights));
		const x = shortest * (NOTE_WIDTH + NOTE_GAP);
		const y = columnHeights[shortest];
		element.style.left = `${x}px`;
		element.style.top = `${y}px`;
		element.style.zIndex = String(nextLayer);
		positions[id] = { x, y, z: nextLayer };
		nextLayer += 1;
		columnHeights[shortest] = y + element.offsetHeight + NOTE_GAP;
	}
	savePositions();
	updateBoardHeight(noteElements);
}

function updateBoardHeight(noteElements: HTMLElement[]): void {
	const board = boardElement;
	if (!board) return;
	let maxBottom = 0;
	for (const element of noteElements) {
		const saved = positions[element.dataset.noteId || ""];
		if (!saved) continue;
		const rect = element.getBoundingClientRect();
		maxBottom = Math.max(maxBottom, saved.y + (rect.height || 220));
	}
	board.style.height = `${Math.max(24 * 16, maxBottom + 70)}px`;
}

function resetLayout(): void {
	positions = {};
	savePositions();
	relayout();
}

function onNotePointerDown(event: PointerEvent, id: string): void {
	if (!isDesktop() || event.button !== 0) return;
	const element = event.currentTarget as HTMLElement;
	element.setPointerCapture(event.pointerId);
	dragState = {
		element,
		startX: event.clientX,
		startY: event.clientY,
		originX: parseFloat(element.style.left) || 0,
		originY: parseFloat(element.style.top) || 0,
		moved: false,
	};
	draggingId = id;
	element.style.zIndex = "9999";
	element.classList.add("dragging");
}

function onNotePointerMove(event: PointerEvent): void {
	const drag = dragState;
	if (!drag) return;
	const dx = event.clientX - drag.startX;
	const dy = event.clientY - drag.startY;
	if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
	drag.element.style.left = `${drag.originX + dx}px`;
	drag.element.style.top = `${drag.originY + dy}px`;
}

function onNotePointerUp(event: PointerEvent): void {
	const drag = dragState;
	draggingId = null;
	dragState = null;
	if (!drag) return;
	drag.element.classList.remove("dragging");
	const id = drag.element.dataset.noteId;
	if (!drag.moved) {
		if (id) {
			const saved = positions[id];
			if (saved) drag.element.style.zIndex = String(saved.z);
		}
		return;
	}
	const x = Math.max(0, Math.round(parseFloat(drag.element.style.left)));
	const y = Math.max(0, Math.round(parseFloat(drag.element.style.top)));
	if (id) positions[id] = { x, y, z: 10000 };
	savePositions();
	updateBoardHeight(
		Array.from(
			(boardElement?.querySelectorAll<HTMLElement>(".note[data-note-id]") || []),
		),
	);
	event.preventDefault();
}

const typeOptions = $derived([
	{ label: "全部", value: "all" as const },
	...Object.entries(config.types).map(([value, item]) => ({
		label: item.label,
		value: value as GuestbookNoteType,
	})),
]);

function formatDate(value: string): string {
	return new Intl.DateTimeFormat(document.documentElement.lang || "zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

function tiltClass(id: string): string {
	const score = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0);
	return ["tilt-left", "tilt-none", "tilt-right"][score % 3];
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}

async function loadNotes(append = false): Promise<void> {
	if (append) loadingMore = true;
	else {
		loading = true;
		loadError = "";
	}

	try {
		const query = new URLSearchParams();
		if (activeType !== "all") query.set("type", activeType);
		if (append && nextCursor) query.set("cursor", nextCursor);
		const response = await fetch(`/api/guestbook/notes/?${query.toString()}`, {
			headers: { Accept: "application/json" },
		});
		const data = (await response.json()) as GuestbookListResponse & { message?: string };
		if (!response.ok) throw new Error(data.message || "便签加载失败");
		notes = append ? [...notes, ...data.notes] : data.notes;
		nextCursor = data.nextCursor;
		relayout();
	} catch (error) {
		loadError = error instanceof Error ? error.message : "便签加载失败";
	} finally {
		loading = false;
		loadingMore = false;
	}
}

function changeType(type: "all" | GuestbookNoteType): void {
	if (type === activeType) return;
	activeType = type;
	nextCursor = null;
	void loadNotes();
}

function resetTurnstile(): void {
	turnstileToken = "";
	if (turnstileWidgetId) window.turnstile?.reset(turnstileWidgetId);
}

async function submitNote(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (submitting) return;
	submitting = true;
	submitMessage = "";
	submitState = "idle";

	try {
		const response = await fetch("/api/guestbook/notes/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				anonymous,
				color,
				contact,
				content,
				displayName,
				formStartedAt,
				turnstileToken,
				type: noteType,
				website,
			}),
		});
		const data = await parseResponse(response);
		if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "便签提交失败");

		if (data.status === "published" && data.note) {
			const note = data.note as GuestbookNote;
			if (activeType === "all" || activeType === note.type) notes = [note, ...notes];
			submitState = "success";
			submitMessage = "便签已经贴到墙上了";
		} else {
			submitState = "pending";
			submitMessage = typeof data.message === "string" ? data.message : "便签已进入审核队列";
		}

		content = "";
		displayName = "";
		contact = "";
		formStartedAt = Date.now();
		relayout();
	} catch (error) {
		submitState = "error";
		submitMessage = error instanceof Error ? error.message : "便签提交失败";
	} finally {
		submitting = false;
		resetTurnstile();
	}
}

function loadTurnstile(): Promise<void> {
	if (window.turnstile) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>("script[data-guestbook-turnstile]");
		if (existing) {
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener("error", () => reject(new Error("人机验证加载失败")), { once: true });
			return;
		}
		const script = document.createElement("script");
		script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		script.async = true;
		script.defer = true;
		script.dataset.guestbookTurnstile = "";
		script.addEventListener("load", () => resolve(), { once: true });
		script.addEventListener("error", () => reject(new Error("人机验证加载失败")), { once: true });
		document.head.append(script);
	});
}

async function initializeTurnstile(): Promise<void> {
	if (!config.turnstileSiteKey) return;
	try {
		await loadTurnstile();
		if (!turnstileContainer || !window.turnstile) return;
		turnstileWidgetId = window.turnstile.render(turnstileContainer, {
			action: "guestbook-submit",
			callback: (token: string) => {
				turnstileToken = token;
			},
			"error-callback": () => {
				turnstileToken = "";
			},
			"expired-callback": () => {
				turnstileToken = "";
			},
			sitekey: config.turnstileSiteKey,
			theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
		});
	} catch (error) {
		submitState = "error";
		submitMessage = error instanceof Error ? error.message : "人机验证加载失败";
	}
}

onMount(() => {
	formStartedAt = Date.now();
	positions = loadPositions();
	void loadNotes();
	if (config.turnstileSiteKey) void initializeTurnstile();
	return () => {
		if (turnstileWidgetId) window.turnstile?.remove(turnstileWidgetId);
	};
});
</script>

<section class="guestbook-shell" data-full-width-page="guestbook" aria-labelledby="guestbook-title">
	<header class="guestbook-heading">
		<div class="heading-icon" aria-hidden="true">
			<Icon icon="material-symbols:palette" class="text-2xl" />
		</div>
		<div>
			<h2 id="guestbook-title">{title}</h2>
			<p>{description}</p>
		</div>
	</header>

	<div class="guestbook-layout">
		<aside class="composer-column" aria-label="发布便签">
			<form class="composer" onsubmit={submitNote}>
				<div class="composer-title">
					<h3>写一张便签</h3>
					<span>{Array.from(content).length}/{config.maxContentLength}</span>
				</div>

				<div class="segmented" aria-label="留言身份">
					<button type="button" class:active={anonymous} onclick={() => (anonymous = true)}>匿名</button>
					<button type="button" class:active={!anonymous} onclick={() => (anonymous = false)}>留下称呼</button>
				</div>

				{#if !anonymous}
					<div class="identity-fields">
						<label>
							<span>个人称呼 <b>必填</b></span>
							<input bind:value={displayName} maxlength={config.maxDisplayNameLength} autocomplete="nickname" required />
						</label>
						<label>
							<span>联系方式 <small>可选</small></span>
							<input bind:value={contact} maxlength="200" autocomplete="off" placeholder="QQ/WeChat/Email，保护隐私仅作者后台可见" />
						</label>
					</div>
				{/if}

				<label class="content-field">
					<span>便签内容</span>
					<textarea bind:value={content} minlength="2" maxlength={config.maxContentLength} rows="6" required placeholder="想说点什么？"></textarea>
				</label>

				<fieldset>
					<legend>便签类型</legend>
					<div class="type-options">
						{#each Object.entries(config.types) as [value, item]}
							<label class:active={noteType === value}>
								<input type="radio" name="note-type" value={value} bind:group={noteType} />
								<span>{item.label}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset>
					<legend>便签颜色</legend>
					<div class="color-options">
						{#each Object.entries(config.colors) as [value, item]}
							<label title={item.label} aria-label={item.label} class:active={color === value} style={`--swatch: ${item.value}`}>
								<input type="radio" name="note-color" value={value} bind:group={color} />
								<span></span>
							</label>
						{/each}
					</div>
				</fieldset>

				<label class="honeypot" aria-hidden="true">
					<span>网站</span>
					<input bind:value={website} tabindex="-1" autocomplete="off" />
				</label>

				{#if config.turnstileSiteKey}
					<div class="turnstile" bind:this={turnstileContainer}></div>
				{/if}

				<button class="submit-button" type="submit" disabled={submitting || Boolean(config.turnstileSiteKey && !turnstileToken)}>
					{#if submitting}
						<span class="spinner" aria-hidden="true"></span>
						正在贴上
					{:else}
						<Icon icon="material-symbols:check" class="text-xl" />
						贴上便签
					{/if}
				</button>

				{#if submitMessage}
					<p class="submit-status {submitState}" role="status" aria-live="polite">{submitMessage}</p>
				{/if}
			</form>
		</aside>

		<section class="wall-column" aria-label="便签墙">
			<div class="wall-toolbar">
				<div class="wall-filters" aria-label="筛选便签">
					{#each typeOptions as option}
						<button type="button" class:active={activeType === option.value} onclick={() => changeType(option.value)}>{option.label}</button>
					{/each}
				</div>
				<div class="wall-actions">
					<span class="wall-count">{notes.length} 张便签</span>
					<button type="button" class="layout-reset" title="重新按顺序排列便签" onclick={resetLayout}><Icon icon="material-symbols:reorder" /> 整理</button>
					<a class="admin-link" href="/guestbook/admin/" title="管理便签和评论"><Icon icon="material-symbols:settings" /> 管理</a>
				</div>
			</div>

			<div class="wall-board" bind:this={boardElement} aria-live="polite" aria-busy={loading}>
				{#if loading}
					<div class="wall-state"><span class="spinner dark" aria-hidden="true"></span>正在展开便签墙</div>
				{:else if loadError}
					<div class="wall-state error">
						<p>{loadError}</p>
						<button type="button" onclick={() => loadNotes()}>重新加载</button>
					</div>
				{:else if notes.length === 0}
					<div class="wall-state empty">这里还没有便签</div>
				{:else}
					<div class="note-grid">
						{#each notes as note (note.id)}
							<article
								class="note note-{note.type} color-{note.color} {tiltClass(note.id)}"
								data-note-id={note.id}
								class:dragging={draggingId === note.id}
								onpointerdown={(event) => onNotePointerDown(event, note.id)}
								onpointermove={onNotePointerMove}
								onpointerup={onNotePointerUp}
								onpointercancel={onNotePointerUp}
							>
								<div class="note-type">{config.types[note.type].label}</div>
								<p>{note.content}</p>
								<footer>
									<strong>{note.displayName}</strong>
									<time datetime={note.createdAt}>{formatDate(note.createdAt)}</time>
								</footer>
							</article>
						{/each}
					</div>
					{#if nextCursor}
						<button class="load-more" type="button" disabled={loadingMore} onclick={() => loadNotes(true)}>
							{loadingMore ? "正在加载" : "加载更多"}
							<Icon icon="fa7-solid:arrow-right" class="text-sm" />
						</button>
					{/if}
				{/if}
			</div>
		</section>
	</div>
</section>

<style>
	.guestbook-shell { width: 100%; }
	.guestbook-heading { display: flex; align-items: center; gap: 0.9rem; margin: 0 0 1.25rem; padding: 0.2rem 0.25rem; }
	.guestbook-heading h2 { margin: 0; color: var(--content); font-size: 1.75rem; line-height: 1.2; font-weight: 750; letter-spacing: 0; }
	.guestbook-heading p { margin: 0.3rem 0 0; color: var(--content-meta); font-size: 0.93rem; }
	.heading-icon { display: grid; width: 2.75rem; height: 2.75rem; flex: 0 0 2.75rem; place-items: center; border-radius: 6px; color: white; background: var(--primary); }
	.guestbook-layout { display: grid; grid-template-columns: minmax(17rem, 21rem) minmax(0, 1fr); align-items: start; gap: 1.25rem; }
	.composer-column { position: sticky; top: 5.5rem; }
	.composer { padding: 1.15rem; border: 1px solid color-mix(in srgb, var(--content) 11%, transparent); border-radius: 8px; background: var(--card-bg); box-shadow: 0 12px 30px color-mix(in srgb, black 9%, transparent); }
	.composer-title { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 1rem; }
	.composer-title h3 { margin: 0; color: var(--content); font-size: 1.05rem; letter-spacing: 0; }
	.composer-title span { color: var(--content-meta); font-size: 0.75rem; }
	.segmented, .type-options, .wall-filters { display: flex; padding: 3px; border-radius: 6px; background: var(--btn-regular-bg); }
	.segmented { margin-bottom: 0.9rem; }
	.segmented button, .wall-filters button { min-width: 0; flex: 1; padding: 0.48rem 0.65rem; border: 0; border-radius: 4px; color: var(--content-meta); background: transparent; cursor: pointer; font: inherit; font-size: 0.8rem; white-space: nowrap; }
	.segmented button.active, .wall-filters button.active { color: var(--content); background: var(--card-bg); box-shadow: 0 1px 4px color-mix(in srgb, black 12%, transparent); }
	.identity-fields { display: grid; gap: 0.75rem; margin-bottom: 0.9rem; }
	label > span, legend { display: block; margin-bottom: 0.38rem; color: var(--content); font-size: 0.78rem; font-weight: 650; }
	label b { margin-left: 0.2rem; color: #d24b61; font-size: 0.67rem; }
	label small { margin-left: 0.25rem; color: var(--content-meta); font-weight: 400; }
	input, textarea { width: 100%; box-sizing: border-box; border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 5px; outline: 0; color: var(--content); background: color-mix(in srgb, var(--card-bg) 92%, var(--page-bg)); font: inherit; font-size: 0.85rem; transition: border-color 150ms, box-shadow 150ms; }
	input { height: 2.45rem; padding: 0 0.7rem; }
	textarea { min-height: 8rem; padding: 0.7rem; line-height: 1.6; resize: vertical; }
	input:focus, textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent); }
	.content-field { display: block; margin-bottom: 0.9rem; }
	fieldset { margin: 0 0 0.9rem; padding: 0; border: 0; }
	.type-options { gap: 2px; }
	.type-options label { position: relative; flex: 1; margin: 0; padding: 0.48rem 0.3rem; border-radius: 4px; color: var(--content-meta); text-align: center; cursor: pointer; }
	.type-options label.active { color: var(--content); background: var(--card-bg); box-shadow: 0 1px 4px color-mix(in srgb, black 12%, transparent); }
	.type-options input, .color-options input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
	.type-options span { margin: 0; color: inherit; font-size: 0.77rem; font-weight: 600; }
	.color-options { display: flex; gap: 0.65rem; }
	.color-options label { position: relative; width: 2rem; height: 2rem; margin: 0; border: 2px solid transparent; border-radius: 50%; cursor: pointer; }
	.color-options label.active { border-color: var(--primary); }
	.color-options span { display: block; width: 100%; height: 100%; margin: 0; border: 1px solid rgba(20, 24, 30, 0.12); border-radius: 50%; background: var(--swatch); box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.55); }
	.honeypot { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
	.turnstile { min-height: 65px; margin: 0.2rem 0 0.8rem; overflow: hidden; }
	.submit-button { display: flex; width: 100%; min-height: 2.7rem; align-items: center; justify-content: center; gap: 0.45rem; border: 0; border-radius: 5px; color: white; background: var(--primary); cursor: pointer; font: inherit; font-weight: 700; }
	.submit-button:disabled { cursor: not-allowed; opacity: 0.55; }
	.submit-status { margin: 0.7rem 0 0; font-size: 0.78rem; line-height: 1.45; }
	.submit-status.success { color: #23824f; }
	.submit-status.pending { color: #9a6b08; }
	.submit-status.error { color: #c13d55; }
	.wall-column { min-width: 0; }
	.wall-toolbar { display: flex; min-height: 2.75rem; align-items: center; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.65rem; }
	.wall-filters { width: min(100%, 28rem); }
	.wall-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 0.75rem; }
	.wall-count { color: var(--content-meta); font-size: 0.78rem; white-space: nowrap; }
	.layout-reset { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.6rem; border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 5px; color: var(--content-meta); background: transparent; cursor: pointer; font: inherit; font-size: 0.76rem; white-space: nowrap; }
	.layout-reset:hover { color: var(--content); }
	.admin-link { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--content-meta); font-size: 0.76rem; text-decoration: none; white-space: nowrap; }
	.admin-link:hover { color: var(--primary); }
	.wall-board { position: relative; min-height: 34rem; padding: 1.25rem; border: 1px solid color-mix(in srgb, var(--content) 10%, transparent); border-radius: 6px; background-color: color-mix(in srgb, var(--card-bg) 86%, #8c684a 14%); background-image: repeating-linear-gradient(0deg, transparent 0, transparent 18px, color-mix(in srgb, #5d402d 5%, transparent) 19px), repeating-linear-gradient(90deg, transparent 0, transparent 24px, color-mix(in srgb, #5d402d 4%, transparent) 25px); box-shadow: inset 0 0 34px color-mix(in srgb, #3e2d20 8%, transparent); }
	.note-grid { position: relative; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(13.5rem, 100%), 1fr)); align-items: start; gap: 1.15rem; }
	.note { --paper: #fff1a8; position: relative; display: flex; min-height: 13rem; box-sizing: border-box; flex-direction: column; justify-content: space-between; padding: 1.25rem 1.1rem 0.95rem; border: 0; border-radius: 2px; color: #27302c; background: var(--paper); box-shadow: 0 8px 14px rgba(48, 38, 29, 0.16); transform-origin: 50% 8%; transition: transform 180ms ease, box-shadow 180ms ease; }
	.note:hover { box-shadow: 0 13px 22px rgba(48, 38, 29, 0.22); transform: rotate(0) translateY(-3px); }
	.note.dragging, .note.dragging:hover { z-index: 9999 !important; cursor: grabbing; box-shadow: 0 16px 26px rgba(48, 38, 29, 0.3); transform: rotate(0) scale(1.03); user-select: none; }
	@media (min-width: 768px) {
		.note-grid { display: block; }
		.note { position: absolute; top: 0; left: 0; width: 210px; margin: 0; cursor: grab; touch-action: none; }
		.load-more { position: absolute; bottom: 0.5rem; left: 50%; margin: 0; transform: translateX(-50%); }
	}
	.color-lemon { --paper: #fff1a8; }
	.color-mint { --paper: #d6f1d9; }
	.color-sky { --paper: #d9ecff; }
	.color-blush { --paper: #ffe0e8; }
	.tilt-left { transform: rotate(-0.8deg); }
	.tilt-none { transform: rotate(0); }
	.tilt-right { transform: rotate(0.8deg); }
	.note-visit::before { position: absolute; top: -0.42rem; left: 50%; width: 3.8rem; height: 1rem; content: ""; background: rgba(255, 255, 255, 0.55); box-shadow: 0 1px 2px rgba(40, 30, 20, 0.1); transform: translateX(-50%) rotate(-1deg); }
	.note-feedback { border-left: 5px solid color-mix(in srgb, #4f7396 45%, transparent); background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 1.72rem, rgba(40, 70, 100, 0.09) 1.76rem); }
	.note-feedback::after { position: absolute; top: 0; right: 0; width: 1.7rem; height: 1.7rem; content: ""; background: linear-gradient(225deg, rgba(255,255,255,0.88) 0 48%, rgba(35,45,55,0.12) 50% 53%, transparent 55%); }
	.note-request { clip-path: polygon(0 0, 100% 0, 100% 42%, calc(100% - 0.45rem) 46%, 100% 50%, 100% 100%, 0 100%, 0 50%, 0.45rem 46%, 0 42%); border-top: 5px solid color-mix(in srgb, #b06283 48%, transparent); }
	.note-type { align-self: flex-start; margin-bottom: 0.75rem; padding: 0.22rem 0.48rem; border: 1px solid rgba(25, 35, 32, 0.16); border-radius: 3px; font-size: 0.68rem; font-weight: 750; }
	.note p { flex: 1; margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; font-size: 0.93rem; line-height: 1.68; }
	.note footer { display: flex; align-items: end; justify-content: space-between; gap: 0.7rem; margin-top: 1rem; padding-top: 0.7rem; border-top: 1px solid rgba(25, 35, 32, 0.12); }
	.note footer strong { min-width: 0; overflow: hidden; font-size: 0.75rem; text-overflow: ellipsis; white-space: nowrap; }
	.note time { flex: 0 0 auto; font-size: 0.62rem; opacity: 0.65; }
	.wall-state { display: flex; min-height: 27rem; align-items: center; justify-content: center; gap: 0.6rem; color: var(--content-meta); text-align: center; }
	.wall-state.error { flex-direction: column; }
	.wall-state button, .load-more { border: 1px solid color-mix(in srgb, var(--content) 14%, transparent); border-radius: 5px; color: var(--content); background: var(--card-bg); cursor: pointer; font: inherit; }
	.wall-state button { padding: 0.48rem 0.8rem; }
	.load-more { display: flex; min-height: 2.5rem; align-items: center; justify-content: center; gap: 0.45rem; margin: 1.5rem auto 0; padding: 0.5rem 1rem; }
	.spinner { width: 1rem; height: 1rem; border: 2px solid rgba(255,255,255,0.35); border-top-color: currentColor; border-radius: 50%; animation: spin 0.8s linear infinite; }
	.spinner.dark { border-color: color-mix(in srgb, var(--content) 20%, transparent); border-top-color: var(--content); }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (max-width: 1023px) {
		.guestbook-layout { grid-template-columns: minmax(15.5rem, 18rem) minmax(0, 1fr); }
		.note-grid { grid-template-columns: repeat(auto-fill, minmax(min(12rem, 100%), 1fr)); }
	}
	@media (max-width: 767px) {
		.guestbook-heading { padding-inline: 0.35rem; }
		.guestbook-heading h2 { font-size: 1.45rem; }
		.guestbook-layout { grid-template-columns: minmax(0, 1fr); }
		.composer-column { position: static; }
		.wall-board { min-height: 24rem; padding: 0.85rem; }
		.wall-toolbar { align-items: stretch; flex-direction: column; }
		.wall-filters { width: 100%; overflow-x: auto; }
		.wall-actions { justify-content: space-between; padding-left: 0.25rem; }
		.wall-count { padding-left: 0; }
	}
	@media (max-width: 420px) {
		.note-grid { grid-template-columns: minmax(0, 1fr); }
		.segmented button, .wall-filters button { padding-inline: 0.45rem; font-size: 0.74rem; }
	}
	@media (prefers-reduced-motion: reduce) {
		.note, .submit-button, input, textarea { transition: none; }
		.note, .note:hover { transform: none; }
		.spinner { animation-duration: 1.8s; }
	}
</style>
