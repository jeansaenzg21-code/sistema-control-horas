declare global {
  interface Window {
    __TAURI__?: {
      store: {
        get: (key: string) => Promise<unknown>
        set: (key: string, value: unknown) => Promise<void>
      }
    }
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__
}

export const storage = {
  async get(key: string): Promise<string | null> {
    if (isTauri()) {
      const val = await window.__TAURI__!.store.get(key)
      return val != null ? String(val) : null
    }
    return localStorage.getItem(key)
  },

  async set(key: string, value: string): Promise<void> {
    if (isTauri()) {
      await window.__TAURI__!.store.set(key, value)
    } else {
      localStorage.setItem(key, value)
    }
  },

  async remove(key: string): Promise<void> {
    if (isTauri()) {
      await window.__TAURI__!.store.set(key, null)
    } else {
      localStorage.removeItem(key)
    }
  },
}
