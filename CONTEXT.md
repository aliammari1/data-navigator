# Data Navigator

Data Navigator turns uploaded business data into report-focused analytics, with the telecom area centered on daily transaction reporting.

## Language

**Telecom Daily Transaction Report**:
A daily report made of telecom transaction rows, from which telecom analytics are derived.
_Avoid_: Telecom dashboard, telecom analytics, daily transactions dataset

**File**:
An uploaded business data object that Data Navigator can inspect, analyze, and report on.
_Avoid_: Dataset, data source, table

**Canal**:
The business channel or category assigned to a telecom transaction.
_Avoid_: Channel, raw channel column

**Submitted Transaction**:
A telecom transaction that has been sent for processing but is not yet confirmed as a final business outcome.
_Avoid_: Confirmed transaction

**Confirmed Transaction**:
A telecom transaction whose business outcome has been confirmed.
_Avoid_: Submitted transaction

**MSISDN**:
The telecom number identifier associated with a transaction row.
_Avoid_: Subscriber identifier, customer identifier, account identifier

**Narrative Report**:
An AI-generated written explanation of patterns, risks, and conclusions found in a File.
_Avoid_: Insight, recommendation, analysis

**Data Lineage**:
The trace of how a File is transformed, related, and depended on over time.
_Avoid_: Provenance, audit trail, version history

**LAN Collaboration Session**:
A local-network collaboration session where participants share a view of a File or report with limited access to selected read-only areas.
_Avoid_: Collaboration, workspace, shared view

**Viewer Access**:
A restricted access level that lets a participant see selected shared areas without modifying the File or report.
_Avoid_: Read-only access, guest access, observer mode

**Workspace**:
The interactive surface where users inspect, filter, visualize, and collaborate around a File.
_Avoid_: Dashboard, report view, visualization

**Anomaly**:
An unusual pattern, spike, or outlier found in a File.
_Avoid_: Alert, risk signal

**Forecast**:
A projection of future values derived from a File.
_Avoid_: Prediction, projection, predictive analysis

**Custom KPI**:
A user-defined business metric calculated from a File or report.
_Avoid_: Metric, calculated field, measure

**Analytics History**:
The chronological record of saved analytics results for a File or report.
_Avoid_: Analysis snapshot, saved report, cache entry

**Column Mapping**:
The configuration that links source File columns to expected report fields.
_Avoid_: Field mapping, import configuration, schema mapping

**Status Mapping**:
The configuration that links raw transaction status codes to business status meanings.
_Avoid_: Status classification, status taxonomy, code mapping

**Natural Language Query**:
A plain-language question asked about a File.
_Avoid_: AI question, prompt, data question

**Period Studio**:
The workspace area for comparing report metrics across dates or periods.
_Avoid_: Period comparison, day analytics, trend analysis

## Relationships

- A **Telecom Daily Transaction Report** contains many telecom transaction rows.
- A **Telecom Daily Transaction Report** is a specialized **File**.
- Each telecom transaction row belongs to exactly one **Canal**.
- A **Submitted Transaction** and a **Confirmed Transaction** are distinct status concepts.
- A telecom transaction row has one **MSISDN**.
- A **Narrative Report** explains what Data Navigator found in a **File**.
- **Data Lineage** belongs to a **File**.
- A **LAN Collaboration Session** can expose a shared view of a **File** or **Telecom Daily Transaction Report**.
- A participant in a **LAN Collaboration Session** can have **Viewer Access**.
- A **Workspace** is centered on one or more **Files**.
- A **Narrative Report** can explain an **Anomaly**.
- A **Forecast** is derived from a **File**.
- A **Custom KPI** is calculated from a **File** or **Telecom Daily Transaction Report**.
- **Analytics History** belongs to a **File** or **Telecom Daily Transaction Report**.
- A **Column Mapping** prepares a **File** for report-specific analysis.
- A **Status Mapping** interprets status codes in a **Telecom Daily Transaction Report**.
- A **Natural Language Query** is asked about a **File**.
- **Period Studio** compares metrics from one or more **Telecom Daily Transaction Reports**.

## Example dialogue

