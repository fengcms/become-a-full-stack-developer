export const storage = new Map<string, unknown>();
export let handler: (options: any) => Promise<any> = async () => {
  throw new Error("unexpected request");
};
export function mockRequest(next: typeof handler) {
  handler = next;
}
export default {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => {
    storage.set(key, value);
  },
  removeStorageSync: (key: string) => {
    storage.delete(key);
  },
  request: (options: unknown) => handler(options),
  showToast: () => {},
};
