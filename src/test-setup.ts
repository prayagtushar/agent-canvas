/** jsdom in this runner exposes a `localStorage` whose methods are missing, so
 *  the store blows up on import. A plain in-memory one is also what the tests
 *  want: no state carried between files. */
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  },
});

/** jsdom stops short of the browser APIs a terminal emulator expects. Stubs,
 *  not polyfills: nothing here is under test, it just has to exist. */
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof globalThis.matchMedia;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

/** `CSS.escape` is missing from jsdom. The store uses it to build the
 *  attribute selector that finds a node's element. */
if (!globalThis.CSS?.escape) {
  globalThis.CSS = {
    ...(globalThis.CSS ?? {}),
    escape: (value: string) => value.replace(/["\\]/g, "\\$&"),
  } as typeof globalThis.CSS;
}
