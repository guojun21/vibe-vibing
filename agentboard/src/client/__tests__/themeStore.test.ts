import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

const globalAny = globalThis as typeof globalThis & {
  window?: { localStorage: Storage }
  localStorage?: Storage
}

const originalWindow = globalAny.window
const originalLocalStorage = globalAny.localStorage

function createStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

const storage = createStorage()
globalAny.localStorage = storage
globalAny.window = { localStorage: storage } as typeof window

const themeModule = await import('../stores/themeStore')
const { useThemeStore, terminalThemes } = themeModule

beforeEach(() => {
  storage.clear()
  useThemeStore.setState({ theme: 'dark' })
})

afterAll(() => {
  globalAny.window = originalWindow
  globalAny.localStorage = originalLocalStorage
})

describe('useThemeStore', () => {
  test('defaults to dark theme', () => {
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  test('sets theme directly', () => {
    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
  })

  test('toggles theme', () => {
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('light')
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
  })
})

describe('terminalThemes', () => {
  test('exposes light and dark palettes', () => {
    expect(terminalThemes.dark).toBeTruthy()
    expect(terminalThemes.light).toBeTruthy()
  })
})
