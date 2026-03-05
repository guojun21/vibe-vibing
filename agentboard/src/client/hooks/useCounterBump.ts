import { useState, useRef, useEffect } from 'react'

/**
 * Tracks count changes and triggers a bump animation after a delay.
 * Used for counter animations when sessions are added/removed.
 *
 * @param count - The current count value
 * @param delay - Delay in ms before triggering bump (for exit animations)
 * @param onlyIncreasing - Only bump when count increases (default: false)
 * @returns Tuple of [isBumping, clearBump]
 */
export function useCounterBump(
  count: number,
  delay: number,
  onlyIncreasing = false
): [boolean, () => void] {
  const [isBumping, setIsBumping] = useState(false)
  const prevCountRef = useRef(count)
  const pendingRef = useRef(false)

  useEffect(() => {
    const prevCount = prevCountRef.current
    const shouldBump = onlyIncreasing
      ? count > prevCount
      : count !== prevCount

    if (shouldBump) {
      pendingRef.current = true
      const timer = setTimeout(() => {
        if (pendingRef.current) {
          setIsBumping(true)
          pendingRef.current = false
        }
      }, delay)
      prevCountRef.current = count
      return () => clearTimeout(timer)
    }
    prevCountRef.current = count
  }, [count, delay, onlyIncreasing])

  const clearBump = () => setIsBumping(false)

  return [isBumping, clearBump]
}
