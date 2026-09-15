#!/usr/bin/env python3
"""Merge one verified current-season week into the public score leaderboards."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MATCHUPS_PATH = ROOT / "data" / "matchups.json"
CURRENT_PATH = ROOT / "data" / "current-season.json"
STREAKS_PATH = ROOT / "data" / "streaks.json"
LIMIT = 5
TOP_THREE = 3
CONSOLATION_TYPES = {"LOSERS_CONSOLATION_LADDER", "WINNERS_CONSOLATION_LADDER"}


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
                "opponentTeamId": int(opponent.get("teamId")),
                "score": _number(side.get("score")),
                "opponentScore": _number(opponent.get("score")),
                "owner": str(side["owner"]).strip(),
                "team": str(side["team"]).strip(),
                "opponentOwner": str(opponent.get("owner") or "").strip(),
                "opponentTeam": str(opponent.get("team") or "").strip(),
                "isPlayoff": bool(game.get("isPlayoff", False)),
                "matchupType": str(game.get("matchupType") or "NONE"),
            })
    return rows


def _leaderboard_row(row: dict) -> list:
    return [
        row["score"], row["owner"], row["team"], row["opponentOwner"],
        row["opponentTeam"], row["season"], row["week"], int(row["isPlayoff"]),
    ]


def _game_row(row: dict, metric: float) -> list:
    winner = row
    if row["opponentScore"] > row["score"]:
        winner = {**row, "owner": row["opponentOwner"], "team": row["opponentTeam"],
                  "score": row["opponentScore"], "opponentOwner": row["owner"],
                  "opponentTeam": row["team"], "opponentScore": row["score"]}
    return [round(metric, 2), winner["owner"], winner["team"], winner["score"],
            winner["opponentOwner"], winner["opponentTeam"], winner["opponentScore"],
            winner["season"], winner["week"], int(winner["isPlayoff"]), winner["matchupType"]]


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
    regular_candidates = [row for row in candidates if not row["isPlayoff"]]
    lowest = sorted(regular_candidates, key=lambda row: (row["score"], row["season"], row["week"], row["owner"]))[:LIMIT]
    leaderboards = dict(archive)
    leaderboards.update({
        "highestScores": [_leaderboard_row(row) for row in highest],
        "lowestScores": [_leaderboard_row(row) for row in lowest],
    })
    games=[]
    seen=set()
    for row in saved:
        game_key=(row["season"],row["week"],min(row["teamId"],row["opponentTeamId"]),max(row["teamId"],row["opponentTeamId"]))
        if game_key not in seen:
            seen.add(game_key);games.append(row)
    current_game_rows={
        "biggestBlowouts": [_game_row(row,abs(row["score"]-row["opponentScore"])) for row in games if row["score"] != row["opponentScore"] and row["matchupType"] not in CONSOLATION_TYPES],
        "closestGames": [_game_row(row,abs(row["score"]-row["opponentScore"])) for row in games if row["score"] != row["opponentScore"]],
        "highestCombinedGames": [_game_row(row,row["score"]+row["opponentScore"]) for row in games],
    }
    for name,rows in current_game_rows.items():
        candidates=list(archive.get(name) or [])+rows
        reverse=name != "closestGames"
        leaderboards[name]=sorted(candidates,key=lambda row:row[0],reverse=reverse)[:TOP_THREE]
    changed = saved != (matchups.get("currentSeasonScores") or []) or leaderboards != matchups.get("leaderboards")
    matchups["schemaVersion"] = max(2, int(matchups.get("schemaVersion") or 1))
    matchups["currentSeasonScores"] = saved
    matchups["leaderboards"] = leaderboards
    matchups.setdefault("records", {})["highestScore"] = leaderboards["highestScores"][0]
    matchups["records"]["lowestScore"] = leaderboards["lowestScores"][0]
    first=leaderboards["biggestBlowouts"][0]
    matchups["records"]["biggestBlowout"]=[first[0],first[1],first[3],first[4],first[6],first[7],first[8],first[9]]
    first=leaderboards["closestGames"][0]
    matchups["records"]["closestGame"]=[first[0],first[1],first[3],first[4],first[6],first[7],first[8],first[9]]
    first=leaderboards["highestCombinedGames"][0]
    matchups["records"]["highestCombined"]=[first[0],first[1],first[3],first[4],first[6],first[7],first[8],first[9]]
    archive_games = int(matchups.get("archiveGameCount") or matchups.get("gameCount") or 0)
    matchups["archiveGameCount"] = archive_games
    matchups["gameCount"] = archive_games + len(saved) // 2
    matchups.setdefault("seasonRange", {})["to"] = max(int(matchups.get("seasonRange", {}).get("to") or season), season)
    return changed


def update_streak_leaderboards(streaks: dict, score_rows: list[dict]) -> bool:
    """Merge current-season streaks while keeping losing streaks regular-season-only."""
    def current_runs(result_code: str, regular_only: bool) -> list[dict]:
        groups={}
        for row in score_rows:
            if regular_only and row["isPlayoff"]:continue
            groups.setdefault((row["season"],row["teamId"]),[]).append(row)
        runs=[]
        for (season,_),rows in groups.items():
            run=[]
            for row in sorted(rows,key=lambda item:item["week"])+[None]:
                result=None if row is None else ('W' if row['score']>row['opponentScore'] else 'L' if row['score']<row['opponentScore'] else 'T')
                if result==result_code:run.append(row)
                elif run:
                    runs.append({'games':len(run),'manager':run[-1]['owner'],'team':run[-1]['team'],
                      'season':season,'startWeek':run[0]['week'],'endWeek':run[-1]['week'],
                      'includesPostseason':bool(any(item['isPlayoff'] for item in run))})
                    run=[]
        return runs
    archive=streaks.get('archiveLeaderboards') or streaks.get('leaderboards') or {}
    leaders={}
    for name,result,regular_only in [('winningStreaks','W',False),('losingStreaks','L',True)]:
        candidates=list(archive.get(name) or [])+current_runs(result,regular_only)
        leaders[name]=sorted(candidates,key=lambda row:(-row['games'],row['season'],row['startWeek'],row['manager'].lower()))[:TOP_THREE]
    changed=leaders != streaks.get('leaderboards')
    streaks['schemaVersion']=2;streaks['leaderboards']=leaders
    streaks['longestWinningStreak']={**leaders['winningStreaks'][0],'wins':leaders['winningStreaks'][0]['games']}
    streaks['longestLosingStreak']={**leaders['losingStreaks'][0],'losses':leaders['losingStreaks'][0]['games']}
    if score_rows:streaks.setdefault('seasonRange',{})['to']=max(streaks.get('seasonRange',{}).get('to',0),max(row['season'] for row in score_rows))
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matchups", type=Path, default=MATCHUPS_PATH)
    parser.add_argument("--current", type=Path, default=CURRENT_PATH)
    parser.add_argument("--streaks", type=Path, default=STREAKS_PATH)
    args = parser.parse_args()
    matchups = json.loads(args.matchups.read_text(encoding="utf-8"))
    board = json.loads(args.current.read_text(encoding="utf-8"))
    if not update_leaderboards(matchups, board):
        print("Current week is incomplete or score leaderboards are unchanged.")
        return 0
    streaks = json.loads(args.streaks.read_text(encoding="utf-8"))
    update_streak_leaderboards(streaks, matchups["currentSeasonScores"])
    args.matchups.write_text(json.dumps(matchups, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    args.streaks.write_text(json.dumps(streaks, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Updated score leaderboards through {board['season']} Week {board['week']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
