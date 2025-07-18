"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Script from "next/script";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

export default function Home() {
  const [currentFile, setCurrentFile] = useState(null);
  const [originalImageSrc, setOriginalImageSrc] = useState("");
  const [processedImageSrc, setProcessedImageSrc] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState(
    "Analyzing objects..."
  );
  const [showQualitySelector, setShowQualitySelector] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [downloadDisabled, setDownloadDisabled] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState("standard");

  const fileInputRef = useRef(null);
  const originalImageRef = useRef(null);
  const processedImageRef = useRef(null);
  const notificationAreaRef = useRef(null);
  const bgRemoverRef = useRef(null);

  const REMOVE_BG_API_URL = "https://api.remove.bg/v1.0/removebg";
  const MAX_API_SIZE = 10 * 1024 * 1024;

  useEffect(() => {
    const loadModels = async () => {
      try {
        await import("@tensorflow/tfjs");
        const cocoSsdModule = await import("@tensorflow-models/coco-ssd");
        const detectionModel = await cocoSsdModule.load();
        const selfieSegmentation = await new Promise((resolve) => {
          const script = document.createElement("script");
          script.src =
            "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
          script.onload = () => {
            resolve(
              new SelfieSegmentation({
                locateFile: (file) => {
                  return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
                },
              })
            );
          };
          script.onerror = () => resolve(null);
          document.body.appendChild(script);
        });

        if (selfieSegmentation) {
          selfieSegmentation.setOptions({
            modelSelection: 1,
          });
          await selfieSegmentation.initialize();
        }
        const localProcessor = await new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = "/js/bgremove.js";
          script.onload = () => {
            if (window.AdvancedBackgroundRemover) {
              resolve(window.AdvancedBackgroundRemover);
            } else {
              resolve(null);
            }
          };
          script.onerror = () => resolve(null);
          document.body.appendChild(script);
        });

        bgRemoverRef.current = {
          detectionModel,
          segmentationModel: selfieSegmentation,
          localProcessor,
        };
      } catch (error) {
        console.error("Error loading models:", error);
        bgRemoverRef.current = {
          detectionModel: null,
          segmentationModel: null,
          localProcessor: window.AdvancedBackgroundRemover || null,
        };
      }
    };

    loadModels();

    const preventDefault = (e) => e.preventDefault();
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);

    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  const showNotification = (message, type = "info") => {
    if (!notificationAreaRef.current) return;

    const notification = document.createElement("div");
    notification.className = `notification ${type} show`;
    notification.textContent = message;

    notificationAreaRef.current.appendChild(notification);

    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        if (notification.parentNode === notificationAreaRef.current) {
          notificationAreaRef.current.removeChild(notification);
        }
      }, 300);
    }, 3000);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const uploadArea = e.target.closest(".upload-area");
    if (uploadArea) uploadArea.classList.remove("dragover");

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = (file) => {
    if (!file.type.startsWith("image/")) {
      showNotification("❌ Please select a valid image file!", "error");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showNotification("❌ File too large! Maximum 20MB", "error");
      return;
    }

    setCurrentFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      setOriginalImageSrc(e.target.result);
      setProcessedImageSrc("");
      setShowImagePreview(true);
      setShowQualitySelector(true);
      setDownloadDisabled(true);
      resetZoom("originalImage");
    };
    reader.readAsDataURL(file);
  };

  const selectQuality = (quality) => {
    setSelectedQuality(quality);
  };

  const processImage = async () => {
    if (!currentFile || !bgRemoverRef.current) {
      showNotification("❌ System off", "error");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProcessingStatus("Analyzing objects...");

    try {
      const progressSteps = [
        { progress: 10, status: "Loading neural networks..." },
        { progress: 25, status: "Analyzing image content..." },
        { progress: 40, status: "Detecting objects..." },
        { progress: 55, status: "Segmenting foreground..." },
        { progress: 70, status: "Smoothing edges..." },
        { progress: 85, status: "Applying precision filter..." },
        { progress: 95, status: "Finalizing..." },
      ];

      for (const step of progressSteps) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        setProgress(step.progress);
        setProcessingStatus(step.status);
      }

      let processedBlob;

      if (currentFile.size <= MAX_API_SIZE) {
        try {
          setProcessingStatus("Using API");

          const formData = new FormData();
          formData.append("image_file", currentFile);
          formData.append("size", "auto");

          const response = await fetch(REMOVE_BG_API_URL, {
            method: "POST",
            headers: {
              "X-Api-Key": process.env.NEXT_PUBLIC_REMOVE_BG_API_KEY,
            },
            body: formData,
          });

          if (!response.ok) throw new Error("API error: " + response.status);

          processedBlob = await response.blob();
        } catch (apiError) {
          console.warn("API error, fallback to local:", apiError);
          setProcessingStatus("Using local methods");
        }
      }

      if (!processedBlob) {
        const image = new window.Image();
        image.src = originalImageSrc;

        await new Promise((resolve) => {
          image.onload = resolve;
        });

        processedBlob = await processImageLocally(image);
      }

      const imageUrl = URL.createObjectURL(processedBlob);
      setProcessedImageSrc(imageUrl);
      setDownloadDisabled(false);
      setProgress(100);

      window.processedImageUrl = imageUrl;

      showNotification("✅ Background successfully removed!", "success");
    } catch (error) {
      console.error("Error:", error);
      showNotification("❌ Process failed!", "error");
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 500);
    }
  };

  const detectObjectType = async (image) => {
    const predictions = await bgRemoverRef.current.detectionModel.detect(image);
    return predictions.length > 0 ? predictions[0].class : "unknown";
  };
  const processImageLocally = async (image) => {
    if (!window.AdvancedBackgroundRemover) {
      throw new Error("Local processor not loaded");
    }
    const processor = new window.AdvancedBackgroundRemover();
    const quality = selectedQuality;
    const processedImageData = await processor.processImage(image, quality);
    const canvas = document.createElement("canvas");
    canvas.width = processedImageData.width;
    canvas.height = processedImageData.height;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(processedImageData, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
  };

  const zoomImage = (imageId, factor) => {
    if (imageId === "originalImage" && originalImageRef.current) {
      const current = parseFloat(
        originalImageRef.current.style.transform?.replace("scale(", "") || 1
      );
      originalImageRef.current.style.transform = `scale(${current * factor})`;
    } else if (imageId === "processedImage" && processedImageRef.current) {
      const current = parseFloat(
        processedImageRef.current.style.transform?.replace("scale(", "") || 1
      );
      processedImageRef.current.style.transform = `scale(${current * factor})`;
    }
  };

  const resetZoom = (imageId) => {
    if (imageId === "originalImage" && originalImageRef.current) {
      originalImageRef.current.style.transform = "scale(1)";
    } else if (imageId === "processedImage" && processedImageRef.current) {
      processedImageRef.current.style.transform = "scale(1)";
    }
  };

  const downloadImage = () => {
    if (window.processedImageUrl) {
      const link = document.createElement("a");
      link.download = `bg-removed-${Date.now()}.png`;
      link.href = window.processedImageUrl;
      link.click();
    } else {
      showNotification("❌ No images to download!", "error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Script
        src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0"
        strategy="beforeInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2"
        strategy="beforeInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js"
        strategy="beforeInteractive"
        crossOrigin="anonymous"
      />

      <div id="notificationArea" ref={notificationAreaRef}></div>

      <header className="py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="logo">
            BG<span className="text-white">Remover</span>
          </div>
          <button className="md:hidden text-purple-300">
            <i className="fas fa-bars text-2xl"></i>
          </button>
        </div>
      </header>

      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Remove <span className="text-purple-400">Image Background</span>{" "}
              with
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-purple-600">
                {" "}
                Precision and Cleanliness
              </span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Remove the background from any photo in seconds. Professional
              results without editing skills.
            </p>
          </div>

          <div className="glass-effect rounded-3xl p-6 md:p-8 mb-16">
            {!originalImageSrc && (
              <div
                className="upload-area rounded-2xl p-8 mb-8 text-center cursor-pointer"
                onClick={() => fileInputRef.current.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("dragover");
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("dragover");
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("dragover");
                }}
                onDrop={handleDrop}
              >
                <div className="hero-icon">
                  <i className="fas fa-cloud-upload-alt"></i>
                </div>
                <h3 className="text-2xl font-semibold text-white mb-3">
                  Select or Drop Image
                </h3>
                <p className="text-gray-300 mb-6">
                  Drag & drop images or click to select from your device
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="text-gray-400 text-sm">
                  Supported formats: JPG, PNG, WEBP (Maximum 20MB)
                </div>
              </div>
            )}

            {showQualitySelector && (
              <div className="quality-selector mb-8">
                <h4 className="text-xl font-semibold text-white mb-4 flex items-center">
                  <i className="fas fa-cog mr-3 text-purple-400"></i>
                  Quality Settings
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div
                    className={`quality-option ${
                      selectedQuality === "standard" ? "selected" : ""
                    }`}
                    onClick={() => selectQuality("standard")}
                  >
                    <div className="mr-4 text-purple-400">
                      <i className="fas fa-bolt text-xl"></i>
                    </div>
                    <div>
                      <div className="font-medium text-white">Standard</div>
                      <div className="text-sm text-gray-300">
                        Fast & efficient
                      </div>
                    </div>
                  </div>
                  <div
                    className={`quality-option ${
                      selectedQuality === "high" ? "selected" : ""
                    }`}
                    onClick={() => selectQuality("high")}
                  >
                    <div className="mr-4 text-purple-400">
                      <i className="fas fa-gem text-xl"></i>
                    </div>
                    <div>
                      <div className="font-medium text-white">High Quality</div>
                      <div className="text-sm text-gray-300">
                        More detailed results
                      </div>
                    </div>
                  </div>
                  <div
                    className={`quality-option ${
                      selectedQuality === "ultra" ? "selected" : ""
                    }`}
                    onClick={() => selectQuality("ultra")}
                  >
                    <div className="mr-4 text-purple-400">
                      <i className="fas fa-crown text-xl"></i>
                    </div>
                    <div>
                      <div className="font-medium text-white">Ultra HD</div>
                      <div className="text-sm text-gray-300">Best quality</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isProcessing && (
              <div className="progress-bar mb-8">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            )}

            {showImagePreview && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white flex items-center">
                    <i className="fas fa-image mr-2 text-purple-400"></i>
                    Original Image
                  </h3>
                  <div className="image-container rounded-2xl p-4 relative min-h-[500px]">
                    <img
                      ref={originalImageRef}
                      src={originalImageSrc}
                      alt="Original"
                      className="w-full h-auto max-h-[400px] object-contain  rounded-lg"
                      style={{
                        transform: "scale(1)",
                        transformOrigin: "center",
                      }}
                    />
                    <div className="zoom-controls">
                      <button
                        className="zoom-btn"
                        onClick={() => zoomImage("originalImage", 1.2)}
                      >
                        <i className="fas fa-plus"></i>
                      </button>
                      <button
                        className="zoom-btn"
                        onClick={() => zoomImage("originalImage", 0.8)}
                      >
                        <i className="fas fa-minus"></i>
                      </button>
                      <button
                        className="zoom-btn"
                        onClick={() => resetZoom("originalImage")}
                      >
                        <i className="fas fa-expand"></i>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white flex items-center">
                    <i className="fas fa-magic mr-2 text-purple-400"></i>
                    Results
                  </h3>
                  <div className="image-container rounded-2xl p-4 relative min-h-[500px]">
                    {processedImageSrc ? (
                      <img
                        ref={processedImageRef}
                        src={processedImageSrc}
                        alt="Processed"
                        className="w-full h-auto max-h-[400px] object-contain rounded-lg"
                        style={{
                          transform: "scale(1)",
                          transformOrigin: "center",
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <i className="fas fa-image fa-3x mb-4"></i>
                      </div>
                    )}
                    {isProcessing && (
                      <div className="loading-overlay show">
                        <div className="text-center">
                          <div className="animate-pulse text-4xl mb-3 text-purple-400">
                            <i className="fas fa-spinner fa-spin"></i>
                          </div>
                          <div className="text-white font-medium text-lg">
                            Processing images...
                          </div>
                          <div className="text-gray-300 text-sm mt-1">
                            {processingStatus}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="zoom-controls">
                      <button
                        className="zoom-btn"
                        onClick={() => zoomImage("originalImage", 1.2)}
                        aria-label="Zoom in"
                      >
                        <i className="fas fa-plus"></i>
                      </button>
                      <button
                        className="zoom-btn"
                        onClick={() => zoomImage("originalImage", 0.8)}
                        aria-label="Zoom out"
                      >
                        <i className="fas fa-minus"></i>
                      </button>
                      <button
                        className="zoom-btn"
                        onClick={() => resetZoom("originalImage")}
                        aria-label="Reset zoom"
                      >
                        <i className="fas fa-expand"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                className="btn-primary text-white font-semibold py-4 px-8 rounded-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed flex-1 text-lg"
                onClick={processImage}
                disabled={!originalImageSrc || isProcessing}
              >
                {isProcessing ? (
                  <span className="animate-pulse">🔄</span>
                ) : (
                  <i className="fas fa-bolt"></i>
                )}
                <span>
                  {isProcessing ? "Memproses..." : "Hapus Background"}
                </span>
              </button>
              <button
                className="btn-secondary text-white font-semibold py-4 px-8 rounded-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed flex-1 text-lg"
                onClick={downloadImage}
                disabled={downloadDisabled}
              >
                <i className="fas fa-download"></i>
                <span>Downloads Result</span>
              </button>
            </div>

            <div className="mt-8 p-5 rounded-xl bg-gradient-to-r from-purple-900/30 to-purple-800/20 border border-purple-500/20">
              <h4 className="font-semibold text-purple-300 mb-3 flex items-center">
                <i className="fas fa-lightbulb mr-2"></i>
                Tips for Best Results:
              </h4>
              <ul className="text-gray-200 space-y-2">
                <li className="flex items-start">
                  <i className="fas fa-check-circle text-purple-400 mr-2 mt-1"></i>
                  <span>
                    Use images with clear contrast between the subject and
                    background
                  </span>
                </li>
                <li className="flex items-start">
                  <i className="fas fa-check-circle text-purple-400 mr-2 mt-1"></i>
                  <span>
                    Avoid overly complex or similar-colored backgrounds
                  </span>
                </li>
                <li className="flex items-start">
                  <i className="fas fa-check-circle text-purple-400 mr-2 mt-1"></i>
                  <span>
                    For small objects or fine details, use "Ultra HD" mode
                  </span>
                </li>
                <li className="flex items-start">
                  <i className="fas fa-check-circle text-purple-400 mr-2 mt-1"></i>
                  <span>Well-lit images will provide more precise results</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mb-16">
            <h2 className="text-3xl font-bold text-center mb-12 section-title">
              Featured Features
            </h2>
            <div className="feature-grid">
              <div className="feature-card">
                <div className="text-purple-400 text-3xl mb-4">
                  <i className="fas fa-robot"></i>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Advanced AI
                </h3>
                <p className="text-gray-300">
                  Uses AI technology that recognizes objects with high
                  precision.
                </p>
              </div>

              <div className="feature-card">
                <div className="text-purple-400 text-3xl mb-4">
                  <i className="fas fa-bolt"></i>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Fast Processing
                </h3>
                <p className="text-gray-300">
                  Remove backgrounds in seconds without compromising image
                  quality.
                </p>
              </div>

              <div className="feature-card">
                <div className="text-purple-400 text-3xl mb-4">
                  <i className="fas fa-crop-alt"></i>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  High Precision
                </h3>
                <p className="text-gray-300">
                  Accurate results even for the smallest details like hair or
                  fur.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="logo mb-6 md:mb-0">
              BG<span className="text-white">Remover</span>
            </div>
            <div className="flex space-x-6">
              <a
                href="https://www.facebook.com/aditya.kurniwan.12"
                className="text-gray-400 hover:text-purple-300 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-facebook-f"></i>
              </a>
              <a
                href="https://x.com/ShDitzz"
                className="text-gray-400 hover:text-purple-300 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-twitter"></i>
              </a>
              <a
                href="https://www.instagram.com/ry.shditz?igsh=b3RuMnBtM3J5a3Nk"
                className="text-gray-400 hover:text-purple-300 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-instagram"></i>
              </a>
              <a
                href="https://github.com/qwershditz"
                className="text-gray-400 hover:text-purple-300 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-github"></i>
              </a>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-500 text-sm">
            &copy; 2025 BGRemover All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
