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
SKIP_LIVE = "week_not_final"
SKIP_INCOMPLETE = "data_incomplete"
SKIP_INVALID = "invalid_scores"
SKIP_DUPLICATE = "edition_already_published"
SKIP_MISSING = "missing_data"
FINAL_WINNERS = {"HOME", "AWAY", "TIE"}
