"""Section 11 acceptance: every demo scenario through the full pipeline.

    python tests/test_acceptance.py            # offline: classify -> scan -> mask -> correlate, no server
    python tests/test_acceptance.py --live     # also check the running server (after start_demo)

The live mode only reads (GET); it never posts or deletes anything.
"""

import sys

from _common import Checks, demo_events, run_pipeline

c = Checks("Section 11 acceptance" + (" (offline + live)" if "--live" in sys.argv else " (offline)"))
results = {n: run_pipeline(demo_events(n)) for n in ("01", "02", "03", "04", "05", "06", "07")}
n_findings = lambda n: sum(len(v) for v in results[n][1].values())  # noqa: E731
incidents = lambda n: results[n][0]  # noqa: E731

c.check("01 benign: 0 findings, 0 incidents", n_findings("01") == 0 and not incidents("01"),
        (n_findings("01"), len(incidents("01"))))
c.check("02 shadow traffic: 0 findings, 0 incidents", n_findings("02") == 0 and not incidents("02"),
        (n_findings("02"), len(incidents("02"))))
c.check("03 key leak: credential incidents, every score >= 4",
        incidents("03") and all(i.risk_score >= 4 and any(f.category == "Credential" for f in i.findings)
                                for i in incidents("03")),
        [i.risk_score for i in incidents("03")])
c.check("04 PII leak: PII incidents, every score >= 3",
        incidents("04") and all(i.risk_score >= 3 and any(f.category == "PII" for f in i.findings) for i in incidents("04")),
        [i.risk_score for i in incidents("04")])
i05 = incidents("05")
c.check("05 agent chain: 1 incident, score 10, critical, is_chain",
        [(i.risk_score, i.severity, i.is_chain) for i in i05] == [(10, "critical", True)],
        [(i.risk_score, i.severity, i.is_chain) for i in i05])
c.check("06 false-positive bait: 0 findings, 0 incidents", n_findings("06") == 0 and not incidents("06"),
        (n_findings("06"), len(incidents("06"))))
by_source = {}
for i in incidents("07"):
    by_source.setdefault(i.source, []).append(i)
claude, lc = by_source.get("claude-agent", []), by_source.get("langchain-agent", [])
c.check("07 claude-agent: chain, critical", len(claude) == 1 and claude[0].is_chain and claude[0].severity == "critical",
        [(i.risk_score, i.severity, i.is_chain) for i in claude])
c.check("07 langchain-agent: only the shell session, 3 medium, shell factor only",
        len(lc) == 1 and (lc[0].risk_score, lc[0].severity) == (3, "medium")
        and [b["factor"] for b in lc[0].score_breakdown] == ["Agent shell execution"],
        [(i.risk_score, i.severity, i.score_breakdown) for i in lc])
c.check("07 harmless config.yaml session: no incident",
        not any({"evt_07_005", "evt_07_006"} & set(i.trigger_events) for i in incidents("07")))
leaks = [v[:10] for n in results for i in results[n][0] for f in i.findings for v in results[n][2]
         if v in f.redacted_evidence]
c.check("no incident finding carries a full raw value", not leaks, leaks)

if "--live" in sys.argv:
    import requests

    api = "http://127.0.0.1:8000"
    try:
        health = requests.get(f"{api}/api/health", timeout=5).json()
    except requests.RequestException:
        c.check("live: server reachable at 127.0.0.1:8000", False, "start it with start_demo.ps1 / start_demo.sh")
        c.finish()
    live = requests.get(f"{api}/api/incidents", timeout=10).json()
    stats = requests.get(f"{api}/api/stats", timeout=10).json()
    c.check("live: /api/health ok", health.get("status") == "ok", health)
    print(f"  (live analyzer={health.get('analyzer')}, collector={health.get('collector')})")
    ids = lambda n: {e["event_id"] for e in demo_events(n)}  # noqa: E731
    touching = lambda n: [i for i in live if ids(n) & set(i["trigger_events"])]  # noqa: E731
    for n in ("01", "02", "06"):
        c.check(f"live {n}: no incident", not touching(n), len(touching(n)))
    c.check("live 03/04: incidents present", touching("03") and touching("04"))
    shadow = {r["provider"] for r in stats["inventory"] if r["sanctioned"] is False}
    c.check("live: Ollama, Hugging Face, Anthropic are SHADOW in the inventory",
            {"Ollama", "Hugging Face", "Anthropic"} <= shadow, sorted(shadow))
    chain = [i for i in live if i["source"] == "autogpt"]
    if chain:  # present once demo_agent.py has been played
        c.check("live 05 (played): 10 critical chain",
                (chain[0]["risk_score"], chain[0]["severity"], chain[0]["is_chain"]) == (10, "critical", True),
                (chain[0]["risk_score"], chain[0]["severity"]))
c.finish()
