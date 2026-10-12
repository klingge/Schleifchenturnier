import { useEffect, useState, type CSSProperties } from "react";

function measure() {
  const viewport = window.visualViewport;
  return {
    height: viewport?.height ?? window.innerHeight,
    top: viewport?.offsetTop ?? 0,
  };
}

// The visual viewport shrinks when the on-screen keyboard covers a mobile page.
export function useDialogViewport(): CSSProperties {
  const [viewport, setViewport] = useState(measure);
  useEffect(() => {
    const update = () => setViewport(measure());
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", update);
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
  return {
    top: viewport.top + viewport.height / 2,
    maxHeight: Math.max(0, viewport.height - 32),
  };
}
