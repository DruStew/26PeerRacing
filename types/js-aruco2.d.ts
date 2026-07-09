declare module "js-aruco2" {
  export namespace AR {
    interface DictionaryData {
      nBits: number;
      tau: number;
      codeList: number[];
    }

    const DICTIONARIES: Record<string, DictionaryData>;

    class Dictionary {
      constructor(dicName: string);
      nBits: number;
      tau: number;
      markSize: number;
      codeList: number[];
      generateSVG(id: number): string;
    }

    interface MarkerCorner {
      x: number;
      y: number;
    }

    class Marker {
      id: number;
      corners: MarkerCorner[];
      hammingDistance: number;
    }

    interface DetectorOptions {
      dictionaryName?: string;
      maxHammingDistance?: number;
    }

    interface DetectorImage {
      width: number;
      height: number;
      data: Uint8ClampedArray;
    }

    class Detector {
      constructor(options?: DetectorOptions);
      detect(image: DetectorImage | ImageData): Marker[];
    }
  }
}
