import io, json, sys, tempfile, unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_newspaper as paper

OWNERS = ["Hunt", "Daley", "Speer", "Travis", "Hash", "Fowler", "Haro", "Krum", "Cannarozzi", "Hall", "Brochu", "Heino"]
SCORES = [122.16, 112.26, 96.5, 88.32, 150.76, 70.12, 101.62, 64.12, 126.6, 80.6, 120.86, 41.8]

def board():
    games, standings = [], []
    for i in range(6):
        sides = [{"teamId": i*2+j+1, "team": OWNERS[i*2+j]+" Team", "owner": OWNERS[i*2+j], "score": SCORES[i*2+j]} for j in range(2)]
        winner = "AWAY" if sides[0]["score"] > sides[1]["score"] else "HOME"
        games.append({"id": i+1, "week": 1, "state": "final", "winner": winner, "away": sides[0], "home": sides[1]})
        for j, side in enumerate(sides):
            won = int((j == 0 and winner == "AWAY") or (j == 1 and winner == "HOME"))
            standings.append({"teamId": side["teamId"], "team": side["team"], "owner": side["owner"], "wins": won, "losses": 1-won, "ties": 0, "pointsFor": side["score"], "pointsAgainst": sides[1-j]["score"]})
    return {"season": 2026, "week": 1, "standings": standings, "matchups": games}

class NewspaperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        data = self.root / "data"; data.mkdir()
        (data / "power-rankings.json").write_text(json.dumps({"ratings":[{"name":"Hash","rating":37.2}]}))
        (data / "matchups.json").write_text(json.dumps({"records":{"highestScore":[235.64],"biggestBlowout":[137.42],"closestGame":[0.08]},"pairs":[["Hunt","Daley",[5,8,0,0,0]]]}))
    def tearDown(self): self.tmp.cleanup()
    def make(self, value=None, **kw): return paper.generate_edition(value or board(), 2026, 1, root=self.root, now=datetime(2026,9,15,tzinfo=timezone.utc), **kw)

    def test_complete_and_sourced(self):
        result=self.make(); self.assertEqual(result["source_status"],"verified_final"); self.assertGreaterEqual(len(result["stories"]),8); self.assertTrue(all(s.get("source") for s in result["stories"]))
    def test_live_skip(self):
        value=board(); value["matchups"][0].update(state="live",winner="UNDECIDED")
        with self.assertRaises(paper.GenerationSkip) as error:self.make(value)
        self.assertEqual(error.exception.reason,paper.SKIP_LIVE)
    def test_incomplete_skip(self):
        value=board(); value["matchups"].pop()
        with self.assertRaises(paper.GenerationSkip) as error:self.make(value)
        self.assertEqual(error.exception.reason,paper.SKIP_INCOMPLETE)
    def test_invalid_score(self):
        value=board(); value["matchups"][0]["away"]["score"]="122"
        with self.assertRaises(paper.GenerationSkip) as error:self.make(value)
        self.assertEqual(error.exception.reason,paper.SKIP_INVALID)
    def test_preview_cannot_publish(self):
        value=board(); value["matchups"][0].update(state="live",winner="UNDECIDED"); result=self.make(value,allow_incomplete=True)
        self.assertEqual((result["source_status"],result["validation_status"]),("incomplete_override","preview"))
        with self.assertRaises(ValueError):paper.validate_edition(result)
    def test_record_watch(self): self.assertIn("did not break",next(s for s in self.make()["stories"] if s["story_type"]=="record_watch")["body"])
    def test_optional_transactions(self):
        self.assertNotIn("transactions",{s["story_type"] for s in self.make()["stories"]})
        path=self.root/"data/transactions/2026.json"; path.parent.mkdir(); path.write_text(json.dumps({"transactions":[{"week":1}]}))
        self.assertIn("transactions",{s["story_type"] for s in self.make()["stories"]})
    def test_optional_next_week(self):
        self.assertNotIn("next_week",{s["story_type"] for s in self.make()["stories"]})
        path=self.root/"data/current-season-weeks/week_02.json"; path.parent.mkdir(); path.write_text(json.dumps({"matchups":[{}]*6}))
        self.assertIn("next_week",{s["story_type"] for s in self.make()["stories"]})
    def test_index_order_and_duplicate(self):
        index=self.root/"data/newspaper_editions/index.json"; one=self.make(); two=self.make(); two["week"]=2
        paper.update_index(index,one,self.root/"data/newspaper_editions/2026/week_01.json",root=self.root)
        result=paper.update_index(index,two,self.root/"data/newspaper_editions/2026/week_02.json",root=self.root); result=paper.update_index(index,two,self.root/"data/newspaper_editions/2026/week_02.json",root=self.root)
        self.assertEqual([e["week"] for e in result["editions"]],[2,1]); self.assertEqual(len(result["editions"]),2)
    def test_existing_valid(self):
        path=self.root/"edition.json"; paper.write_json(path,self.make()); self.assertTrue(paper.existing_valid_edition(path)); path.write_text("{}"); self.assertFalse(paper.existing_valid_edition(path))
    def test_historical_preserved(self):
        path=self.root/"data/newspaper_editions/historical_2023.json"; path.parent.mkdir(exist_ok=True); path.write_text('{"sentinel":true}\n'); before=path.read_bytes()
        paper.write_json(paper.edition_path(2026,1,self.root/"data/newspaper_editions"),self.make()); self.assertEqual(path.read_bytes(),before)
    def grok_response(self, edition, mutate=False):
        stories=[{"story_type":s["story_type"],"title":s["title"],"body":s["body"]} for s in edition["stories"]]
        if mutate: stories[0]["body"] += " 999.00"
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps({"choices":[{"message":{"content":json.dumps({"stories":stories})}}]}).encode(); return response
    def openai_response(self, edition, mutate=False):
        stories=[{"story_type":s["story_type"],"title":s["title"],"body":s["body"]} for s in edition["stories"]]
        if mutate: stories[0]["body"] += " 999.00"
        text=json.dumps({"stories":stories})
        payload={"output":[{"type":"message","content":[{"type":"output_text","text":text}]}]}
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps(payload).encode(); return response
    def test_grok_down_fallback(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",side_effect=OSError("down")):self.assertEqual(paper.apply_grok_stories(edition,"key"),edition)
    def test_grok_bad_numbers_rejected(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=self.grok_response(edition,True)):self.assertEqual(paper.apply_grok_stories(edition,"key"),edition)
    def test_grok_valid_keeps_sources(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=self.grok_response(edition)):result=paper.apply_grok_stories(edition,"key")
        self.assertEqual(result["writing_mode"],"grok_verified_rewrite"); self.assertEqual([s["source"] for s in result["stories"]],[s["source"] for s in edition["stories"]])
    def test_openai_down_fallback(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",side_effect=OSError("down")):self.assertEqual(paper.apply_openai_stories(edition,"key"),edition)
    def test_openai_bad_numbers_rejected(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=self.openai_response(edition,True)):self.assertEqual(paper.apply_openai_stories(edition,"key"),edition)
    def test_openai_valid_keeps_sources(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=self.openai_response(edition)):result=paper.apply_openai_stories(edition,"key")
        self.assertEqual(result["writing_mode"],"openai_verified_rewrite"); self.assertEqual([s["source"] for s in result["stories"]],[s["source"] for s in edition["stories"]])
    def test_regenerate_preserves_existing_when_ai_fails(self):
        current=self.root/"current.json"; paper.write_json(current,board())
        editions=self.root/"data/newspaper_editions"; existing=paper.edition_path(2026,1,editions); paper.write_json(existing,self.make()); before=existing.read_bytes()
        with patch.object(paper,"ROOT",self.root),patch.object(paper,"CURRENT_PATH",current),patch.object(paper,"EDITIONS_ROOT",editions),patch.object(paper,"apply_ai_stories",side_effect=lambda edition,writing:edition):
            output=io.StringIO()
            with redirect_stdout(output):code=paper.main(["--season","2026","--week","1","--writing","openai","--regenerate"])
        self.assertEqual(code,0); self.assertIn("SKIP rewrite_failed",output.getvalue()); self.assertEqual(existing.read_bytes(),before)
    def test_regenerate_replaces_existing_after_verified_rewrite(self):
        current=self.root/"current.json"; paper.write_json(current,board())
        editions=self.root/"data/newspaper_editions"; existing=paper.edition_path(2026,1,editions); paper.write_json(existing,self.make())
        def rewritten(edition,writing): edition["writing_mode"]="openai_verified_rewrite"; return edition
        with patch.object(paper,"ROOT",self.root),patch.object(paper,"CURRENT_PATH",current),patch.object(paper,"EDITIONS_ROOT",editions),patch.object(paper,"apply_ai_stories",side_effect=rewritten):
            output=io.StringIO()
            with redirect_stdout(output):code=paper.main(["--season","2026","--week","1","--writing","openai","--regenerate"])
        self.assertEqual(code,0); self.assertIn("Replaced",output.getvalue()); self.assertEqual(paper.read_json(existing)["writing_mode"],"openai_verified_rewrite")
    def test_main_live_skip_writes_nothing(self):
        value=board(); value["matchups"][0].update(state="live",winner="UNDECIDED"); current=self.root/"current.json"; paper.write_json(current,value)
        with patch.object(paper,"CURRENT_PATH",current),patch.object(paper,"EDITIONS_ROOT",self.root/"editions"):
            output=io.StringIO()
            with redirect_stdout(output):code=paper.main(["--season","2026"])
        self.assertEqual(code,0); self.assertIn("SKIP week_not_final",output.getvalue()); self.assertFalse((self.root/"editions/2026/week_01.json").exists())

if __name__ == "__main__": unittest.main()
