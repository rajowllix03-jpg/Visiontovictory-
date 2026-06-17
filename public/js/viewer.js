// State trackers for secure PDF player
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.0;
const scaleStep = 0.25;
const minScale = 0.5;
const maxScale = 2.5;

// Elements references
const canvas = document.getElementById('pdf-render-canvas');
const ctx = canvas.getContext('2d');
const pageNumEl = document.getElementById('page-num');
const pageCountEl = document.getElementById('page-count');
const zoomPercentEl = document.getElementById('zoom-percent');
const viewerHeaderTitle = document.getElementById('pdf-header-title');
const spinner = document.getElementById('viewer-loading-spinner');

// Retrieve dynamic ID from query string parameters
const urlParams = new URLSearchParams(window.location.search);
const pdfId = urlParams.get('id');

// Setup PDFjs Configurations
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  if (!pdfId) {
    showErrorAndRedirect('No document has been selected to load.');
    return;
  }

  // Inject user metadata / watermark info
  initializeViewerSecurity();

  // Load PDF structure
  fetchPdfDocument();

  // Setup toolbar interactions
  setupToolbarEvents();

  // Resize Listener to handle fluid layouts safely
  setupResponsiveHandlers();
});

// Enforce PDF Security rules
function initializeViewerSecurity() {
  // 1. Disable Right Click contextual dialog completely
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  }, false);

  // 2. Disable Standard Copy action to safeguard text
  document.addEventListener('copy', (e) => {
    e.preventDefault();
  }, false);

  // 3. Keep Keyboard Hotkey shortcuts blocked
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

    // Block Print: Ctrl/Cmd + P
    if (ctrlOrCmd && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Block Save/Download: Ctrl/Cmd + S
    if (ctrlOrCmd && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });

  // Dynamic user watermark tagging - using email if any is present, or default secure credentials
  const clientCell = document.getElementById('client-watermark-cell');
  clientCell.innerText = "STUDENT PORTAL - SECURE VIEW ONLY";
}

// Draw/Render selected page index inside Canvas with precise memory allocation
function renderActivePage() {
  pageRendering = true;
  
  // Fetch page structure
  pdfDoc.getPage(pageNum).then((page) => {
    const viewport = page.getViewport({ scale: scale });
    
    // Set viewport dimensions on canvas container
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    const renderTask = page.render(renderContext);

    // Wait for render to complete to prevent canvas flickering states
    renderTask.promise.then(() => {
      pageRendering = false;
      if (pageNumPending !== null) {
        // There is a pending page render
        renderActivePage(pageNumPending);
        pageNumPending = null;
      }
    });
  });

  // Update Page numbers in HTML elements
  pageNumEl.textContent = pageNum;
  zoomPercentEl.textContent = `${Math.round(scale * 100)}%`;
}

// Stagger / queue page rendering requests safely
function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    pageNum = num;
    renderActivePage();
  }
}

// Fetch dynamic streams
async function fetchPdfDocument() {
  try {
    // 1. Fetch metadata to show Title in header
    const metaRes = await fetch(`/api/pdf/pdfs/metadata/${pdfId}`);
    if (!metaRes.ok) {
      showErrorAndRedirect('The selected document does not exist or has been deleted.');
      return;
    }
    const metadata = await metaRes.json();
    viewerHeaderTitle.innerText = metadata.title;
    document.title = `VisionToVictory | Read - ${metadata.title}`;

    // 2. Fetch stream from gateway
    const streamUrl = `/api/pdf/stream/${pdfId}`;

    // PDFJS initialization parameters
    const loadingTask = pdfjsLib.getDocument({
      url: streamUrl,
      withCredentials: true // Passes secure session cookies to the stream route for validation
    });

    loadingTask.onProgress = function(progress) {
      // Handles progress loader updates if needed
    };

    loadingTask.promise.then((pdfDocument) => {
      pdfDoc = pdfDocument;
      pageCountEl.textContent = pdfDoc.numPages;

      // Render first page immediately and hide loader backdrop spinner
      pageNum = 1;
      renderActivePage();
      spinner.style.display = 'none';

    }, (error) => {
      console.error('PDF.js launch failure:', error);
      showErrorAndRedirect('Authorization failure or insecure document. Access Denied.');
    });

  } catch (err) {
    console.error('Error fetching stream:', err);
    showErrorAndRedirect('Internal Connection Failure.');
  }
}

