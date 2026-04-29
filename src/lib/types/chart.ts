export interface ChartCustomization {
  colors: string[];
  showLegend: boolean;
  legendPosition: "top" | "bottom" | "left" | "right";
  showGrid: boolean;
  showTooltip: boolean;
  showAxes: boolean;
  animate: boolean;
  barDirection: "vertical" | "horizontal";
  barStacked: boolean;
  donutHoleSize: number;
  lineType: "monotone" | "linear" | "step";
  areaStyle: boolean;
}
