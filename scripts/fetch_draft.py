#!/usr/bin/env python3
"""Fetch a normalized ESPN draft recap for the current 1048 Gate season.

Credentials are read only from ESPN_S2 and ESPN_SWID. The script never writes
raw ESPN responses or credentials. Compact output matches data/drafts/*.json.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_LEAGUE_ID = 1237285
DEFAULT_SEASON = 2026
BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
MAX_ATTEMPTS = 3
TIMEOUT_SECONDS = 30
POSITIONS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}
ALIASES = {
    "german joshua haro": "German Haro",
    "tommy speer": "Thomas Speer",
    "tom speer": "Thomas Speer",
    "thomas speer": "Thomas Speer",
    "jd daley": "JD Daley",
    "j.d. daley": "JD Daley",
}


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def canonical_owner(value: str, members: list[str]) -> str:
    name = clean(value)
    if not name:
        return "Unknown"
    key = name.lower()
    if key in ALIASES:
        return ALIASES[key]
    members_by_lower = {m.lower(): m for m in members}
    if key in members_by_lower:
        return members_by_lower[key]
    last = key.split()[-1]
    last_matches = [m for m in members if m.lower().split()[-1] == last]
    if len(last_matches) == 1:
        return last_matches[0]
    return name


def load_member_names(root: Path) -> list[str]:
    path = root / "data" / "members.json"
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [clean(m.get("name")) for m in payload.get("members", []) if clean(m.get("name"))]


def espn_request(url: str, cookies: dict[str, str]) -> dict[str, Any]:
    headers = {"Accept": "application/json", "User-Agent": "1048Gate-draft-scrape/1.0"}
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


def fetch_json(season: int, league_id: int) -> dict[str, Any]:
    views = ["mSettings", "mTeam", "mRoster", "mDraftDetail"]
    query = [("view", view) for view in views]
    url = f"{BASE}/seasons/{season}/segments/0/leagues/{league_id}?{urllib.parse.urlencode(query)}"
    cookies: dict[str, str] = {}
    if os.getenv("ESPN_S2"):
        cookies["espn_s2"] = os.environ["ESPN_S2"]
    if os.getenv("ESPN_SWID"):
        cookies["SWID"] = os.environ["ESPN_SWID"]
    return espn_request(url, cookies)


def _int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _player_from_entry(entry: dict[str, Any]) -> dict[str, Any]:
    pool = entry.get("playerPoolEntry") if isinstance(entry.get("playerPoolEntry"), dict) else {}
    player = pool.get("player") if isinstance(pool.get("player"), dict) else {}
    if not player and isinstance(entry.get("player"), dict):
        player = entry["player"]
    return player


def _player_name(player: dict[str, Any], fallback_id: int | None) -> str:
    name = clean(player.get("fullName") or player.get("name"))
    if name:
        return name
    first = clean(player.get("firstName"))
    last = clean(player.get("lastName"))
    joined = clean(f"{first} {last}")
    if joined:
        return joined
    return f"Player {fallback_id}" if fallback_id is not None else "Unknown"


def _ppr_rank(player: dict[str, Any]) -> int | None:
    ranks = player.get("draftRanksByRankType")
    if not isinstance(ranks, dict):
        return None
    ppr = ranks.get("PPR") if isinstance(ranks.get("PPR"), dict) else {}
    standard = ranks.get("STANDARD") if isinstance(ranks.get("STANDARD"), dict) else {}
    return _int(ppr.get("rank") or standard.get("rank"))


def _adp(player: dict[str, Any]) -> float | None:
    ownership = player.get("ownership") if isinstance(player.get("ownership"), dict) else {}
    value = ownership.get("averageDraftPosition")
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _dst_name(player: dict[str, Any], fallback: str) -> str:
    if player.get("defaultPositionId") != 16:
        return fallback
    pro = clean(player.get("proTeamAbbreviation") or player.get("proTeam"))
    if pro:
        return f"{pro} D/ST"
    if fallback.lower().endswith("d/st") or "defense" in fallback.lower():
        return fallback
    return fallback


def member_map(payload: dict[str, Any], members: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for member in payload.get("members") or []:
        if not isinstance(member, dict) or not member.get("id"):
            continue
        first = clean(member.get("firstName"))
        last = clean(member.get("lastName"))
        display = clean(member.get("displayName"))
        name = canonical_owner(clean(f"{first} {last}") or display, members)
        result[str(member["id"])] = name
    return result


def player_index(payload: dict[str, Any]) -> dict[int, dict[str, Any]]:
    found: dict[int, dict[str, Any]] = {}
    for team in payload.get("teams") or []:
        if not isinstance(team, dict):
            continue
        roster = team.get("roster") if isinstance(team.get("roster"), dict) else {}
        for entry in roster.get("entries") or []:
            if not isinstance(entry, dict):
                continue
            player = _player_from_entry(entry)
            player_id = _int(entry.get("playerId") or player.get("id") or player.get("playerId"))
            if player_id is None:
                continue
            name = _dst_name(player, _player_name(player, player_id))
            found[player_id] = {
                "id": player_id,
                "name": name,
                "position": POSITIONS.get(_int(player.get("defaultPositionId")) or -1, "FLEX"),
                "rank": _ppr_rank(player),
                "adp": _adp(player),
            }
    return found


def team_records(payload: dict[str, Any], members: list[str]) -> dict[int, dict[str, Any]]:
    owners = member_map(payload, members)
    result: dict[int, dict[str, Any]] = {}
    for team in payload.get("teams") or []:
        if not isinstance(team, dict) or team.get("id") is None:
            continue
        team_id = int(team["id"])
        name = clean(team.get("name") or team.get("location") or f"Team {team_id}")
        owner_id = str(team.get("primaryOwner") or "")
        owner = owners.get(owner_id)
        if not owner:
            for item in team.get("owners") or []:
                owner = owners.get(str(item))
                if owner:
                    break
        result[team_id] = {
            "team_id": team_id,
            "team_name": name,
            "owner": owner or "Unknown",
            "abbrev": team.get("abbrev"),
        }
    return result


def normalize_draft(payload: dict[str, Any], season: int, league_id: int, members: list[str] | None = None) -> dict[str, Any]:
    members = members or []
    detail = payload.get("draftDetail") if isinstance(payload.get("draftDetail"), dict) else {}
    picks_raw = [item for item in (detail.get("picks") or []) if isinstance(item, dict)]
    if not picks_raw:
        raise RuntimeError("ESPN draft recap did not include any picks.")
    settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    league_name = clean(settings.get("name") or f"1048 Gate Szn {season - 2016}")
    teams = team_records(payload, members)
    players = player_index(payload)

    ordered = sorted(
        picks_raw,
        key=lambda item: (
            _int(item.get("overallPickNumber")) is None,
            _int(item.get("overallPickNumber")) or 0,
            _int(item.get("id")) or 0,
        ),
    )
    team_rows: list[list[str]] = []
    team_index: dict[int, int] = {}
    compact_picks: list[list[Any]] = []
    full_picks: list[dict[str, Any]] = []
    for item in ordered:
        overall = _int(item.get("overallPickNumber"))
        team_id = _int(item.get("teamId"))
        player_id = _int(item.get("playerId"))
        if overall is None or team_id is None:
            continue
        if team_id not in team_index:
            team = teams.get(team_id, {"team_name": f"Team {team_id}", "owner": "Unknown"})
            team_index[team_id] = len(team_rows)
            team_rows.append([team["team_name"], team["owner"]])
        player = players.get(player_id or -1, {})
        player_name = player.get("name") or (f"Player {player_id}" if player_id is not None else "Unknown")
        keeper = 1 if item.get("keeper") else 0
        compact_picks.append([overall, team_index[team_id], player_name, keeper])
        full_picks.append({
            "overall": overall,
            "round": _int(item.get("roundId")),
            "round_pick": _int(item.get("roundPickNumber")),
            "team_id": team_id,
            "team_index": team_index[team_id],
            "team_name": team_rows[team_index[team_id]][0],
            "owner": team_rows[team_index[team_id]][1],
            "player_id": player_id,
            "player": player_name,
            "position": player.get("position"),
            "rank": player.get("rank"),
            "adp": player.get("adp"),
            "keeper": keeper,
        })

    if not compact_picks:
        raise RuntimeError("ESPN draft recap contained picks, but none could be normalized.")

    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "league_id": league_id,
        "season": season,
        "source": "ESPN league endpoint",
        "complete": bool(detail.get("drafted") or detail.get("complete")),
        "in_progress": bool(detail.get("inProgress")),
        "league": league_name,
        "keepers": sum(pick[3] for pick in compact_picks),
        "teams": team_rows,
        "picks": compact_picks,
        "full_picks": full_picks,
        "archive": {
            "year": season,
            "league": league_name,
            "keepers": sum(pick[3] for pick in compact_picks),
            "teams": team_rows,
            "picks": compact_picks,
        },
    }


def compact_json(archive: dict[str, Any]) -> str:
    return json.dumps(archive, ensure_ascii=False, separators=(",", ":")) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=int(os.getenv("ESPN_SEASON", DEFAULT_SEASON)))
    parser.add_argument("--league-id", type=int, default=int(os.getenv("ESPN_LEAGUE_ID", DEFAULT_LEAGUE_ID)))
    parser.add_argument("--output", type=Path, help="Write compact draft archive JSON")
    parser.add_argument("--full-output", type=Path, help="Write the ratings-ready recap JSON")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    if not os.getenv("ESPN_S2") or not os.getenv("ESPN_SWID"):
        print("ESPN_S2 and ESPN_SWID must be set for this private league.", file=sys.stderr)
        return 2
    members = load_member_names(args.root)
    try:
        payload = fetch_json(args.season, args.league_id)
        result = normalize_draft(payload, args.season, args.league_id, members)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    archive_text = compact_json(result["archive"])
    full_text = json.dumps({k: v for k, v in result.items() if k != "archive"}, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(archive_text, encoding="utf-8")
        print(f"Wrote {args.output}: {len(result['picks'])} picks, {result['keepers']} keepers")
    if args.full_output:
        args.full_output.parent.mkdir(parents=True, exist_ok=True)
        args.full_output.write_text(full_text, encoding="utf-8")
        print(f"Wrote {args.full_output}: recap for {result['season']}")
    if not args.output and not args.full_output:
        print(full_text, end="")
    if result["in_progress"] or not result["complete"]:
        print("Warning: ESPN still marks this draft incomplete.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