> **Dev:** "Should the telecom dashboard accept any telecom-looking dataset?"
> **Domain expert:** "No — this feature starts from a **Telecom Daily Transaction Report**. Analytics come after the report is loaded."
>
> **Dev:** "Should we call uploaded data a dataset?"
> **Domain expert:** "No — call it a **File** in the product language."
>
> **Dev:** "Is `CHANNEL` our domain term?"
> **Domain expert:** "No — `CHANNEL` is the source column. The domain term is **Canal**."
>
> **Dev:** "Can I treat submitted and confirmed as the same status?"
> **Domain expert:** "No — a **Submitted Transaction** is not the same thing as a **Confirmed Transaction**."
>
> **Dev:** "Should I call this a subscriber identifier?"
> **Domain expert:** "No — use **MSISDN** as the business term."
>
> **Dev:** "Should AI output be shown as separate insights?"
> **Domain expert:** "No — frame it as a **Narrative Report**."
>
> **Dev:** "Should I call the transformation graph provenance?"
> **Domain expert:** "No — use **Data Lineage** unless we are specifically discussing origin evidence."
>
> **Dev:** "Is this just generic collaboration?"
> **Domain expert:** "No — it is a **LAN Collaboration Session** with shared views and limited read-only access."
>
> **Dev:** "Can a viewer edit the report?"
> **Domain expert:** "No — **Viewer Access** only exposes selected shared areas."
>
> **Dev:** "Is the chart page a dashboard?"
> **Domain expert:** "No — call the broader interactive surface a **Workspace**."
>
> **Dev:** "Should unusual spikes be called alerts?"
> **Domain expert:** "No — call the finding an **Anomaly**."
>
> **Dev:** "Should projected values be called predictive analytics?"
> **Domain expert:** "No — the output is a **Forecast**."
>
> **Dev:** "Should user-defined telecom metrics be called measures?"
> **Domain expert:** "No — call them **Custom KPIs**."
>
> **Dev:** "Should saved analytics be called snapshots?"
> **Domain expert:** "No — expose them as **Analytics History**."
>
> **Dev:** "Should source-column setup be called import configuration?"
> **Domain expert:** "No — call it **Column Mapping**."
>
> **Dev:** "Should raw transaction status codes be treated as final statuses?"
> **Domain expert:** "No — use **Status Mapping** to interpret them."
>
> **Dev:** "Should user questions be called prompts?"
> **Domain expert:** "No — call them **Natural Language Queries**."
>
> **Dev:** "Should date comparisons be called trend analysis?"
> **Domain expert:** "No — use **Period Studio** for that workspace area."

## Flagged ambiguities

- "telecom report", "telecom analytics", and "daily transactions" were used for the same core artifact — resolved: use **Telecom Daily Transaction Report**.
- "dataset", "data source", "table", and "file" were used for uploaded data — resolved: use **File** as the generic product term.
- "channel" and **Canal** were used for the same grouping concept — resolved: use **Canal** as the domain term and treat `CHANNEL` as a source-column alias.
- "submitted" and "confirmed" were used for the same status bucket in code/UI — resolved: they are distinct business states and should not be merged under one term.
- `CUSTOMER_MSISDN`, `ACCOUNT_MSISDN`, and subscriber/account/customer wording were all used around the same value — resolved: use **MSISDN** as the canonical term.
- "insight", "recommendation", "analysis", and "narrative report" were used around AI-generated output — resolved: use **Narrative Report** as the product term.
- "data lineage", "provenance", "audit trail", and "version history" were used around traceability — resolved: use **Data Lineage** as the main product term.
- "real-time collaboration", "LAN collab", "workspace", and "shared view" were used around live teamwork — resolved: use **LAN Collaboration Session** for the local-network shared-view feature.
- "read-only access", "guest access", and "observer mode" were considered for restricted LAN participants — resolved: use **Viewer Access**.
- "dashboard", "report view", "visualization", and "workspace" were used around the main interactive surface — resolved: use **Workspace**.
- "anomaly", "outlier", "alert", and "risk signal" were considered for unusual findings — resolved: use **Anomaly**.
- "forecast", "prediction", "projection", and "predictive analysis" were considered for projected future values — resolved: use **Forecast**.
- "custom KPI", "metric", "calculated field", and "measure" were considered for user-defined business metrics — resolved: use **Custom KPI**.
- "analysis snapshot", "analytics history", "saved report", and "cache entry" were considered for saved/reopenable results — resolved: use **Analytics History**.
- "column mapping", "field mapping", "import configuration", and "schema mapping" were considered for source-column setup — resolved: use **Column Mapping**.
- "status mapping", "status classification", "status taxonomy", and "code mapping" were considered for status-code translation — resolved: use **Status Mapping**.
- "natural language query", "AI question", "prompt", and "data question" were considered for plain-language questions — resolved: use **Natural Language Query**.
- "period comparison", "period studio", "day analytics", and "trend analysis" were considered for period-based telecom analysis — resolved: use **Period Studio**.
