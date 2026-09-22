import io, json, sys, tempfile, unittest, urllib.error
from contextlib import redirect_stderr, redirect_stdout
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
        ratings = [
            {"name": owner, "rating": 50-index, "preseasonRating": 50-index}
            for index, owner in enumerate(OWNERS)
        ]
        (data / "power-rankings.json").write_text(json.dumps({"ratings":ratings}))
        (data / "matchups.json").write_text(json.dumps({"records":{"highestScore":[235.64],"biggestBlowout":[137.42],"closestGame":[0.08]},"pairs":[["Hunt","Daley",[5,8,0,0,0]]]}))
    def tearDown(self): self.tmp.cleanup()
    def make(self, value=None, **kw): return paper.generate_edition(value or board(), 2026, 1, root=self.root, now=datetime(2026,9,15,tzinfo=timezone.utc), **kw)

    def test_complete_and_sourced(self):
        result=self.make(); self.assertEqual(result["source_status"],"verified_final"); self.assertGreaterEqual(len(result["stories"]),8); self.assertTrue(all(s.get("source") for s in result["stories"]))
        self.assertNotEqual(result["headline"],result["lead"]["title"])
        self.assertEqual(result["pressure"]["label"],"NEXT TEST")
        recap=next(s for s in result["stories"] if s["story_type"]=="matchup_recap")
        self.assertIn(" beat ",recap["body"]); self.assertNotIn(";",recap["body"])
    def test_manager_feature_limit_is_applied(self):
        result=self.make()
        counts={}
        for story in result["stories"]:
            owner=story.get("primary_owner")
            if owner: counts[owner]=counts.get(owner,0)+1
        self.assertEqual(result["editorial_policy"],{"max_primary_features_per_manager":2,"matchup_recap_exempt":True})
        self.assertTrue(all(count <= 2 for count in counts.values()))
        self.assertEqual(counts["Hash"],2)
        standings=next(s for s in result["stories"] if s["story_type"]=="standings")
        self.assertNotIn("primary_owner",standings); self.assertEqual(standings["title"],"The Week 1 standings take shape")
        power=next(s for s in result["stories"] if s["story_type"]=="power_rankings")
        self.assertNotEqual(power.get("primary_owner"),"Hash")
    def test_manager_feature_limit_is_validated(self):
        result=self.make()
        standings=next(s for s in result["stories"] if s["story_type"]=="standings")
        standings["primary_owner"]="Hash"
        with self.assertRaisesRegex(ValueError,"Manager feature limit exceeded"):paper.validate_edition(result)
    def test_live_snapshot_is_publishable(self):
        value=board(); value["matchups"][0].update(state="live",winner="UNDECIDED")
        result=self.make(value)
        self.assertEqual((result["source_status"],result["validation_status"],result["status"]),("verified_live","valid","live"))
        paper.validate_edition(result)
        widest=next(s for s in result["stories"] if s["story_type"]=="biggest_win")
        self.assertIn("live", widest["title"].lower())
        self.assertNotIn(" beat ", widest["body"].lower())
    def test_live_editorial_ignores_untouched_zero_zero_game(self):
        value=board(); value["matchups"][0].update(state="live",winner="UNDECIDED")
        value["matchups"][0]["away"]["score"]=0; value["matchups"][0]["home"]["score"]=0
        result=self.make(value)
        self.assertGreater(float(result["matchup"]["awayScore"])+float(result["matchup"]["homeScore"]),0)

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
    def test_rivalry_requires_current_week_matchup(self):
        result=self.make()
        rivalry=next(s for s in result["stories"] if s["story_type"]=="rivalry")
        self.assertIn("Hunt and Daley",rivalry["title"])
        records=json.loads((self.root/"data/matchups.json").read_text())
        records["pairs"]=[["Hunt","Speer",[5,8,0,0,0]]]
        (self.root/"data/matchups.json").write_text(json.dumps(records))
        self.assertNotIn("rivalry",{s["story_type"] for s in self.make()["stories"]})
    def test_index_order_and_duplicate(self):
        index=self.root/"data/newspaper_editions/index.json"; one=self.make(); two=self.make(); two["week"]=2
        paper.update_index(index,one,self.root/"data/newspaper_editions/2026/week_01.json",root=self.root)
        result=paper.update_index(index,two,self.root/"data/newspaper_editions/2026/week_02.json",root=self.root); result=paper.update_index(index,two,self.root/"data/newspaper_editions/2026/week_02.json",root=self.root)
        self.assertEqual([e["week"] for e in result["editions"]],[2,1]); self.assertEqual(len(result["editions"]),2)
    def test_existing_valid(self):
        path=self.root/"edition.json"; paper.write_json(path,self.make()); self.assertTrue(paper.existing_valid_edition(path))
        live=board(); live["matchups"][0].update(state="live",winner="UNDECIDED"); paper.write_json(path,self.make(live)); self.assertTrue(paper.existing_valid_edition(path))
        path.write_text("{}"); self.assertFalse(paper.existing_valid_edition(path))
    def test_historical_preserved(self):
        path=self.root/"data/newspaper_editions/historical_archive.json"; path.parent.mkdir(exist_ok=True); path.write_text('{"sentinel":true}\n'); before=path.read_bytes()
        paper.write_json(paper.edition_path(2026,1,self.root/"data/newspaper_editions"),self.make()); self.assertEqual(path.read_bytes(),before)
    def grok_response(self, edition, mutate=False):
        stories=[{"story_type":s["story_type"],"title":s["title"],"body":s["body"]} for s in edition["stories"]]
        if mutate: stories[0]["body"] += " 999.00"
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps({"choices":[{"message":{"content":json.dumps({"stories":stories})}}]}).encode(); return response
    def openai_response(self, edition, mutate=False, add_week=False):
        stories=[{"story_type":s["story_type"],"title":s["title"],"body":s["body"]} for s in edition["stories"]]
        if mutate: stories[0]["body"] += " 999.00"
        if add_week: stories[1]["title"] = "Week 1: " + stories[1]["title"]
        editorial={key: edition[key] for key in ("status","headline","standfirst","lead","matchup","tableNotes","pressure","surprise","recordWatch","archiveComparison","editorial_note") if key in edition}
        text=json.dumps({"stories":stories,"editorial":editorial})
        payload={"output":[{"type":"message","content":[{"type":"output_text","text":text}]}]}
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps(payload).encode(); return response
    def test_grok_down_fallback(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",side_effect=OSError("down")):self.assertEqual(paper.apply_grok_stories(edition,"key"),edition)
    def test_grok_bad_numbers_fall_back_to_verified_story(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=self.grok_response(edition,True)):result=paper.apply_grok_stories(edition,"key")
        self.assertEqual(result["writing_mode"],"grok_verified_rewrite")
        self.assertEqual(result["stories"][0],edition["stories"][0])
        self.assertEqual(result["rewrite_fallbacks"],[{"story_type":"matchup_recap","reason":"numbers_changed"}])
    def test_grok_valid_keeps_sources(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=self.grok_response(edition)):result=paper.apply_grok_stories(edition,"key")
        self.assertEqual(result["writing_mode"],"grok_verified_rewrite"); self.assertEqual([s["source"] for s in result["stories"]],[s["source"] for s in edition["stories"]])
    def test_openai_down_fallback(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",side_effect=OSError("down")):self.assertEqual(paper.apply_openai_stories(edition,"key"),edition)
    def test_openai_bad_numbers_fall_back_to_verified_story(self):
        edition=self.make()
        failures=[]
        with patch("generate_newspaper.urllib.request.urlopen",return_value=self.openai_response(edition,add_week=True)):result=paper.apply_openai_stories(edition,"key",failures=failures)
        self.assertEqual(result["writing_mode"],"openai_verified_rewrite")
        self.assertEqual(result["stories"][1],edition["stories"][1])
        self.assertEqual(result["rewrite_fallbacks"],[{"story_type":"biggest_win","reason":"numbers_changed"}])
        self.assertEqual(failures,[])
    def test_openai_valid_keeps_sources(self):
        edition=self.make()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=self.openai_response(edition)) as request:
            result=paper.apply_openai_stories(edition,"key")
        self.assertEqual(result["writing_mode"],"openai_verified_rewrite"); self.assertEqual([s["source"] for s in result["stories"]],[s["source"] for s in edition["stories"]])
        payload=json.loads(request.call_args.args[0].data)
        self.assertIn("no manager may be the primary subject of more than two",payload["input"][0]["content"])
        supplied=json.loads(payload["input"][1]["content"])["stories"]
        self.assertTrue(all("primary_owner" in story for story in supplied))
    def test_openai_http_error_is_safe_and_actionable(self):
        edition=self.make(); failures=[]
        body=io.BytesIO(json.dumps({"error":{"type":"rate_limit_error","code":"insufficient_quota","message":"Add credits; sk-secret-must-not-log"}}).encode())
        error=urllib.error.HTTPError("https://api.openai.com/v1/responses",429,"Too Many Requests",{"x-request-id":"req_test"},body)
        with patch("generate_newspaper.urllib.request.urlopen",side_effect=error):self.assertEqual(paper.apply_openai_stories(edition,"key",failures=failures),edition)
        detail=str(failures[0]); self.assertIn("status=429",detail); self.assertIn("insufficient_quota",detail); self.assertIn("req_test",detail); self.assertNotIn("sk-secret",detail)
    def test_openai_incomplete_response_is_reported(self):
        edition=self.make(); failures=[]
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps({"id":"resp_test","status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}).encode()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=response):self.assertEqual(paper.apply_openai_stories(edition,"key",failures=failures),edition)
        self.assertEqual(failures[0].stage,"response"); self.assertIn("max_output_tokens",failures[0].detail)
    def test_openai_wrong_output_shape_is_reported(self):
        edition=self.make(); failures=[]
        payload={"id":"resp_test","status":"completed","output_text":"[]"}
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps(payload).encode()
        with patch("generate_newspaper.urllib.request.urlopen",return_value=response):self.assertEqual(paper.apply_openai_stories(edition,"key",failures=failures),edition)
        self.assertEqual(failures[0].stage,"output_json"); self.assertIn("expected_object",failures[0].detail)
    def test_regenerate_preserves_existing_when_ai_fails(self):
        current=self.root/"current.json"; paper.write_json(current,board())
        editions=self.root/"data/newspaper_editions"; existing=paper.edition_path(2026,1,editions); paper.write_json(existing,self.make()); before=existing.read_bytes()
        with patch.object(paper,"ROOT",self.root),patch.object(paper,"CURRENT_PATH",current),patch.object(paper,"EDITIONS_ROOT",editions),patch.object(paper,"apply_ai_stories",side_effect=paper.RewriteFailure("openai","validation","story=1 reason=numbers_changed")):
            error=io.StringIO()
            with redirect_stderr(error):code=paper.main(["--season","2026","--week","1","--writing","openai","--regenerate"])
        self.assertEqual(code,1); self.assertIn("AI_REWRITE_FAILED",error.getvalue()); self.assertIn("numbers_changed",error.getvalue()); self.assertIn("Preserved",error.getvalue()); self.assertEqual(existing.read_bytes(),before)
    def test_duplicate_skips_before_ai_call(self):
        current=self.root/"current.json"; paper.write_json(current,board())
        editions=self.root/"data/newspaper_editions"; existing=paper.edition_path(2026,1,editions); paper.write_json(existing,self.make())
        with patch.object(paper,"ROOT",self.root),patch.object(paper,"CURRENT_PATH",current),patch.object(paper,"EDITIONS_ROOT",editions),patch.object(paper,"apply_ai_stories") as rewrite:
            output=io.StringIO()
            with redirect_stdout(output):code=paper.main(["--season","2026","--week","1","--writing","auto"])
        self.assertEqual(code,0); self.assertIn("SKIP edition_already_published",output.getvalue()); rewrite.assert_not_called()
    def test_regenerate_replaces_existing_after_verified_rewrite(self):
        current=self.root/"current.json"; paper.write_json(current,board())
        editions=self.root/"data/newspaper_editions"; existing=paper.edition_path(2026,1,editions); paper.write_json(existing,self.make())
        def rewritten(edition,writing,**kwargs): edition["writing_mode"]="openai_verified_rewrite"; return edition
        with patch.object(paper,"ROOT",self.root),patch.object(paper,"CURRENT_PATH",current),patch.object(paper,"EDITIONS_ROOT",editions),patch.object(paper,"apply_ai_stories",side_effect=rewritten):
            output=io.StringIO()
            with redirect_stdout(output):code=paper.main(["--season","2026","--week","1","--writing","openai","--regenerate"])
        self.assertEqual(code,0); self.assertIn("Replaced",output.getvalue()); self.assertEqual(paper.read_json(existing)["writing_mode"],"openai_verified_rewrite")
    def test_main_live_refresh_writes_verified_live_without_ai(self):
        value=board(); value["matchups"][0].update(state="live",winner="UNDECIDED"); current=self.root/"current.json"; paper.write_json(current,value)
        editions=self.root/"data/newspaper_editions"
        with patch.object(paper,"ROOT",self.root),patch.object(paper,"CURRENT_PATH",current),patch.object(paper,"EDITIONS_ROOT",editions),patch.object(paper,"apply_ai_stories",side_effect=lambda edition,writing,**kw: edition) as rewrite:
            output=io.StringIO()
            with redirect_stdout(output):code=paper.main(["--season","2026","--writing","auto"])
        self.assertEqual(code,0); self.assertIn("Published",output.getvalue())
        saved=paper.read_json(editions/"2026/week_01.json")
        self.assertEqual(saved["source_status"],"verified_live")
        self.assertEqual(rewrite.call_args.args[1],"deterministic")
        self.assertEqual(paper.read_json(editions/"index.json")["editions"][0]["source_status"],"verified_live")

    def test_live_snapshot_refreshes_and_then_finalizes(self):
        live=board(); live["matchups"][0].update(state="live",winner="UNDECIDED")
        current=self.root/"current.json"; paper.write_json(current,live); editions=self.root/"data/newspaper_editions"
        with patch.object(paper,"ROOT",self.root),patch.object(paper,"CURRENT_PATH",current),patch.object(paper,"EDITIONS_ROOT",editions):
            first=io.StringIO()
            with redirect_stdout(first): self.assertEqual(paper.main(["--season","2026","--writing","deterministic"]),0)
            live["matchups"][0]["away"]["score"] += 7; paper.write_json(current,live)
            second=io.StringIO()
            with redirect_stdout(second): self.assertEqual(paper.main(["--season","2026","--writing","deterministic"]),0)
            self.assertIn("Refreshed",second.getvalue())
            refreshed=paper.read_json(editions/"2026/week_01.json")
            recap=next(story for story in refreshed["stories"] if story["story_type"]=="matchup_recap")
            self.assertIn(f'{live["matchups"][0]["away"]["score"]:.2f}',recap["body"])
            paper.write_json(current,board())
            final=io.StringIO()
            with redirect_stdout(final): self.assertEqual(paper.main(["--season","2026","--writing","deterministic"]),0)
        self.assertIn("Finalized",final.getvalue())
        saved=paper.read_json(editions/"2026/week_01.json")
        self.assertEqual((saved["source_status"],saved["validation_status"],saved["status"]),("verified_final","valid","final"))

if __name__ == "__main__": unittest.main()
