# Mizumi Platform — Demo Transcript

> Casual walkthrough for a non-technical audience. Each section covers one item in the sidebar.

---

## Introduction

Before we dive in, let me give you a quick sense of what Mizumi is and why it exists.

Every company that works with data eventually runs into the same set of problems. Data is scattered across many systems — databases, files, cloud storage — and nobody has a clear picture of what exists, where it lives, or who's allowed to use it. When a team wants to run an analysis or build a product on top of that data, they spend more time chasing answers from engineers and security teams than actually doing the work. And when something goes wrong — a report shows the wrong number, a model starts behaving oddly — it's nearly impossible to trace back what happened.

**Mizumi is a data platform that solves all of this in one place.** It gives every person in the organization a single interface to find data, understand it, request access to it, query it, and build on top of it. At the same time, it gives the data and security teams full visibility and control — they can see who has access to what, approve or reject requests, and trace exactly how data flows from source to dashboard.

The platform is built around a few core ideas. Data is organized in what we call a **medallion lakehouse** — think of it like refining raw ore into finished metal. Raw data comes in as **bronze** (exactly as received, unfiltered), gets cleaned and standardized into **silver** (validated, deduplicated, ready to use), and finally gets aggregated into **gold** (the polished summaries and KPIs that business decisions are based on). This layered approach means there's always a clear, trusted version of the truth at every stage. Everything that moves that data is automated and observable through a pipeline orchestrator. And on top of all of that sits a layer of AI tooling — a conversational agent, an AI-assisted dashboard builder, and AI-powered risk assessment on access requests — so the platform works for technical and non-technical users alike.

What you're about to see is a walkthrough of each section in the sidebar, from left to right. We'll start with how data is organized, move through governance and collaboration, then look at the engineering tools, and finish with the AI-powered features and the demo simulators.

---

## 1. Catalog

The first thing anyone needs when working with data is simply knowing what exists. That's what the Catalog is for.

Think of it like a **library catalogue for your company's data**. Instead of books, it lists every dataset the company owns. The structure goes catalog → schema → table — if you picture a filing cabinet, the catalog is the cabinet itself, the schema is a drawer inside it, and the table is a folder of records in that drawer.

When you click into a table, you get the full picture all in one place. The first tab is the **schema** — the columns inside, their data types, and whether each one can be empty. Right next to that is a **preview** tab showing live sample rows from the actual data, so you don't have to run a query just to know what's in there. From there, a **permissions** tab shows who currently has access. And if you're not on that list yet, there's a **request permissions** button that lets you ask for access without leaving the page.

So if someone asks "what data do we have on HDBank customers?", you come here, browse the tree on the left, open the table, and see exactly what's inside — no need to chase an engineer.

Now that we know what data exists, the obvious next question is: who's actually allowed to use it? That brings us to Governance.

---

## 2. Governance

Once people can see what data exists, the next question is: who's allowed to use it? That's where Governance comes in.

This is the **security desk** for data access. Anyone who needs to work with a dataset submits a request here, and a reviewer approves or rejects it.

The main page is a queue of every pending and resolved request. For each one you can see who asked, which dataset they want, and why. On top of that, the system automatically assigns a **risk rating** — low, medium, or high — using AI to assess how sensitive the request is. There's also a **blast radius** score — think of it like a map of consequences. It tells you how many other datasets and automated jobs would be affected if this person gets access, which helps reviewers understand the real scope of what they're approving rather than just seeing a single table name. Some requests go through a single reviewer, while higher-risk ones route through multiple teams in sequence before they're approved.

Beyond the main queue, there are two sub-pages. The first is **Policy templates** — pre-approved recipes for common access patterns, for example "data analyst reads silver tables". When an incoming request matches a template, it can be auto-approved instantly without a human in the loop. The second is **Time-bound access**, a live list of all temporary grants. Every approval comes with an expiry date, and from this page admins can renew or revoke grants as needed.

