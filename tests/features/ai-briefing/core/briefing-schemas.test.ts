import { describe, it, expect } from "vitest";
import {
  ActionPlanItemSchema,
  ActionPlanSchema,
  AnomalyExplanationSchema,
  DataStorySchema,
} from "@/features/ai-briefing/core/briefing-schemas";

// ─── ActionPlanItemSchema ─────────────────────────────────────────────────────

describe("ActionPlanItemSchema", () => {
  it("accepts a fully valid action plan item", () => {
    // Arrange
    const input = {
      priority: 1,
      category: "critical",
      action: "Fix the broken pipeline immediately",
      rationale: "The pipeline is causing data loss in production",
      estimatedImpact: "Prevents revenue loss",
    };

    // Act
    const result = ActionPlanItemSchema.parse(input);

    // Assert
    expect(result.priority).toBe(1);
    expect(result.category).toBe("critical");
  });

  it("accepts all valid category enum values", () => {
    // Arrange
    const categories = ["critical", "high", "medium", "low"] as const;

    for (const category of categories) {
      // Act
      const result = ActionPlanItemSchema.parse({
        priority: 3,
        category,
        action: "Take action now",
        rationale: "This is important",
        estimatedImpact: "High impact",
      });

      // Assert
      expect(result.category).toBe(category);
    }
  });

  it("coerces string priority to number", () => {
    // Arrange: priority is a string that should be coerced
    const input = {
      priority: "2",
      category: "high",
      action: "Review system logs",
      rationale: "Anomalies detected",
      estimatedImpact: "Reduce risk",
    };

    // Act
    const result = ActionPlanItemSchema.parse(input);

    // Assert
    expect(result.priority).toBe(2);
  });

  it("rejects priority less than 1", () => {
    // Arrange
    const input = {
      priority: 0,
      category: "medium",
      action: "Some action",
      rationale: "Some rationale",
      estimatedImpact: "Some impact",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects priority greater than 5", () => {
    // Arrange
    const input = {
      priority: 6,
      category: "low",
      action: "Some action",
      rationale: "Some rationale",
      estimatedImpact: "Some impact",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects a non-integer priority (float)", () => {
    // Arrange
    const input = {
      priority: 2.5,
      category: "low",
      action: "Some action",
      rationale: "Some rationale",
      estimatedImpact: "Some impact",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects an invalid category enum value", () => {
    // Arrange
    const input = {
      priority: 1,
      category: "urgent",
      action: "Some action",
      rationale: "Some rationale",
      estimatedImpact: "Some impact",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects an action string shorter than 4 characters", () => {
    // Arrange
    const input = {
      priority: 1,
      category: "high",
      action: "abc",
      rationale: "Some rationale",
      estimatedImpact: "Some impact",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects an action string longer than 240 characters", () => {
    // Arrange
    const input = {
      priority: 1,
      category: "high",
      action: "a".repeat(241),
      rationale: "Some rationale",
      estimatedImpact: "Some impact",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects a rationale string shorter than 4 characters", () => {
    // Arrange
    const input = {
      priority: 1,
      category: "high",
      action: "Take corrective action",
      rationale: "abc",
      estimatedImpact: "Some impact",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects a rationale string longer than 600 characters", () => {
    // Arrange
    const input = {
      priority: 1,
      category: "high",
      action: "Take corrective action",
      rationale: "r".repeat(601),
      estimatedImpact: "Some impact",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects an estimatedImpact string shorter than 2 characters", () => {
    // Arrange
    const input = {
      priority: 1,
      category: "high",
      action: "Take corrective action",
      rationale: "This is important",
      estimatedImpact: "x",
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("rejects an estimatedImpact string longer than 240 characters", () => {
    // Arrange
    const input = {
      priority: 1,
      category: "high",
      action: "Take corrective action",
      rationale: "This is important",
      estimatedImpact: "i".repeat(241),
    };

    // Act + Assert
    expect(() => ActionPlanItemSchema.parse(input)).toThrow();
  });

  it("accepts minimum-length strings at the boundaries", () => {
    // Arrange: action=4, rationale=4, estimatedImpact=2
    const input = {
      priority: 5,
      category: "low",
      action: "abcd",
      rationale: "abcd",
      estimatedImpact: "ab",
    };

    // Act
    const result = ActionPlanItemSchema.parse(input);

    // Assert
    expect(result.action).toBe("abcd");
    expect(result.rationale).toBe("abcd");
    expect(result.estimatedImpact).toBe("ab");
  });

  it("accepts maximum-length strings at the boundaries", () => {
    // Arrange: action=240, rationale=600, estimatedImpact=240
    const input = {
      priority: 1,
      category: "critical",
      action: "a".repeat(240),
      rationale: "r".repeat(600),
      estimatedImpact: "i".repeat(240),
    };

    // Act
    const result = ActionPlanItemSchema.parse(input);

    // Assert
    expect(result.action).toHaveLength(240);
    expect(result.rationale).toHaveLength(600);
    expect(result.estimatedImpact).toHaveLength(240);
  });
});

// ─── ActionPlanSchema ─────────────────────────────────────────────────────────

describe("ActionPlanSchema", () => {
  const validItem = {
    priority: 1,
    category: "critical" as const,
    action: "Fix the broken pipeline immediately",
    rationale: "The pipeline is causing data loss in production",
    estimatedImpact: "Prevents revenue loss",
  };

  it("accepts a valid plan with one item", () => {
    // Arrange
    const input = { items: [validItem] };

    // Act
    const result = ActionPlanSchema.parse(input);

    // Assert
    expect(result.items).toHaveLength(1);
    expect(result.items[0].priority).toBe(1);
  });

  it("accepts a valid plan with up to 8 items", () => {
    // Arrange: exactly 8 items (max boundary)
    const input = {
      items: Array.from({ length: 8 }, (_, i) => ({
        ...validItem,
        priority: Math.min(i + 1, 5),
      })),
    };

    // Act
    const result = ActionPlanSchema.parse(input);

    // Assert
    expect(result.items).toHaveLength(8);
  });

  it("rejects an empty items array (min 1)", () => {
    // Arrange
    const input = { items: [] };

    // Act + Assert
    expect(() => ActionPlanSchema.parse(input)).toThrow();
  });

  it("rejects more than 8 items", () => {
    // Arrange: 9 items (exceeds max of 8)
    const input = {
      items: Array.from({ length: 9 }, (_, i) => ({
        ...validItem,
        priority: Math.min(i + 1, 5),
      })),
    };

    // Act + Assert
    expect(() => ActionPlanSchema.parse(input)).toThrow();
  });

  it("rejects items array with an invalid item inside", () => {
    // Arrange: one valid item and one item with wrong category
    const input = {
      items: [
        validItem,
        { ...validItem, category: "extreme" },
      ],
    };

    // Act + Assert
    expect(() => ActionPlanSchema.parse(input)).toThrow();
  });
});

// ─── AnomalyExplanationSchema ─────────────────────────────────────────────────

describe("AnomalyExplanationSchema", () => {
  it("accepts a valid anomaly explanation with one hypothesis", () => {
    // Arrange
    const input = {
      explanation: "The data shows unusual spikes in revenue during Q4.",
      hypotheses: ["Seasonal promotion effect"],
    };

    // Act
    const result = AnomalyExplanationSchema.parse(input);

    // Assert
    expect(result.explanation).toContain("unusual spikes");
    expect(result.hypotheses).toHaveLength(1);
  });

  it("accepts up to 4 hypotheses (max boundary)", () => {
    // Arrange
    const input = {
      explanation: "Multiple anomalies detected in the dataset columns.",
      hypotheses: [
        "Hypothesis one about data entry",
        "Hypothesis two about system failure",
        "Hypothesis three about external events",
        "Hypothesis four about seasonal trend",
      ],
    };

    // Act
    const result = AnomalyExplanationSchema.parse(input);

    // Assert
    expect(result.hypotheses).toHaveLength(4);
  });

  it("rejects explanation shorter than 8 characters", () => {
    // Arrange
    const input = {
      explanation: "Short",
      hypotheses: ["Valid hypothesis here"],
    };

    // Act + Assert
    expect(() => AnomalyExplanationSchema.parse(input)).toThrow();
  });

  it("rejects explanation longer than 800 characters", () => {
    // Arrange
    const input = {
      explanation: "e".repeat(801),
      hypotheses: ["Valid hypothesis here"],
    };

    // Act + Assert
    expect(() => AnomalyExplanationSchema.parse(input)).toThrow();
  });

  it("rejects an empty hypotheses array (min 1)", () => {
    // Arrange
    const input = {
      explanation: "The data shows unusual spikes in revenue.",
      hypotheses: [],
    };

    // Act + Assert
    expect(() => AnomalyExplanationSchema.parse(input)).toThrow();
  });

  it("rejects more than 4 hypotheses", () => {
    // Arrange: 5 hypotheses (exceeds max of 4)
    const input = {
      explanation: "The data shows unusual spikes in revenue.",
      hypotheses: [
        "Hypothesis one",
        "Hypothesis two",
        "Hypothesis three",
        "Hypothesis four",
        "Hypothesis five",
      ],
    };

    // Act + Assert
    expect(() => AnomalyExplanationSchema.parse(input)).toThrow();
  });

  it("rejects a hypothesis shorter than 4 characters", () => {
    // Arrange
    const input = {
      explanation: "The data shows unusual spikes in revenue.",
      hypotheses: ["abc"],
    };

    // Act + Assert
    expect(() => AnomalyExplanationSchema.parse(input)).toThrow();
  });

  it("rejects a hypothesis longer than 400 characters", () => {
    // Arrange
    const input = {
      explanation: "The data shows unusual spikes in revenue.",
      hypotheses: ["h".repeat(401)],
    };

    // Act + Assert
    expect(() => AnomalyExplanationSchema.parse(input)).toThrow();
  });

  it("accepts boundary-minimum strings", () => {
    // Arrange: explanation=8 chars, hypothesis=4 chars
    const input = {
      explanation: "12345678",
      hypotheses: ["abcd"],
    };

    // Act
    const result = AnomalyExplanationSchema.parse(input);

    // Assert
    expect(result.explanation).toHaveLength(8);
    expect(result.hypotheses[0]).toHaveLength(4);
  });

  it("accepts boundary-maximum strings", () => {
    // Arrange: explanation=800 chars, hypothesis=400 chars
    const input = {
      explanation: "e".repeat(800),
      hypotheses: ["h".repeat(400)],
    };

    // Act
    const result = AnomalyExplanationSchema.parse(input);

    // Assert
    expect(result.explanation).toHaveLength(800);
    expect(result.hypotheses[0]).toHaveLength(400);
  });
});

// ─── DataStorySchema ──────────────────────────────────────────────────────────

describe("DataStorySchema", () => {
  it("accepts a valid data story with all three fields", () => {
    // Arrange
    const input = {
      setup: "Revenue was stable throughout most of the year with consistent monthly targets.",
      conflict: "In October a sudden spike appeared that broke all historical patterns.",
      resolution: "Investigation revealed a one-time promotional campaign caused the spike.",
    };

    // Act
    const result = DataStorySchema.parse(input);

    // Assert
    expect(result.setup).toContain("stable");
    expect(result.conflict).toContain("spike");
    expect(result.resolution).toContain("promotional");
  });

  it("rejects setup shorter than 20 characters", () => {
    // Arrange
    const input = {
      setup: "Too short setup.",
      conflict: "Conflict with sufficient length to pass the twenty character minimum threshold.",
      resolution: "Resolution with sufficient length to pass the twenty character minimum threshold.",
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });

  it("rejects setup longer than 1600 characters", () => {
    // Arrange
    const input = {
      setup: "s".repeat(1601),
      conflict: "Conflict with sufficient length to pass the minimum twenty character check.",
      resolution: "Resolution with sufficient length to pass the minimum twenty character check.",
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });

  it("rejects conflict shorter than 20 characters", () => {
    // Arrange
    const input = {
      setup: "Setup with sufficient length to pass the minimum twenty character threshold check.",
      conflict: "Too short!",
      resolution: "Resolution with sufficient length to pass the minimum twenty character check.",
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });

  it("rejects conflict longer than 1600 characters", () => {
    // Arrange
    const input = {
      setup: "Setup with sufficient length to pass the minimum twenty character threshold check.",
      conflict: "c".repeat(1601),
      resolution: "Resolution with sufficient length to pass the minimum twenty character check.",
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });

  it("rejects resolution shorter than 20 characters", () => {
    // Arrange
    const input = {
      setup: "Setup with sufficient length to pass the minimum twenty character threshold check.",
      conflict: "Conflict with sufficient length to pass the minimum twenty character threshold.",
      resolution: "Too short!",
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });

  it("rejects resolution longer than 1600 characters", () => {
    // Arrange
    const input = {
      setup: "Setup with sufficient length to pass the minimum twenty character threshold check.",
      conflict: "Conflict with sufficient length to pass the minimum twenty character threshold.",
      resolution: "r".repeat(1601),
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });

  it("accepts boundary-minimum strings (exactly 20 characters each)", () => {
    // Arrange
    const twentyChars = "a".repeat(20);
    const input = {
      setup: twentyChars,
      conflict: twentyChars,
      resolution: twentyChars,
    };

    // Act
    const result = DataStorySchema.parse(input);

    // Assert
    expect(result.setup).toHaveLength(20);
    expect(result.conflict).toHaveLength(20);
    expect(result.resolution).toHaveLength(20);
  });

  it("accepts boundary-maximum strings (exactly 1600 characters each)", () => {
    // Arrange
    const sixteenHundredChars = "x".repeat(1600);
    const input = {
      setup: sixteenHundredChars,
      conflict: sixteenHundredChars,
      resolution: sixteenHundredChars,
    };

    // Act
    const result = DataStorySchema.parse(input);

    // Assert
    expect(result.setup).toHaveLength(1600);
    expect(result.conflict).toHaveLength(1600);
    expect(result.resolution).toHaveLength(1600);
  });

  it("rejects missing setup field", () => {
    // Arrange
    const input = {
      conflict: "Conflict with sufficient length for the twenty character minimum threshold.",
      resolution: "Resolution with sufficient length for the twenty character minimum threshold.",
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });

  it("rejects missing conflict field", () => {
    // Arrange
    const input = {
      setup: "Setup with sufficient length for the twenty character minimum threshold here.",
      resolution: "Resolution with sufficient length for the twenty character minimum threshold.",
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });

  it("rejects missing resolution field", () => {
    // Arrange
    const input = {
      setup: "Setup with sufficient length for the twenty character minimum threshold here.",
      conflict: "Conflict with sufficient length for the twenty character minimum threshold here.",
    };

    // Act + Assert
    expect(() => DataStorySchema.parse(input)).toThrow();
  });
});
