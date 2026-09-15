#!/usr/bin/env python3
"""Merge one verified current-season week into the public score leaderboards."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MATCHUPS_PATH = ROOT / "data" / "matchups.json"
CURRENT_PATH = ROOT / "data" / "current-season.json"
LIMIT = 5


def _number(value) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("scores must be numeric")
    return round(float(value), 2)


def _current_rows(board: dict) -> list[dict]:
    games = board.get("matchups") or []
    if len(games) != 6 or any(game.get("state") != "final" for game in games):
        return []
    season = int(board["season"])
    week = int(board["week"])
    rows = []
    for game in games:
        for side_name, opponent_name in (("away", "home"), ("home", "away")):
            side = game.get(side_name) or {}
            opponent = game.get(opponent_name) or {}
            team_id = side.get("teamId")
            if team_id is None or not side.get("owner") or not side.get("team"):
                raise ValueError("final matchup sides need teamId, owner, and team")
            rows.append({
                "season": season,
                "week": week,
                "teamId": int(team_id),
                "score": _number(side.get("score")),
                "owner": str(side["owner"]).strip(),
                "team": str(side["team"]).strip(),
                "opponentOwner": str(opponent.get("owner") or "").strip(),
                "opponentTeam": str(opponent.get("team") or "").strip(),
                "isPlayoff": bool(game.get("isPlayoff", False)),
            })
    return rows


def _leaderboard_row(row: dict) -> list:
    return [
        row["score"], row["owner"], row["team"], row["opponentOwner"],
        row["opponentTeam"], row["season"], row["week"], int(row["isPlayoff"]),
    ]


def update_leaderboards(matchups: dict, board: dict) -> bool:
    new_rows = _current_rows(board)
    if not new_rows:
        return False

    season = int(board["season"])
    week = int(board["week"])
    saved = [
        row for row in (matchups.get("currentSeasonScores") or [])
        if not (int(row.get("season", -1)) == season and int(row.get("week", -1)) == week)
    ]
    saved.extend(new_rows)
    saved.sort(key=lambda row: (int(row["season"]), int(row["week"]), int(row["teamId"])))

    archive = matchups.get("archiveLeaderboards") or matchups.get("leaderboards") or {}
    historical = []
    for row in archive.get("highestScores") or []:
        historical.append({
            "score": _number(row[0]), "owner": row[1], "team": row[2],
            "opponentOwner": row[3], "opponentTeam": row[4], "season": int(row[5]),
            "week": int(row[6]), "isPlayoff": bool(row[7]),
        })
    for row in archive.get("lowestScores") or []:
        key = (int(row[5]), int(row[6]), str(row[1]), _number(row[0]))
        if not any((r["season"], r["week"], r["owner"], r["score"]) == key for r in historical):
            historical.append({
                "score": _number(row[0]), "owner": row[1], "team": row[2],
                "opponentOwner": row[3], "opponentTeam": row[4], "season": int(row[5]),
                "week": int(row[6]), "isPlayoff": bool(row[7]),
            })

    candidates = historical + saved
    highest = sorted(candidates, key=lambda row: (-row["score"], row["season"], row["week"], row["owner"]))[:LIMIT]
    lowest = sorted(candidates, key=lambda row: (row["score"], row["season"], row["week"], row["owner"]))[:LIMIT]
    leaderboards = {
        "highestScores": [_leaderboard_row(row) for row in highest],
        "lowestScores": [_leaderboard_row(row) for row in lowest],
    }
    changed = saved != (matchups.get("currentSeasonScores") or []) or leaderboards != matchups.get("leaderboards")
    matchups["schemaVersion"] = max(2, int(matchups.get("schemaVersion") or 1))
    matchups["currentSeasonScores"] = saved
    matchups["leaderboards"] = leaderboards
    matchups.setdefault("records", {})["highestScore"] = leaderboards["highestScores"][0]
    matchups["records"]["lowestScore"] = leaderboards["lowestScores"][0]
    archive_games = int(matchups.get("archiveGameCount") or matchups.get("gameCount") or 0)
    matchups["archiveGameCount"] = archive_games
    matchups["gameCount"] = archive_games + len(saved) // 2
    matchups.setdefault("seasonRange", {})["to"] = max(int(matchups.get("seasonRange", {}).get("to") or season), season)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matchups", type=Path, default=MATCHUPS_PATH)
    parser.add_argument("--current", type=Path, default=CURRENT_PATH)
    args = parser.parse_args()
    matchups = json.loads(args.matchups.read_text(encoding="utf-8"))
    board = json.loads(args.current.read_text(encoding="utf-8"))
    if not update_leaderboards(matchups, board):
        print("Current week is incomplete or score leaderboards are unchanged.")
        return 0
    args.matchups.write_text(json.dumps(matchups, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Updated score leaderboards through {board['season']} Week {board['week']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