The analogy is a **building access card system**: you ask for a card, a security officer approves it, it expires on a set date, and they can cancel it at any time.

Of course, managing access one person at a time doesn't scale. That's where Teams comes in.

---

## 3. Teams

Governance works best when access is managed at the team level, not person by person. Teams is where that structure lives.

Teams is a directory of all the groups in the platform, each linked to a workspace — which is essentially the business unit it belongs to. When you click into a team you can see its members and which permissions the team holds collectively.

The reason this matters is that access can be granted to a whole team at once. So when a new person joins a team, they automatically inherit the right level of access without anyone having to set it up manually. Think of it as the **org chart for data permissions**.

Once you have the right access, the quickest way to actually get an answer from the data is the SQL Editor.

---

## 4. SQL Editor

Sometimes you just need a quick answer from the data without building a whole dashboard. The SQL Editor is the fastest way to get there.

This is a browser-based query tool — like a lightweight version of DBeaver or DataGrip, but built right into the platform so there's nothing to install.

You type SQL, hit run, and the results come back as a table directly in the browser. It's connected to the same data catalog, so autocomplete already knows the table and column names. It's useful for quick sanity checks: "how many customers signed up this week?" or "show me the last 10 transactions" — the kind of question that doesn't need a full dashboard, just a fast answer.

But where does that data actually come from? It's produced by the automated jobs you'll see next in Pipelines.

---

## 5. Pipelines

The data in the Catalog doesn't appear by magic — it's produced by automated jobs that run on a schedule. Pipelines is where you see, manage, and debug all of that.

This is the **control room for all the automated data jobs**, powered by Dagster as the orchestration engine. It has four sections, each answering a different question.

The first is **Assets** — the main view showing every data asset the platform manages. That means everything from raw bronze data (the unfiltered, as-received records — think of it as the inbox) through cleaned silver tables (validated and ready to use) and gold aggregates (the summarized metrics business teams actually read) all the way to ML model outputs. Each asset shows whether it's fresh, stale, or missing, and you can trigger a refresh with one click. Think of assets like **living spreadsheets** that get updated automatically on a schedule. From there, if you want to know what actually happened when those assets were last updated, you move to **Runs** — the full execution history of every job that has ever run, with its start time, duration, success or failure status, and which assets it touched. It's essentially the job log. Stepping back one level, **Schedules** answers the question of when all those runs are supposed to happen — it shows the recurring timers that kick off jobs automatically, including the schedule frequency, whether each one is currently active or paused, and when it last fired. And tying everything together is **Lineage** — a visual graph of how data flows through the entire system. You can follow chains like raw orders → cleaned orders → customer stats, and see exactly where streaming topics, ML models, and dashboards plug in. If something breaks upstream, you can trace at a glance which downstream tables are going to be affected.

Alongside data pipelines, the platform also manages something closely related — the AI and machine learning models that are trained on that data. That's the Model Registry.

---

## 6. Model Registry

Beyond data pipelines, the platform also manages AI and machine learning models. The Model Registry is their home.

A catalog specifically for **machine learning models**, powered by MLflow. It lists every trained model alongside its version history, current status — ready or not — and where the model artifact is actually stored.

You can label a version with an alias like `production` or `staging`, so the serving system always knows which one to use without being hardcoded to a specific version number. The analogy is **Git but for AI models** — a full version history where you can tag the release you want in production.

But before any model gets to the registry, it goes through a lot of experimentation. That's what the next section is for.

---

## 7. Experiments

Before a model ends up in the registry, data scientists go through many rounds of trial and error. Experiments is where that process is tracked.

This is a companion to the Model Registry. Where the registry tracks the final models, **Experiments** tracks all the trial runs that led to them — each experiment is a group of training attempts where data scientists were testing different approaches, such as different hyperparameters or different training datasets.

For each experiment you can see when it was created, when it was last updated, and any tags attached to it. It's essentially the **lab notebook** for the AI team, so you always know what was tried, when, and in what order.

