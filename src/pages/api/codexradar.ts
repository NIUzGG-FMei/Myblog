import type { APIRoute } from "astro";

export const prerender = false;

const API_BASE = "https://api.codexradar.com";
const KV_KEY = "codexradar:v1";
const CACHE_TTL_SECONDS = 1800;
const HISTORY_POINTS = 48;

interface RadarModel {
	model: string;
	effort: string;
	pass_rate: number;
	cells_passed: number;
	cells: number;
	graded: number;
}

interface RadarPayload {
	models: RadarModel[];
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

async function fetchFromCodexradar(): Promise<RadarPayload> {
	const headers = { "User-Agent": "Mozilla/5.0 (compatible; FireflyBlog/1.0)" };
	const [lbRes, iqRes] = await Promise.all([
		fetch(`${API_BASE}/api/v1/leaderboard`, { headers }),
		fetch(`${API_BASE}/api/v1/iq-history?v=20260807-goldset-v1`, { headers }),
	]);
	if (!lbRes.ok || !iqRes.ok) {
		throw new Error(`codexradar upstream ${lbRes.status}/${iqRes.status}`);
	}
	const lb = (await lbRes.json()) as { models?: RadarModel[] };
	const iq = (await iqRes.json()) as Record<
		string,
		{ ts: string; score: number }[]
	>;

	const models: RadarModel[] = (lb.models ?? [])
		.map((m: RadarModel) => ({
			model: m.model,
			effort: m.effort,
			pass_rate: m.pass_rate,
			cells_passed: m.cells_passed,
			cells: m.cells,
			graded: m.graded,
		}))
		.sort((a, b) => b.pass_rate - a.pass_rate);

	const iqSlim: RadarPayload["iq"] = {};
	for (const [name, points] of Object.entries(iq)) {
		iqSlim[name] = points.slice(-HISTORY_POINTS);
	}

	return {
		models,
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
