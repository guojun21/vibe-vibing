import { useEffect, useRef, type MutableRefObject } from 'react'

interface UseEdgeSwipeOptions {
  enabled: boolean
  isOpen: boolean
  onOpen: () => void
  edgeThresholdPx?: number
  swipeDistancePx?: number
  swipeRatio?: number
}

/**
 * Detects swipe gestures from the left edge of the screen to open a drawer.
 * Returns a ref that tracks whether an edge swipe is in progress.
 */
export function useEdgeSwipeToOpenDrawer({
  enabled,
  isOpen,
  onOpen,
  edgeThresholdPx = 30,
  swipeDistancePx = 50,
  swipeRatio = 1.5,
}: UseEdgeSwipeOptions): MutableRefObject<boolean> {
  const isEdgeSwipingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    let touchStartX = 0
    let touchStartY = 0
    let isEdgeSwipe = false

    const handleTouchStart = (e: TouchEvent) => {
      if (isOpen) return
      const touch = e.touches[0]
      // Only start tracking if touch begins near left edge
      if (touch.clientX <= edgeThresholdPx) {
        touchStartX = touch.clientX
        touchStartY = touch.clientY
        isEdgeSwipe = true
        isEdgeSwipingRef.current = true
      } else {
        isEdgeSwipe = false
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      // Always clear the edge swiping ref on touch end
      isEdgeSwipingRef.current = false

      if (!isEdgeSwipe || isOpen) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartX
      const deltaY = Math.abs(touch.clientY - touchStartY)

      // Check if swipe was primarily horizontal and far enough
      if (deltaX >= swipeDistancePx && deltaX > deltaY * swipeRatio) {
        onOpen()
      }

      isEdgeSwipe = false
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      isEdgeSwipingRef.current = false
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [enabled, isOpen, onOpen, edgeThresholdPx, swipeDistancePx, swipeRatio])

  return isEdgeSwipingRef
}
