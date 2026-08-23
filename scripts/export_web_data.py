#!/usr/bin/env python3
"""
Export the 1048 Gate SQLite history database into website-friendly JSON.

Current export:
    data/members.json

Run from the repository root:
    python3 scripts/export_web_data.py 1048_gate.db

If the database is named 1048_gate.db and is in the repository root:
    python3 scripts/export_web_data.py
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path


START_YEAR = 2017
END_YEAR = 2025

# Fallback roster used only when the database has not been migrated yet
# (no members/owner_aliases tables). Prefer the database tables: they are the
# canonical identity source maintained by espn-fantasy-history-toolkit/migrate.sql.
FALLBACK_MEMBERS = [
    {
        "number": "01",
        "name": "George Travis",
        "role": "Commissioner",
        "owner_ids": ["{FACABF18-8353-4007-83E6-0962A870FB65}"],
    },
    {
        "number": "02",
        "name": "Jared Hall",
        "role": "League Member",
        "owner_ids": ["{AA315F1C-BD33-466B-B957-9CD596A34D89}"],
    },
    {
        "number": "03",
        "name": "Kyle Fowler",
        "role": "League Member",
        "owner_ids": ["{BC03B527-5EBB-4094-B93D-7E3B670D3609}"],
    },
    {
        "number": "04",
        "name": "Bryan Hunt",
        "role": "League Member",
        "owner_ids": [
            "{15065ABE-4502-449A-8123-76C28506E06D}",
            "{17F7DFE0-C849-4652-86AC-723DBEF508AC}",
        ],
    },
    {
        "number": "05",
        "name": "Brian Heino",
        "role": "League Member",
        "owner_ids": ["{D2A3BA81-320E-4EA2-9C36-B02F7439AC48}"],
    },
    {
        "number": "06",
        "name": "Vincent Cannarozzi",
        "role": "League Member",
        "owner_ids": ["{BD2A33C0-1FF6-4BB4-AA33-C01FF6CBB45B}"],
    },
    {
        "number": "07",
        "name": "James Brochu",
        "role": "League Member",
        "owner_ids": ["{C19F89F4-148C-4C4F-BFDA-7DA05E0839DC}"],
    },
    {
        "number": "08",
        "name": "JD Daley",
        "role": "League Member",
        "owner_ids": ["{D448C8DD-83C3-4C9B-8E18-0C6842D29C00}"],
    },
    {
        "number": "09",
        "name": "Thomas Speer",
        "role": "League Member",
        "owner_ids": [
            "{F0195AC7-78B8-4577-AEB7-D471AC5D64EF}",
            "{557F5048-981A-445C-95A1-EC1487D98327}",
        ],
    },
    {
        "number": "10",
        "name": "Collin Krum",
        "role": "League Member",
        "owner_ids": ["{ED477261-26A1-4CE7-9177-D9AFDD087AAB}"],
    },
    {
        "number": "11",
        "name": "German Haro",
        "role": "League Member",
        "owner_ids": ["{08C42AF9-ED50-4BD6-9CA5-58C7C2B2F442}"],
    },
    {
        "number": "12",
        "name": "Trevor Hash",
        "role": "League Member",
        "owner_ids": ["{B44F52B3-EAA6-4863-9C6B-82578AFE2C69}"],
    },
]

# Kept for un-migrated databases. A migrated database carries these finishes
# in teams.final_standing (see espn-fantasy-history-toolkit/migrate.sql).
EARLY_FINAL_FINISH = {
    2017: {
        "{FACABF18-8353-4007-83E6-0962A870FB65}": 2,
        "{AA315F1C-BD33-466B-B957-9CD596A34D89}": 1,
        "{BC03B527-5EBB-4094-B93D-7E3B670D3609}": 8,
        "{15065ABE-4502-449A-8123-76C28506E06D}": 6,
        "{D2A3BA81-320E-4EA2-9C36-B02F7439AC48}": 7,
        "{BD2A33C0-1FF6-4BB4-AA33-C01FF6CBB45B}": 12,
        "{D448C8DD-83C3-4C9B-8E18-0C6842D29C00}": 9,
        "{F0195AC7-78B8-4577-AEB7-D471AC5D64EF}": 11,
    },
    2018: {
        "{FACABF18-8353-4007-83E6-0962A870FB65}": 2,
        "{AA315F1C-BD33-466B-B957-9CD596A34D89}": 3,
        "{BC03B527-5EBB-4094-B93D-7E3B670D3609}": 1,
        "{15065ABE-4502-449A-8123-76C28506E06D}": 7,
        "{D2A3BA81-320E-4EA2-9C36-B02F7439AC48}": 8,
        "{BD2A33C0-1FF6-4BB4-AA33-C01FF6CBB45B}": 5,
        "{D448C8DD-83C3-4C9B-8E18-0C6842D29C00}": 4,
        "{F0195AC7-78B8-4577-AEB7-D471AC5D64EF}": 11,
        "{B44F52B3-EAA6-4863-9C6B-82578AFE2C69}": 10,
    },
}


def clean_team_name(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def record_text(wins: int, losses: int, ties: int) -> str:
    return f"{wins}-{losses}-{ties}" if ties else f"{wins}-{losses}"


def load_members(conn: sqlite3.Connection) -> list[dict]:
    """Read the canonical roster from migrated tables, or fall back."""

    try:
        rows = conn.execute(
            """
            SELECT member_id, member_number, name, role
            FROM members
            WHERE is_current = 1
            ORDER BY member_number
            """
        ).fetchall()
        aliases = conn.execute("SELECT owner_id, member_id FROM owner_aliases").fetchall()
    except sqlite3.OperationalError:
        return FALLBACK_MEMBERS

    by_member: dict[int, list[str]] = {}
    for alias in aliases:
        by_member.setdefault(alias["member_id"], []).append(alias["owner_id"])

    members = []
    for row in rows:
        members.append(
            {
                "number": row["member_number"],
                "name": row["name"],
                "role": row["role"],
                "owner_ids": by_member.get(row["member_id"], []),
            }
        )
    return members


def export_member(conn: sqlite3.Connection, member: dict) -> dict:
    placeholders = ",".join("?" for _ in member["owner_ids"])

    rows = conn.execute(
        f"""
        SELECT
            year,
            owner_id,
            team_name,
            wins,
            losses,
            ties,
            points_for,
            points_against,
            final_standing
        FROM teams
        WHERE owner_id IN ({placeholders})
          AND year BETWEEN ? AND ?
        ORDER BY year
        """,
        [*member["owner_ids"], START_YEAR, END_YEAR],
    ).fetchall()

    seasons = []

    for row in rows:
        year = int(row["year"])
        owner_id = row["owner_id"]

        finish = int(row["final_standing"] or 0)
        if finish <= 0:
            finish = EARLY_FINAL_FINISH.get(year, {}).get(owner_id)

        wins = int(row["wins"] or 0)
        losses = int(row["losses"] or 0)
        ties = int(row["ties"] or 0)

        # This array shape intentionally mirrors the site's current app.js:
        # [year, finish, team name, record, points for, points against]
        seasons.append(
            [
                year,
                finish,
                clean_team_name(row["team_name"]),
                record_text(wins, losses, ties),
                round(float(row["points_for"]), 2)
                if row["points_for"] is not None
                else None,
                round(float(row["points_against"]), 2)
                if row["points_against"] is not None
                else None,
            ]
        )

    return {
        "number": member["number"],
        "name": member["name"],
        "role": member["role"],
        "seasons": seasons,
    }


def validate(members: list[dict]) -> None:
    if len(members) != 12:
        raise RuntimeError(f"Expected 12 Members-page members, found {len(members)}")

    seen_numbers = set()
    for member in members:
        number = member["number"]
        if number in seen_numbers:
            raise RuntimeError(f"Duplicate member number: {number}")
        seen_numbers.add(number)

        years = [season[0] for season in member["seasons"]]
        if len(years) != len(set(years)):
            raise RuntimeError(f"Duplicate season detected for {member['name']}")

        if years != sorted(years):
            raise RuntimeError(f"Seasons are not sorted for {member['name']}")

        for season in member["seasons"]:
            year, finish = season[0], season[1]
            if not START_YEAR <= year <= END_YEAR:
                raise RuntimeError(
                    f"Unexpected season {year} for {member['name']}"
                )
            if finish is None:
                raise RuntimeError(
                    f"Missing final finish for {member['name']} in {year}"
                )


def main() -> None:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[1]

    db_path = (
        Path(sys.argv[1]).expanduser().resolve()
        if len(sys.argv) > 1
        else repo_root / "1048_gate.db"
    )

    if not db_path.exists():
        raise SystemExit(
            f"Database not found: {db_path}\n"
            "Pass the database path explicitly, for example:\n"
            "python3 scripts/export_web_data.py /path/to/1048_gate.db"
        )

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        members = [export_member(conn, member) for member in load_members(conn)]
    finally:
        conn.close()

    validate(members)

    payload = {
        "schemaVersion": 1,
        "seasonRange": {"from": START_YEAR, "to": END_YEAR},
        "members": members,
    }

    output_dir = repo_root / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "members.json"

    output_path.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    season_rows = sum(len(member["seasons"]) for member in members)

    print(f"Wrote: {output_path}")
    print(f"Members: {len(members)}")
    print(f"Member-season rows: {season_rows}")
    print(f"Season range: {START_YEAR}-{END_YEAR}")


if __name__ == "__main__":
    main()
