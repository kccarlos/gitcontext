export function debounce<T extends (...args: any[]) => unknown>(
  fn: T,
  delay: number,
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const debounced = function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args as unknown as []);
      timeoutId = null
    }, delay)
  } as T & { cancel: () => void }

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return debounced
}


