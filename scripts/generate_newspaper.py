#!/usr/bin/env python3
"""Deterministic 1048 Gate weekly newspaper generator.

Builds a weekly edition only from checked-in league files. It does not invent
scores, records, standings, transactions, or next-week slates. Every published
claim carries a source trace. Normal publishing requires a finalized week.
Credentials are read only from the environment and are never written into
edition files or logs.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CURRENT_PATH = ROOT / "data" / "current-season.json"
EDITIONS_ROOT = ROOT / "data" / "newspaper_editions"
EXPECTED_MATCHUPS = 6
EXPECTED_TEAMS = 12
PLAYOFF_PICTURE_WEEK = 10
GROK_API_URL = "https://api.x.ai/v1/chat/completions"
GROK_MODEL = "grok-4-fast-non-reasoning"
OPENAI_API_URL = "https://api.openai.com/v1/responses"
OPENAI_MODEL = "gpt-5.6-luna"
SKIP_LIVE = "week_not_final"
SKIP_INCOMPLETE = "data_incomplete"
SKIP_INVALID = "invalid_scores"
SKIP_DUPLICATE = "edition_already_published"
SKIP_MISSING = "missing_data"
FINAL_WINNERS = {"HOME", "AWAY", "TIE"}


class GenerationSkip(Exception):
    """A safe, expected refusal to publish an edition."""

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason
        self.detail = detail or reason


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def edition_path(season: int, week: int, root: Path = EDITIONS_ROOT) -> Path:
    return root / str(season) / f"week_{week:02d}.json"


def _score(side: dict[str, Any]) -> float:
    value = side.get("score")
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise GenerationSkip(SKIP_INVALID, "Every matchup must contain two non-negative numeric scores.")
    return round(float(value), 2)


def inspect_week(board: dict[str, Any], season: int, week: int) -> dict[str, Any]:
    if not isinstance(board, dict) or board.get("season") != season:
        raise GenerationSkip(SKIP_MISSING, f"No current-season board is available for {season}.")
    matchups = [game for game in board.get("matchups", []) if game.get("week", board.get("week")) == week]
    if len(matchups) != EXPECTED_MATCHUPS:
        raise GenerationSkip(SKIP_INCOMPLETE, f"Expected {EXPECTED_MATCHUPS} matchups for Week {week}; found {len(matchups)}.")
    team_ids: set[Any] = set()
    live = 0
    for game in matchups:
        for key in ("away", "home"):
            side = game.get(key)
            if not isinstance(side, dict) or side.get("teamId") is None or not side.get("owner"):
                raise GenerationSkip(SKIP_INCOMPLETE, "A matchup is missing a team or owner.")
            _score(side)
            team_ids.add(side["teamId"])
        state = str(game.get("state", "")).lower()
        winner = str(game.get("winner", "")).upper()
        if state != "final" or winner not in FINAL_WINNERS:
            live += 1
    if len(team_ids) != EXPECTED_TEAMS:
        raise GenerationSkip(SKIP_INCOMPLETE, f"Expected {EXPECTED_TEAMS} unique teams; found {len(team_ids)}.")
    standings = board.get("standings")
    if not isinstance(standings, list) or len(standings) != EXPECTED_TEAMS:
        raise GenerationSkip(SKIP_INCOMPLETE, "The standings table is incomplete.")
    return {"matchups": matchups, "standings": standings, "live": live, "final": live == 0}


def _source(dataset: str, locator: str, description: str) -> dict[str, str]:
    return {"dataset": dataset, "locator": locator, "description": description}


def _matchup_facts(matchups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    facts = []
    for game in matchups:
        away, home = game["away"], game["home"]
        away_score, home_score = _score(away), _score(home)
        if away_score == home_score:
            winner, loser, margin = away, home, 0.0
        elif away_score > home_score:
            winner, loser, margin = away, home, away_score - home_score
        else:
            winner, loser, margin = home, away, home_score - away_score
        facts.append({
            "game": game, "away": away, "home": home, "away_score": away_score,
            "home_score": home_score, "winner": winner, "loser": loser,
            "winner_score": max(away_score, home_score), "loser_score": min(away_score, home_score),
            "margin": round(margin, 2), "combined": round(away_score + home_score, 2),
        })
    return facts


def _story(kind: str, title: str, body: str, source: dict[str, str]) -> dict[str, Any]:
    return {"story_type": kind, "title": title, "body": body, "source": source}


def _load_optional(path: Path) -> Any | None:
    try:
        return read_json(path)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def generate_edition(
    board: dict[str, Any], season: int, week: int, *, allow_incomplete: bool = False,
    root: Path = ROOT, now: datetime | None = None,
) -> dict[str, Any]:
    status = inspect_week(board, season, week)
    if status["live"] and not allow_incomplete:
        raise GenerationSkip(SKIP_LIVE, f"Week {week} has {status['live']} matchup(s) still underway.")
    facts = _matchup_facts(status["matchups"])
    biggest = max(facts, key=lambda item: item["margin"])
    closest = min(facts, key=lambda item: item["margin"])
    all_sides = [(fact[key], fact[f"{key}_score"]) for fact in facts for key in ("away", "home")]
    high_team, high_score = max(all_sides, key=lambda pair: pair[1])
    low_team, low_score = min(all_sides, key=lambda pair: pair[1])
    scoreboard_source = _source("data/current-season.json", f"season={season};week={week};matchups", "Final ESPN matchup board")
    recap_lines = [
        f"{fact['away']['owner']} {fact['away_score']:.2f}–{fact['home_score']:.2f} {fact['home']['owner']}"
        for fact in facts
    ]
    stories = [
        _story("matchup_recap", f"Week {week}: The league board", "; ".join(recap_lines) + ".", scoreboard_source),
        _story("biggest_win", f"{biggest['winner']['owner']} delivers the week's biggest win", f"{biggest['winner']['owner']} beat {biggest['loser']['owner']} {biggest['winner_score']:.2f}–{biggest['loser_score']:.2f}, a margin of {biggest['margin']:.2f} points.", scoreboard_source),
        _story("closest_game", f"{closest['winner']['owner']} survives the closest finish", f"The week's tightest matchup finished {closest['winner_score']:.2f}–{closest['loser_score']:.2f}, with {closest['winner']['owner']} ahead of {closest['loser']['owner']} by {closest['margin']:.2f} points.", scoreboard_source),
        _story("scoring_leaders", f"{high_team['owner']} sets the Week {week} pace", f"{high_team['owner']} posted the league-high {high_score:.2f}. {low_team['owner']} finished with the week's low score at {low_score:.2f}.", scoreboard_source),
    ]

    standings = sorted(status["standings"], key=lambda row: (-int(row.get("wins", 0)), int(row.get("losses", 0)), -float(row.get("pointsFor", 0))))
    leader = standings[0]
    stories.append(_story("standings", f"{leader['owner']} leads the verified table", f"After Week {week}, {leader['owner']} is listed first at {leader.get('wins', 0)}-{leader.get('losses', 0)} with {float(leader.get('pointsFor', 0)):.2f} points for.", _source("data/current-season.json", f"season={season};week={week};standings", "Verified standings table")))

    rankings = _load_optional(root / "data" / "power-rankings.json")
    if rankings and rankings.get("ratings"):
        preseason = {row.get("name"): row.get("rating") for row in rankings["ratings"]}
        rating = preseason.get(high_team["owner"])
        detail = f" Their post-draft rating was {float(rating):.1f}." if isinstance(rating, (int, float)) else ""
        stories.append(_story("power_rankings", f"The opening board challenges the preseason order", f"Week {week}'s top score belongs to {high_team['owner']} at {high_score:.2f}.{detail}", _source("data/current-season.json + data/power-rankings.json", f"week={week};owner={high_team['owner']}", "Weekly score compared with checked-in post-draft ratings")))

    records = _load_optional(root / "data" / "matchups.json") or {}
    archive = records.get("records", {})
    broken = []
    if archive.get("highestScore") and high_score > float(archive["highestScore"][0]): broken.append("highest single-team score")
    if archive.get("biggestBlowout") and biggest["margin"] > float(archive["biggestBlowout"][0]): broken.append("biggest blowout")
    if archive.get("closestGame") and closest["margin"] < float(archive["closestGame"][0]): broken.append("closest game")
    record_body = f"Week {week} broke the archive mark for {', '.join(broken)}." if broken else f"Week {week}'s results did not break the checked-in highest-score, blowout, or closest-game marks."
    stories.append(_story("record_watch", "The record book holds" if not broken else "The record book needs an update", record_body, _source("data/current-season.json + data/matchups.json", f"week={week};records", "Week results compared with archive records")))

    pairs = records.get("pairs", [])
    current_owners = {fact[key]["owner"] for fact in facts for key in ("away", "home")}
    for pair in pairs:
        if len(pair) >= 3 and pair[0] in current_owners and pair[1] in current_owners:
            a, b, series = pair[0], pair[1], pair[2]
            stories.append(_story("rivalry", f"Rivalry file: {a} and {b}", f"The archive lists the all-time series at {int(series[0])}-{int(series[1])}-{int(series[2])} from {int(series[0])+int(series[1])+int(series[2])} meetings.", _source("data/matchups.json", f"pair={a}|{b}", "All-time head-to-head archive")))
            break

    transaction_candidates = [root / "data" / "transactions" / f"{season}.json", root / "data" / f"transactions-{season}.json"]
    transactions = next((value for path in transaction_candidates if (value := _load_optional(path))), None)
    rows = transactions.get("transactions", transactions if isinstance(transactions, list) else []) if transactions else []
    week_rows = [row for row in rows if row.get("week") == week]
    if week_rows:
        stories.append(_story("transactions", f"Week {week} wire activity", f"The checked-in transaction snapshot contains {len(week_rows)} move{'s' if len(week_rows) != 1 else ''} for Week {week}.", _source(str(transaction_candidates[0].relative_to(root)), f"week={week}", "Checked-in transaction snapshot")))

    next_board = _load_optional(root / "data" / "current-season-weeks" / f"week_{week + 1:02d}.json")
    if next_board and len(next_board.get("matchups", [])) == EXPECTED_MATCHUPS:
        stories.append(_story("next_week", f"Next: Week {week + 1}", f"The verified Week {week + 1} board contains all {EXPECTED_MATCHUPS} scheduled matchups.", _source(f"data/current-season-weeks/week_{week + 1:02d}.json", f"week={week + 1}", "Checked-in next-week slate")))
    if week >= PLAYOFF_PICTURE_WEEK:
        stories.append(_story("playoff_picture", "The playoff picture comes into focus", f"With Week {week} complete, the verified standings now provide the current six-team playoff order.", _source("data/current-season.json", f"season={season};week={week};standings", "Verified standings table")))

    timestamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": 1, "league_name": "1048 Gate", "season": season,
        "edition_year": season, "week": week, "generated_at": timestamp,
        "source_status": "verified_final" if status["final"] else "incomplete_override",
        "validation_status": "valid" if status["final"] else "preview",
        "source_trace": _source("data/current-season.json", f"season={season};week={week}", "Published ESPN board snapshot"),
        "stories": stories,
    }


def validate_edition(edition: dict[str, Any], *, publish: bool = True) -> None:
    if not isinstance(edition, dict) or not isinstance(edition.get("stories"), list) or not edition["stories"]:
        raise ValueError("Edition contains no stories.")
    if publish and (edition.get("source_status") != "verified_final" or edition.get("validation_status") != "valid"):
        raise ValueError("Only verified final editions may be published.")
    for story in edition["stories"]:
        if not all(isinstance(story.get(key), str) and story[key].strip() for key in ("story_type", "title", "body")) or not story.get("source"):
            raise ValueError("Every story requires a type, title, body, and source trace.")


def existing_valid_edition(path: Path) -> bool:
    try:
        validate_edition(read_json(path), publish=True)
        return True
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return False


def update_index(index_path: Path, edition: dict[str, Any], path: Path, *, root: Path = ROOT) -> dict[str, Any]:
    index = _load_optional(index_path) or {"schema_version": 1, "league_name": "1048 Gate", "historical": {"path": "data/newspaper_editions/historical_2023.json", "season": 2023, "mode": "historical"}, "editions": []}
    relative = path.relative_to(root).as_posix()
    entry = {"path": relative, "season": edition["season"], "week": edition["week"], "mode": "weekly", "published_at": edition["generated_at"], "source_status": edition["source_status"], "validation_status": edition["validation_status"]}
    editions = [item for item in index.get("editions", []) if not (item.get("season") == edition["season"] and item.get("week") == edition["week"])]
    editions.append(entry)
    editions.sort(key=lambda item: (item.get("season", 0), item.get("week", 0)), reverse=True)
    index["editions"] = editions
    index["updated_at"] = edition["generated_at"]
    write_json(index_path, index)
    return index


def _numbers(value: str) -> list[str]:
    return re.findall(r"(?<![A-Za-z])\d+(?:\.\d+)?", value)


def _facts(edition: dict[str, Any]) -> list[dict[str, str]]:
    return [{"story_type": story["story_type"], "title": story["title"], "body": story["body"]} for story in edition["stories"]]


def _verified_rewrite(edition: dict[str, Any], candidates: Any, writing_mode: str) -> dict[str, Any]:
    if not isinstance(candidates, list) or len(candidates) != len(edition["stories"]):
        return edition
    result = json.loads(json.dumps(edition))
    for original, candidate, output in zip(edition["stories"], candidates, result["stories"]):
        if not isinstance(candidate, dict) or candidate.get("story_type") != original["story_type"]:
            return edition
        title, body = candidate.get("title"), candidate.get("body")
        if not isinstance(title, str) or not title.strip() or not isinstance(body, str) or not body.strip():
            return edition
        if sorted(_numbers(title + " " + body)) != sorted(_numbers(original["title"] + " " + original["body"])):
            return edition
        output["title"], output["body"] = title.strip(), body.strip()
    result["writing_mode"] = writing_mode
    return result


def _openai_text(payload: dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct
    for item in payload.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if isinstance(part, dict) and part.get("type") == "output_text" and isinstance(part.get("text"), str):
                return part["text"]
    raise KeyError("OpenAI response did not contain output text.")


def apply_openai_stories(edition: dict[str, Any], api_key: str | None = None) -> dict[str, Any]:
    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        return edition
    facts = _facts(edition)
    story_schema = {
        "type": "object",
        "properties": {
            "stories": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "story_type": {"type": "string"},
                        "title": {"type": "string"},
                        "body": {"type": "string"},
                    },
                    "required": ["story_type", "title", "body"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["stories"],
        "additionalProperties": False,
    }
    instructions = (
        "Rewrite these verified fantasy-football newspaper briefs with a lively local sports-column voice. "
        "Keep the same story count, order, and story_type values. Preserve every factual claim, name, and number exactly. "
        "Make each item cover a distinct angle, vary sentence openings, and avoid repeating a score when it is not needed. "
        "Do not add predictions, quotes, injuries, transactions, or facts that are not supplied."
    )
    request = urllib.request.Request(
        OPENAI_API_URL,
        data=json.dumps({
            "model": os.getenv("OPENAI_MODEL", OPENAI_MODEL),
            "input": [
                {"role": "system", "content": instructions},
                {"role": "user", "content": json.dumps({"stories": facts}, ensure_ascii=False)},
            ],
            "text": {"format": {"type": "json_schema", "name": "newspaper_rewrite", "strict": True, "schema": story_schema}},
            "max_output_tokens": 4000,
        }).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode())
        rewritten = json.loads(_openai_text(payload))
        return _verified_rewrite(edition, rewritten.get("stories"), "openai_verified_rewrite")
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return edition


def apply_grok_stories(edition: dict[str, Any], api_key: str | None = None) -> dict[str, Any]:
    key = api_key or os.getenv("XAI_API_KEY") or os.getenv("GROK_API_KEY")
    if not key:
        return edition
    facts = _facts(edition)
    request = urllib.request.Request(GROK_API_URL, data=json.dumps({"model": GROK_MODEL, "temperature": 0.2, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": "Rewrite only for style. Preserve every fact and number. Return JSON with a stories array in the same order."}, {"role": "user", "content": json.dumps({"stories": facts}, ensure_ascii=False)}]}).encode(), headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode())
        content = payload["choices"][0]["message"]["content"]
        rewritten = json.loads(content) if isinstance(content, str) else content
        return _verified_rewrite(edition, rewritten.get("stories"), "grok_verified_rewrite")
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return edition


def apply_ai_stories(edition: dict[str, Any], writing: str = "auto") -> dict[str, Any]:
    if writing in {"auto", "openai"}:
        result = apply_openai_stories(edition)
        if result.get("writing_mode") == "openai_verified_rewrite" or writing == "openai":
            return result
    if writing in {"auto", "grok"}:
        return apply_grok_stories(edition)
    return edition


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--week", type=int)
    parser.add_argument("--allow-incomplete", action="store_true")
    parser.add_argument("--regenerate", action="store_true", help="Replace an existing valid edition only after a verified AI rewrite.")
    parser.add_argument("--stdout", action="store_true")
    parser.add_argument("--writing", choices=("deterministic", "auto", "openai", "grok"), default="deterministic")
    args = parser.parse_args(argv)
    try:
        board = read_json(CURRENT_PATH)
        week = args.week or int(board.get("week", 0))
        path = edition_path(args.season, week, EDITIONS_ROOT)
        replacing = existing_valid_edition(path)
        if replacing and not args.regenerate and not args.allow_incomplete and not args.stdout:
            print(f"SKIP {SKIP_DUPLICATE}: {path.relative_to(ROOT)} already contains a valid edition.")
            return 0
        edition = generate_edition(board, args.season, week, allow_incomplete=args.allow_incomplete, root=ROOT)
        edition = apply_ai_stories(edition, args.writing)
        validate_edition(edition, publish=not args.allow_incomplete)
        if args.allow_incomplete or args.stdout:
            print(json.dumps(edition, indent=2, ensure_ascii=False))
            return 0
        if replacing and not str(edition.get("writing_mode", "")).endswith("_verified_rewrite"):
            print(f"SKIP rewrite_failed: Preserved {path.relative_to(ROOT)} because no verified AI rewrite was produced.")
            return 0
        write_json(path, edition)
        update_index(EDITIONS_ROOT / "index.json", edition, path, root=ROOT)
        action = "Replaced" if replacing else "Published"
        print(f"{action} {path.relative_to(ROOT)} with {len(edition['stories'])} sourced stories ({edition.get('writing_mode', 'deterministic')}).")
        return 0
    except GenerationSkip as skip:
        print(f"SKIP {skip.reason}: {skip.detail}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
