#!/usr/bin/env python3
"""Deterministic 1048 Gate weekly newspaper generator.

Builds a weekly edition only from checked-in league files. It does not invent
scores, records, standings, transactions, or next-week slates. Every published
claim carries a source trace. Normal publishing refreshes a verified live issue
while games are underway, then replaces it with a verified final edition after
the week completes. Credentials are read only from the environment and are never
written into edition files or logs.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
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
MAX_MANAGER_FEATURES = 2


class GenerationSkip(Exception):
    """A safe, expected refusal to publish an edition."""

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason
        self.detail = detail or reason


class RewriteFailure(Exception):
    """A safe-to-log explanation of why an AI rewrite was rejected."""

    def __init__(self, provider: str, stage: str, detail: str) -> None:
        super().__init__(detail)
        self.provider = provider
        self.stage = stage
        self.detail = detail

    def __str__(self) -> str:
        return f"provider={self.provider} stage={self.stage} {self.detail}"


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


def _story(
    kind: str, title: str, body: str, source: dict[str, str], *, primary_owner: str | None = None,
) -> dict[str, Any]:
    story = {"story_type": kind, "title": title, "body": body, "source": source}
    if primary_owner:
        story["primary_owner"] = primary_owner
    return story


def _load_optional(path: Path) -> Any | None:
    try:
        return read_json(path)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _build_editorial(
    *, season: int, week: int, status: dict[str, Any], facts: list[dict[str, Any]], standings: list[dict[str, Any]],
    leader: dict[str, Any], high_team: dict[str, Any], high_score: float, low_team: dict[str, Any], low_score: float,
    record_body: str, root: Path,
) -> dict[str, Any]:
    closest = min(facts, key=lambda item: item["margin"])
    pressure = next((row for row in standings if int(row.get("losses", 0)) > 0), standings[-1])
    matchup = closest
    final = status["final"]
    status_label = "final" if final else "live"
    standfirst = (
        f"{leader['owner']} leads the verified table after Week {week}, while {pressure['owner']} is already looking for a response."
        if final else
        f"Week {week} is live; {leader['owner']} leads the completed-results table while the current matchup board continues to move."
    )
    lead_body = (
        f"{leader['owner']} owns the Week {week} headline at {int(leader.get('wins', 0))}-{int(leader.get('losses', 0))} with {float(leader.get('pointsFor', 0)):.2f} points for. {high_team['owner']} supplied the league-high score at {high_score:.2f}, while {low_team['owner']} finished at {low_score:.2f}. The completed slate is now part of the season record."
        if final else
        f"{leader['owner']} is first in the completed-results table at {int(leader.get('wins', 0))}-{int(leader.get('losses', 0))} with {float(leader.get('pointsFor', 0)):.2f} points for. On the live Week {week} board, {high_team['owner']} currently has the high score at {high_score:.2f}, while {low_team['owner']} is at {low_score:.2f}. Those live scores can still change."
    )
    matchup_why = (
        f"The closest game on the final board finished with a {matchup['margin']:.2f}-point margin, making it the tightest result of Week {week}."
        if final else
        f"The closest live game currently has a {matchup['margin']:.2f}-point margin, making it the tightest matchup on the Week {week} board right now."
    )
    matchup_edge = (
        f"Verified result: {matchup['winner']['owner']} by {matchup['margin']:.2f} points."
        if final else
        f"Live edge: {matchup['winner']['owner']} by {matchup['margin']:.2f} points."
    )
    pressure_body = (
        f"{pressure['owner']} is {int(pressure.get('wins', 0))}-{int(pressure.get('losses', 0))} after Week {week}. That is an early-season pressure point, not a verdict; the next result determines whether the opening becomes a story."
        if final else
        f"{pressure['owner']} enters the live Week {week} board at {int(pressure.get('wins', 0))}-{int(pressure.get('losses', 0))}. The current matchup can change the direction of that early-season story."
    )
    archive_body = (
        f"Week {week} is now part of the verified Szn {season - 2016} record, but the archive does not turn an opening table into a final ranking. Keep the benchmark; wait for the pattern."
        if final else
        f"Week {week} is still underway in Szn {season - 2016}. The archive keeps completed results separate from the live board, so no unfinished score is treated as a final historical result."
    )
    return {
        "status": status_label,
        "headline": f"The Week {week} table has a shape, but not a verdict",
        "standfirst": standfirst,
        "lead": {
            "title": f"The Week {week} table has a shape, but not a verdict",
            "body": lead_body,
            "sourceIds": ["current-season", "power-rankings"],
        },
        "matchup": {
            "awayTeam": matchup["away"]["team"], "awayOwner": matchup["away"]["owner"], "awayScore": matchup["away_score"],
            "homeTeam": matchup["home"]["team"], "homeOwner": matchup["home"]["owner"], "homeScore": matchup["home_score"],
            "whyItMatters": matchup_why,
            "history": "This is a current-board feature, not a declared rivalry. The archive remains the authority on long-term series claims.",
            "edge": matchup_edge,
            "sourceIds": ["current-season"],
        },
        "tableNotes": [
            {
                "rank": index,
                "team": row["team"],
                "owner": row["owner"],
                "record": f"{int(row.get('wins', 0))}-{int(row.get('losses', 0))}",
                "pointsFor": f"{float(row.get('pointsFor', 0)):.2f}",
                "tag": ("Table leader" if not final else "Highest scoring") if index == 1 else ("Current table" if not final else "Early signal"),
            }
            for index, row in enumerate(standings[:3], start=1)
        ],
        "pressure": {
            "team": pressure["team"], "owner": pressure["owner"], "record": f"{int(pressure.get('wins', 0))}-{int(pressure.get('losses', 0))}",
            "title": f"Under pressure: {pressure['owner']}",
            "body": pressure_body,
            "sourceIds": ["current-season", "seasons"],
        },
        "surprise": {
            "title": "Biggest surprise: the scoring range is already loud",
            "body": f"The gap between {high_team['owner']}'s {high_score:.2f} and {low_team['owner']}'s {low_score:.2f} is {high_score - low_score:.2f} points. " + ("It is a completed Week %d signal, but too early to call a season trend." % week if final else "That is the current live spread, not a final Week %d result." % week),
            "sourceIds": ["current-season"],
        },
        "recordWatch": {
            "title": "Record to watch: the first benchmark is on the board",
            "body": record_body,
            "sourceIds": ["current-season", "matchups"],
        },
        "archiveComparison": {
            "title": "From the archive: early leaders need patience",
            "body": archive_body,
            "linkLabel": "Open the newspaper archive",
            "sourceIds": ["seasons", "newspaper"],
        },
        "editorial_note": (
            f"Week {week} edition generated from the verified final board."
            if final else
            f"Week {week} live edition generated from the verified board. Scores and live edges may change until the slate is final."
        ),
    }

def generate_edition(
    board: dict[str, Any], season: int, week: int, *, allow_incomplete: bool = False,
    root: Path = ROOT, now: datetime | None = None,
) -> dict[str, Any]:
    status = inspect_week(board, season, week)
    live = not status["final"]
    facts = _matchup_facts(status["matchups"])
    biggest = max(facts, key=lambda item: item["margin"])
    closest = min(facts, key=lambda item: item["margin"])
    all_sides = [(fact[key], fact[f"{key}_score"]) for fact in facts for key in ("away", "home")]
    high_team, high_score = max(all_sides, key=lambda pair: pair[1])
    low_team, low_score = min(all_sides, key=lambda pair: pair[1])
    scoreboard_source = _source(
        "data/current-season.json",
        f"season={season};week={week};matchups",
        "Live ESPN matchup board" if live else "Final ESPN matchup board",
    )
    recap_lines = [
        f"{fact['away']['owner']} {fact['away_score']:.2f}–{fact['home_score']:.2f} {fact['home']['owner']}"
        for fact in facts
    ]
    feature_counts: Counter[str] = Counter()

    def feature_story(
        kind: str, owner: str, title: str, body: str, source: dict[str, str],
        *, balanced_title: str, balanced_body: str,
    ) -> dict[str, Any]:
        if feature_counts[owner] < MAX_MANAGER_FEATURES:
            feature_counts[owner] += 1
            return _story(kind, title, body, source, primary_owner=owner)
        return _story(kind, balanced_title, balanced_body, source)

    stories = [
        _story(
            "matchup_recap",
            f"Week {week}: " + ("Live league board" if live else "The league board"),
            "; ".join(recap_lines) + ".",
            scoreboard_source,
        ),
        feature_story(
            "biggest_win", biggest["winner"]["owner"],
            (
                f"{biggest['winner']['owner']} holds the widest live edge"
                if live else f"{biggest['winner']['owner']} delivers the week's biggest win"
            ),
            (
                f"{biggest['winner']['owner']} currently leads {biggest['loser']['owner']} {biggest['winner_score']:.2f}–{biggest['loser_score']:.2f}, a live margin of {biggest['margin']:.2f} points."
                if live else f"{biggest['winner']['owner']} beat {biggest['loser']['owner']} {biggest['winner_score']:.2f}–{biggest['loser_score']:.2f}, a margin of {biggest['margin']:.2f} points."
            ),
            scoreboard_source,
            balanced_title="The widest live margin" if live else "The week's widest margin",
            balanced_body=(
                f"The widest live margin currently stands at {biggest['winner_score']:.2f}–{biggest['loser_score']:.2f}, a gap of {biggest['margin']:.2f} points."
                if live else f"The biggest win finished {biggest['winner_score']:.2f}–{biggest['loser_score']:.2f}, a margin of {biggest['margin']:.2f} points."
            ),
        ),
        feature_story(
            "closest_game", closest["winner"]["owner"],
            (
                f"{closest['winner']['owner']} has the narrowest live edge"
                if live else f"{closest['winner']['owner']} survives the closest finish"
            ),
            (
                f"The tightest live matchup stands {closest['winner_score']:.2f}–{closest['loser_score']:.2f}, with {closest['winner']['owner']} ahead of {closest['loser']['owner']} by {closest['margin']:.2f} points."
                if live else f"The week's tightest matchup finished {closest['winner_score']:.2f}–{closest['loser_score']:.2f}, with {closest['winner']['owner']} ahead of {closest['loser']['owner']} by {closest['margin']:.2f} points."
            ),
            scoreboard_source,
            balanced_title="The closest live margin" if live else "The week's closest finish",
            balanced_body=(
                f"The tightest live matchup stands {closest['winner_score']:.2f}–{closest['loser_score']:.2f}, a margin of {closest['margin']:.2f} points."
                if live else f"The tightest matchup finished {closest['winner_score']:.2f}–{closest['loser_score']:.2f}, a margin of {closest['margin']:.2f} points."
            ),
        ),
        feature_story(
            "scoring_leaders", high_team["owner"],
            f"{high_team['owner']} sets the " + ("current " if live else "") + f"Week {week} pace",
            (
                f"{high_team['owner']} currently has the league-high {high_score:.2f}. {low_team['owner']} is at the current board-low {low_score:.2f}; both scores can still move."
                if live else f"{high_team['owner']} posted the league-high {high_score:.2f}. {low_team['owner']} finished with the week's low score at {low_score:.2f}."
            ),
            scoreboard_source,
            balanced_title=f"Week {week}'s " + ("live scoring range" if live else "scoring range"),
            balanced_body=(
                f"The current league-high score is {high_score:.2f}, while the current board-low is {low_score:.2f}."
                if live else f"The league-high score was {high_score:.2f}, while the week's low score was {low_score:.2f}."
            ),
        ),
    ]

    standings = sorted(status["standings"], key=lambda row: (-int(row.get("wins", 0)), int(row.get("losses", 0)), -float(row.get("pointsFor", 0))))
    leader = standings[0]
    top_three = ", ".join(row["owner"] for row in standings[:3])
    stories.append(feature_story(
        "standings", leader["owner"],
        (
            f"{leader['owner']} leads the completed-results table"
            if live else f"{leader['owner']} leads the verified table"
        ),
        (
            f"During live Week {week}, {leader['owner']} is listed first at {leader.get('wins', 0)}-{leader.get('losses', 0)} with {float(leader.get('pointsFor', 0)):.2f} points for from completed results."
            if live else f"After Week {week}, {leader['owner']} is listed first at {leader.get('wins', 0)}-{leader.get('losses', 0)} with {float(leader.get('pointsFor', 0)):.2f} points for."
        ),
        _source("data/current-season.json", f"season={season};week={week};standings", "Verified standings table"),
        balanced_title=f"The Week {week} standings take shape",
        balanced_body=(
            f"The current completed-results top three during Week {week} are {top_three}."
            if live else f"The verified top three after Week {week} are {top_three}."
        ),
    ))

    rankings = _load_optional(root / "data" / "power-rankings.json")
    if status["final"] and rankings and rankings.get("ratings"):
        rating_rows = {row.get("name"): row for row in rankings["ratings"] if isinstance(row, dict)}
        power_candidates = []
        for fact in facts:
            owner = fact["winner"]["owner"]
            row = rating_rows.get(owner, {})
            rating = row.get("preseasonRating", row.get("rating"))
            if isinstance(rating, (int, float)) and feature_counts[owner] < MAX_MANAGER_FEATURES:
                power_candidates.append((float(rating), -fact["margin"], owner, fact["winner_score"]))
        power_source = _source("data/current-season.json + data/power-rankings.json", f"week={week};ratings", "Weekly results compared with checked-in post-draft ratings")
        if power_candidates:
            rating, _, owner, winner_score = min(power_candidates)
            stories.append(feature_story(
                "power_rankings", owner,
                f"{owner} applies early pressure to the preseason order",
                f"{owner} won in Week {week} with {winner_score:.2f} points after entering the season with a {rating:.1f} post-draft rating.",
                power_source,
                balanced_title="The opening board challenges the preseason order",
                balanced_body=f"The verified Week {week} results can now be compared with the checked-in post-draft ratings.",
            ))
        else:
            stories.append(_story(
                "power_rankings", "The opening board challenges the preseason order",
                f"The verified Week {week} results can now be compared with the checked-in post-draft ratings.",
                power_source,
            ))

    records = _load_optional(root / "data" / "matchups.json") or {}
    archive = records.get("records", {})
    broken = []
    if archive.get("highestScore") and high_score > float(archive["highestScore"][0]): broken.append("highest single-team score")
    if archive.get("biggestBlowout") and biggest["margin"] > float(archive["biggestBlowout"][0]): broken.append("biggest blowout")
    if archive.get("closestGame") and closest["margin"] < float(archive["closestGame"][0]): broken.append("closest game")
    if live:
        record_body = (
            f"The live Week {week} board currently exceeds the checked-in archive mark for {', '.join(broken)}, but no record is declared until the matchup is final."
            if broken else
            f"The live Week {week} board has not yet exceeded the checked-in highest-score, blowout, or closest-game marks. No final record claim is made while games are underway."
        )
        record_title = "Live record watch"
    else:
        record_body = f"Week {week} broke the archive mark for {', '.join(broken)}." if broken else f"Week {week}'s results did not break the checked-in highest-score, blowout, or closest-game marks."
        record_title = "The record book holds" if not broken else "The record book needs an update"
    stories.append(_story("record_watch", record_title, record_body, _source("data/current-season.json + data/matchups.json", f"week={week};records", "Week board compared with archive records")))

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
    if status["final"] and week >= PLAYOFF_PICTURE_WEEK:
        stories.append(_story("playoff_picture", "The playoff picture comes into focus", f"With Week {week} complete, the verified standings now provide the current six-team playoff order.", _source("data/current-season.json", f"season={season};week={week};standings", "Verified standings table")))

    timestamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    editorial = _build_editorial(
        season=season, week=week, status=status, facts=facts, standings=standings,
        leader=leader, high_team=high_team, high_score=high_score, low_team=low_team,
        low_score=low_score, record_body=record_body, root=root,
    )
    return {
        "schema_version": 2, "league_name": "1048 Gate", "season": season,
        "edition_year": season, "week": week, "generated_at": timestamp,
        "source_status": "verified_final" if status["final"] else ("incomplete_override" if allow_incomplete else "verified_live"),
        "validation_status": "valid" if status["final"] or not allow_incomplete else "preview",
        "editorial_policy": {
            "max_primary_features_per_manager": MAX_MANAGER_FEATURES,
            "matchup_recap_exempt": True,
        },
        "source_trace": _source("data/current-season.json", f"season={season};week={week}", "Published ESPN board snapshot"),
        **editorial,
        "stories": stories,
    }


def validate_edition(edition: dict[str, Any], *, publish: bool = True) -> None:
    if not isinstance(edition, dict) or not isinstance(edition.get("stories"), list) or not edition["stories"]:
        raise ValueError("Edition contains no stories.")
    if publish and (
        edition.get("source_status") not in {"verified_live", "verified_final"}
        or edition.get("validation_status") != "valid"
    ):
        raise ValueError("Only verified live or final editions may be published.")
    for story in edition["stories"]:
        if not all(isinstance(story.get(key), str) and story[key].strip() for key in ("story_type", "title", "body")) or not story.get("source"):
            raise ValueError("Every story requires a type, title, body, and source trace.")
    policy = edition.get("editorial_policy", {})
    feature_limit = policy.get("max_primary_features_per_manager", MAX_MANAGER_FEATURES)
    if not isinstance(feature_limit, int) or feature_limit < 1:
        raise ValueError("The manager feature limit must be a positive integer.")
    primary_counts = Counter(
        story["primary_owner"] for story in edition["stories"]
        if story.get("story_type") != "matchup_recap" and story.get("primary_owner")
    )
    overused = [owner for owner, count in primary_counts.items() if count > feature_limit]
    if overused:
        raise ValueError(f"Manager feature limit exceeded: {', '.join(sorted(overused))}.")


def existing_valid_edition(path: Path) -> bool:
    try:
        validate_edition(read_json(path), publish=True)
        return True
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return False


def update_index(index_path: Path, edition: dict[str, Any], path: Path, *, root: Path = ROOT) -> dict[str, Any]:
    index = _load_optional(index_path) or {"schema_version": 1, "league_name": "1048 Gate", "historical": {"path": "data/newspaper_editions/historical_archive.json", "season_start": 2017, "season_end": 2025, "mode": "historical"}, "editions": []}
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


def _facts(edition: dict[str, Any]) -> list[dict[str, Any]]:
    return [{
        "story_type": story["story_type"],
        "title": story["title"],
        "body": story["body"],
        "primary_owner": story.get("primary_owner"),
    } for story in edition["stories"]]


def _verified_rewrite(edition: dict[str, Any], candidates: Any, writing_mode: str) -> dict[str, Any]:
    provider = writing_mode.split("_", 1)[0]
    if not isinstance(candidates, list):
        raise RewriteFailure(provider, "validation", "reason=stories_not_array")
    if len(candidates) != len(edition["stories"]):
        raise RewriteFailure(
            provider,
            "validation",
            f"reason=story_count expected={len(edition['stories'])} actual={len(candidates)}",
        )
    result = json.loads(json.dumps(edition))
    numeric_fallbacks = []
    for index, (original, candidate, output) in enumerate(zip(edition["stories"], candidates, result["stories"]), start=1):
        story_type = original["story_type"]
        if not isinstance(candidate, dict):
            raise RewriteFailure(provider, "validation", f"story={index} story_type={story_type} reason=not_object")
        if candidate.get("story_type") != story_type:
            raise RewriteFailure(
                provider,
                "validation",
                f"story={index} story_type={story_type} reason=story_type_changed",
            )
        title, body = candidate.get("title"), candidate.get("body")
        if not isinstance(title, str) or not title.strip() or not isinstance(body, str) or not body.strip():
            raise RewriteFailure(provider, "validation", f"story={index} story_type={story_type} reason=missing_text")
        expected_numbers = sorted(_numbers(original["title"] + " " + original["body"]))
        actual_numbers = sorted(_numbers(title + " " + body))
        if actual_numbers != expected_numbers:
            numeric_fallbacks.append({"story_type": story_type, "reason": "numbers_changed"})
            continue
        output["title"], output["body"] = title.strip(), body.strip()
    result["writing_mode"] = writing_mode
    if numeric_fallbacks:
        result["rewrite_fallbacks"] = numeric_fallbacks
    return result


def _verified_editorial(edition: dict[str, Any], candidate: Any, provider: str) -> dict[str, Any]:
    editorial_keys = ("status", "headline", "standfirst", "lead", "matchup", "tableNotes", "pressure", "surprise", "recordWatch", "archiveComparison", "editorial_note")
    original = {key: edition[key] for key in editorial_keys if key in edition}
    if not isinstance(candidate, dict) or not isinstance(original, dict):
        raise RewriteFailure(provider, "validation", "reason=editorial_not_object")

    def merge(source: Any, value: Any, path: str) -> Any:
        if isinstance(source, dict):
            if not isinstance(value, dict) or set(source) != set(value):
                raise RewriteFailure(provider, "validation", f"field={path} reason=editorial_shape_changed")
            return {key: merge(source[key], value[key], f"{path}.{key}") for key in source}
        if isinstance(source, list):
            if not isinstance(value, list) or len(source) != len(value):
                raise RewriteFailure(provider, "validation", f"field={path} reason=editorial_array_changed")
            return [merge(left, right, f"{path}[{index}]") for index, (left, right) in enumerate(zip(source, value))]
        if isinstance(source, str):
            if not isinstance(value, str) or not value.strip():
                raise RewriteFailure(provider, "validation", f"field={path} reason=editorial_text_missing")
            if sorted(_numbers(source)) != sorted(_numbers(value)):
                raise RewriteFailure(provider, "validation", f"field={path} reason=editorial_numbers_changed")
            return value.strip()
        if value != source:
            raise RewriteFailure(provider, "validation", f"field={path} reason=editorial_locked_value_changed")
        return source

    result = json.loads(json.dumps(edition))
    result.update(merge(original, candidate, "editorial"))
    result["writing_mode"] = f"{provider}_verified_rewrite"
    return result


def _safe_error_text(value: Any, limit: int = 240) -> str:
    text = re.sub(r"\bsk-[A-Za-z0-9_-]+", "[redacted]", str(value or ""))
    text = " ".join(text.split())
    return text[:limit] or "unavailable"


def _openai_http_failure(error: urllib.error.HTTPError) -> RewriteFailure:
    error_type = "unavailable"
    error_code = "unavailable"
    message = error.reason or "request rejected"
    try:
        payload = json.loads(error.read(8192).decode("utf-8", errors="replace"))
        details = payload.get("error", {}) if isinstance(payload, dict) else {}
        if isinstance(details, dict):
            error_type = details.get("type") or error_type
            error_code = details.get("code") or error_code
            message = details.get("message") or message
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        pass
    request_id = error.headers.get("x-request-id", "unavailable") if error.headers else "unavailable"
    return RewriteFailure(
        "openai",
        "http",
        f"status={error.code} type={_safe_error_text(error_type)} code={_safe_error_text(error_code)} "
        f"request_id={_safe_error_text(request_id)} message={_safe_error_text(message)}",
    )


def _openai_text(payload: dict[str, Any]) -> str:
    if payload.get("status") not in (None, "completed"):
        details = payload.get("incomplete_details") or payload.get("error") or {}
        reason = details.get("reason") if isinstance(details, dict) else details
        raise RewriteFailure(
            "openai",
            "response",
            f"status={_safe_error_text(payload.get('status'))} reason={_safe_error_text(reason)} "
            f"response_id={_safe_error_text(payload.get('id'))}",
        )
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct
    for item in payload.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if isinstance(part, dict) and part.get("type") == "output_text" and isinstance(part.get("text"), str):
                return part["text"]
            if isinstance(part, dict) and part.get("type") == "refusal":
                raise RewriteFailure("openai", "response", "reason=model_refusal")
    raise RewriteFailure(
        "openai",
        "response",
        f"reason=missing_output_text response_id={_safe_error_text(payload.get('id'))}",
    )


def _strict_schema(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {"type": "object", "properties": {key: _strict_schema(item) for key, item in value.items()}, "required": list(value), "additionalProperties": False}
    if isinstance(value, list):
        item = _strict_schema(value[0]) if value else {"type": "string"}
        return {"type": "array", "items": item, "minItems": len(value), "maxItems": len(value)}
    if isinstance(value, bool): return {"type": "boolean"}
    if isinstance(value, int): return {"type": "integer"}
    if isinstance(value, float): return {"type": "number"}
    return {"type": "string"}


def apply_openai_stories(
    edition: dict[str, Any], api_key: str | None = None, *, failures: list[RewriteFailure] | None = None,
) -> dict[str, Any]:
    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        return edition
    facts = _facts(edition)
    editorial_keys = ("status", "headline", "standfirst", "lead", "matchup", "tableNotes", "pressure", "surprise", "recordWatch", "archiveComparison", "editorial_note")
    editorial = {key: edition[key] for key in editorial_keys if key in edition}
    story_schema = {
        "type": "object",
        "properties": {
            "stories": {
                "type": "array",
                "minItems": len(facts),
                "maxItems": len(facts),
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
            },
            "editorial": _strict_schema(editorial),
        },
        "required": ["stories", "editorial"],
        "additionalProperties": False,
    }
    instructions = (
        "Rewrite these verified fantasy-football newspaper briefs and structured editorial fields with a lively local sports-column voice. "
        "Keep the same story count, order, and story_type values. Preserve every factual claim, name, and number exactly. "
        "Within each story, every numeric token must appear exactly as supplied and the same number of times; never spell out, "
        "remove, add, round, or move a number to another story. If a sentence cannot be improved without changing a number, "
        "leave that sentence unchanged. This applies to titles too: do not add a Week number to a title unless that title "
        "already contains it. Make each item cover a distinct angle and vary sentence openings. "
        "Treat primary_owner as locked editorial metadata: no manager may be the primary subject of more than two "
        "feature stories, and the full matchup_recap is exempt. When primary_owner is null, keep the story league-wide "
        "instead of turning it into another manager profile. "
        "Do not add predictions, quotes, injuries, transactions, or facts that are not supplied. Return the editorial object with exactly the same keys, arrays, names, sourceIds, and numeric values; only improve string wording while preserving every numeric token."
    )
    request = urllib.request.Request(
        OPENAI_API_URL,
        data=json.dumps({
            "model": os.getenv("OPENAI_MODEL", OPENAI_MODEL),
            "input": [
                {"role": "system", "content": instructions},
                {"role": "user", "content": json.dumps({"stories": facts, "editorial": editorial}, ensure_ascii=False)},
            ],
            "text": {"format": {"type": "json_schema", "name": "newspaper_rewrite", "strict": True, "schema": story_schema}},
            "max_output_tokens": 4000,
        }).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw_payload = response.read().decode()
        try:
            payload = json.loads(raw_payload)
        except json.JSONDecodeError as error:
            raise RewriteFailure("openai", "response_json", f"reason=invalid_json line={error.lineno}") from error
        try:
            rewritten = json.loads(_openai_text(payload))
        except json.JSONDecodeError as error:
            raise RewriteFailure("openai", "output_json", f"reason=invalid_json line={error.lineno}") from error
        if not isinstance(rewritten, dict):
            raise RewriteFailure("openai", "output_json", "reason=expected_object")
        rewritten_edition = _verified_rewrite(edition, rewritten.get("stories"), "openai_verified_rewrite")
        return _verified_editorial(rewritten_edition, rewritten.get("editorial"), "openai")
    except urllib.error.HTTPError as error:
        failure = _openai_http_failure(error)
    except RewriteFailure as error:
        failure = error
    except urllib.error.URLError as error:
        failure = RewriteFailure("openai", "network", f"reason={_safe_error_text(error.reason)}")
    except (OSError, KeyError, TypeError, ValueError) as error:
        failure = RewriteFailure("openai", "client", f"reason={_safe_error_text(type(error).__name__)}")
    if failures is not None:
        failures.append(failure)
    return edition


def _report_rewrite_failures(failures: list[RewriteFailure], *, fatal: bool) -> None:
    label = "ERROR" if fatal else "WARNING"
    for failure in failures:
        print(f"{label} AI_REWRITE {failure}", file=sys.stderr)


def _require_failure(writing: str) -> RewriteFailure:
    providers = "openai,grok" if writing == "auto" else writing
    return RewriteFailure(providers, "configuration", "reason=no_verified_rewrite")


def apply_grok_stories(
    edition: dict[str, Any], api_key: str | None = None, *, failures: list[RewriteFailure] | None = None,
) -> dict[str, Any]:
    key = api_key or os.getenv("XAI_API_KEY") or os.getenv("GROK_API_KEY")
    if not key:
        return edition
    facts = _facts(edition)
    request = urllib.request.Request(GROK_API_URL, data=json.dumps({"model": GROK_MODEL, "temperature": 0.2, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": "Rewrite only for style. Preserve every fact and number. Respect the locked primary_owner assignments, keep null-primary stories league-wide, and never make one manager the primary subject of more than two feature stories; matchup_recap is exempt. Return JSON with a stories array in the same order."}, {"role": "user", "content": json.dumps({"stories": facts}, ensure_ascii=False)}]}).encode(), headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode())
        content = payload["choices"][0]["message"]["content"]
        rewritten = json.loads(content) if isinstance(content, str) else content
        return _verified_rewrite(edition, rewritten.get("stories"), "grok_verified_rewrite")
    except RewriteFailure as error:
        failure = error
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        failure = RewriteFailure("grok", "client", f"reason={_safe_error_text(type(error).__name__)}")
    if failures is not None:
        failures.append(failure)
    return edition


def apply_ai_stories(edition: dict[str, Any], writing: str = "auto", *, require_verified: bool = False) -> dict[str, Any]:
    failures: list[RewriteFailure] = []
    if writing in {"auto", "openai"}:
        result = apply_openai_stories(edition, failures=failures)
        if result.get("writing_mode") == "openai_verified_rewrite" or writing == "openai":
            if result.get("writing_mode") == "openai_verified_rewrite":
                return result
    if writing in {"auto", "grok"}:
        result = apply_grok_stories(edition, failures=failures)
        if result.get("writing_mode") == "grok_verified_rewrite":
            return result
    if writing != "deterministic":
        if not failures:
            failures.append(_require_failure(writing))
        _report_rewrite_failures(failures, fatal=require_verified)
        if require_verified:
            raise RewriteFailure("all", "rewrite", "reason=no_verified_rewrite")
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
        existing = _load_optional(path) if replacing else None
        previous_status = existing.get("source_status") if isinstance(existing, dict) else None
        if replacing and previous_status == "verified_final" and not args.regenerate and not args.allow_incomplete and not args.stdout:
            print(f"SKIP {SKIP_DUPLICATE}: {path.relative_to(ROOT)} already contains a verified final edition.")
            return 0
        edition = generate_edition(board, args.season, week, allow_incomplete=args.allow_incomplete, root=ROOT)
        writing = args.writing
        if edition.get("source_status") == "verified_live" and writing == "auto" and not args.regenerate:
            writing = "deterministic"
        edition = apply_ai_stories(
            edition,
            writing,
            require_verified=args.regenerate or writing in {"openai", "grok"},
        )
        validate_edition(edition, publish=not args.allow_incomplete)
        if args.allow_incomplete or args.stdout:
            print(json.dumps(edition, indent=2, ensure_ascii=False))
            return 0
        write_json(path, edition)
        update_index(EDITIONS_ROOT / "index.json", edition, path, root=ROOT)
        if not replacing:
            action = "Published"
        elif previous_status == "verified_live" and edition.get("source_status") == "verified_final":
            action = "Finalized"
        elif edition.get("source_status") == "verified_live":
            action = "Refreshed"
        else:
            action = "Replaced"
        print(f"{action} {path.relative_to(ROOT)} with {len(edition['stories'])} sourced stories ({edition.get('writing_mode', 'deterministic')}).")
        return 0
    except GenerationSkip as skip:
        print(f"SKIP {skip.reason}: {skip.detail}")
        return 0
    except RewriteFailure as error:
        preserved = f" Preserved {path.relative_to(ROOT)}." if 'path' in locals() and replacing else ""
        print(f"ERROR AI_REWRITE_FAILED {error}.{preserved}", file=sys.stderr)
        return 1
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
