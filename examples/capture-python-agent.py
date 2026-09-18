"""Capture real Python tool callbacks through the local collector; no packages needed."""

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = os.environ.get("AFR_URL", "http://127.0.0.1:4180").rstrip("/")


def post(path, body, write_token=None):
    headers = {"Content-Type": "application/json", "X-AFR-Client": "sdk"}
    if write_token is not None:
        headers["X-AFR-Write-Token"] = write_token
    request = Request(
        BASE + path,
        data=json.dumps(body, allow_nan=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            return json.load(response)
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Collector HTTP {error.code}: {details}") from error


def main():
    credentials = post("/api/capture/runs", {
        "name": "Independent Python report agent",
        "agentName": "python-report-agent",
        "input": {"prompt": "Calculate revenue from the fictional report"},
        "metadata": {"language": "Python", "modelMode": "deterministic-code", "fictionalData": True},
    })
    run_id = credentials["runId"]
    token = credentials["writeToken"]

    def event(kind, name, **fields):
        return post(f"/api/capture/runs/{run_id}/events", {"events": [{
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": kind,
            "name": name,
            **fields,
        }]}, token)

    def tool(name, inputs, callback):
        span = uuid.uuid4().hex[:16]
        event("tool.started", name, input=inputs, spanId=span)
        started = time.perf_counter()
        try:
            result = callback()
        except Exception as error:
            event("tool.failed", name, input=inputs, spanId=span,
                  durationMs=(time.perf_counter() - started) * 1000,
                  error={"name": type(error).__name__, "message": str(error)[:4000]})
            raise
        event("tool.completed", name, input=inputs, output=result, spanId=span,
              durationMs=(time.perf_counter() - started) * 1000)
        return result

    try:
        event("prompt", "Python agent prompt", input="Calculate the fictional sales total.")
        event("decision", "Read the source report", stateDelta={"phase": "reading"},
              attributes={"source": "explicit-agent-annotation", "hiddenReasoning": False})
        fixture = Path(__file__).resolve().parent / "fixtures" / "quarterly-sales.json"
        report = tool("PythonReadReport", {"file": fixture.name},
                      lambda: json.loads(fixture.read_text(encoding="utf-8")))
        total = tool("PythonSumRevenue", {"rows": report["sales"]},
                     lambda: sum(row["revenue"] for row in report["sales"]))
        output = {"totalRevenue": total, "currency": report["currency"], "fictional": True}
    except Exception as error:
        post(f"/api/capture/runs/{run_id}/finish", {
            "status": "failed",
            "error": {"name": type(error).__name__, "message": str(error)[:4000]},
        }, token)
        raise
    post(f"/api/capture/runs/{run_id}/finish", {"status": "completed", "output": output}, token)
    print(json.dumps({"runId": run_id, "view": f"{BASE}/#/runs/{run_id}", "result": output}, indent=2))


if __name__ == "__main__":
    main()
