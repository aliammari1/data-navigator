/**
 * Enterprise Business Intelligence corpus for BIRD-SQL, Spider 2.0, and DeepEval standards.
 *
 * Provides:
 * 1. Realistic enterprise DDL & seed data (customers, products, sales_reps, transactions).
 * 2. 20 realistic BI benchmark prompts covering:
 *    - Aggregations
 *    - Date Filtering
 *    - Multi-table Joins
 *    - Top-N / Window functions
 *    - Anomaly / Fraud checks
 * 3. Malformed SQL corpus for Valid SQL Rate (VSR) discrimination.
 * 4. Hallucinated SQL corpus for Column Hallucination Rate discrimination.
 * 5. Chart & clarification tool calling corpus for conformance testing.
 */

export interface BICase {
  id: string;
  category: "aggregations" | "date_filtering" | "joins" | "top_n" | "anomaly_checks";
  difficulty: "simple" | "moderate" | "challenging";
  prompt: string;
  goldSql: string;
  candidateSql: string;
  expectedColumns: string[];
  expectedMinRows: number;
  relevantTables: string[];
  description: string;
}

export interface SQLNegativeCase {
  id: string;
  sql: string;
  defectType: "syntax_error" | "column_hallucination" | "mutation_attempt";
  hallucinatedColumn?: string;
  targetTable?: string;
  expectedErrorSubstr: string;
}

export interface ColumnSchema {
  name: string;
  type: "string" | "number" | "date";
  dbType: string;
  isNumeric: boolean;
  isTemporal: boolean;
  isCategorical: boolean;
}

