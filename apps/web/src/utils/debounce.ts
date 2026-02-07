export function debounce<T extends (...args: any[]) => unknown>(
  fn: T,
  delay: number,
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args as unknown as []);
    }, delay)
  }
}


