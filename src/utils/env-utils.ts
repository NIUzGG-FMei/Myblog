export function getPublicEnv(name: string): string {
	try {
		const metaEnv = import.meta.env as ImportMetaEnv & Record<string, unknown>;
		const value = metaEnv?.[name];
		if (typeof value === "string") return value;
	} catch {
		// Build scripts run in Node and do not provide import.meta.env.
	}
	return typeof process === "undefined" ? "" : process.env[name] || "";
}
