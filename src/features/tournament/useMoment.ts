import { useCallback, useEffect, useRef, useState } from "react";

export const COURT_REVEAL_MS = 650;

/** Visual feedback never owns the lifetime of data or an action. */
export function useMoment() {
  const [active, setActive] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setActive(null);
  }, []);
  const play = useCallback((key: string, duration: number) => {
    if (!mounted.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (
      document.visibilityState !== "visible" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setActive(null);
      return;
    }
    setActive(key);
    timer.current = setTimeout(() => {
      timer.current = null;
      setActive(null);
    }, duration);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onVisibility = () => {
      if (document.visibilityState !== "visible") stop();
    };
    const onPreference = () => {
      if (preference.matches) stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    preference.addEventListener("change", onPreference);
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      preference.removeEventListener("change", onPreference);
    };
  }, [stop]);
  return { active, play, stop };
}
