/**
 * Shim to force using the ESM browser build of isomorphic-git, bypassing the package "exports"
 * that defaults to the CJS build (which pulls Node polyfills like "buffer").
 * We directly import the ESM file from node_modules.
 */
import * as git from 'isomorphic-git/index.js'
export default git
