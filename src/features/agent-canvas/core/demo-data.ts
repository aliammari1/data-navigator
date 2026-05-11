/**
 * Demo datasets — inline JSON generators for quick pipeline testing.
 * No upload needed. Each returns Record<string,unknown>[] ready for DuckDB.
 */

const RNG = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
};

// ─── Telecom 50k ─────────────────────────────────────────────────────────────

export function generateTelecom(n = 5000): Record<string, unknown>[] {
  const rng = RNG(42);
  const regions = ["North", "South", "East", "West", "Central"];
  const plans = ["Basic", "Standard", "Premium", "Enterprise"];
  const statuses = ["Active", "Churned", "Suspended", "Pending"];
  const rows: Record<string, unknown>[] = [];
  const base = new Date("2024-01-01").getTime();

  for (let i = 0; i < n; i++) {
    const region = regions[Math.floor(rng() * regions.length)];
    const plan = plans[Math.floor(rng() * plans.length)];
    const status = statuses[Math.floor(rng() * statuses.length)];
    const revenue =
      plan === "Enterprise"
        ? 800 + rng() * 1200
        : plan === "Premium"
          ? 300 + rng() * 500
          : plan === "Standard"
            ? 100 + rng() * 200
            : 30 + rng() * 70;
    const churn = status === "Churned" ? 1 : 0;
    rows.push({
      customer_id: i + 1,
      region,
      plan,
      status,
      revenue: Math.round(revenue * 100) / 100,
      data_usage_gb: Math.round(rng() * 50 * 10) / 10,
      calls_min: Math.round(rng() * 5000),
      tenure_months: Math.floor(rng() * 72),
      churned: churn,
      signup_date: new Date(base + Math.floor(rng() * 365 * 2) * 86400000)
        .toISOString()
        .slice(0, 10),
    });
  }
  return rows;
}

// ─── Sales 12k ────────────────────────────────────────────────────────────────

export function generateSales(n = 1200): Record<string, unknown>[] {
  const rng = RNG(99);
  const products = [
    "Laptop",
    "Phone",
    "Tablet",
    "Monitor",
    "Keyboard",
    "Headphones",
    "Camera",
  ];
  const categories = ["Electronics", "Accessories", "Peripherals"];
  const regions = ["EMEA", "APAC", "AMER", "LATAM"];
  const rows: Record<string, unknown>[] = [];
  const base = new Date("2023-01-01").getTime();

  for (let i = 0; i < n; i++) {
    const product = products[Math.floor(rng() * products.length)];
    const qty = Math.floor(rng() * 20) + 1;
    const price = Math.round((50 + rng() * 1950) * 100) / 100;
    rows.push({
      order_id: `ORD-${String(i + 1).padStart(5, "0")}`,
      product,
      category: categories[Math.floor(rng() * categories.length)],
      region: regions[Math.floor(rng() * regions.length)],
      quantity: qty,
      unit_price: price,
      revenue: Math.round(qty * price * 100) / 100,
      discount_pct: Math.round(rng() * 30),
      order_date: new Date(base + Math.floor(rng() * 365 * 2) * 86400000)
        .toISOString()
        .slice(0, 10),
    });
  }
  return rows;
}

// ─── HR 8k ─────────────────────────────────────────────────────────────────

export function generateHR(n = 800): Record<string, unknown>[] {
  const rng = RNG(7);
  const depts = [
    "Engineering",
    "Sales",
    "Marketing",
    "Finance",
    "HR",
    "Operations",
  ];
  const levels = ["Junior", "Mid", "Senior", "Lead", "Manager", "Director"];
  const locations = ["NYC", "SF", "Austin", "London", "Berlin", "Singapore"];
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < n; i++) {
    const dept = depts[Math.floor(rng() * depts.length)];
    const level = levels[Math.floor(rng() * levels.length)];
    const baseSalary =
      level === "Director"
        ? 180000 + rng() * 80000
        : level === "Manager"
          ? 120000 + rng() * 60000
          : level === "Lead"
            ? 90000 + rng() * 40000
            : level === "Senior"
              ? 70000 + rng() * 30000
              : level === "Mid"
                ? 55000 + rng() * 20000
                : 40000 + rng() * 15000;
    rows.push({
      employee_id: i + 1,
      department: dept,
      level,
      location: locations[Math.floor(rng() * locations.length)],
      salary: Math.round(baseSalary),
      tenure_years: Math.round(rng() * 20 * 10) / 10,
      performance_score: Math.round((2 + rng() * 3) * 10) / 10,
      satisfaction: Math.round((1 + rng() * 4) * 10) / 10,
      attrition: rng() < 0.12 ? 1 : 0,
    });
  }
  return rows;
}

// ─── Ecommerce 20k ───────────────────────────────────────────────────────────

export function generateEcommerce(n = 2000): Record<string, unknown>[] {
  const rng = RNG(31);
  const categories = [
    "Fashion",
    "Electronics",
    "Home",
    "Sports",
    "Beauty",
    "Books",
    "Toys",
  ];
  const channels = ["Web", "Mobile", "App", "Marketplace"];
  const statuses = ["Delivered", "Returned", "Pending", "Cancelled"];
  const rows: Record<string, unknown>[] = [];
  const base = new Date("2024-01-01").getTime();

  for (let i = 0; i < n; i++) {
    const category = categories[Math.floor(rng() * categories.length)];
    const status = statuses[Math.floor(rng() * statuses.length)];
    const gmv = Math.round((10 + rng() * 490) * 100) / 100;
    rows.push({
      order_id: `EC-${String(i + 1).padStart(6, "0")}`,
      category,
      channel: channels[Math.floor(rng() * channels.length)],
      status,
      gmv,
      items: Math.floor(rng() * 8) + 1,
      discount: Math.round(rng() * 50),
      rating: Math.round((1 + rng() * 4) * 10) / 10,
      return_flag: status === "Returned" ? 1 : 0,
      order_date: new Date(base + Math.floor(rng() * 365) * 86400000)
        .toISOString()
        .slice(0, 10),
    });
  }
  return rows;
}

export type DemoDataset = "telecom" | "sales" | "hr" | "ecommerce";

export const DEMO_PILLS: Array<{
  id: DemoDataset;
  label: string;
  rows: number;
  color: string;
}> = [
  {
    id: "telecom",
    label: "Telecom 5k",
    rows: 5000,
    color: "from-violet-600 to-indigo-600",
  },
  {
    id: "sales",
    label: "Sales 1.2k",
    rows: 1200,
    color: "from-emerald-600 to-teal-600",
  },
  {
    id: "hr",
    label: "HR 800",
    rows: 800,
    color: "from-amber-600 to-orange-600",
  },
  {
    id: "ecommerce",
    label: "Ecommerce 2k",
    rows: 2000,
    color: "from-rose-600 to-pink-600",
  },
];

export function generateDataset(id: DemoDataset): Record<string, unknown>[] {
  switch (id) {
    case "telecom":
      return generateTelecom();
    case "sales":
      return generateSales();
    case "hr":
      return generateHR();
    case "ecommerce":
      return generateEcommerce();
  }
}
