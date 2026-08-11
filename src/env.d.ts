/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare global {
	interface ImportMetaEnv {
		readonly MEILI_MASTER_KEY: string;
		readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
		readonly PUBLIC_WALINE_SERVER_URL?: string;
		readonly PUBLIC_BACKGROUND_VIDEO_URL?: string;
		readonly PUBLIC_MUSIC_BASE_URL?: string;
		// 视图设置面板总开关，可在部署平台配置（true / 1 / on / yes 开启）
		readonly PUBLIC_DISPLAY_SETTINGS?: string;
	}

	interface ITOCManager {
		init: () => void;
		render: () => void;
		attach: () => void;
		cleanup: () => void;
	}

	interface Window {
		turnstile?: {
			render: (
				container: HTMLElement,
				options: Record<string, unknown>,
			) => string;
			remove: (widgetId: string) => void;
			reset: (widgetId: string) => void;
		};
		SidebarTOC: {
			manager: ITOCManager | null;
		};
		FloatingTOC: {
			btn: HTMLElement | null;
			panel: HTMLElement | null;
			manager: ITOCManager | null;
			isPostPage: () => boolean;
		};
		toggleFloatingTOC: () => void;
		tocInternalNavigation: boolean;
		// swup is defined in global.d.ts
		// biome-ignore lint/suspicious/noExplicitAny: External library without types
		spine: any;
		closeAnnouncement: () => void;
		// __fireflyMusic type is defined in global.d.ts
		semifullScrollHandler?: (() => void) | undefined;
		initSemifullScrollDetection?: () => void;
	}
}

declare global {
	interface GuestbookD1Result<T = unknown> {
		results?: T[];
		meta?: Record<string, unknown>;
	}

	interface GuestbookD1Statement {
		bind(...values: unknown[]): GuestbookD1Statement;
		all<T = unknown>(): Promise<GuestbookD1Result<T>>;
		first<T = unknown>(): Promise<T | null>;
		run(): Promise<GuestbookD1Result>;
	}

	interface GuestbookD1Database {
		prepare(query: string): GuestbookD1Statement;
		batch<T = unknown>(
			statements: GuestbookD1Statement[],
		): Promise<GuestbookD1Result<T>[]>;
	}

	interface Env {
		DB: GuestbookD1Database;
		SESSION: KVNamespace;
		RADAR_CACHE?: KVNamespace;
		TURNSTILE_SECRET_KEY?: string;
		CONTACT_ENCRYPTION_KEY?: string;
		IP_HASH_SECRET?: string;
		ADMIN_PASSWORD?: string;
	}
}

export {};
