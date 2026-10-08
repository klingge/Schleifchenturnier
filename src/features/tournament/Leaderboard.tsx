import hairBow from "@/assets/hair-bow.png";
import type { Player } from "@/domain/tournament";

export function Leaderboard({
  players,
  selected,
  onSelect,
}: {
  players: Player[];
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <ol className="ranking">
      {players.map((p) => {
        const content = (
          <>
            <b>{p.rank}</b>
            <i>{p.emoji}</i>
            <span className="ranking-player">
              <strong>{p.display_name}</strong>
            </span>
            <span className="ranking-stats">
              <span
                className="win-tally"
                data-zero={p.wins === 0}
                role="img"
                aria-label={`${p.wins} ${p.wins === 1 ? "Sieg" : "Siege"}`}
              >
                <span className="win-count">{p.wins}</span>
                <img
                  src={hairBow}
                  alt=""
                  width="292"
                  height="292"
                  aria-hidden="true"
                />
              </span>
              <small className="game-difference">
                Diff. {p.gameDifference > 0 ? "+" : ""}
                {p.gameDifference}
              </small>
            </span>
          </>
        );

        return (
          <li key={p.id}>
            {onSelect ? (
              <button
                type="button"
                data-rank={p.rank <= 3 ? p.rank : undefined}
                className={selected === p.id ? "selected" : ""}
                aria-pressed={selected === p.id}
                onClick={() => onSelect(p.id)}
              >
                {content}
              </button>
            ) : (
              <div
                className={`ranking-row${selected === p.id ? " selected" : ""}`}
                data-rank={p.rank <= 3 ? p.rank : undefined}
              >
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
