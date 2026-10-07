import Taro from "@tarojs/taro";
import { useSyncExternalStore } from "react";
export type ThemeMode = "light" | "dark" | "system";
let mode: ThemeMode = ["system", "light", "dark"].includes(Taro.getStorageSync("befull:theme"))
  ? Taro.getStorageSync("befull:theme")
  : "system";
let systemDark = Taro.getAppBaseInfo().theme === "dark";
const listeners = new Set<() => void>();
const snapshot = () => (mode === "system" ? (systemDark ? "dark" : "light") : mode);
export function applyTheme() {
  const dark = snapshot() === "dark";
  Taro.setNavigationBarColor({
    frontColor: dark ? "#ffffff" : "#000000",
    backgroundColor: dark ? "#121820" : "#ffffff",
  }).catch(() => {});
  Taro.setBackgroundColor({
    backgroundColor: dark ? "#121820" : "#f7fafd",
    backgroundColorTop: dark ? "#121820" : "#f7fafd",
  }).catch(() => {});
  Taro.setTabBarStyle({
    color: dark ? "#8fa0b2" : "#607286",
    selectedColor: dark ? "#7fb6e4" : "#3277b5",
    backgroundColor: dark ? "#1a222c" : "#ffffff",
    borderStyle: dark ? "white" : "black",
  }).catch(() => {});
}
Taro.onThemeChange(({ theme }) => {
  systemDark = theme === "dark";
  [...listeners].forEach((fn) => fn());
  applyTheme();
});
export function setTheme(value: ThemeMode) {
  mode = value;
  Taro.setStorageSync("befull:theme", value);
  [...listeners].forEach((fn) => fn());
  applyTheme();
}
export const themeMode = () => mode;
export const useTheme = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    snapshot,
    snapshot,
  );

export const useThemeMode = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    themeMode,
    themeMode,
  );
