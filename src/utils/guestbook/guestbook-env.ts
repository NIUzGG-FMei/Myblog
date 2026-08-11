export async function getGuestbookEnv(): Promise<Env> {
	const { env } = await import("cloudflare:workers");
	return env;
}
