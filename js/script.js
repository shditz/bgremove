const REMOVE_BG_API_KEY = "jEL7a8SHmqzJcfn2u29QXPVP";
const REMOVE_BG_API_URL = "https://api.remove.bg/v1.0/removebg";
const MAX_API_SIZE = 5 * 1024 * 1024;

async function removeBgWithAPI(file) {
  const formData = new FormData();
  formData.append("image_file", file);
  formData.append("size", "auto");

  const response = await fetch(REMOVE_BG_API_URL, {
    method: "POST",
    headers: {
      "X-Api-Key": REMOVE_BG_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.errors?.[0]?.title || "API request failed");
  }

  return await response.blob();
}

let currentFile = null;
let currentZoom = { originalImage: 1, processedImage: 1 };
let selectedQuality = "high";
let bgRemover = null;

document.addEventListener("DOMContentLoaded", function () {
  bgRemover = new AdvancedBackgroundRemover();

  bgRemover.loadSegmentationModel().catch(() => {});

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());
});

function handleFileSelect(event) {
  const file = event.target.files[0];
  file && processFile(file);
}

function handleDragOver(event) {
  event.preventDefault();
}

function handleDragEnter(event) {
  event.preventDefault();
  event.target.closest(".upload-area").classList.add("dragover");
}

function handleDragLeave(event) {
  event.preventDefault();
  event.target.closest(".upload-area").classList.remove("dragover");
}

function handleDrop(event) {
  event.preventDefault();
  event.target.closest(".upload-area").classList.remove("dragover");
  const files = event.dataTransfer.files;
  files.length > 0 && processFile(files[0]);
}

function processFile(file) {
  if (!file.type.startsWith("image/")) {
    showNotification("❌ Please select a valid image file!", "error");
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    showNotification("❌ File too large! Max 50MB", "error");
    return;
  }

  currentFile = file;
  const reader = new FileReader();

  reader.onload = function (e) {
    const originalImage = document.getElementById("originalImage");
    originalImage.src = e.target.result;

    document.getElementById("processedImage").src = "";
    document.getElementById("imagePreview").style.display = "block";
    document.getElementById("qualitySelector").style.display = "block";
    document.getElementById("processBtn").disabled = false;
    document.getElementById("downloadBtn").disabled = true;

    resetZoom("originalImage");
    resetZoom("processedImage");
  };

  reader.readAsDataURL(file);
}

function selectQuality(quality) {
  selectedQuality = quality;
  document.querySelectorAll(".quality-option").forEach((option) => {
    option.classList.remove("selected");
  });
  event.target.closest(".quality-option").classList.add("selected");
}

