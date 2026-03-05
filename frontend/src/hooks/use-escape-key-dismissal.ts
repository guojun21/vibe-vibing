import { useEffect } from 'react'

/**
 * Listens for Escape key presses and calls the close handler.
 * @param enabled - Whether the listener should be active
 * @param onClose - Callback when Escape is pressed
 */
export function useEscapeToClose(
  enabled: boolean,
  onClose: () => void
): void {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onClose])
}
