// wordcloud2 (timdream/wordcloud2.js) ships its npm `main` as a browser DEMO
// file with no module export. The actual UMD library — `module.exports =
// WordCloud` — lives at `wordcloud2/src/wordcloud2.js`, so we import that path
// directly and type it here (the published `@types/wordcloud` targets the
// differently-named `wordcloud` package and does not cover this deep path).
declare module "wordcloud2/src/wordcloud2.js" {
  interface WordCloudOptions {
    /** `[word, weight]` pairs. */
    list: Array<[string, number]>;
    fontFamily?: string;
    fontWeight?: string | number;
    /** Static color, or `(word, weight, fontSize, distance, theta) => color`. */
    color?:
      | string
      | ((
          word: string,
          weight: number,
          fontSize: number,
          distance: number,
          theta: number,
        ) => string);
    backgroundColor?: string;
    gridSize?: number;
    /** Maps a list weight to a font size (number multiplier or fn). */
    weightFactor?: number | ((weight: number) => number);
    minSize?: number;
    rotateRatio?: number;
    rotationSteps?: number;
    minRotation?: number;
    maxRotation?: number;
    shape?: string;
    ellipticity?: number;
    drawOutOfBound?: boolean;
    shrinkToFit?: boolean;
    clearCanvas?: boolean;
    hover?: (
      item: [string, number] | undefined,
      dimension: { x: number; y: number; w: number; h: number } | undefined,
      event: MouseEvent,
    ) => void;
    click?: (item: [string, number], dimension: unknown, event: MouseEvent) => void;
  }

  interface WordCloudStatic {
    (target: HTMLElement | HTMLElement[], options: WordCloudOptions): void;
    isSupported: boolean;
    minFontSize: number;
    stop: () => void;
  }

  const WordCloud: WordCloudStatic;
  export = WordCloud;
}
