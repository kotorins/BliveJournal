// https://github.com/Microsoft/TypeScript/blob/main/src/lib/webworker.generated.d.ts

type CompressionFormat = "deflate" | "deflate-raw" | "gzip";

/** [MDN Reference, chrome 80+, firefox 113+](https://developer.mozilla.org/docs/Web/API/CompressionStream) */
interface CompressionStream extends GenericTransformStream {
}

declare const CompressionStream: {
    prototype: CompressionStream;
    new(format: CompressionFormat): CompressionStream;
};

/** [MDN Reference, chrome 80+, firefox 113+](https://developer.mozilla.org/docs/Web/API/DecompressionStream) */
interface DecompressionStream extends GenericTransformStream {
}

declare const DecompressionStream: {
    prototype: DecompressionStream;
    new(format: CompressionFormat): DecompressionStream;
};
