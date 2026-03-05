import { afterEach, describe, expect, test } from 'bun:test'
import TestRenderer, { act } from 'react-test-renderer'
import NumPad, { getNumAtPoint } from '../components/NumPad'

const globalAny = globalThis as any

const originalNavigator = globalAny.navigator
const originalWindow = globalAny.window
const originalSetTimeout = globalAny.setTimeout
const originalClearTimeout = globalAny.clearTimeout

afterEach(() => {
  globalAny.navigator = originalNavigator
  globalAny.window = originalWindow
  globalAny.setTimeout = originalSetTimeout
  globalAny.clearTimeout = originalClearTimeout
})

function createTouchEvent(clientX: number, clientY: number) {
  return {
    touches: [{ clientX, clientY }],
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as TouchEvent
}

const CELL_WIDTH = 56
const CELL_HEIGHT = 48
const GAP = 6
const PADDING = 8
const INDICATOR_HEIGHT = 20 + GAP + 2
const PAD_WIDTH = 3 * CELL_WIDTH + 2 * GAP + 2 * PADDING
const PAD_HEIGHT = 3 * CELL_HEIGHT + 2 * GAP + 2 * PADDING + INDICATOR_HEIGHT

describe('NumPad helpers', () => {
  test('maps points to numbers', () => {
    const padPosition = { x: 200, y: 200 }
    const padLeft = padPosition.x - PAD_WIDTH / 2
    const padTop = padPosition.y - PAD_HEIGHT / 2

    // Top-left cell is 7 (calculator-style layout)
    const seven = getNumAtPoint(
      padLeft + PADDING + 1,
      padTop + PADDING + 1,
      padPosition
    )
    expect(seven).toBe('7')

    // Bottom-left cell is 1
    const one = getNumAtPoint(
      padLeft + PADDING + 1,
      padTop + PADDING + (CELL_HEIGHT + GAP) * 2 + 1,
      padPosition
    )
    expect(one).toBe('1')
  })

  test('returns null for gaps and out of bounds', () => {
    const padPosition = { x: 200, y: 200 }
    const padLeft = padPosition.x - PAD_WIDTH / 2
    const padTop = padPosition.y - PAD_HEIGHT / 2

    const inGap = getNumAtPoint(
      padLeft + PADDING + CELL_WIDTH + 1,
      padTop + PADDING + 1,
      padPosition
    )
    expect(inGap).toBeNull()

    const outOfBounds = getNumAtPoint(padLeft - 10, padTop - 10, padPosition)
    expect(outOfBounds).toBeNull()
  })
})

describe('NumPad component', () => {
  test('opens on long press and sends selected number', () => {
    globalAny.navigator = { vibrate: () => true }
    globalAny.window = { innerWidth: 400 } as unknown as Window
    globalAny.setTimeout = ((callback: () => void, delay?: number) => {
      if (delay === 150) {
        callback()
      }
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    globalAny.clearTimeout = (() => {}) as typeof clearTimeout

    const sent: string[] = []
    let refocused = false

    const renderer = TestRenderer.create(
      <NumPad
        onSendKey={(key) => sent.push(key)}
        onRefocus={() => {
          refocused = true
        }}
        isKeyboardVisible={() => true}
      />
    )

    const button = renderer.root
      .findAllByType('button')
      .find((node: TestRenderer.ReactTestInstance) => node.props.children === '123')

    if (!button) {
      throw new Error('NumPad trigger button not found')
    }

    act(() => {
      button.props.onTouchStart(createTouchEvent(200, 200))
    })

    // Coordinates for the top-left cell ("7") after clamping.
    act(() => {
      button.props.onTouchMove(createTouchEvent(111, 19))
    })

    act(() => {
      button.props.onTouchEnd(createTouchEvent(111, 19))
    })

    expect(sent).toEqual(['7'])
    expect(refocused).toBe(true)
  })

  test('touch cancel closes without sending', () => {
    globalAny.navigator = { vibrate: () => true }
    globalAny.window = { innerWidth: 400 } as unknown as Window
    globalAny.setTimeout = ((callback: () => void, delay?: number) => {
      if (delay === 150) {
        callback()
      }
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    globalAny.clearTimeout = (() => {}) as typeof clearTimeout

    const sent: string[] = []
    let refocused = false

    const renderer = TestRenderer.create(
      <NumPad
        onSendKey={(key) => sent.push(key)}
        onRefocus={() => {
          refocused = true
        }}
        isKeyboardVisible={() => true}
      />
    )

    const button = renderer.root
      .findAllByType('button')
      .find((node: TestRenderer.ReactTestInstance) => node.props.children === '123')

    if (!button) {
      throw new Error('NumPad trigger button not found')
    }

    act(() => {
      button.props.onTouchStart(createTouchEvent(200, 200))
    })

    act(() => {
      button.props.onTouchCancel(createTouchEvent(200, 200))
    })

    expect(sent).toEqual([])
    expect(refocused).toBe(true)
  })
})
