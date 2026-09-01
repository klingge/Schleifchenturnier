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
    <div className="ranking">
      {players.map((p) => (
        <button
          key={p.id}
          data-rank={p.rank <= 3 ? p.rank : undefined}
          className={selected === p.id ? "selected" : ""}
          disabled={!onSelect}
          onClick={() => onSelect?.(p.id)}
        >
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
        </button>
      ))}
    </div>
  );
}
