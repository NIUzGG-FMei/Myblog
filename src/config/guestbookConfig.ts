import type { GuestbookConfig } from "../types/guestbook";
import { getPublicEnv } from "../utils/env-utils";

export const guestbookConfig: GuestbookConfig = {
	pageSize: 24,
	maxContentLength: 300,
	maxDisplayNameLength: 24,
	turnstileSiteKey: getPublicEnv("PUBLIC_TURNSTILE_SITE_KEY"),
	defaultType: "visit",
	defaultColor: "lemon",
	colors: {
		lemon: { label: "浅黄", value: "#FFF1A8" },
		mint: { label: "薄荷绿", value: "#D6F1D9" },
		sky: { label: "浅蓝", value: "#D9ECFF" },
		blush: { label: "浅粉", value: "#FFE0E8" },
	},
	types: {
		visit: { label: "到此一游", icon: "material-symbols:location-on" },
		feedback: { label: "反馈", icon: "material-symbols:rate-review" },
		request: { label: "需求", icon: "material-symbols:lightbulb" },
	},
};
