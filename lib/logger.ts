type Json = Record<string, unknown>;

function ts() {
	return new Date().toISOString();
}

export const log = {
	info(context: string, message: string, details?: Json) {
		const base = { t: ts(), level: 'INFO', ctx: context, msg: message };
		// eslint-disable-next-line no-console
		console.log(JSON.stringify(details ? { ...base, ...details } : base));
	},
	warn(context: string, message: string, details?: Json) {
		const base = { t: ts(), level: 'WARN', ctx: context, msg: message };
		// eslint-disable-next-line no-console
		console.warn(JSON.stringify(details ? { ...base, ...details } : base));
	},
	error(context: string, error: unknown, details?: Json) {
		const err = error as any;
		const base = {
			t: ts(),
			level: 'ERROR',
			ctx: context,
			msg: String(err?.message || err),
			code: err?.code,
		};
		// eslint-disable-next-line no-console
		console.error(JSON.stringify(details ? { ...base, ...details } : base));
	},
};

export default log;