function setupToolbarEvents() {
  // Page Navs
  document.getElementById('prev-page').addEventListener('click', () => {
    if (pageNum <= 1) return;
    queueRenderPage(pageNum - 1);
  });

  document.getElementById('next-page').addEventListener('click', () => {
    if (pdfDoc && pageNum >= pdfDoc.numPages) return;
    queueRenderPage(pageNum + 1);
  });

  // Zoom Controllers
  document.getElementById('zoom-in').addEventListener('click', () => {
    if (scale >= maxScale) return;
    scale += scaleStep;
    queueRenderPage(pageNum);
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    if (scale <= minScale) return;
    scale -= scaleStep;
    queueRenderPage(pageNum);
  });

  // Dark Mode Canvas custom Filter Toggle
  const modeBtn = document.getElementById('dark-mode-toggle');
  let isDarkMode = false;
  modeBtn.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    if (isDarkMode) {
      canvas.classList.add('dark-viewer-canvas');
      modeBtn.innerHTML = '<i data-lucide="sun" style="width: 16px; height: 16px; color: #F59E0B;"></i>';
    } else {
      canvas.classList.remove('dark-viewer-canvas');
      modeBtn.innerHTML = '<i data-lucide="moon" style="width: 16px; height: 16px; color: #F59E0B;"></i>';
    }
    lucide.createIcons();
  });

  // Full Screen Request
  const fullscreenBtn = document.getElementById('full-screen');
  fullscreenBtn.addEventListener('click', () => {
    const container = document.getElementById('viewer-container');
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => {
        console.error(`Error enabling full-screen: ${err.message}`);
      });
      fullscreenBtn.innerHTML = '<i data-lucide="minimize" style="width: 16px; height: 16px;"></i>';
    } else {
      document.exitFullscreen();
      fullscreenBtn.innerHTML = '<i data-lucide="maximize" style="width: 16px; height: 16px;"></i>';
    }
    lucide.createIcons();
  });

  // Back button confirmation
  document.getElementById('back-portal-btn').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/';
  });
}

// Listen to screen resizes and dynamically scale content safely
function setupResponsiveHandlers() {
  let resizeTimeout;
  const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      const containerWidth = entry.contentRect.width;
      // Debounce rerender calls to maintain smooth transitions
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (pdfDoc) {
          // Auto scaling down to fit small screens fluidly
          if (containerWidth < 768 && scale > 0.85) {
            scale = 0.75;
          } else if (containerWidth < 480 && scale > 0.6) {
            scale = 0.5;
          }
          queueRenderPage(pageNum);
        }
      }, 250);
    }
  });

  // Observe parent container bounding limits
  const target = document.getElementById('viewer-container');
  resizeObserver.observe(target);
}

// Display elegant error and redirect to secure home listing
function showErrorAndRedirect(message) {
  spinner.innerHTML = `
    <div style="text-align: center;">
      <i data-lucide="shield-alert" style="width: 48px; height: 48px; color: #EF4444; margin: 0 auto 16px auto; display: block;"></i>
      <h3 style="color:#FFFFFF; font-size: 1.3rem; margin-bottom: 8px;">Document Access Prevented</h3>
      <p style="color: #64748B; font-size: 0.9rem; max-width: 320px; margin: 0 auto 20px auto;">${message}</p>
      <button class="gold-btn" onclick="window.location.href='/'">Return to Scholastic Portal</button>
    </div>
  `;
  lucide.createIcons();
}
