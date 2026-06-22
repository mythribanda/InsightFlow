# InsightFlow

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-Database-4479A1?logo=mysql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

> **AI-powered data analytics and visualization platform** for turning raw spreadsheets into actionable, explainable insights.

InsightFlow is a modern analytics experience that helps teams upload datasets, profile data quality, generate charts, surface risks, and ask natural-language questions about their data. It combines a polished React interface with AI-assisted analysis, making it easier to move from CSV to decision-ready insight in minutes.

## Overview

This project is designed for analysts, developers, and business users who need a fast way to understand the shape, quality, and story of a dataset. The platform focuses on:

- Automated profiling and trust scoring
- Visual exploration of numeric and categorical data
- Explainable AI-generated narratives and recommendations
- A clean workflow for future FastAPI + MySQL integration

## Features

| Feature | Description |
| --- | --- |
| Smart file upload | Import `.csv`, `.tsv`, `.xlsx`, and `.xls` datasets quickly. |
| Dataset profiling | Detect missing values, duplicates, outliers, distributions, and data types. |
| Trust & risk scoring | Generate a quality score with breakdowns, contradictions, and warning signals. |
| Auto-generated charts | Create visualizations automatically from dataset structure. |
| AI insights | Produce business, student, or developer-focused narratives and recommendations. |
| Ask-your-data chat | Query the dataset in natural language with context-aware responses. |
| PDF reporting | Export analysis results into a shareable report. |
| Responsive dashboard | Use the platform on desktop and mobile with a polished, modern UI. |

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, Tailwind CSS, TanStack Router, Vite |
| Backend | FastAPI, Python |
| Database | MySQL |
| Data Processing | Pandas, NumPy |
| Visualization | Matplotlib, Plotly |
| AI APIs | Gemini, OpenAI |
| Supporting Libraries | Recharts, PapaParse, SheetJS, React Query |

## Installation

### Prerequisites

- Node.js 20+ or Bun
- Python 3.10+
- MySQL 8+
- API key for Gemini or OpenAI

### 1. Clone the repository

```bash
git clone https://github.com/your-username/insightflow.git
cd insightflow
```

### 2. Install frontend dependencies

```bash
bun install
```

If you prefer npm:

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file and add the required values:

```env
VITE_API_BASE_URL=http://localhost:8000
DATABASE_URL=mysql://user:password@localhost:3306/insightflow
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
```

### 4. Start the frontend

```bash
bun run dev
```

or:

```bash
npm run dev
```

### 5. Start the backend

If you are running the FastAPI service separately:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Usage

1. Open the application in your browser.
2. Upload a dataset in CSV or Excel format.
3. Review the dashboard, profiling metrics, and trust score.
4. Explore auto-generated charts and risk flags.
5. Ask questions using the AI chat panel.
6. Export a report when you need a shareable summary.

### Example workflow

```text
Upload file -> Profile data -> Review charts -> Inspect risks -> Ask questions -> Export report
```

## Folder Structure

```text
insightflow/
├── src/
│   ├── components/
│   │   ├── AutoCharts.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── FileDrop.tsx
│   │   ├── MetricCard.tsx
│   │   ├── MiniBarChart.tsx
│   │   └── TrustGauge.tsx
│   ├── hooks/
│   ├── integrations/
│   │   └── supabase/
│   ├── lib/
│   │   ├── exportReport.ts
│   │   ├── parseFile.ts
│   │   ├── profiler.ts
│   │   └── riskLevel.ts
│   ├── routes/
│   │   └── index.tsx
│   └── utils/
│       └── ai.functions.ts
├── supabase/
├── test-data.csv
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Screenshots

Add your product images here to showcase the experience.

| Preview | Description |
| --- | --- |
| ![Dashboard Screenshot](./docs/screenshots/dashboard.png) | Main analytics dashboard with trust score and dataset summary. |
| ![Charts Screenshot](./docs/screenshots/charts.png) | Automated visualizations and trend exploration. |
| ![Chat Screenshot](./docs/screenshots/chat.png) | AI chat interface for asking questions about the dataset. |

> Suggested location: `docs/screenshots/`

## API Integration

InsightFlow is built to integrate with a FastAPI backend and AI providers for structured data analysis.

### Recommended backend endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload` | Receive and validate uploaded datasets. |
| `POST` | `/api/profile` | Return profiling statistics and trust metrics. |
| `POST` | `/api/charts` | Generate chart-ready aggregations and metadata. |
| `POST` | `/api/chat` | Handle natural-language questions about the dataset. |
| `GET` | `/api/report/:id` | Retrieve a saved report or export payload. |

### AI provider flow

```mermaid
flowchart LR
  U[User Uploads Dataset] --> F[Frontend React App]
  F --> B[FastAPI Backend]
  B --> P[Pandas / NumPy Profiling]
  B --> A[Gemini or OpenAI API]
  B --> D[(MySQL)]
  B --> V[Matplotlib / Plotly Output]
  V --> F
  A --> F
```

### Example request payload

```json
{
  "fileName": "sales_data.csv",
  "persona": "business",
  "mode": "insights",
  "profile": {
    "rowCount": 1250,
    "colCount": 18,
    "missingPct": 4.8
  }
}
```

### Frontend integration notes

- The current React app includes an AI server function for dataset Q&A.
- Replace or proxy that layer with your FastAPI service when you move to a dedicated backend.
- Store provider keys securely in environment variables and never commit them to the repository.

## Future Enhancements

- Multi-user authentication and role-based access control
- Saved workspaces and dataset history
- Scheduled reporting and alerts
- Advanced anomaly detection and forecasting
- More chart templates and custom dashboard layouts
- CSV, Excel, and database connector expansion
- Model comparison workflows for Gemini and OpenAI
- Team collaboration and shared comments on insights

## Contribution Guidelines

Contributions are welcome. Please follow this workflow:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes with clear, focused commits.
4. Run linting and tests before submitting.
5. Open a pull request with a short summary and screenshots if relevant.

### Development standards

- Keep code readable and modular.
- Preserve the existing UI language and component structure.
- Add or update documentation when behavior changes.
- Prefer small, reviewable pull requests.

## License

This project is licensed under the MIT License. See the `LICENSE` file if one is added to the repository.

## Author

**Mythri Banda**

- Project: InsightFlow
- Role: Creator and maintainer
- Contact: Add your preferred email or portfolio link here

---

> Built to help teams understand data faster, reason more clearly, and ship insight with confidence.