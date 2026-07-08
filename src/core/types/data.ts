export interface DataColumn {
  key: string;
  label: string;
  type: "string" | "number" | "date";
  visible: boolean;
}

export interface DataTransform {
  type: "rename" | "filter" | "computed";
  column?: string;
  newName?: string;
  operator?: "equals" | "contains" | "greater" | "less";
  value?: string | number;
  expression?: string;
}
