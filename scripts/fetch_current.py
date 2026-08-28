#!/usr/bin/env python3
"""Fetch normalized current-season ESPN standings or scoreboard data.

Credentials are read only from ESPN_S2 and ESPN_SWID environment variables.
The script never writes raw ESPN responses or credentials to output.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_LEAGUE_ID = 1237285
DEFAULT_SEASON = 2026
BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
MAX_ATTEMPTS = 3
TIMEOUT_SECONDS = 15


def fetch_json(season: int, league_id: int, week: int | None, kind: str) -> dict:
    views = ["mSettings", "mTeam", "mStandings"]
    if kind == "scoreboard":
        views = ["mSettings", "mTeam", "mMatchup", "mMatchupScore", "mScoreboard"]
    query: list[tuple[str, str]] = [("view", view) for view in views]
    if week is not None:
        query.append(("scoringPeriodId", str(week)))
    url = f"{BASE}/seasons/{season}/segments/0/leagues/{league_id}?{urllib.parse.urlencode(query)}"
    cookies = {}
    if os.getenv("ESPN_S2"):
        cookies["espn_s2"] = os.environ["ESPN_S2"]
    if os.getenv("ESPN_SWID"):
        cookies["SWID"] = os.environ["ESPN_SWID"]
    headers = {"Accept": "application/json", "User-Agent": "1048Gate-current-data/1.0"}
    request = urllib.request.Request(url, headers=headers)
    if cookies:
        request.add_header("Cookie", "; ".join(f"{key}={value}" for key, value in cookies.items()))
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                if response.status != 200:
                    raise RuntimeError(f"ESPN HTTP {response.status}")
                payload = json.load(response)
                if not isinstance(payload, dict):
                    raise RuntimeError("ESPN returned a non-object response")
                return payload
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(min(2 ** (attempt - 1), 8))
    raise RuntimeError(f"ESPN request failed after {MAX_ATTEMPTS} attempts: {last_error}")


def team_map(payload: dict) -> dict[int, dict]:
    result = {}
    for team in payload.get("teams", []):
        if not isinstance(team, dict) or team.get("id") is None:
            continue
        record = team.get("record", {}) or {}
        overall = record.get("overall", {}) or {}
        result[int(team["id"])] = {
            "team_id": int(team["id"]),
            "team_name": (team.get("name") or team.get("location") or f"Team {team['id']}").strip(),
            "abbrev": team.get("abbrev"),
            "owners": team.get("owners", []),
            "wins": overall.get("wins"),
            "losses": overall.get("losses"),
            "ties": overall.get("ties"),
            "points_for": overall.get("pointsFor"),
            "points_against": overall.get("pointsAgainst"),
            "rank": (team.get("rank") or team.get("playoffSeed")) or None,
        }
    return result


def normalize_standings(payload: dict, season: int, league_id: int) -> dict:
    teams = list(team_map(payload).values())
    teams.sort(key=lambda row: (row["rank"] is None, row["rank"] or 999, row["team_id"]))
    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "league_id": league_id,
        "season": season,
        "source": "ESPN league endpoint",
        "teams": teams,
    }


def normalize_scoreboard(payload: dict, season: int, league_id: int, requested_week: int | None) -> dict:
    teams = team_map(payload)
    games = []
    for index, item in enumerate(payload.get("schedule", [])):
        if not isinstance(item, dict):
            continue
        item_period = item.get("matchupPeriodId")
        if requested_week is not None and item_period is not None and int(item_period) != requested_week:
            continue
        home = item.get("home", {}) or {}
        away = item.get("away", {}) or {}
        home_id = home.get("teamId")
        away_id = away.get("teamId")
        if home_id is None and away_id is None:
            continue
        home_id = int(home_id) if home_id is not None else None
        away_id = int(away_id) if away_id is not None else None
        games.append({
            "matchup_id": item.get("id", index),
            "scoring_period": item.get("matchupPeriodId", requested_week),
            "matchup_period": item.get("matchupPeriodId"),
            "status": item.get("status", {}).get("type", {}).get("name") if isinstance(item.get("status"), dict) else item.get("status"),
            "home": {"team_id": home_id, "team_name": teams.get(home_id, {}).get("team_name"), "score": home.get("totalScore")},
            "away": {"team_id": away_id, "team_name": teams.get(away_id, {}).get("team_name"), "score": away.get("totalScore")},
        })
    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "league_id": league_id,
        "season": season,
        "scoring_period": requested_week,
        "source": "ESPN league endpoint",
        "games": games,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("standings", "scoreboard"))
    parser.add_argument("--season", type=int, default=int(os.getenv("ESPN_SEASON", DEFAULT_SEASON)))
    parser.add_argument("--week", type=int, help="ESPN scoring period; required for scoreboard")
    parser.add_argument("--league-id", type=int, default=int(os.getenv("ESPN_LEAGUE_ID", DEFAULT_LEAGUE_ID)))
    parser.add_argument("--output", type=Path, help="Write normalized JSON to this path")
    args = parser.parse_args()
    if args.kind == "scoreboard" and args.week is None:
        parser.error("scoreboard requires --week")
    if not os.getenv("ESPN_S2") or not os.getenv("ESPN_SWID"):
        print("ESPN_S2 and ESPN_SWID must be set for this private league.", file=sys.stderr)
        return 2
    try:
        payload = fetch_json(args.season, args.league_id, args.week, args.kind)
        result = normalize_standings(payload, args.season, args.league_id) if args.kind == "standings" else normalize_scoreboard(payload, args.season, args.league_id, args.week)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
        print(f"Wrote {args.output}: {len(result.get('teams', result.get('games', [])))} records")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
