let currentFile = null;
let currentZoom = { originalImage: 1, processedImage: 1 };
let selectedQuality = "standard";

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processFile(file);
  }
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
  if (files.length > 0) {
    processFile(files[0]);
  }
}

function processFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("❌ Harap pilih file gambar yang valid!");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert("❌ Ukuran file terlalu besar! Maksimal 10MB");
    return;
  }

  currentFile = file;

  const reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById("originalImage").src = e.target.result;
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

  document.querySelector(`input[value="${quality}"]`).checked = true;
}

async function processImage() {
  if (!currentFile) return;

  const processBtn = document.getElementById("processBtn");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const progressBar = document.getElementById("progressBar");
  const progressFill = document.getElementById("progressFill");
  const processingStatus = document.getElementById("processingStatus");

  processBtn.disabled = true;
  processBtn.innerHTML = '<span class="animate-pulse">🔄</span> Memproses...';
  loadingOverlay.classList.add("show");
  progressBar.style.display = "block";

  try {
    const formData = new FormData();
    formData.append("image", currentFile);
    formData.append("quality", selectedQuality);

    const steps = [
      { progress: 15, status: "Mengunggah gambar..." },
      { progress: 30, status: "Menganalisis jenis objek..." },
      { progress: 50, status: "Memilih model AI terbaik..." },
      { progress: 70, status: "Memproses dengan AI..." },
      { progress: 85, status: "Menghaluskan hasil..." },
      { progress: 95, status: "Menyelesaikan..." },
    ];

    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < steps.length) {
        const step = steps[stepIndex];
        progressFill.style.width = step.progress + "%";
        processingStatus.textContent = step.status;
        stepIndex++;
      }
    }, 800);

    const response = await fetch("/api/remove-bg", {
      method: "POST",
      body: formData,
    });

    clearInterval(progressInterval);
    progressFill.style.width = "100%";
    processingStatus.textContent = "Selesai!";

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);

    document.getElementById("processedImage").src = imageUrl;
    document.getElementById("downloadBtn").disabled = false;

    window.processedImageUrl = imageUrl;

    setTimeout(() => {
      loadingOverlay.classList.remove("show");
      progressBar.style.display = "none";
      progressFill.style.width = "0%";

      showNotification("✅ Background berhasil dihapus!", "success");
    }, 500);
  } catch (error) {
    console.error("Error processing image:", error);
    showNotification("❌ Terjadi kesalahan saat memproses gambar!", "error");
    loadingOverlay.classList.remove("show");
    progressBar.style.display = "none";
  } finally {
    processBtn.disabled = false;
    processBtn.innerHTML =
      '<span class="text-xl">🚀</span><span>Hapus Background</span>';
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
    link.download = "bg-remove" + ".png";
    link.href = window.processedImageUrl;
    link.click();

    showNotification("💾 Gambar berhasil diunduh!", "success");
  }
}

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full ${
    type === "success"
      ? "bg-green-500 text-white"
      : type === "error"
      ? "bg-red-500 text-white"
      : "bg-blue-500 text-white"
  }`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.remove("translate-x-full");
  }, 100);

  setTimeout(() => {
    notification.classList.add("translate-x-full");
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

document.addEventListener("DOMContentLoaded", function () {
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  checkBackendHealth();
});

async function checkBackendHealth() {
  try {
    const response = await fetch("/api/health");
    if (response.ok) {
      const data = await response.json();
      console.log("Backend ready:", data);
    } else {
      showNotification("⚠️ Server tidak merespons.", "error");
    }
  } catch (error) {
    console.error("Backend check failed:", error);
    showNotification("⚠️ Tidak dapat menghubungi server.", "error");
  }
}
