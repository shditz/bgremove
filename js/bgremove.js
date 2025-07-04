class AdvancedBackgroundRemover {
  constructor() {
    this.segmentationModel = null;
    this.detectionModel = null;
    this.isSegmentationLoaded = false;
    this.isDetectionLoaded = false;
    this.isLoading = false;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.maxSize = 4096;
    this.qualitySettings = {
      standard: { model: 0, feather: 1, dilation: 1, blur: 0.5 },
      high: { model: 1, feather: 2, dilation: 2, blur: 1.0 },
      ultra: { model: 2, feather: 3, dilation: 3, blur: 1.5 },
    };
  }

  async loadSegmentationModel(quality = "high") {
    if (this.isSegmentationLoaded || this.isLoading) return;
    this.isLoading = true;

    try {
      this.segmentationModel = new SelfieSegmentation({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });

      await this.segmentationModel.setOptions({
        modelSelection: this.qualitySettings[quality].model,
        selfieMode: true,
      });

      await this.segmentationModel.initialize();
      this.isSegmentationLoaded = true;
      return true;
    } catch (error) {
      console.error("Error loading segmentation model:", error);
      this.segmentationModel = null;
      this.isSegmentationLoaded = false;
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  async loadDetectionModel() {
    if (this.isDetectionLoaded) return;

    try {
      this.detectionModel = await cocoSsd.load();
      this.isDetectionLoaded = true;
      return true;
    } catch (error) {
      console.error("Error loading detection model:", error);
      this.detectionModel = null;
      return false;
    }
  }

  async detectObjectType(imageElement) {
    await this.loadDetectionModel();
    if (!this.detectionModel) return "unknown";

    try {
      const predictions = await this.detectionModel.detect(imageElement);
      if (predictions.length > 0) {
        const objectClasses = predictions.map((p) => p.class.toLowerCase());

        const humanKeywords = [
          "person",
          "man",
          "woman",
          "child",
          "baby",
          "boy",
          "girl",
        ];
        const animalKeywords = [
          "animal",
          "cat",
          "dog",
          "bird",
          "horse",
          "elephant",
          "tiger",
          "lion",
          "bear",
          "zebra",
          "giraffe",
          "fish",
          "shark",
          "dolphin",
          "whale",
          "monkey",
          "snake",
          "turtle",
          "rabbit",
          "pig",
          "cow",
          "sheep",
          "chicken",
          "duck",
          "frog",
          "butterfly",
          "insect",
          "spider",
        ];
        const fruitKeywords = [
          "fruit",
          "apple",
          "orange",
          "banana",
          "strawberry",
          "grape",
          "watermelon",
          "pineapple",
          "pear",
          "peach",
          "mango",
          "kiwi",
          "lemon",
          "lime",
          "cherry",
          "blueberry",
          "raspberry",
          "avocado",
          "coconut",
          "pomegranate",
        ];
        const vehicleKeywords = [
          "vehicle",
          "car",
          "truck",
          "bus",
          "motorcycle",
          "bicycle",
          "airplane",
          "helicopter",
          "boat",
          "ship",
          "train",
          "submarine",
          "rocket",
        ];
        const furnitureKeywords = [
          "furniture",
          "chair",
          "couch",
          "sofa",
          "bed",
          "table",
          "desk",
          "cabinet",
          "shelf",
          "stool",
          "bench",
          "wardrobe",
          "dresser",
        ];
        const electronicKeywords = [
          "electronic",
          "tv",
          "television",
          "laptop",
          "computer",
          "monitor",
          "keyboard",
          "mouse",
          "phone",
          "smartphone",
          "tablet",
          "camera",
          "headphones",
          "speaker",
        ];

        if (
          objectClasses.some((cls) =>
            humanKeywords.some((kw) => cls.includes(kw))
          )
        )
          return "human";
        if (
          objectClasses.some((cls) =>
            animalKeywords.some((kw) => cls.includes(kw))
          )
        )
          return "animal";
        if (
          objectClasses.some((cls) =>
            fruitKeywords.some((kw) => cls.includes(kw))
          )
        )
          return "fruit";
        if (
          objectClasses.some((cls) =>
            vehicleKeywords.some((kw) => cls.includes(kw))
          )
        )
          return "vehicle";
        if (
          objectClasses.some((cls) =>
            furnitureKeywords.some((kw) => cls.includes(kw))
          )
        )
          return "furniture";
        if (
          objectClasses.some((cls) =>
            electronicKeywords.some((kw) => cls.includes(kw))
          )
        )
          return "electronic";
      }
      return "object";
    } catch {
      return "unknown";
    }
  }

  setupProcessingCanvas(imageElement, maxSize = 4096) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const ratio = Math.min(
      maxSize / imageElement.naturalWidth,
      maxSize / imageElement.naturalHeight,
      1
    );

    canvas.width = imageElement.naturalWidth * ratio;
    canvas.height = imageElement.naturalHeight * ratio;

    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx, ratio };
  }

  async processImage(imageElement, quality = "high") {
    const settings = this.qualitySettings[quality];
    if (!this.isSegmentationLoaded) await this.loadSegmentationModel(quality);

    const { canvas, ctx, ratio } = this.setupProcessingCanvas(
      imageElement,
      this.maxSize
    );
    const originalImageData = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    let maskImageData;
    try {
      if (this.segmentationModel) {
        maskImageData = await this.processWithAI(canvas);
      } else {
        maskImageData = await this.advancedBackgroundRemoval(originalImageData);
      }

      maskImageData = this.applyMorphologicalOperations(
        maskImageData,
        settings.dilation,
        settings.feather
      );
    } catch (error) {
      console.error("Error in processing:", error);
      maskImageData = await this.advancedBackgroundRemoval(originalImageData);
    }

    const finalImage = this.applyAlphaMask(
      originalImageData,
      maskImageData,
      settings.blur
    );
    return finalImage;
  }

  async processWithAI(canvas) {
    return new Promise((resolve, reject) => {
      if (!this.segmentationModel) {
        return reject(new Error("Segmentation model not loaded"));
      }

      this.segmentationModel.onResults((results) => {
        if (!results?.segmentationMask) {
          return reject(new Error("Invalid segmentation"));
        }

        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;

        const maskCtx = maskCanvas.getContext("2d");
        maskCtx.drawImage(
          results.segmentationMask,
          0,
          0,
          canvas.width,
          canvas.height
        );

        resolve(maskCtx.getImageData(0, 0, canvas.width, canvas.height));
      });

      try {
        this.segmentationModel.send({ image: canvas });
      } catch (error) {
        reject(error);
      }
    });
  }

  applyAlphaMask(imageData, maskData, blurAmount) {
    const src = new Uint8ClampedArray(imageData.data);
    const mask = new Uint8ClampedArray(maskData.data);
    const result = new Uint8ClampedArray(src.length);
    const width = imageData.width;
    const height = imageData.height;

    for (let i = 0; i < src.length; i += 4) {
      const alpha = mask[i + 3] > 128 ? 255 : 0;

      result[i] = src[i];
      result[i + 1] = src[i + 1];
      result[i + 2] = src[i + 2];
      result[i + 3] = alpha;
    }

    const resultImage = new ImageData(result, width, height);

    if (blurAmount > 0) {
      return this.applyEdgeBlur(resultImage, blurAmount);
    }

    return resultImage;
  }

  applyMorphologicalOperations(maskData, dilationSize, featherSize) {
    const width = maskData.width;
    const height = maskData.height;
    const data = new Uint8ClampedArray(maskData.data);
    const matrix = new Array(height).fill().map(() => new Array(width).fill(0));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        matrix[y][x] = data[idx + 3] > 128 ? 1 : 0;
      }
    }

    const dilate = (matrix, size) => {
      const newMatrix = new Array(height)
        .fill()
        .map(() => new Array(width).fill(0));
      const half = Math.floor(size / 2);

      for (let y = half; y < height - half; y++) {
        for (let x = half; x < width - half; x++) {
          let max = 0;
          for (let ky = -half; ky <= half; ky++) {
            for (let kx = -half; kx <= half; kx++) {
              max = Math.max(max, matrix[y + ky][x + kx]);
            }
          }
          newMatrix[y][x] = max;
        }
      }
      return newMatrix;
    };

    const erode = (matrix, size) => {
      const newMatrix = new Array(height)
        .fill()
        .map(() => new Array(width).fill(0));
      const half = Math.floor(size / 2);

      for (let y = half; y < height - half; y++) {
        for (let x = half; x < width - half; x++) {
          let min = 1;
          for (let ky = -half; ky <= half; ky++) {
            for (let kx = -half; kx <= half; kx++) {
              min = Math.min(min, matrix[y + ky][x + kx]);
            }
          }
          newMatrix[y][x] = min;
        }
      }
      return newMatrix;
    };

    let processedMatrix = matrix;
    if (dilationSize > 0) {
      processedMatrix = dilate(processedMatrix, dilationSize);
      processedMatrix = erode(processedMatrix, dilationSize);
    }

    if (featherSize > 0) {
      processedMatrix = this.featherEdges(processedMatrix, featherSize);
    }

    const result = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = processedMatrix[y][x] * 255;

        result[idx] = 255;
        result[idx + 1] = 255;
        result[idx + 2] = 255;
        result[idx + 3] = alpha;
      }
    }

    return new ImageData(result, width, height);
  }

  featherEdges(matrix, radius) {
    const height = matrix.length;
    const width = matrix[0].length;
    const newMatrix = new Array(height)
      .fill()
      .map(() => new Array(width).fill(0));
    const kernel = this.getGaussianKernel(radius, radius / 2);
    const half = Math.floor(radius / 2);

    for (let y = half; y < height - half; y++) {
      for (let x = half; x < width - half; x++) {
        let sum = 0;
        let weightSum = 0;

        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const weight = kernel[ky + half][kx + half];
            sum += matrix[y + ky][x + kx] * weight;
            weightSum += weight;
          }
        }

        newMatrix[y][x] = Math.min(1, sum / weightSum);
      }
    }

    return newMatrix;
  }

  getGaussianKernel(size, sigma) {
    const kernel = new Array(size).fill().map(() => new Array(size).fill(0));
    let sum = 0;
    const center = Math.floor(size / 2);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        const dy = y - center;
        const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        kernel[y][x] = value;
        sum += value;
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        kernel[y][x] /= sum;
      }
    }

    return kernel;
  }

  applyEdgeRefinement(originalData, maskData) {
    const width = originalData.width;
    const height = originalData.height;
    const src = new Uint8ClampedArray(originalData.data);
    const mask = new Uint8ClampedArray(maskData.data);
    const result = new Uint8ClampedArray(maskData.data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const alpha = mask[idx + 3];

        if (alpha > 50 && alpha < 205) {
          const neighbors = [
            mask[idx - width * 4 - 4 + 3],
            mask[idx - width * 4 + 3],
            mask[idx - width * 4 + 4 + 3],
            mask[idx - 4 + 3],
            mask[idx + 4 + 3],
            mask[idx + width * 4 - 4 + 3],
            mask[idx + width * 4 + 3],
            mask[idx + width * 4 + 4 + 3],
          ];

          const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;

          if (Math.abs(alpha - avg) > 50) {
            const bgSimilarity = this.calculateBackgroundSimilarity(
              originalData,
              x,
              y
            );
            const newAlpha = bgSimilarity > 0.7 ? 0 : 255;

            result[idx + 3] = newAlpha;
          }
        }
      }
    }

    return new ImageData(result, width, height);
  }

  calculateBackgroundSimilarity(imageData, x, y) {
    const width = imageData.width;
    const height = imageData.height;
    const data = new Uint8ClampedArray(imageData.data);
    const idx = (y * width + x) * 4;

    const topColor = this.getPixel(data, width, x, Math.max(0, y - 5));
    const bottomColor = this.getPixel(
      data,
      width,
      x,
      Math.min(height - 1, y + 5)
    );
    const leftColor = this.getPixel(data, width, Math.max(0, x - 5), y);
    const rightColor = this.getPixel(
      data,
      width,
      Math.min(width - 1, x + 5),
      y
    );

    const currentColor = [data[idx], data[idx + 1], data[idx + 2]];

    const topDiff = this.colorDistance(currentColor, topColor);
    const bottomDiff = this.colorDistance(currentColor, bottomColor);
    const leftDiff = this.colorDistance(currentColor, leftColor);
    const rightDiff = this.colorDistance(currentColor, rightColor);

    const avgDiff = (topDiff + bottomDiff + leftDiff + rightDiff) / 4;
    return Math.min(1, avgDiff / 100);
  }

  getPixel(data, width, x, y) {
    const idx = (y * width + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  }

  applyEdgeBlur(imageData, amount) {
    // Implementasi sederhana untuk browser
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);

    // Gunakan efek blur CSS sebagai alternatif
    canvas.style.filter = `blur(${amount}px)`;

    // Kembalikan imageData yang sudah di-blur
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  async advancedBackgroundRemoval(imageData) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);

    const data = imageData.data;
    const mask = new Uint8ClampedArray(imageData.width * imageData.height * 4);

    const bgColor = this.calculateDominantBackground(imageData);
    const edgeData = this.detectEdges(imageData);

    for (let y = 0; y < imageData.height; y++) {
      for (let x = 0; x < imageData.width; x++) {
        const idx = (y * imageData.width + x) * 4;
        const colorDiff = this.colorDistance(
          [data[idx], data[idx + 1], data[idx + 2]],
          bgColor
        );

        const edgeValue = edgeData.data[idx];
        const centerFactor =
          1 -
          Math.sqrt(
            Math.pow(x / imageData.width - 0.5, 2) +
              Math.pow(y / imageData.height - 0.5, 2)
          ) /
            0.7;

        let isForeground =
          colorDiff > 50 || edgeValue > 40 || centerFactor > 0.7;

        if (isForeground) {
          mask[idx] = 255;
          mask[idx + 1] = 255;
          mask[idx + 2] = 255;
          mask[idx + 3] = 255;
        }
      }
    }

    const maskImage = new ImageData(mask, imageData.width, imageData.height);
    return this.refineMask(maskImage);
  }

  calculateDominantBackground(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const samplePoints = [];

    for (let i = 0; i < 20; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * 5);
      const idx = (y * width + x) * 4;
      samplePoints.push([data[idx], data[idx + 1], data[idx + 2]]);

      const bottomY = height - 1 - y;
      const bottomIdx = (bottomY * width + x) * 4;
      samplePoints.push([
        data[bottomIdx],
        data[bottomIdx + 1],
        data[bottomIdx + 2],
      ]);
    }

    return samplePoints
      .reduce(
        (acc, color) => [
          acc[0] + color[0],
          acc[1] + color[1],
          acc[2] + color[2],
        ],
        [0, 0, 0]
      )
      .map((v) => Math.round(v / samplePoints.length));
  }

  detectEdges(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const edges = new Uint8ClampedArray(data.length);

    const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0,
          gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIdx = ((y + ky) * width + (x + kx)) * 4;
            const gray =
              0.299 * data[pixelIdx] +
              0.587 * data[pixelIdx + 1] +
              0.114 * data[pixelIdx + 2];
            const kernelIdx = (ky + 1) * 3 + (kx + 1);

            gx += gray * kernelX[kernelIdx];
            gy += gray * kernelY[kernelIdx];
          }
        }

        const magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        const idx = (y * width + x) * 4;

        edges[idx] = magnitude;
        edges[idx + 1] = magnitude;
        edges[idx + 2] = magnitude;
        edges[idx + 3] = 255;
      }
    }

    return new ImageData(edges, width, height);
  }

  colorDistance(color1, color2) {
    return Math.sqrt(
      Math.pow(color1[0] - color2[0], 2) +
        Math.pow(color1[1] - color2[1], 2) +
        Math.pow(color1[2] - color2[2], 2)
    );
  }

  refineMask(maskData) {
    const width = maskData.width;
    const height = maskData.height;
    const data = maskData.data;
    const refined = new Uint8ClampedArray(data);

    for (let i = 0; i < 2; i++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          const neighbors = [
            data[idx - width * 4 - 4],
            data[idx - width * 4],
            data[idx - width * 4 + 4],
            data[idx - 4],
            data[idx + 4],
            data[idx + width * 4 - 4],
            data[idx + width * 4],
            data[idx + width * 4 + 4],
          ];

          const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
          refined[idx] =
            refined[idx + 1] =
            refined[idx + 2] =
              avg > 127 ? 255 : 0;
        }
      }
    }

    return new ImageData(refined, width, height);
  }

  imageDataToCanvas(imageData) {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d").putImageData(imageData, 0, 0);
    return canvas;
  }

  async imageDataToBlob(imageData, format = "image/png", quality = 0.95) {
    const canvas = this.imageDataToCanvas(imageData);
    return new Promise((resolve) => canvas.toBlob(resolve, format, quality));
  }

  cleanup() {
    if (this.segmentationModel?.close) this.segmentationModel.close();
    if (this.detectionModel) this.detectionModel.dispose();
    this.isSegmentationLoaded = false;
    this.isDetectionLoaded = false;
  }
}

window.AdvancedBackgroundRemover = AdvancedBackgroundRemover;
