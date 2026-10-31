# Deploying the public demo (Render, free)

**Live instance: https://shadowguard-ai-wxbl.onrender.com**

One URL serves the dashboard and the API. The host needs **Python only**: the dashboard is the prebuilt frontend in `backend/static`, served by FastAPI.

With `DEPLOY_MODE=1` the backend:

- listens on `0.0.0.0:$PORT` (Render sets `PORT`, default 10000);
- turns the live collector off and does not start the Local LLM Guard relay (a cloud server has no endpoint to watch);
- creates a fresh SQLite database on every start and loads demo scenarios 01–04, 06 and 07 with recent timestamps. Scenario 05 is played with the **Replay agent attack** button;
- caps `/api/ingest` and `/api/scan` bodies at 100 KB, rate-limits each client IP (40 writes and 300 reads per minute), and shows the banner *"Public demo instance · synthetic data only · production runs locally on the endpoint"*;
- uses Featherless for *Generate AI Analysis* only if a key is configured, otherwise the offline rules.

Local mode (no `DEPLOY_MODE`) is unchanged: `127.0.0.1:8000`, collector on, no limits, its own `backend/shadowguard.db`.

## Deploy with the Blueprint (recommended)

The repo contains [`render.yaml`](../render.yaml) (free web service, `runtime: python`) and [`.python-version`](../.python-version) (Python 3.14).

1. Sign in at **https://dashboard.render.com** (signing in with GitHub is easiest).
2. Click **New** → **Blueprint**.
3. Under *Connect a repository*, find **Muzammil757/HFT26-TEAM-48** and click **Connect**. If it isn't listed, click *Configure GitHub* and give Render access to that repository.
4. Enter a Blueprint name (e.g. `shadowguard-ai`) and choose the branch **main**. Leave *Blueprint Path* empty: `render.yaml` is at the repo root.
5. Check the preview: one web service, `shadowguard-ai`, plan **Free**, with `DEPLOY_MODE=1`.
6. Click **Deploy Blueprint**.
7. Open the service and watch **Logs**. The build runs `pip install -r backend/requirements.txt`, then `cd backend && python main.py` starts. Wait for `[deploy] scenario 07: processed 6, incidents 2` and the health check on `/api/health`. The first deploy takes a few minutes.
8. Open the URL shown at the top of the service page, e.g. `https://shadowguard-ai.onrender.com`. The subdomain is different if that name is taken.
9. Check it:
   - The dark banner says *Public demo instance*, and the top bar shows **Public demo**.
   - `https://<your-url>/api/health` returns `"mode":"deploy"` and `"collector":"off"`.
   - **Replay agent attack** on Overview or Incidents builds a 10/10 critical chain in about 10 seconds.
   - Opening `https://<your-url>/incidents` directly, or refreshing any page, works.
10. Put the URL in the README's *Live Demo* section and in the PR description. The current instance is https://shadowguard-ai-wxbl.onrender.com.

### Optional: Featherless AI analysis

1. In the service, open **Environment** → **Add Environment Variable**.
2. Add `FEATHERLESS_API_KEY` (your key) and `FEATHERLESS_MODEL` (e.g. `Qwen/Qwen2.5-7B-Instruct`).
3. Click **Save, rebuild, and deploy**. `/api/health` then reports `"analyzer":"featherless:<model>"`.

Never commit the key. The analyzer only ever sends redacted fields.

## Manual alternative (no Blueprint)

**New** → **Web Service** → connect **Muzammil757/HFT26-TEAM-48**, then:

| Setting | Value |
|---|---|
| Branch | `main` |
| Language / Runtime | Python 3 |
| Root Directory | *(leave empty)* |
| Build Command | `pip install -r backend/requirements.txt` |
| Start Command | `cd backend && python main.py` |
| Instance Type | Free |
| Environment Variables | `DEPLOY_MODE` = `1` |
| Health Check Path (Advanced) | `/api/health` |

Click **Deploy Web Service**.

## Good to know

- **Cold starts:** free services spin down after 15 minutes without traffic, and the next request takes about a minute to wake them. Open the URL a minute before you present.
- **Data resets** on every restart, redeploy or spin-down. That's intended: the demo always starts from the same synthetic scenarios.
- **Free hours:** 750 instance hours per workspace per month. A spun-down service uses none.
- **Frontend changes:** the host does not run Node. After changing `frontend/`, run `cd frontend && npm run build` (it writes to `backend/static`), then commit and push. Render redeploys on each push to `main`.
- **Try deploy mode locally:**

  ```bash
  cd backend
  DEPLOY_MODE=1 PORT=18734 python main.py      # PowerShell: $env:DEPLOY_MODE="1"; $env:PORT="18734"; python main.py
  ```

  Then open http://127.0.0.1:18734. It uses its own `backend/shadowguard_demo.db`, so a local install's data is untouched.
