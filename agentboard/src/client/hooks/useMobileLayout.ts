import { useState, useEffect } from 'react'

/**
 * Detects if the current viewport matches a mobile layout breakpoint.
 * @param query - Media query string (default: max-width: 767px)
 * @returns Boolean indicating if mobile layout is active
 */
export function useIsMobileLayout(query = '(max-width: 767px)'): boolean {
  const [isMobileLayout, setIsMobileLayout] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia(query)
    const handleChange = () => setIsMobileLayout(mediaQuery.matches)
    handleChange()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    // Fallback for older browsers
    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [query])

  return isMobileLayout
}
