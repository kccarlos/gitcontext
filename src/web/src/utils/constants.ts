/**
 * Performance guardrails for large repository operations
 */

/**
 * Maximum number of concurrent file read operations.
 * Used by copy generation and token counting to prevent overwhelming
 * the worker and causing memory spikes on large file selections.
 *
 * Setting: 10 files at a time provides good balance between throughput
 * and resource usage.
 */
export const MAX_CONCURRENT_READS = 10
