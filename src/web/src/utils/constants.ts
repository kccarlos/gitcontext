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

/**
 * Large repo mode thresholds
 */

/**
 * Total file count threshold for triggering large repo warnings.
 * Above this, default to "Filter Changed Files" ON and warn on "Expand All".
 */
export const LARGE_REPO_FILE_THRESHOLD = 50000

/**
 * Selection count threshold for copy confirmation.
 * Above this, show confirmation dialog before copying.
 */
export const LARGE_SELECTION_THRESHOLD = 2000
