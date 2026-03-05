import { useEffect, type RefObject } from 'react'

/**
 * Detects clicks outside of a referenced element and calls the handler.
 * @param ref - React ref to the element to monitor
 * @param enabled - Whether the listener should be active
 * @param onClickOutside - Callback when click occurs outside the element
 */
export function useOnClickOutside(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onClickOutside: () => void
): void {
  useEffect(() => {
    if (!enabled) return

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [ref, enabled, onClickOutside])
}
