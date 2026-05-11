// ─── SQL snapshots for diff ────────────────────────────────────────────────

export const SNAPSHOT_A = `-- Version 1.3: After dedup transform
SELECT
  id,
  first_name,
  last_name,
  email,
  department,
  country,
  status,
  revenue,
  units_sold
FROM clean_sales
WHERE status != 'test'
ORDER BY id
LIMIT 5;

-- Result snapshot (5 of 4891 rows):
-- id | first_name | last_name | email               | department | country | status | revenue | units_sold
-- 1  | Alice      | Johnson   | alice@example.com   | Sales      | US      | active | 452.30  | 12
-- 2  | Bob        | Chen      | bob@example.com     | Marketing  | CA      | active | 891.00  | 24
-- 3  | Carol      | Singh     | carol@company.org   | Engineering| UK      | active | 303.75  | 8
-- 4  | Dave       | Lopez     | dave@startup.io     | HR         | DE      | active | 127.50  | 3
-- 5  | Eve        | Park      | eve@enterprise.com  | Finance    | JP      | active | 650.00  | 18`;

export const SNAPSHOT_B = `-- Version 1.4: After schema change (add profit_margin, revenue_tier)
SELECT
  id,
  first_name,
  last_name,
  email,
  department,
  country,
  status,
  revenue,
  units_sold,
  profit_margin,
  revenue_tier
FROM clean_sales
WHERE status != 'test'
ORDER BY id
LIMIT 5;

-- Result snapshot (5 of 4891 rows):
-- id | first_name | last_name | email               | department | country | status | revenue | units_sold | profit_margin | revenue_tier
-- 1  | Alice      | Johnson   | alice@example.com   | Sales      | US      | active | 452.30  | 12         | 0.28          | medium
-- 2  | Bob        | Chen      | bob@example.com     | Marketing  | CA      | active | 891.00  | 24         | 0.41          | high
-- 3  | Carol      | Singh     | carol@company.org   | Engineering| UK      | active | 303.75  | 8          | 0.19          | low
-- 4  | Dave       | Lopez     | dave@startup.io     | HR         | DE      | active | 127.50  | 3          | 0.12          | low
-- 5  | Eve        | Park      | eve@enterprise.com  | Finance    | JP      | active | 650.00  | 18         | 0.35          | high`;
