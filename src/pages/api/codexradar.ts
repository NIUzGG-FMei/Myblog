import type { APIRoute } from "astro";

export const prerender = false;

const API_BASE = "https://api.codexradar.com";
const KV_KEY = "codexradar:v2";
const CACHE_TTL_SECONDS = 1800;
const HISTORY_POINTS = 48;

interface RadarTier {
	effort: string;
	pass_rate: number;
	cells_passed: number;
	cells: number;
	graded: number;
}

interface RadarGroup {
	model: string;
	iq?: number;
	tiers: RadarTier[];
}

interface RadarPayload {
	groups: RadarGroup[];
	iq: Record<string, { ts: string; score: number }[]>;
	generated_at: string;
	source: string;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "public, max-age=600",
		},
	});
}

function num(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

async function fetchFromCodexradar(): Promise<RadarPayload> {
	const headers = { "User-Agent": "Mozilla/5.0 (compatible; FireflyBlog/1.0)" };

	// 排行榜是核心数据，失败则整体失败
	const lbRes = await fetch(`${API_BASE}/api/v1/leaderboard`, { headers });
	if (!lbRes.ok) throw new Error(`leaderboard upstream ${lbRes.status}`);
	const lb = (await lbRes.json()) as {
		models?: {
			model?: string;
			effort?: string;
			pass_rate?: number;
			cells_passed?: number;
			cells?: number;
			graded?: number;
		}[];
	};

	// iq-history 为辅助数据，独立抓取：失败只影响 IQ 列，不影响表格
	let iq = {} as Record<string, { ts: string; score: number }[]>;
	try {
		const iqRes = await fetch(
			`${API_BASE}/api/v1/iq-history?v=20260807-goldset-v1`,
			{ headers },
		);
		if (iqRes.ok) iq = await iqRes.json();
	} catch {
		// 忽略，IQ 列显示 "—"
	}

	const iqSlim: RadarPayload["iq"] = {};
	for (const [name, points] of Object.entries(iq)) {
		if (!Array.isArray(points)) continue;
		iqSlim[name] = points
			.filter(
				(p): p is { ts: string; score: number } =>
					typeof p?.score === "number" && Number.isFinite(p.score),
			)
			.slice(-HISTORY_POINTS);
	}

	const latestIq = (name: string): number | undefined => {
		const points = iqSlim[name];
		return points?.length ? points[points.length - 1].score : undefined;
	};

	// 按模型分组：组内为不同推理档位，组 IQ 优先取模型级历史，缺省则取组内最高档位 IQ
	const byModel = new Map<string, RadarGroup>();
	for (const m of lb.models ?? []) {
		const model = (m.model ?? "").trim();
		if (!model) continue;
		let group = byModel.get(model);
		if (!group) {
			group = { model, tiers: [] };
			byModel.set(model, group);
		}
		group.tiers.push({
			effort: (m.effort ?? "").trim(),
			pass_rate: num(m.pass_rate),
			cells_passed: num(m.cells_passed),
			cells: num(m.cells),
			graded: num(m.graded),
		});
	}
	for (const group of byModel.values()) {
		group.tiers.sort((a, b) => b.pass_rate - a.pass_rate);
		group.iq =
			latestIq(group.model) ??
			group.tiers
				.map((t) => latestIq(`${group.model}@${t.effort}`))
				.filter((v): v is number => v !== undefined)
				.sort((a, b) => b - a)[0];
	}
	const groups = [...byModel.values()].sort(
		(a, b) =>
			(b.iq ?? Number.NEGATIVE_INFINITY) - (a.iq ?? Number.NEGATIVE_INFINITY) ||
			(a.tiers[0]?.pass_rate ?? 0) - (b.tiers[0]?.pass_rate ?? 0),
	);

	return {
		groups,
		iq: iqSlim,
		generated_at: new Date().toISOString(),
		source: "https://deng.codexradar.com/?benchmark=deep-swe",
	};
}

export const GET: APIRoute = async () => {
	// 本地 dev（Node 环境）没有 KV，直接实时抓取
	let env: Env | undefined;
	try {
		const { env: workersEnv } = await import("cloudflare:workers");
		env = workersEnv;
	} catch {
		env = undefined;
	}

	try {
		const cached = env?.RADAR_CACHE
			? await env.RADAR_CACHE.get<RadarPayload>(KV_KEY, "json")
			: null;
		if (cached) return json(cached);
	} catch {
		// KV 读取失败则跳过缓存
	}

	try {
		const data = await fetchFromCodexradar();
		if (env?.RADAR_CACHE) {
			await env.RADAR_CACHE.put(KV_KEY, JSON.stringify(data), {
				expirationTtl: CACHE_TTL_SECONDS,
			});
		}
		return json(data);
	} catch {
		return json({ error: "上游数据获取失败，请稍后重试" }, 502);
	}
};