With the data and models in place, let's look at how non-technical users actually interact with them — starting with the Agent.

---

## 8. Agent

Now we get to the AI layer. Not everyone who needs answers from data knows SQL — and even those who do shouldn't have to write a query for every question. The Agent is built for exactly that.

This is a **conversational AI assistant** that answers questions about your data in plain language — no SQL knowledge required.

You type something like *"Top VietJet activation candidates ranked by propensity score"* or *"HDBank customers by segment and credit score band"*, and the agent figures out the right SQL query, runs it against the data warehouse, and shows the results back as a table or chart. Beyond answering data questions, it can also explore the catalog on your behalf — searching for tables and explaining what's in them. If you ask about data you don't have access to, it drafts a permission request you can submit with one click. You can even ask it to check the status of an existing access request and it looks it up for you.

There's also a model picker in the bottom left of the chat, so you can switch between different AI models depending on how fast or thorough you need the answer to be.

For a broader, always-on view of the most important metrics, the Dashboard takes things a step further.

---

## 9. Dashboard

If the Agent is for ad-hoc questions, the Dashboard is for the bigger picture — a persistent, visual view of the most important metrics, built collaboratively with AI.

An **AI-generated, drag-and-drop analytics dashboard** built around the HDBank × VietJet Air partnership data.

The page is split into three panels side by side. Starting on the left is the **AI Composer** — a chat panel where you describe what you want to see, like "show untapped cross-sell whitespace" or "compare journey edges by monetization value". The AI then writes the SQL, runs it, and adds a new chart directly to the canvas. Moving to the centre, the **dashboard canvas** is the live grid of charts you can drag, resize, and rearrange. The default set already includes a cross-company opportunity bar chart, a Sankey flow diagram of journey edge value, a customer funnel, activation segments, next-best journey routing, and a recovery risk view. Finally, on the right, clicking any chart opens a **panel config sidebar** where you can edit the underlying SQL, switch the chart type, or adjust the axes — so every panel is fully customizable without ever leaving the page.

The analogy is **Notion + Tableau, but driven by a conversation with an AI**.

To show all of this working end to end, we need data actually flowing through the system. That's exactly what the final section — Synthetics — is designed for.

---

## 10. Synthetics (Demo Apps)

To wrap up, let's look at how we make everything we just showed actually come to life in a demo. The platform needs real data flowing through it — and that's what the Synthetics section provides.

The three pages under "Synthetics" are **demo simulators** — tools for feeding realistic fake data into the platform so we can show the full pipeline working end to end without needing live production traffic.

The first simulator, **VietJet Air Booking**, generates batches of synthetic flight ticket bookings and flight incident reports — things like baggage damage or flight delays — and sends them straight to the platform's ingest API. You hit "Send 100" and a hundred realistic VietJet records flow into the bronze data layer in seconds. Alongside that, the **Baggage Model** page is a live demo of the AI damage classifier. You upload a photo of a piece of luggage, the model tells you whether it's damaged, the confidence score, and a ranked list of every damage label it considered. It's the same real model that's registered in the Model Registry — so you can jump from here straight over to the registry to see its version history and training metadata. Finally, **HDBank Transfer** works on the same principle as the VietJet simulator, but for banking transactions — transfers, payments, and so on. This synthetic data flows through the pipeline and ultimately powers the cross-sell analysis you see in the Dashboard.

---

## Summary

| Section | What it does in one line |
|---|---|
| Catalog | Browse and understand every dataset |
| Governance | Request and approve data access |
| Teams | Manage team membership and permissions |
| SQL Editor | Run ad-hoc SQL queries in the browser |
| Pipelines | Monitor, trigger, and visualize data jobs |
| Model Registry | Track ML model versions |
| Experiments | Track ML training experiments |
| Agent | Ask questions about data in plain language |
| Dashboard | AI-assisted analytics dashboard |
| Synthetics | Demo apps for feeding test data into the platform |
