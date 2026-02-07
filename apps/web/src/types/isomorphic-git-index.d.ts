declare module 'isomorphic-git/index.js' {
  // Re-export all types from the canonical module so TypeScript can resolve them.
  export * from 'isomorphic-git'
  // Default export mirrors the runtime export shape.
  const defaultExport: typeof import('isomorphic-git')
  export default defaultExport
}
