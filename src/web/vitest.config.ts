import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: [
			'src/**/__tests__/**/*.{test,spec}.?(c|m)[jt]s?(x)',
			'src/**/?(*.)+(test|spec).?(c|m)[jt]s?(x)'
		],
		exclude: [
			'tests/e2e/**',
			'node_modules/**',
			'dist/**',
			'.{idea,git,cache,output,temp}/**'
		],
		environment: 'node',
		passWithNoTests: true
	}
})