export const ANALYTICS_TABLE_SCHEMAS: Record<string, ColumnSchema[]> = {
  customers: [
    {
      name: "customer_id",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "company_name",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "segment",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "country",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "region",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "created_at",
      type: "date",
      dbType: "DATE",
      isNumeric: false,
      isTemporal: true,
      isCategorical: false,
    },
  ],
  products: [
    {
      name: "product_id",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "product_name",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "category",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "unit_price",
      type: "number",
      dbType: "DECIMAL(10,2)",
      isNumeric: true,
      isTemporal: false,
      isCategorical: false,
    },
    {
      name: "cost",
      type: "number",
      dbType: "DECIMAL(10,2)",
      isNumeric: true,
      isTemporal: false,
      isCategorical: false,
    },
  ],
  sales_reps: [
    {
      name: "rep_id",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "rep_name",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "territory",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "quota",
      type: "number",
      dbType: "DECIMAL(12,2)",
      isNumeric: true,
      isTemporal: false,
      isCategorical: false,
    },
  ],
  transactions: [
    {
      name: "transaction_id",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "customer_id",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "product_id",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "rep_id",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
    {
      name: "transaction_date",
      type: "date",
      dbType: "DATE",
      isNumeric: false,
      isTemporal: true,
      isCategorical: false,
    },
    {
      name: "quantity",
      type: "number",
      dbType: "INTEGER",
      isNumeric: true,
      isTemporal: false,
      isCategorical: false,
    },
    {
      name: "unit_price",
      type: "number",
      dbType: "DECIMAL(10,2)",
      isNumeric: true,
      isTemporal: false,
      isCategorical: false,
    },
    {
      name: "discount",
      type: "number",
      dbType: "DECIMAL(4,2)",
      isNumeric: true,
      isTemporal: false,
      isCategorical: false,
    },
    {
      name: "total_amount",
      type: "number",
      dbType: "DECIMAL(12,2)",
      isNumeric: true,
      isTemporal: false,
      isCategorical: false,
    },
    {
      name: "status",
      type: "string",
      dbType: "VARCHAR",
      isNumeric: false,
      isTemporal: false,
      isCategorical: true,
    },
  ],
};

export const ANALYTICS_ALL_COLUMNS: Set<string> = new Set(
  Object.values(ANALYTICS_TABLE_SCHEMAS).flatMap((cols) => cols.map((c) => c.name)),
);

export const ANALYTICS_DDL = `
  CREATE TABLE customers (
    customer_id VARCHAR PRIMARY KEY,
    company_name VARCHAR NOT NULL,
    segment VARCHAR NOT NULL,
    country VARCHAR NOT NULL,
    region VARCHAR NOT NULL,
    created_at DATE NOT NULL
  );

  CREATE TABLE products (
    product_id VARCHAR PRIMARY KEY,
    product_name VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    cost DECIMAL(10, 2) NOT NULL
  );

  CREATE TABLE sales_reps (
    rep_id VARCHAR PRIMARY KEY,
    rep_name VARCHAR NOT NULL,
    territory VARCHAR NOT NULL,
    quota DECIMAL(12, 2) NOT NULL
  );

  CREATE TABLE transactions (
    transaction_id VARCHAR PRIMARY KEY,
    customer_id VARCHAR NOT NULL,
    product_id VARCHAR NOT NULL,
    rep_id VARCHAR NOT NULL,
    transaction_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(4, 2) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR NOT NULL
  );
`;

export const ANALYTICS_SEED_SQL = `
  INSERT INTO customers VALUES
    ('C001', 'Acme Corporation', 'Enterprise', 'USA', 'Americas', '2022-01-15'),
    ('C002', 'Globex International', 'Enterprise', 'Germany', 'EMEA', '2022-03-20'),
    ('C003', 'Initech Systems', 'Mid-Market', 'USA', 'Americas', '2022-06-10'),
    ('C004', 'Umbrella Security', 'Enterprise', 'UK', 'EMEA', '2023-01-08'),
    ('C005', 'Hooli Technologies', 'Enterprise', 'USA', 'Americas', '2023-04-12'),
    ('C006', 'Wayne Enterprises', 'Enterprise', 'USA', 'Americas', '2023-07-25'),
    ('C007', 'Stark Industries', 'Enterprise', 'USA', 'Americas', '2023-09-01'),
    ('C008', 'Cyberdyne Systems', 'Mid-Market', 'Japan', 'APAC', '2023-11-14'),
    ('C009', 'Massive Dynamic', 'SMB', 'Canada', 'Americas', '2024-01-05'),
    ('C010', 'Soylent Health', 'SMB', 'France', 'EMEA', '2022-02-18');

  INSERT INTO products VALUES
    ('P001', 'Cloud Compute Tier 1', 'Cloud Infrastructure', 1200.00, 600.00),
    ('P002', 'Vector Database Engine', 'Data & AI', 800.00, 400.00),
    ('P003', 'Security Guardrail AI', 'Security', 450.00, 180.00),
    ('P004', 'Data Lakehouse Enterprise', 'Data & AI', 2500.00, 1200.00),
    ('P005', 'DevOps Automation Suite', 'Developer Tools', 350.00, 120.00),
    ('P006', 'Agentic Workflow Hub', 'Data & AI', 1500.00, 700.00),
    ('P007', 'Enterprise BI Analytics', 'Data & AI', 950.00, 400.00),
    ('P008', 'API Gateway Proxy', 'Cloud Infrastructure', 300.00, 100.00),
    ('P009', 'Distributed Storage Tier', 'Cloud Infrastructure', 150.00, 50.00),
    ('P010', 'CI/CD Pipeline Engine', 'Developer Tools', 600.00, 250.00);

  INSERT INTO sales_reps VALUES
    ('R01', 'Sarah Connor', 'Americas North', 150000.00),
    ('R02', 'Miles Dyson', 'Americas South', 120000.00),
    ('R03', 'Peter Gibbons', 'EMEA Central', 140000.00),
    ('R04', 'Tony Stark', 'Americas West', 200000.00),
    ('R05', 'Bruce Wayne', 'EMEA West', 180000.00),
    ('R06', 'Dana Scully', 'APAC East', 110000.00);

  INSERT INTO transactions VALUES
    ('T1001', 'C001', 'P001', 'R01', '2023-01-20', 10, 1200.00, 0.05, 11400.00, 'Completed'),
    ('T1002', 'C002', 'P004', 'R03', '2023-03-15', 5, 2500.00, 0.10, 11250.00, 'Completed'),
    ('T1003', 'C003', 'P005', 'R02', '2023-04-10', 20, 350.00, 0.00, 7000.00, 'Completed'),
    ('T1004', 'C004', 'P003', 'R05', '2023-06-05', 15, 450.00, 0.05, 6412.50, 'Completed'),
    ('T1005', 'C005', 'P002', 'R04', '2023-08-18', 25, 800.00, 0.10, 18000.00, 'Completed'),
    ('T1006', 'C006', 'P006', 'R01', '2023-10-22', 8, 1500.00, 0.05, 11400.00, 'Completed'),
    ('T1007', 'C007', 'P007', 'R04', '2023-11-12', 12, 950.00, 0.15, 9690.00, 'Completed'),
    ('T1008', 'C008', 'P008', 'R06', '2023-12-05', 30, 300.00, 0.10, 8100.00, 'Completed'),
    ('T2001', 'C001', 'P004', 'R01', '2024-01-14', 8, 2500.00, 0.10, 18000.00, 'Completed'),
    ('T2002', 'C002', 'P001', 'R03', '2024-01-25', 15, 1200.00, 0.05, 17100.00, 'Completed'),
    ('T2003', 'C005', 'P006', 'R04', '2024-02-10', 10, 1500.00, 0.00, 15000.00, 'Completed'),
    ('T2004', 'C007', 'P002', 'R04', '2024-02-28', 20, 800.00, 0.10, 14400.00, 'Completed'),
    ('T2005', 'C003', 'P003', 'R02', '2024-03-08', 25, 450.00, 0.05, 10687.50, 'Completed'),
    ('T2006', 'C004', 'P007', 'R05', '2024-03-22', 14, 950.00, 0.10, 11970.00, 'Completed'),
    ('T2007', 'C006', 'P001', 'R01', '2024-04-05', 12, 1200.00, 0.05, 13680.00, 'Completed'),
    ('T2008', 'C001', 'P002', 'R01', '2024-04-18', 18, 800.00, 0.10, 12960.00, 'Completed'),
    ('T2009', 'C008', 'P004', 'R06', '2024-05-12', 6, 2500.00, 0.05, 14250.00, 'Completed'),
    ('T2010', 'C009', 'P005', 'R02', '2024-05-28', 10, 350.00, 0.00, 3500.00, 'Completed'),
    ('T2011', 'C002', 'P006', 'R03', '2024-06-11', 12, 1500.00, 0.10, 16200.00, 'Completed'),
    ('T2012', 'C007', 'P001', 'R04', '2024-06-25', 20, 1200.00, 0.15, 20400.00, 'Completed'),
    ('T2013', 'C005', 'P009', 'R04', '2024-06-29', 50, 150.00, 0.05, 7125.00, 'Completed'),
    ('T2014', 'C006', 'P004', 'R01', '2024-07-15', 10, 2500.00, 0.05, 23750.00, 'Completed'),
    ('T2015', 'C003', 'P010', 'R02', '2024-08-04', 15, 600.00, 0.10, 8100.00, 'Completed'),
    ('T2016', 'C004', 'P002', 'R05', '2024-09-19', 22, 800.00, 0.05, 16720.00, 'Completed'),
    ('T2017', 'C001', 'P006', 'R01', '2024-10-10', 14, 1500.00, 0.10, 18900.00, 'Completed'),
    ('T2018', 'C007', 'P004', 'R04', '2024-11-05', 8, 2500.00, 0.10, 18000.00, 'Completed'),
    ('T2019', 'C002', 'P007', 'R03', '2024-11-20', 16, 950.00, 0.05, 14440.00, 'Completed'),
    ('T2020', 'C008', 'P001', 'R06', '2024-12-15', 10, 1200.00, 0.10, 10800.00, 'Completed'),
    ('T3001', 'C009', 'P008', 'R02', '2024-12-18', 5, 300.00, 0.00, 1500.00, 'Pending'),
    ('T3002', 'C003', 'P004', 'R02', '2024-04-20', 3, 2500.00, 0.00, 7500.00, 'Refunded'),
    ('T3003', 'C005', 'P003', 'R04', '2024-07-22', 4, 450.00, 0.00, 1800.00, 'Refunded'),
    ('T4001', 'C006', 'P008', 'R01', '2024-08-14', 60, 300.00, 0.25, 13500.00, 'Completed'),
    ('T4002', 'C009', 'P005', 'R02', '2024-09-10', 10, 100.00, 0.00, 1000.00, 'Completed'),
    ('T4003', 'C001', 'P001', 'R01', '2024-09-25', 10, 1200.00, 0.10, 12000.00, 'Completed');
`;

export const BI_BENCHMARK_PROMPTS: BICase[] = [
  // ─── 1. Aggregations ────────────────────────────────────────────────────────
  {
    id: "bi-agg-01",
    category: "aggregations",
    difficulty: "simple",
    prompt:
      "What is the total revenue and average discount percentage for each product category for completed transactions?",
    goldSql: `SELECT p.category, ROUND(SUM(t.total_amount), 2) AS total_revenue, ROUND(AVG(t.discount) * 100, 2) AS avg_discount_pct FROM transactions t JOIN products p ON t.product_id = p.product_id WHERE t.status = 'Completed' GROUP BY p.category ORDER BY total_revenue DESC;`,
    candidateSql: `SELECT p.category, ROUND(SUM(t.total_amount), 2) AS total_revenue, ROUND(AVG(t.discount) * 100, 2) AS avg_discount_pct FROM transactions t INNER JOIN products p ON t.product_id = p.product_id WHERE t.status = 'Completed' GROUP BY p.category ORDER BY total_revenue DESC;`,
    expectedColumns: ["category", "total_revenue", "avg_discount_pct"],
    expectedMinRows: 4,
    relevantTables: ["transactions", "products"],
    description:
      "Multi-table aggregation grouping by product category with SUM and AVG discount percentage.",
  },
  {
    id: "bi-agg-02",
    category: "aggregations",
    difficulty: "moderate",
    prompt:
      "Count the number of distinct customers, total transactions, and total spend per customer segment.",
    goldSql: `SELECT c.segment, COUNT(DISTINCT c.customer_id) AS customer_count, COUNT(t.transaction_id) AS total_transactions, ROUND(COALESCE(SUM(t.total_amount), 0), 2) AS total_spend FROM customers c LEFT JOIN transactions t ON c.customer_id = t.customer_id GROUP BY c.segment ORDER BY total_spend DESC;`,
    candidateSql: `SELECT c.segment, COUNT(DISTINCT c.customer_id) AS customer_count, COUNT(t.transaction_id) AS total_transactions, ROUND(COALESCE(SUM(t.total_amount), 0), 2) AS total_spend FROM customers c LEFT JOIN transactions t ON c.customer_id = t.customer_id GROUP BY c.segment ORDER BY total_spend DESC;`,
    expectedColumns: ["segment", "customer_count", "total_transactions", "total_spend"],
    expectedMinRows: 3,
    relevantTables: ["customers", "transactions"],
    description: "Segment rollup with COUNT DISTINCT, transaction count, and COALESCE spend.",
  },
  {
    id: "bi-agg-03",
    category: "aggregations",
    difficulty: "challenging",
    prompt:
      "Calculate total gross revenue, gross profit, and profit margin percentage across all completed transactions by customer region.",
    goldSql: `SELECT c.region, ROUND(SUM(t.total_amount), 2) AS gross_revenue, ROUND(SUM(t.total_amount - (t.quantity * p.cost)), 2) AS gross_profit, ROUND(SUM(t.total_amount - (t.quantity * p.cost)) / SUM(t.total_amount) * 100, 2) AS profit_margin_pct FROM transactions t JOIN products p ON t.product_id = p.product_id JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Completed' GROUP BY c.region ORDER BY gross_revenue DESC;`,
    candidateSql: `SELECT c.region, ROUND(SUM(t.total_amount), 2) AS gross_revenue, ROUND(SUM(t.total_amount - (t.quantity * p.cost)), 2) AS gross_profit, ROUND(SUM(t.total_amount - (t.quantity * p.cost)) / SUM(t.total_amount) * 100, 2) AS profit_margin_pct FROM transactions t JOIN products p ON t.product_id = p.product_id JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Completed' GROUP BY c.region ORDER BY gross_revenue DESC;`,
    expectedColumns: ["region", "gross_revenue", "gross_profit", "profit_margin_pct"],
    expectedMinRows: 3,
    relevantTables: ["transactions", "products", "customers"],
    description: "3-way join calculating business margin formula (Revenue - Cost) / Revenue * 100.",
  },
  {
    id: "bi-agg-04",
    category: "aggregations",
    difficulty: "moderate",
    prompt:
      "Find the minimum, median, and maximum transaction amount for each customer segment for completed orders.",
    goldSql: `SELECT c.segment, ROUND(MIN(t.total_amount), 2) AS min_order, ROUND(MEDIAN(t.total_amount), 2) AS median_order, ROUND(MAX(t.total_amount), 2) AS max_order FROM transactions t JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Completed' GROUP BY c.segment ORDER BY c.segment;`,
    candidateSql: `SELECT c.segment, ROUND(MIN(t.total_amount), 2) AS min_order, ROUND(MEDIAN(t.total_amount), 2) AS median_order, ROUND(MAX(t.total_amount), 2) AS max_order FROM transactions t JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Completed' GROUP BY c.segment ORDER BY c.segment;`,
    expectedColumns: ["segment", "min_order", "median_order", "max_order"],
    expectedMinRows: 3,
    relevantTables: ["transactions", "customers"],
    description: "Analytical distribution statistics using DuckDB native MEDIAN aggregate.",
  },

  // ─── 2. Date Filtering ───────────────────────────────────────────────────────
  {
    id: "bi-date-01",
    category: "date_filtering",
    difficulty: "simple",
    prompt:
      "Calculate total revenue and completed order count for Q1 2024 (January 1 to March 31, 2024).",
    goldSql: `SELECT COUNT(*) AS q1_order_count, ROUND(SUM(total_amount), 2) AS q1_revenue FROM transactions WHERE status = 'Completed' AND transaction_date >= '2024-01-01' AND transaction_date <= '2024-03-31';`,
    candidateSql: `SELECT COUNT(*) AS q1_order_count, ROUND(SUM(total_amount), 2) AS q1_revenue FROM transactions WHERE status = 'Completed' AND transaction_date BETWEEN '2024-01-01' AND '2024-03-31';`,
    expectedColumns: ["q1_order_count", "q1_revenue"],
    expectedMinRows: 1,
    relevantTables: ["transactions"],
    description: "Bounded date interval filtering comparing BETWEEN semantics with explicit range.",
  },
  {
    id: "bi-date-02",
    category: "date_filtering",
    difficulty: "moderate",
    prompt:
      "Show monthly completed order counts and revenue trends for the year 2024, ordered chronologically.",
    goldSql: `SELECT strftime(transaction_date, '%Y-%m') AS sales_month, COUNT(*) AS orders, ROUND(SUM(total_amount), 2) AS monthly_revenue FROM transactions WHERE status = 'Completed' AND transaction_date >= '2024-01-01' AND transaction_date <= '2024-12-31' GROUP BY sales_month ORDER BY sales_month ASC;`,
    candidateSql: `SELECT strftime(transaction_date, '%Y-%m') AS sales_month, COUNT(*) AS orders, ROUND(SUM(total_amount), 2) AS monthly_revenue FROM transactions WHERE status = 'Completed' AND EXTRACT(year FROM transaction_date) = 2024 GROUP BY sales_month ORDER BY sales_month ASC;`,
    expectedColumns: ["sales_month", "orders", "monthly_revenue"],
    expectedMinRows: 12,
    relevantTables: ["transactions"],
    description: "Chronological monthly bucketing using DuckDB strftime with year bounds.",
  },
  {
    id: "bi-date-03",
    category: "date_filtering",
    difficulty: "moderate",
    prompt:
      "Compare Year-over-Year (YoY) completed transaction count and annual revenue between 2023 and 2024.",
    goldSql: `SELECT EXTRACT(year FROM transaction_date)::INTEGER AS sale_year, COUNT(*) AS tx_count, ROUND(SUM(total_amount), 2) AS annual_revenue FROM transactions WHERE status = 'Completed' AND EXTRACT(year FROM transaction_date) IN (2023, 2024) GROUP BY sale_year ORDER BY sale_year ASC;`,
    candidateSql: `SELECT CAST(EXTRACT(year FROM transaction_date) AS INTEGER) AS sale_year, COUNT(*) AS tx_count, ROUND(SUM(total_amount), 2) AS annual_revenue FROM transactions WHERE status = 'Completed' AND EXTRACT(year FROM transaction_date) IN (2023, 2024) GROUP BY sale_year ORDER BY sale_year ASC;`,
    expectedColumns: ["sale_year", "tx_count", "annual_revenue"],
    expectedMinRows: 2,
    relevantTables: ["transactions"],
    description: "YoY comparison grouping by extracted year with explicit cast.",
  },
  {
    id: "bi-date-04",
    category: "date_filtering",
    difficulty: "challenging",
    prompt:
      "Compute 7-day rolling total revenue leading up to the end of Q2 2024 (2024-06-30), showing the 10 most recent days.",
    goldSql: `SELECT transaction_date, ROUND(total_amount, 2) AS total_amount, ROUND(SUM(total_amount) OVER (ORDER BY transaction_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS rolling_7day_revenue FROM transactions WHERE status = 'Completed' AND transaction_date <= '2024-06-30' ORDER BY transaction_date DESC LIMIT 10;`,
    candidateSql: `SELECT transaction_date, ROUND(total_amount, 2) AS total_amount, ROUND(SUM(total_amount) OVER (ORDER BY transaction_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS rolling_7day_revenue FROM transactions WHERE status = 'Completed' AND transaction_date <= '2024-06-30' ORDER BY transaction_date DESC LIMIT 10;`,
    expectedColumns: ["transaction_date", "total_amount", "rolling_7day_revenue"],
    expectedMinRows: 10,
    relevantTables: ["transactions"],
    description:
      "Window analytical function with rolling frame specification ROWS BETWEEN 6 PRECEDING AND CURRENT ROW.",
  },

  // ─── 3. Joins ────────────────────────────────────────────────────────────────
  {
    id: "bi-join-01",
    category: "joins",
    difficulty: "simple",
    prompt:
      "List company name, customer segment, country, order count, and total spend for all Enterprise customers with completed orders.",
    goldSql: `SELECT c.company_name, c.segment, c.country, COUNT(t.transaction_id) AS order_count, ROUND(SUM(t.total_amount), 2) AS total_spent FROM customers c JOIN transactions t ON c.customer_id = t.customer_id WHERE c.segment = 'Enterprise' AND t.status = 'Completed' GROUP BY c.company_name, c.segment, c.country ORDER BY total_spent DESC;`,
    candidateSql: `SELECT c.company_name, c.segment, c.country, COUNT(t.transaction_id) AS order_count, ROUND(SUM(t.total_amount), 2) AS total_spent FROM customers c INNER JOIN transactions t ON c.customer_id = t.customer_id WHERE c.segment = 'Enterprise' AND t.status = 'Completed' GROUP BY c.company_name, c.segment, c.country ORDER BY total_spent DESC;`,
    expectedColumns: ["company_name", "segment", "country", "order_count", "total_spent"],
    expectedMinRows: 6,
    relevantTables: ["customers", "transactions"],
    description: "Standard 2-table INNER JOIN with grouping and filtering.",
  },
  {
    id: "bi-join-02",
    category: "joins",
    difficulty: "moderate",
    prompt:
      "Calculate quota attainment percentage for each sales rep by comparing total booked completed revenue against their target quota.",
    goldSql: `SELECT r.rep_name, r.territory, r.quota, ROUND(SUM(t.total_amount), 2) AS booked_revenue, ROUND(SUM(t.total_amount) / r.quota * 100, 2) AS attainment_pct FROM sales_reps r JOIN transactions t ON r.rep_id = t.rep_id WHERE t.status = 'Completed' GROUP BY r.rep_name, r.territory, r.quota ORDER BY attainment_pct DESC;`,
    candidateSql: `SELECT r.rep_name, r.territory, r.quota, ROUND(SUM(t.total_amount), 2) AS booked_revenue, ROUND((SUM(t.total_amount) / r.quota) * 100, 2) AS attainment_pct FROM sales_reps r JOIN transactions t ON r.rep_id = t.rep_id WHERE t.status = 'Completed' GROUP BY r.rep_name, r.territory, r.quota ORDER BY attainment_pct DESC;`,
    expectedColumns: ["rep_name", "territory", "quota", "booked_revenue", "attainment_pct"],
    expectedMinRows: 6,
    relevantTables: ["sales_reps", "transactions"],
    description: "Sales performance join calculating quota attainment ratio.",
  },
  {
    id: "bi-join-03",
    category: "joins",
    difficulty: "moderate",
    prompt:
      "Show product sales revenue broken down by product category and customer geographic region for completed orders.",
    goldSql: `SELECT p.category, c.region, ROUND(SUM(t.total_amount), 2) AS regional_revenue FROM transactions t JOIN products p ON t.product_id = p.product_id JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Completed' GROUP BY p.category, c.region ORDER BY p.category, regional_revenue DESC;`,
    candidateSql: `SELECT p.category, c.region, ROUND(SUM(t.total_amount), 2) AS regional_revenue FROM transactions t INNER JOIN products p ON t.product_id = p.product_id INNER JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Completed' GROUP BY p.category, c.region ORDER BY p.category, regional_revenue DESC;`,
    expectedColumns: ["category", "region", "regional_revenue"],
    expectedMinRows: 9,
    relevantTables: ["transactions", "products", "customers"],
    description: "Cross-dimensional 3-table join joining fact table with two dimension tables.",
  },
  {
    id: "bi-join-04",
    category: "joins",
    difficulty: "challenging",
    prompt:
      "Identify dormant customers created prior to 2023 who have never placed any transactions.",
    goldSql: `SELECT c.customer_id, c.company_name, c.created_at FROM customers c LEFT JOIN transactions t ON c.customer_id = t.customer_id WHERE t.transaction_id IS NULL AND c.created_at < '2023-01-01';`,
    candidateSql: `SELECT c.customer_id, c.company_name, c.created_at FROM customers c LEFT JOIN transactions t ON c.customer_id = t.customer_id WHERE t.customer_id IS NULL AND c.created_at < '2023-01-01';`,
    expectedColumns: ["customer_id", "company_name", "created_at"],
    expectedMinRows: 1,
    relevantTables: ["customers", "transactions"],
    description: "Anti-join pattern using LEFT JOIN and IS NULL check on foreign key.",
  },

  // ─── 4. Top-N ────────────────────────────────────────────────────────────────
  {
    id: "bi-topn-01",
    category: "top_n",
    difficulty: "simple",
    prompt:
      "Find the top 5 customers by total completed spend, along with their segment and country.",
    goldSql: `SELECT c.company_name, c.segment, c.country, ROUND(SUM(t.total_amount), 2) AS total_spend FROM customers c JOIN transactions t ON c.customer_id = t.customer_id WHERE t.status = 'Completed' GROUP BY c.company_name, c.segment, c.country ORDER BY total_spend DESC LIMIT 5;`,
    candidateSql: `SELECT c.company_name, c.segment, c.country, ROUND(SUM(t.total_amount), 2) AS total_spend FROM customers c JOIN transactions t ON c.customer_id = t.customer_id WHERE t.status = 'Completed' GROUP BY c.company_name, c.segment, c.country ORDER BY total_spend DESC LIMIT 5;`,
    expectedColumns: ["company_name", "segment", "country", "total_spend"],
    expectedMinRows: 5,
    relevantTables: ["customers", "transactions"],
    description: "Classic top-5 leaderboard by descending aggregated total spend.",
  },
  {
    id: "bi-topn-02",
    category: "top_n",
    difficulty: "moderate",
    prompt:
      "Identify the top 3 best-selling products by quantity sold to customers in the 'Americas' region.",
    goldSql: `SELECT p.product_name, p.category, SUM(t.quantity) AS total_units_sold FROM transactions t JOIN products p ON t.product_id = p.product_id JOIN customers c ON t.customer_id = c.customer_id WHERE c.region = 'Americas' AND t.status = 'Completed' GROUP BY p.product_name, p.category ORDER BY total_units_sold DESC LIMIT 3;`,
    candidateSql: `SELECT p.product_name, p.category, SUM(t.quantity) AS total_units_sold FROM transactions t JOIN products p ON t.product_id = p.product_id JOIN customers c ON t.customer_id = c.customer_id WHERE c.region = 'Americas' AND t.status = 'Completed' GROUP BY p.product_name, p.category ORDER BY total_units_sold DESC LIMIT 3;`,
    expectedColumns: ["product_name", "category", "total_units_sold"],
    expectedMinRows: 3,
    relevantTables: ["transactions", "products", "customers"],
    description: "Top-N filtered by dimension with aggregate ordering.",
  },
  {
    id: "bi-topn-03",
    category: "top_n",
    difficulty: "moderate",
    prompt: "List the top 3 sales reps with the highest average completed deal size.",
    goldSql: `SELECT r.rep_name, r.territory, ROUND(AVG(t.total_amount), 2) AS avg_deal_size FROM sales_reps r JOIN transactions t ON r.rep_id = t.rep_id WHERE t.status = 'Completed' GROUP BY r.rep_name, r.territory ORDER BY avg_deal_size DESC LIMIT 3;`,
    candidateSql: `SELECT r.rep_name, r.territory, ROUND(AVG(t.total_amount), 2) AS avg_deal_size FROM sales_reps r INNER JOIN transactions t ON r.rep_id = t.rep_id WHERE t.status = 'Completed' GROUP BY r.rep_name, r.territory ORDER BY avg_deal_size DESC LIMIT 3;`,
    expectedColumns: ["rep_name", "territory", "avg_deal_size"],
    expectedMinRows: 3,
    relevantTables: ["sales_reps", "transactions"],
    description: "Ranked ranking of sales reps by average deal amount.",
  },
  {
    id: "bi-topn-04",
    category: "top_n",
    difficulty: "challenging",
    prompt:
      "Find the single highest-value completed transaction for each geographic region using a window function.",
    goldSql: `WITH ranked_deals AS (SELECT c.region, t.transaction_id, c.company_name, t.total_amount, ROW_NUMBER() OVER (PARTITION BY c.region ORDER BY t.total_amount DESC) AS rnk FROM transactions t JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Completed') SELECT region, transaction_id, company_name, total_amount FROM ranked_deals WHERE rnk = 1 ORDER BY total_amount DESC;`,
    candidateSql: `WITH ranked_deals AS (SELECT c.region, t.transaction_id, c.company_name, t.total_amount, ROW_NUMBER() OVER (PARTITION BY c.region ORDER BY t.total_amount DESC) AS rnk FROM transactions t JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Completed') SELECT region, transaction_id, company_name, total_amount FROM ranked_deals WHERE rnk = 1 ORDER BY total_amount DESC;`,
    expectedColumns: ["region", "transaction_id", "company_name", "total_amount"],
    expectedMinRows: 3,
    relevantTables: ["transactions", "customers"],
    description: "CTE with ROW_NUMBER() partition window filter (Top-1 per group).",
  },

  // ─── 5. Anomaly Checks ───────────────────────────────────────────────────────
  {
    id: "bi-anom-01",
    category: "anomaly_checks",
    difficulty: "simple",
    prompt:
      "Flag high-risk transactions where the discount exceeds 20% and the purchase quantity exceeds 50 units.",
    goldSql: `SELECT transaction_id, customer_id, product_id, quantity, discount, total_amount FROM transactions WHERE discount > 0.20 AND quantity > 50;`,
    candidateSql: `SELECT transaction_id, customer_id, product_id, quantity, discount, total_amount FROM transactions WHERE discount > 0.20 AND quantity > 50;`,
    expectedColumns: [
      "transaction_id",
      "customer_id",
      "product_id",
      "quantity",
      "discount",
      "total_amount",
    ],
    expectedMinRows: 1,
    relevantTables: ["transactions"],
    description: "Threshold policy anomaly check detecting unauthorized bulk discounts.",
  },
  {
    id: "bi-anom-02",
    category: "anomaly_checks",
    difficulty: "moderate",
    prompt:
      "Detect negative-margin transactions where the effective selling price per unit after discount is below the product cost.",
    goldSql: `SELECT t.transaction_id, p.product_name, t.unit_price, t.discount, ROUND(t.unit_price * (1 - t.discount), 2) AS net_selling_price, p.cost, ROUND(t.unit_price * (1 - t.discount) - p.cost, 2) AS margin_loss FROM transactions t JOIN products p ON t.product_id = p.product_id WHERE (t.unit_price * (1 - t.discount)) < p.cost;`,
    candidateSql: `SELECT t.transaction_id, p.product_name, t.unit_price, t.discount, ROUND(t.unit_price * (1 - t.discount), 2) AS net_selling_price, p.cost, ROUND((t.unit_price * (1 - t.discount)) - p.cost, 2) AS margin_loss FROM transactions t JOIN products p ON t.product_id = p.product_id WHERE (t.unit_price * (1 - t.discount)) < p.cost;`,
    expectedColumns: [
      "transaction_id",
      "product_name",
      "unit_price",
      "discount",
      "net_selling_price",
      "cost",
      "margin_loss",
    ],
    expectedMinRows: 1,
    relevantTables: ["transactions", "products"],
    description: "Financial integrity check finding sales below manufacturing/operating cost.",
  },
  {
    id: "bi-anom-03",
    category: "anomaly_checks",
    difficulty: "challenging",
    prompt:
      "Identify transactions where the recorded total_amount deviates by more than $1.00 from the calculated formula (quantity * unit_price * (1 - discount)).",
    goldSql: `SELECT transaction_id, quantity, unit_price, discount, total_amount, ROUND(quantity * unit_price * (1 - discount), 2) AS expected_amount, ROUND(ABS(total_amount - (quantity * unit_price * (1 - discount))), 2) AS billing_discrepancy FROM transactions WHERE ABS(total_amount - (quantity * unit_price * (1 - discount))) > 1.0;`,
    candidateSql: `SELECT transaction_id, quantity, unit_price, discount, total_amount, ROUND(quantity * unit_price * (1 - discount), 2) AS expected_amount, ROUND(ABS(total_amount - (quantity * unit_price * (1 - discount))), 2) AS billing_discrepancy FROM transactions WHERE ABS(total_amount - (quantity * unit_price * (1 - discount))) > 1.0;`,
    expectedColumns: [
      "transaction_id",
      "quantity",
      "unit_price",
      "discount",
      "total_amount",
      "expected_amount",
      "billing_discrepancy",
    ],
    expectedMinRows: 1,
    relevantTables: ["transactions"],
    description: "Data quality & reconciliation check identifying pricing ledger discrepancies.",
  },
  {
    id: "bi-anom-04",
    category: "anomaly_checks",
    difficulty: "moderate",
    prompt:
      "Find all customers who have at least one refunded transaction exceeding $5,000 in value.",
    goldSql: `SELECT c.company_name, c.segment, t.transaction_id, t.transaction_date, t.total_amount FROM transactions t JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Refunded' AND t.total_amount > 5000.0 ORDER BY t.total_amount DESC;`,
    candidateSql: `SELECT c.company_name, c.segment, t.transaction_id, t.transaction_date, t.total_amount FROM transactions t JOIN customers c ON t.customer_id = c.customer_id WHERE t.status = 'Refunded' AND t.total_amount > 5000.0 ORDER BY t.total_amount DESC;`,
    expectedColumns: [
      "company_name",
      "segment",
      "transaction_id",
      "transaction_date",
      "total_amount",
    ],
    expectedMinRows: 1,
    relevantTables: ["transactions", "customers"],
    description: "Operational risk check detecting high-value chargebacks / refunds.",
  },
];

/**
 * Malformed SQL corpus to test Valid SQL Rate (VSR) discrimination.
 * These queries must fail SQL parsing.
 */
export const MALFORMED_SQL_CORPUS: SQLNegativeCase[] = [
  {
    id: "malformed-syntax-01",
    sql: "SELEKT company_name FORM customers WHERE segment = 'Enterprise';",
    defectType: "syntax_error",
    expectedErrorSubstr: "syntax error",
  },
  {
    id: "malformed-syntax-02",
    sql: "SELECT company_name,, segment FROM customers;",
    defectType: "syntax_error",
    expectedErrorSubstr: "syntax error",
  },
  {
    id: "malformed-syntax-03",
    sql: "SELECT * WHERE total_amount > 100 FROM transactions;",
    defectType: "syntax_error",
    expectedErrorSubstr: "syntax error",
  },
  {
    id: "malformed-syntax-04",
    sql: "SELECT * FROM (SELECT customer_id FROM customers WHERE country = 'USA'",
    defectType: "syntax_error",
    expectedErrorSubstr: "syntax error",
  },
  {
    id: "malformed-syntax-05",
    sql: "SELECT 'unclosed string literal FROM products;",
    defectType: "syntax_error",
    expectedErrorSubstr: "unterminated quoted string",
  },
];

/**
 * Hallucinated SQL corpus to test Column Hallucination Rate discrimination.
 * These queries reference non-existent columns and MUST cause DuckDB binder errors.
 */
export const HALLUCINATED_SQL_CORPUS: SQLNegativeCase[] = [
  {
    id: "hallucinated-col-01",
    sql: "SELECT customer_id, client_name FROM customers WHERE segment = 'Enterprise';",
    defectType: "column_hallucination",
    hallucinatedColumn: "client_name",
    targetTable: "customers",
    expectedErrorSubstr: 'Referenced column "client_name" not found in FROM clause',
  },
  {
    id: "hallucinated-col-02",
    sql: "SELECT transaction_id, revenue FROM transactions WHERE status = 'Completed';",
    defectType: "column_hallucination",
    hallucinatedColumn: "revenue",
    targetTable: "transactions",
    expectedErrorSubstr: 'Referenced column "revenue" not found in FROM clause',
  },
  {
    id: "hallucinated-col-03",
    sql: "SELECT product_name, price_per_unit FROM products;",
    defectType: "column_hallucination",
    hallucinatedColumn: "price_per_unit",
    targetTable: "products",
    expectedErrorSubstr: 'Referenced column "price_per_unit" not found in FROM clause',
  },
  {
    id: "hallucinated-col-04",
    sql: "SELECT rep_name, rep_email, quota FROM sales_reps;",
    defectType: "column_hallucination",
    hallucinatedColumn: "rep_email",
    targetTable: "sales_reps",
    expectedErrorSubstr: 'Referenced column "rep_email" not found in FROM clause',
  },
  {
    id: "hallucinated-col-05",
    sql: "SELECT customer_id, tax_amount FROM transactions;",
    defectType: "column_hallucination",
    hallucinatedColumn: "tax_amount",
    targetTable: "transactions",
    expectedErrorSubstr: 'Referenced column "tax_amount" not found in FROM clause',
  },
  {
    id: "hallucinated-col-06",
    sql: "SELECT company_name, postal_code FROM customers;",
    defectType: "column_hallucination",
    hallucinatedColumn: "postal_code",
    targetTable: "customers",
    expectedErrorSubstr: 'Referenced column "postal_code" not found in FROM clause',
  },
];

/**
 * Chart tool invocation test cases for chart-tool-conformance.eval.ts.
 */
export interface ChartToolCase {
  id: string;
  name: "make_chart";
  params: {
    chart_type: string;
    x: string;
    y: string;
    aggregate?: string;
    title: string;
    data?: { label: string; value: number }[];
  };
  table: string;
  semanticClass: "temporal" | "categorical" | "correlation" | "matrix" | "part_to_whole";
  shouldPass: boolean;
  expectReason?: string;
}

export interface ClarificationToolCase {
  id: string;
  name: "request_clarification";
  params: {
    question: string;
    options: string[];
    multiSelect?: boolean;
  };
  triggerPrompt: string;
  ambiguityType: "metric_ambiguity" | "temporal_ambiguity" | "filter_ambiguity";
  shouldPass: boolean;
  expectReason?: string;
}

export const CHART_TOOL_CASES: ChartToolCase[] = [
  // ─── Valid Cases ──────────────────────────────────────────────────────────
  {
    id: "chart-temporal-line",
    name: "make_chart",
    params: {
      chart_type: "line",
      x: "transaction_date",
      y: "total_amount",
      aggregate: "sum",
      title: "Daily Completed Revenue Trend",
    },
    table: "transactions",
    semanticClass: "temporal",
    shouldPass: true,
  },
  {
    id: "chart-temporal-area",
    name: "make_chart",
    params: {
      chart_type: "area",
      x: "created_at",
      y: "customer_id",
      aggregate: "count",
      title: "Cumulative Customer Onboarding Volume",
    },
    table: "customers",
    semanticClass: "temporal",
    shouldPass: true,
  },
  {
    id: "chart-categorical-bar",
    name: "make_chart",
    params: {
      chart_type: "bar",
      x: "category",
      y: "unit_price",
      aggregate: "avg",
      title: "Average Product Unit Price by Category",
    },
    table: "products",
    semanticClass: "categorical",
    shouldPass: true,
  },
  {
    id: "chart-part-to-whole-pie",
    name: "make_chart",
    params: {
      chart_type: "pie",
      x: "segment",
      y: "customer_id",
      aggregate: "count",
      title: "Customer Distribution by Business Segment",
    },
    table: "customers",
    semanticClass: "part_to_whole",
    shouldPass: true,
  },
  {
    id: "chart-correlation-scatter",
    name: "make_chart",
    params: {
      chart_type: "scatter",
      x: "discount",
      y: "quantity",
      aggregate: "none",
      title: "Transaction Volume vs Applied Discount Rate",
    },
    table: "transactions",
    semanticClass: "correlation",
    shouldPass: true,
  },
  {
    id: "chart-matrix-heatmap",
    name: "make_chart",
    params: {
      chart_type: "heatmap",
      x: "region",
      y: "segment",
      aggregate: "count",
      title: "Customer Density Matrix by Region and Segment",
    },
    table: "customers",
    semanticClass: "matrix",
    shouldPass: true,
  },
  {
    id: "chart-synthetic-standalone",
    name: "make_chart",
    params: {
      chart_type: "bar",
      x: "label",
      y: "value",
      aggregate: "none",
      title: "Target vs Actual Projection",
      data: [
        { label: "Target", value: 100000 },
        { label: "Actual", value: 112000 },
      ],
    },
    table: "",
    semanticClass: "categorical",
    shouldPass: true,
  },

  // ─── Invalid / Defective Cases ───────────────────────────────────────────
  {
    id: "chart-hallucinated-x-column",
    name: "make_chart",
    params: {
      chart_type: "bar",
      x: "client_name", // Does not exist
      y: "total_amount",
      aggregate: "sum",
      title: "Revenue by Client Name",
    },
    table: "customers",
    semanticClass: "categorical",
    shouldPass: false,
    expectReason: 'non-existent column: "client_name"',
  },
  {
    id: "chart-hallucinated-y-column",
    name: "make_chart",
    params: {
      chart_type: "line",
      x: "transaction_date",
      y: "gross_margin_rate", // Does not exist
      aggregate: "avg",
      title: "Margin Trend",
    },
    table: "transactions",
    semanticClass: "temporal",
    shouldPass: false,
    expectReason: 'non-existent column: "gross_margin_rate"',
  },
  {
    id: "chart-semantic-mismatch-scatter-strings",
    name: "make_chart",
    params: {
      chart_type: "scatter",
      x: "company_name", // String
      y: "country", // String
      aggregate: "none",
      title: "Company vs Country Correlation",
    },
    table: "customers",
    semanticClass: "correlation",
    shouldPass: false,
    expectReason: "scatter chart requires numeric axes for both x and y dimensions",
  },
  {
    id: "chart-semantic-mismatch-pie-timeseries",
    name: "make_chart",
    params: {
      chart_type: "pie",
      x: "transaction_date", // High-cardinality date
      y: "total_amount",
      aggregate: "sum",
      title: "Revenue Slice by Date",
    },
    table: "transactions",
    semanticClass: "part_to_whole",
    shouldPass: false,
    expectReason: "pie chart is inappropriate for high-cardinality temporal dimensions",
  },
  {
    id: "chart-invalid-chart-type",
    name: "make_chart",
    params: {
      chart_type: "3d_surface_wireframe", // Unsupported
      x: "category",
      y: "unit_price",
      title: "Product Prices",
    },
    table: "products",
    semanticClass: "categorical",
    shouldPass: false,
    expectReason: "unsupported chart type: 3d_surface_wireframe",
  },
  {
    id: "chart-empty-x-binding",
    name: "make_chart",
    params: {
      chart_type: "bar",
      x: "",
      y: "total_amount",
      title: "Missing X Axis",
    },
    table: "transactions",
    semanticClass: "categorical",
    shouldPass: false,
    expectReason: "x axis column binding cannot be empty",
  },
];

export const CLARIFICATION_TOOL_CASES: ClarificationToolCase[] = [
  // ─── Valid Cases ──────────────────────────────────────────────────────────
  {
    id: "clarif-ambiguous-metric",
    name: "request_clarification",
    triggerPrompt: "Who is our top performing sales rep?",
    ambiguityType: "metric_ambiguity",
    params: {
      question: "Which metric defines the top performing sales rep?",
      options: ["Total Revenue Booked", "Quota Attainment %", "Number of Closed Deals"],
      multiSelect: false,
    },
    shouldPass: true,
  },
  {
    id: "clarif-ambiguous-timeframe",
    name: "request_clarification",
    triggerPrompt: "Show me recent sales revenue",
    ambiguityType: "temporal_ambiguity",
    params: {
      question: "What time period should be analyzed?",
      options: ["Year to Date (2024)", "Previous Quarter (Q2 2024)", "Full Year 2023", "All Time"],
      multiSelect: false,
    },
    shouldPass: true,
  },
  {
    id: "clarif-ambiguous-region-filter",
    name: "request_clarification",
    triggerPrompt: "Filter customers by territory",
    ambiguityType: "filter_ambiguity",
    params: {
      question: "Which geographic regions should be included?",
      options: ["Americas", "EMEA", "APAC"],
      multiSelect: true,
    },
    shouldPass: true,
  },

  // ─── Invalid / Defective Cases ───────────────────────────────────────────
  {
    id: "clarif-too-few-options",
    name: "request_clarification",
    triggerPrompt: "Show me sales",
    ambiguityType: "temporal_ambiguity",
    params: {
      question: "Pick an option",
      options: ["Only One Option"], // Must have >= 2
      multiSelect: false,
    },
    shouldPass: false,
    expectReason: "options array must contain between 2 and 8 items",
  },
  {
    id: "clarif-too-many-options",
    name: "request_clarification",
    triggerPrompt: "Select a country",
    ambiguityType: "filter_ambiguity",
    params: {
      question: "Which country?",
      options: ["USA", "Canada", "Germany", "France", "UK", "Japan", "Italy", "Spain", "Australia"], // 9 items (> 8)
      multiSelect: false,
    },
    shouldPass: false,
    expectReason: "options array must contain between 2 and 8 items",
  },
  {
    id: "clarif-numbered-options-violation",
    name: "request_clarification",
    triggerPrompt: "Which segment?",
    ambiguityType: "filter_ambiguity",
    params: {
      question: "Select customer segment:",
      options: ["1. Enterprise", "2. Mid-Market", "3. SMB"],
      multiSelect: false,
    },
    shouldPass: false,
    expectReason: "options must not contain numbered prefixes",
  },
  {
    id: "clarif-question-too-long",
    name: "request_clarification",
    triggerPrompt: "Help me choose",
    ambiguityType: "metric_ambiguity",
    params: {
      question:
        "Could you please explain in extreme detail which exact mathematical formula and statistical measurement you would prefer us to utilize for this particular quarterly report across all customer segments and accounts?", // > 160 chars
      options: ["Formula A", "Formula B"],
      multiSelect: false,
    },
    shouldPass: false,
    expectReason: "question exceeds maximum allowed length of 160 characters",
  },
];
