import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_newspaper import (
    GenerationSkip, apply_grok_stories, edition_path, existing_valid_edition,
    generate_edition, inspect_week, main, update_index, validate_edition,
)