async function processImage() {
  if (!currentFile || !bgRemover) {
    showNotification("❌ No image or system not ready!", "error");
    return;
  }

  const processBtn = document.getElementById("processBtn");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const progressBar = document.getElementById("progressBar");
  const progressFill = document.getElementById("progressFill");
  const processingStatus = document.getElementById("processingStatus");
  const originalImage = document.getElementById("originalImage");

  processBtn.disabled = true;
  processBtn.innerHTML = '<span class="animate-pulse">🔄</span> Processing...';
  loadingOverlay.classList.add("show");
  progressBar.style.display = "block";

  try {
    const steps = [
      { progress: 10, status: "Loading neural networks..." },
      { progress: 25, status: "Analyzing image content..." },
      { progress: 40, status: "Detecting objects..." },
      { progress: 55, status: "Segmenting foreground..." },
      { progress: 70, status: "Refining edges..." },
      { progress: 85, status: "Applying precision filters..." },
      { progress: 95, status: "Finalizing..." },
    ];

    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < steps.length) {
        const step = steps[stepIndex];
        progressFill.style.width = step.progress + "%";
        processingStatus.textContent = step.status;
        stepIndex++;
      }
    }, 600);

    await new Promise((resolve) => {
      if (originalImage.complete && originalImage.naturalWidth !== 0) {
        resolve();
      } else {
        originalImage.onload = resolve;
        originalImage.onerror = () => {
          clearInterval(progressInterval);
          throw new Error("Image failed to load");
        };
      }
    });

    let resultImageData;
    if (currentFile.size <= 5 * 1024 * 1024) {
      try {
        processingStatus.textContent = "Using remove.bg";

        const formData = new FormData();
        formData.append("image_file", currentFile);
        formData.append("size", "auto");

        const response = await fetch("https://api.remove.bg/v1.0/removebg", {
          method: "POST",
          headers: {
            "X-Api-Key": "jEL7a8SHmqzJcfn2u29QXPVP",
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        document.getElementById("processedImage").src = imageUrl;
        document.getElementById("downloadBtn").disabled = false;
        window.processedImageUrl = imageUrl;
        window.processedBlob = blob;

        clearInterval(progressInterval);
        progressFill.style.width = "100%";
        processingStatus.textContent = "Completed";

        setTimeout(() => {
          loadingOverlay.classList.remove("show");
          progressBar.style.display = "none";
          progressFill.style.width = "0%";
          showNotification("✅ Background removed", "success");
        }, 500);

        return;
      } catch (apiError) {
        console.warn("Failed, falling back to local method:", apiError);
        showNotification("⚠️ Failed, using local method...", "warning");
      }
    }

    const objectType = bgRemover.detectionModel
      ? await bgRemover.detectObjectType(originalImage)
      : "unknown";

    processingStatus.textContent = `Detected: ${objectType}`;

    try {
      resultImageData = await bgRemover.processImage(
        originalImage,
        selectedQuality
      );
    } catch (processError) {
      console.error("Processing error:", processError);
      showNotification("⚠️ Using advanced method", "warning");

      const { canvas, ctx } = bgRemover.setupProcessingCanvas(originalImage);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resultImageData = await bgRemover.advancedBackgroundRemoval(imageData);
    }

    clearInterval(progressInterval);
    progressFill.style.width = "100%";
    processingStatus.textContent = "Completed!";

    const blob = await bgRemover.imageDataToBlob(
      resultImageData,
      "image/png",
      selectedQuality === "ultra" ? 1.0 : 0.95
    );

    const imageUrl = URL.createObjectURL(blob);
    document.getElementById("processedImage").src = imageUrl;
    document.getElementById("downloadBtn").disabled = false;
    window.processedImageUrl = imageUrl;
    window.processedBlob = blob;

    setTimeout(() => {
      loadingOverlay.classList.remove("show");
      progressBar.style.display = "none";
      progressFill.style.width = "0%";
      showNotification("✅ Background removed successfully!", "success");
    }, 500);
  } catch (error) {
    console.error("Error:", error);
    showNotification("❌ Processing failed!", "error");
    loadingOverlay.classList.remove("show");
    progressBar.style.display = "none";
    progressFill.style.width = "0%";
  } finally {
    processBtn.disabled = false;
    processBtn.innerHTML =
      '<i class="fas fa-bolt"></i><span>Remove Background</span>';
  }
}

function zoomImage(imageId, factor) {
  const img = document.getElementById(imageId);
  currentZoom[imageId] *= factor;
  img.style.transform = `scale(${currentZoom[imageId]})`;
}

function resetZoom(imageId) {
  currentZoom[imageId] = 1;
  const img = document.getElementById(imageId);
  img.style.transform = "scale(1)";
}

function downloadImage() {
  if (window.processedImageUrl) {
    const link = document.createElement("a");
    link.download = `bg-removed-${Date.now()}.png`;
    link.href = window.processedImageUrl;
    link.click();
  } else {
    showNotification("❌ No image to download!", "error");
  }
}

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification ${type} show`;
  notification.textContent = message;
  document.getElementById("notificationArea").appendChild(notification);

  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function cleanupMemory() {
  bgRemover?.cleanup();
  if (window.processedImageUrl) URL.revokeObjectURL(window.processedImageUrl);
  window.processedImageUrl = null;
  window.processedBlob = null;
}

window.addEventListener("error", (event) => {
  console.error("Error:", event.error);
  showNotification("⚠️ Unexpected error occurred!", "error");
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Promise error:", event.reason);
  showNotification("⚠️ Processing error occurred!", "error");
});

window.addEventListener("beforeunload", cleanupMemory);

document.addEventListener("click", (event) => {
  if (event.target.closest(".quality-option")) {
    const option = event.target.closest(".quality-option");
    const quality = option.onclick.toString().match(/selectQuality\('(.+?)'\)/);
    quality && selectQuality(quality[1]);
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "o") {
    event.preventDefault();
    document.getElementById("fileInput").click();
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    !document.getElementById("downloadBtn").disabled && downloadImage();
  }

  if (event.key === " " && event.target.tagName !== "INPUT") {
    event.preventDefault();
    !document.getElementById("processBtn").disabled && processImage();
  }
});
