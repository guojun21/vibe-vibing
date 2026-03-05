import { afterEach, describe, expect, test } from 'bun:test'
import TestRenderer, { act } from 'react-test-renderer'
import DPad, { getDirectionAndDistance, getRepeatInterval } from '../components/DPad'

const globalAny = globalThis as any

const originalNavigator = globalAny.navigator
const originalSetTimeout = globalAny.setTimeout
const originalClearTimeout = globalAny.clearTimeout
const originalClearInterval = globalAny.clearInterval

afterEach(() => {
  globalAny.navigator = originalNavigator
  globalAny.setTimeout = originalSetTimeout
  globalAny.clearTimeout = originalClearTimeout
  globalAny.clearInterval = originalClearInterval
})

function createTouchEvent(clientX: number, clientY: number) {
  return {
    touches: [{ clientX, clientY }],
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as TouchEvent
}

describe('DPad helpers', () => {
  test('detects directions outside dead zone', () => {
    expect(getDirectionAndDistance(0, 0).direction).toBeNull()

    expect(getDirectionAndDistance(20, 0).direction).toBe('right')
    expect(getDirectionAndDistance(0, 20).direction).toBe('down')
    expect(getDirectionAndDistance(0, -20).direction).toBe('up')
    expect(getDirectionAndDistance(-20, 0).direction).toBe('left')
  })

  test('scales repeat interval with distance', () => {
    const slow = getRepeatInterval(0)
    const fast = getRepeatInterval(200)
    expect(slow).toBeGreaterThan(fast)
  })
})

describe('DPad component', () => {
  test('opens on long press and sends arrow key', () => {
    globalAny.navigator = { vibrate: () => true }
    globalAny.setTimeout = ((callback: () => void, delay?: number) => {
      if (delay === 150) {
        callback()
      }
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    globalAny.clearTimeout = (() => {}) as typeof clearTimeout
    globalAny.clearInterval = (() => {}) as typeof clearInterval

    const sent: string[] = []
    let refocused = false

    const renderer = TestRenderer.create(
      <DPad
        onSendKey={(key) => sent.push(key)}
        onRefocus={() => {
          refocused = true
        }}
        isKeyboardVisible={() => true}
      />
    )

    const button = renderer.root.findByType('button')

    act(() => {
      button.props.onTouchStart(createTouchEvent(100, 200))
    })

    act(() => {
      button.props.onTouchMove(createTouchEvent(130, 120))
    })

    expect(sent).toEqual(['\x1b[C'])

    act(() => {
      button.props.onTouchEnd(createTouchEvent(130, 200))
    })

    expect(refocused).toBe(true)
  })

  test('touch cancel closes without sending', () => {
    globalAny.navigator = { vibrate: () => true }
    globalAny.setTimeout = ((callback: () => void, delay?: number) => {
      if (delay === 150) {
        callback()
      }
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    globalAny.clearTimeout = (() => {}) as typeof clearTimeout
    globalAny.clearInterval = (() => {}) as typeof clearInterval

    const sent: string[] = []
    let refocused = false

    const renderer = TestRenderer.create(
      <DPad
        onSendKey={(key) => sent.push(key)}
        onRefocus={() => {
          refocused = true
        }}
        isKeyboardVisible={() => true}
      />
    )

    const button = renderer.root.findByType('button')

    act(() => {
      button.props.onTouchStart(createTouchEvent(100, 200))
    })

    act(() => {
      button.props.onTouchCancel(createTouchEvent(100, 200))
    })

    expect(sent).toEqual([])
    expect(refocused).toBe(true)
  })
})
