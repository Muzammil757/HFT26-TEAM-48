import mockStats from "./mocks/mock_stats.json";
import mockIncidents from "./mocks/mock_incidents.json";
import mockIncidentDetail from "./mocks/mock_incident_detail.json";

// Dev server (npm run dev) talks to the local API; the production build is served by
// FastAPI itself, so it calls the same origin.
export const BASE_URL = import.meta.env.DEV ? "http://127.0.0.1:8000" : "";
export const USE_MOCKS = false;

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = await response.json();
      message = body.detail || body.message || message;
    } catch {
      // Keep the HTTP status message if the response is not JSON.
    }

    // The server answered, so this is not a connectivity failure (see usePolling).
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function getHealth() {
  if (USE_MOCKS) {
    return { status: "ok", db: true, analyzer: "offline-rules", collector: "off" };
  }

  return request("/api/health");
}

export async function getStats() {
  if (USE_MOCKS) {
    return mockStats;
  }

  return request("/api/stats");
}

export async function getIncidents() {
  if (USE_MOCKS) {
    return mockIncidents;
  }

  return request("/api/incidents");
}

export async function getIncident(id) {
  if (USE_MOCKS) {
    if (mockIncidentDetail.incident_id === id) {
      return mockIncidentDetail;
    }

    const incident = mockIncidents.find(
      (item) => item.incident_id === id
    );

    if (!incident) {
      throw new Error(`Incident ${id} was not found`);
    }

    return {
      ...incident,
      events: []
    };
  }

  return request(`/api/incidents/${encodeURIComponent(id)}`);
}

export async function analyzeIncident(id) {
  if (USE_MOCKS) {
    const incident =
      mockIncidentDetail.incident_id === id
        ? mockIncidentDetail
        : mockIncidents.find((item) => item.incident_id === id);

    if (!incident) {
      throw new Error(`Incident ${id} was not found`);
    }

    return {
      ...incident,
      ai_analysis: JSON.stringify({
        sensitivity: "critical",
        summary:
          "The incident contains redacted evidence of sensitive information being accessed and sent to an AI provider.",
        remediation: [
          "Rotate any affected credentials.",
          "Review the process and its access to sensitive files.",
          "Restrict unnecessary AI provider access."
        ]
      })
    };
  }

  return request(
    `/api/incidents/${encodeURIComponent(id)}/analyze`,
    {
      method: "POST"
    }
  );
}
// Live Test Console: scan text (redacted results only) and ingest simulated events.
export async function scanText(text) {
  if (USE_MOCKS) {
    return { findings: [], masked_text: text };
  }

  return request("/api/scan", {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export async function ingestEvents(events) {
  if (USE_MOCKS) {
    return { status: "success", processed: events.length, incidents: 0 };
  }

  return request("/api/ingest", {
    method: "POST",
    body: JSON.stringify(events)
  });
}

// Replays the scenario-05 agent attack under a new session (one replay per 20 s).
export async function replayAgentAttack() {
  if (USE_MOCKS) {
    return { status: "started", event_ids: [], interval_seconds: 3, cooldown_seconds: 20 };
  }

  return request("/api/demo/replay-agent", { method: "POST" });
}
