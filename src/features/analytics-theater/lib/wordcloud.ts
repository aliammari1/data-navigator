// Typed lazy-load boundary for wordcloud2. We import the real UMD module
// (`src/wordcloud2.js`) rather than the package `main`, which is a demo file
// with no export (see src/types/wordcloud2.d.ts). Dynamically imported by
// WordCloudScene so the renderer stays out of the main client chunk.
import WordCloud from "wordcloud2/src/wordcloud2.js";

export default WordCloud;
