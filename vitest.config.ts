import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Der Import-Alias "@/..." aus tsconfig.json muss auch fuer Vitest aufgeloest
// werden, sonst lassen sich nur Module testen, die keine App-Imports haben.
export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('.', import.meta.url)),
		},
	},
	test: {
		include: ['lib/**/__tests__/**/*.test.ts'],
	},
});
