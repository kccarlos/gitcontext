// Strategy layer interfaces (Phase 1)
// These decouple the UI from the underlying Git/tokenizer/platform implementations.

import type {
	LoadRepoResult,
	DiffResult,
	ReadFileResult,
} from '../utils/gitWorkerClient'

export type GitEngine = {
	dispose(): void
	loadRepo(
		repoKey: string,
		opts: {
			dirHandle?: FileSystemDirectoryHandle
			gitFiles?: Array<{ path: string; data: Uint8Array }>
			workFiles?: Array<{ path: string; data: Uint8Array }>
		},
	): Promise<LoadRepoResult>
	listBranches(): Promise<LoadRepoResult>
	diff(base: string, compare: string): Promise<DiffResult>
	listFiles(ref: string): Promise<{ files: string[] }>
	readFile(ref: string, filepath: string): Promise<ReadFileResult>
	resolveRef(ref: string): Promise<{ oid: string }>
}

export type RepoPicker = {
	pickDirectory(): Promise<FileSystemDirectoryHandle | { type: 'electron'; path: string }>
}

export type TokenizerEngine = {
	count(text: string): Promise<number>
	warmup?(): Promise<void>
}

export type PathService = {
	toPosix(p: string): string
	join(...parts: string[]): string
}


