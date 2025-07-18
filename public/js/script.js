document.addEventListener("DOMContentLoaded", function () {
  const bgRemover = new AdvancedBackgroundRemover();
  bgRemover.loadSegmentationModel().catch(() => {});

  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => event.preventDefault());
});

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
