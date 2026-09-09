declare module "diff-match-patch" {
  export class diff_match_patch {
    public Diff_Timeout: number;
    public diff_main(a: number[] | string, b: number[] | string): Array<[number, number[]]>;
    public diff_cleanupSemantic(diffs: Array<[number, number[]]>): void;
  }
  export type Diff = [number, number[]];
}
