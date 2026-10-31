# ShadowGuard AI — Frontend

The ShadowGuard AI frontend is a web-based security dashboard that provides visibility into AI provider usage, shadow AI activity, security incidents and potential data-exfiltration events.

Built with **React, Vite, Tailwind CSS v4, React Router, Recharts and Lucide React**, the interface communicates with the FastAPI backend through REST APIs.

## Pages and Functionality

### 1. Security Overview

The main dashboard provides a consolidated view of AI activity and security posture.

- Displays key statistics, including AI requests, shadow AI requests, incidents and detected providers.
- Visualizes provider usage and approved versus unapproved AI traffic.
- Shows request and incident activity over time.
- Highlights the latest critical security incidents for quick investigation.

### 2. AI Inventory

Provides visibility into applications and processes communicating with recognized AI providers.

- Displays process name, provider, approval status, request count and last-seen activity.
- Distinguishes approved providers from SHADOW providers.
- Supports searching and filtering inventory entries.
- Helps identify unauthorized or unexpected AI tool usage.

### 3. Incidents

Provides a centralized view of detected security incidents.

- Lists incidents with severity, risk score, source process, AI provider and timestamp.
- Supports filtering incidents by severity.
- Highlights correlated agentic exfiltration incidents.
- Provides access to individual incident details.

#### Incident Detail

The incident detail view organizes the investigation into focused sections or tabs:

- **Overview / Risk:** Incident summary, severity and explainable risk-score breakdown.
- **Timeline:** Chronological sequence of relevant events, including sensitive file access, shell execution and AI requests.
- **Findings:** Detected credentials, PII and other suspicious evidence, displayed in redacted form.
- **AI Analysis:** Optional AI-generated incident explanation and remediation recommendations using redacted evidence only.

The detail view helps users understand what happened, why the incident was flagged and which events contributed to its risk score.

### 4. Live Test Console

Provides an interface for exercising and demonstrating the prototype's detection capabilities.

- Allows users to run or submit supported test/demo scenarios.
- Helps observe backend processing and ingestion results.
- Supports demonstration of benign traffic, shadow AI activity, credential leaks, PII exposure and agentic exfiltration scenarios.

## Main UI Components

The frontend is organized around reusable interface elements:

- **Application Layout:** Navigation sidebar, page content area and shared application structure.
- **Stat Cards:** Summary of AI activity and security metrics.
- **Charts:** Provider distribution and activity timelines using Recharts.
- **Inventory Table:** Process and AI provider usage information.
- **Incident List:** Incident records with severity indicators and risk scores.
- **Incident Detail Sections:** Risk breakdown, event timeline, findings and AI analysis.
- **Status Indicators:** Approved, SHADOW, severity and backend availability states.
- **Live Test Controls:** Interface elements for running and observing supported test scenarios.

## Technology Stack

| Technology | Purpose |
|---|---|
| React | Component-based user interface |
| Vite | Development server and build tooling |
| Tailwind CSS v4 | Styling and responsive layouts |
| React Router DOM | Page navigation |
| Recharts | Dashboard visualizations |
| Lucide React | Icons |
| Fetch API | Backend REST communication |

## Running the Frontend

### Prerequisites

- Node.js and npm installed.
- ShadowGuard AI backend running when using live API mode.

### Installation

Open a terminal and navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

### Start the Development Server

```bash
npm run dev
```

Open the local URL printed by Vite, typically:

```text
http://localhost:5173
```

### Backend Connection

The frontend communicates with the ShadowGuard AI FastAPI backend at:

```text
http://127.0.0.1:8000
```

The backend provides incident, statistics, inventory and analysis data through its REST API.

Ensure the backend is running and the frontend API configuration is set appropriately when using live data.

---

**ShadowGuard AI — Visibility into Shadow AI. Detection of Agentic Data Exfiltration. Privacy by Design.**
