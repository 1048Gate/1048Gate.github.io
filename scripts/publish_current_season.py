#!/usr/bin/env python3
"""Fetch ESPN standings + scoreboard and write data/current-season.json for the site.

Preserves locker numbers and manager names from the existing board (keyed by
ESPN teamId). Updates club names, records, PF/PA, and the current week's
matchups. Optionally syncs data/site.json phase to "Week N".

Credentials: ESPN_S2, ESPN_SWID (required). ESPN_LEAGUE_ID / ESPN_SEASON optional.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_current import (  # noqa: E402
    DEFAULT_LEAGUE_ID,
    DEFAULT_SEASON,
    fetch_json,
    normalize_scoreboard,
    normalize_standings,
)

ROOT = Path(__file__).resolve().parents[1]
CURRENT_PATH = ROOT / "data" / "current-season.json"
SITE_PATH = ROOT / "data" / "site.json"


def detect_week(payload: dict, fallback: int) -> int:
    status = payload.get("status") if isinstance(payload.get("status"), dict) else {}
    for key in (
        "currentMatchupPeriod",
        "currentMatchupPeriodId",
        "latestScoringPeriod",
        "scoringPeriodId",
    ):
        value = status.get(key)
        if value is None and key == "scoringPeriodId":
            value = payload.get("scoringPeriodId")
        if value is not None:
            try:
                week = int(value)
                if week > 0:
                    return week
            except (TypeError, ValueError):
                pass
    settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    schedule = settings.get("scheduleSettings") if isinstance(settings.get("scheduleSettings"), dict) else {}
    for key in ("matchupPeriodCount",):
        pass
    value = schedule.get("currentMatchupPeriod") or settings.get("scoringPeriodId")
    if value is not None:
        try:
            week = int(value)
            if week > 0:
                return week
        except (TypeError, ValueError):
            pass
    return fallback


def load_roster(path: Path) -> dict[int, dict]:
    if not path.exists():
        raise SystemExit(f"Missing roster seed file: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    roster = {}
    for row in data.get("standings") or []:
        team_id = row.get("teamId")
        if team_id is None:
            continue
        roster[int(team_id)] = {
            "locker": row.get("locker"),
            "owner": row.get("owner") or "",
            "team": row.get("team") or "",
            "abbrev": row.get("abbrev") or "",
        }
    if len(roster) != 12:
        raise SystemExit(f"Expected 12 teams in {path}, found {len(roster)}")
    return roster


def side_from(team_id: int | None, score, roster: dict[int, dict], espn_name: str | None) -> dict:
    if team_id is None:
        return {"teamId": None, "team": espn_name or "TBD", "owner": "", "score": score}
    meta = roster.get(int(team_id), {})
    return {
        "teamId": int(team_id),
        "team": espn_name or meta.get("team") or f"Team {team_id}",
        "owner": meta.get("owner") or "",
        "score": score,
    }


def build_board(
    *,
    season: int,
    season_number: int,
    week: int,
    fetched_at: str,
    standings_norm: dict,
    scoreboard_norm: dict,
    roster: dict[int, dict],
) -> dict:
    by_id = {int(team["team_id"]): team for team in standings_norm["teams"]}
    standings = []
    for team_id, meta in roster.items():
        espn = by_id.get(team_id)
        if not espn:
            raise SystemExit(f"ESPN standings missing teamId {team_id} ({meta.get('owner')})")
        standings.append({
            "locker": meta.get("locker"),
            "teamId": team_id,
            "team": espn.get("team_name") or meta.get("team") or f"Team {team_id}",
            "owner": meta.get("owner") or "",
            "abbrev": espn.get("abbrev") or meta.get("abbrev") or "",
            "wins": int(espn.get("wins") or 0),
            "losses": int(espn.get("losses") or 0),
            "ties": int(espn.get("ties") or 0),
            "pointsFor": float(espn.get("points_for") or 0),
            "pointsAgainst": float(espn.get("points_against") or 0),
        })
    standings.sort(key=lambda row: (
        -(row["wins"] + 0.5 * row["ties"]),
        -row["pointsFor"],
        row["locker"] if row["locker"] is not None else 999,
    ))

    matchups = []
    for index, game in enumerate(scoreboard_norm.get("games") or [], start=1):
        home = game.get("home") or {}
        away = game.get("away") or {}
        winner = str(game.get("winner") or "").upper()
        scores = (away.get("score"), home.get("score"))
        has_points = any(score not in (None, 0) for score in scores)
        if winner in {"HOME", "AWAY", "TIE"}:
            state = "final"
        elif has_points or winner == "UNDECIDED":
            state = "live" if has_points else "scheduled"
        else:
            state = "scheduled"
        matchups.append({
            "id": game.get("matchup_id", index),
            "week": int(game.get("matchup_period") or game.get("scoring_period") or week),
            "state": state,
            "winner": winner or None,
            "away": side_from(away.get("team_id"), away.get("score"), roster, away.get("team_name")),
            "home": side_from(home.get("team_id"), home.get("score"), roster, home.get("team_name")),
        })

    if len(matchups) != 6:
        raise SystemExit(f"Expected 6 matchups for week {week}, found {len(matchups)}")

    records_started = any(row["wins"] or row["losses"] or row["ties"] for row in standings)
    scores = [game[side]["score"] for game in matchups for side in ("away", "home")]
    has_points = any(score not in (None, 0) for score in scores)
    any_score = any(score is not None for score in scores)
    live_games = sum(1 for game in matchups if game["state"] == "live")
    if not records_started and not any_score:
        note = f"Week {week} slate. Records stay 0-0 until kickoff."
    elif live_games:
        note = f"Week {week} in progress. Live scoring from ESPN."
    elif has_points and not records_started:
        note = f"Week {week} scoring is on the board. Records update when ESPN posts the result."
    else:
        note = f"Week {week} slate from ESPN."

    return {
        "schemaVersion": 1,
        "season": season,
        "seasonNumber": season_number,
        "week": week,
        "phase": f"Week {week}",
        "fetchedAt": fetched_at,
        "source": "ESPN league endpoint",
        "note": note,
        "standings": standings,
        "matchups": matchups,
    }


def sync_site_phase(site_path: Path, phase: str, week: int) -> bool:
    if not site_path.exists():
        return False
    site = json.loads(site_path.read_text(encoding="utf-8"))
    changed = False
    if site.get("phase") != phase:
        site["phase"] = phase
        changed = True
    site_path.write_text(json.dumps(site, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=int(os.getenv("ESPN_SEASON", DEFAULT_SEASON)))
    parser.add_argument("--week", type=int, help="Force matchup week; default detects from ESPN")
    parser.add_argument("--league-id", type=int, default=int(os.getenv("ESPN_LEAGUE_ID", DEFAULT_LEAGUE_ID)))
    parser.add_argument("--season-number", type=int, default=10)
    parser.add_argument("--roster", type=Path, default=CURRENT_PATH)
    parser.add_argument("--output", type=Path, default=CURRENT_PATH)
    parser.add_argument("--sync-site-phase", action="store_true", default=True)
    parser.add_argument("--no-sync-site-phase", action="store_false", dest="sync_site_phase")
    args = parser.parse_args()

    if not os.getenv("ESPN_S2") or not os.getenv("ESPN_SWID"):
        print("ESPN_S2 and ESPN_SWID must be set for this private league.", file=sys.stderr)
        return 2

    roster = load_roster(args.roster)
    seed_week = 1
    if args.roster.exists():
        try:
            seed_week = int(json.loads(args.roster.read_text(encoding="utf-8")).get("week") or 1)
        except (TypeError, ValueError, json.JSONDecodeError):
            seed_week = 1

    try:
        standings_payload = fetch_json(args.season, args.league_id, None, "standings")
        week = args.week or detect_week(standings_payload, seed_week)
        scoreboard_payload = fetch_json(args.season, args.league_id, week, "scoreboard")
        standings_norm = normalize_standings(standings_payload, args.season, args.league_id)
        scoreboard_norm = normalize_scoreboard(scoreboard_payload, args.season, args.league_id, week)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    fetched_at = datetime.now(timezone.utc).isoformat()
    board = build_board(
        season=args.season,
        season_number=args.season_number,
        week=week,
        fetched_at=fetched_at,
        standings_norm=standings_norm,
        scoreboard_norm=scoreboard_norm,
        roster=roster,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(board, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}: week {week}, {len(board['standings'])} teams, {len(board['matchups'])} matchups")

    if args.sync_site_phase:
        if sync_site_phase(SITE_PATH, board["phase"], week):
            print(f"Updated {SITE_PATH} phase → {board['phase']}")
        else:
            print(f"Site phase already {board['phase']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
