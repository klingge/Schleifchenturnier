import { useEffect, useRef } from "react";
import type { EventData } from "@/domain/tournament";
import { useMoment } from "./useMoment";

export function useTournamentAccent(data: EventData | null) {
  const moment = useMoment();
  const previous = useRef<{
    event: string;
    round: string | null;
    state: string | null;
    finished: boolean;
  } | null>(null);

  useEffect(() => {
    if (!data) {
      previous.current = null;
      moment.stop();
      return;
    }
    const before = previous.current;
    const next = {
      event: data.event.id,
      round: data.currentRound?.id ?? null,
      state: data.currentRound?.state ?? null,
      finished: Boolean(data.event.finished_at),
    };
    // Consume every snapshot, including hidden tabs and reduced motion.
    previous.current = next;
    if (
      !before ||
      before.event !== next.event ||
      data.event.status === "archived"
    ) {
      moment.stop();
      return;
    }
    if (!before.finished && next.finished) {
      moment.play("finish", 700);
    } else if (next.finished) {
      return;
    } else if (
      !before.finished &&
      next.round !== null &&
      before.round === next.round &&
      before.state === "published" &&
      next.state === "running"
    ) {
      moment.play("start", 360);
    } else if (
      before.finished ||
      before.round !== next.round ||
      next.state !== "running"
    ) {
      moment.stop();
    }
  }, [data, moment.play, moment.stop]);

  return moment.active;
}
