// State trackers for secure PDF player
let pdfDoc = null;
let pageNum = 1;
let scale = 1.0;
const scaleStep = 0.25;
const minScale = 0.5;
const maxScale = 2.5;
let isDarkMode = false;
let pagesRendering = false;

// Elements references
const canvasFrame = document.getElementById('canvas-frame');
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

  // Inject user metadata / security parameters
  initializeViewerSecurity();

  // Load PDF structure
  fetchPdfDocument();

  // Setup toolbar interactions
  setupToolbarEvents();

  // Resize Listener to handle fluid layouts safely
  setupResponsiveHandlers();

  // Handle scroll tracking to update active page indicator in header
  setupPageScrollTracking();
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
}

// Render all pages vertically stacked
async function renderAllPages() {
  if (!pdfDoc) return;
  pagesRendering = true;
  canvasFrame.innerHTML = ''; // Clear previous pages

  const numPages = pdfDoc.numPages;
  pageCountEl.textContent = numPages;
  zoomPercentEl.textContent = `${Math.round(scale * 100)}%`;

  for (let i = 1; i <= numPages; i++) {
    const pageContainer = document.createElement('div');
    pageContainer.className = 'canvas-page-wrapper';
    pageContainer.id = `page-container-${i}`;
    pageContainer.style.cssText = `
      position: relative;
      margin-bottom: 24px;
      padding: 10px;
      border-radius: 6px;
      background: #111827;
      border: 1px solid rgba(245, 158, 11, 0.15);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      align-items: center;
      user-select: none;
      -webkit-user-select: none;
    `;

    const canvas = document.createElement('canvas');
    canvas.id = `pdf-canvas-page-${i}`;
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.borderRadius = '4px';
    if (isDarkMode) {
      canvas.classList.add('dark-viewer-canvas');
    }

    pageContainer.appendChild(canvas);
    canvasFrame.appendChild(pageContainer);

    try {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: scale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const ctx = canvas.getContext('2d');
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error(`Error rendering page ${i}:`, err);
    }
  }
  pagesRendering = false;
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

    const loadingTask = pdfjsLib.getDocument({
      url: streamUrl,
      withCredentials: true
    });

    loadingTask.promise.then((pdfDocument) => {
      pdfDoc = pdfDocument;
      pageCountEl.textContent = pdfDoc.numPages;

      // Render all pages top-to-bottom
      renderAllPages().then(() => {
        spinner.style.display = 'none';
        pageNumEl.textContent = 1;
      });

    }, (error) => {
      console.error('PDF.js launch failure:', error);
      showErrorAndRedirect('Authorization failure or insecure document. Access Denied.');
    });

  } catch (err) {
    console.error('Error fetching stream:', err);
    showErrorAndRedirect('Internal Connection Failure.');
  }
}

function scrollToPage(num) {
  const targetElement = document.getElementById(`page-container-${num}`);
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    pageNum = num;
    pageNumEl.textContent = num;
  }
}

function setupToolbarEvents() {
  // Page Navs
  document.getElementById('prev-page').addEventListener('click', () => {
    if (pageNum <= 1) return;
    scrollToPage(pageNum - 1);
  });

  document.getElementById('next-page').addEventListener('click', () => {
    if (pdfDoc && pageNum >= pdfDoc.numPages) return;
    scrollToPage(pageNum + 1);
  });

  // Zoom Controllers
  document.getElementById('zoom-in').addEventListener('click', () => {
    if (scale >= maxScale) return;
    scale += scaleStep;
    renderAllPages();
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    if (scale <= minScale) return;
    scale -= scaleStep;
    renderAllPages();
  });

  // Dark Mode Canvas custom Filter Toggle
  const modeBtn = document.getElementById('dark-mode-toggle');
  modeBtn.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    const canvases = canvasFrame.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      if (isDarkMode) {
        canvas.classList.add('dark-viewer-canvas');
      } else {
        canvas.classList.remove('dark-viewer-canvas');
      }
    });

    if (isDarkMode) {
      modeBtn.innerHTML = '<i data-lucide="sun" style="width: 16px; height: 16px; color: #F59E0B;"></i>';
    } else {
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

function setupResponsiveHandlers() {
  let resizeTimeout;
  const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      const containerWidth = entry.contentRect.width;
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (pdfDoc) {
          let oldScale = scale;
          if (containerWidth < 768 && scale > 0.85) {
            scale = 0.75;
          } else if (containerWidth < 480 && scale > 0.6) {
            scale = 0.55;
          } else {
            scale = 1.0;
          }
          if (oldScale !== scale) {
            renderAllPages();
          }
        }
      }, 300);
    }
  });

  const target = document.getElementById('viewer-container');
  resizeObserver.observe(target);
}

// Track page number in head as reader scrolls down
function setupPageScrollTracking() {
  const container = document.getElementById('viewer-container');
  container.addEventListener('scroll', () => {
    if (!pdfDoc || pagesRendering) return;

    const pageWrappers = canvasFrame.querySelectorAll('.canvas-page-wrapper');
    const containerTop = container.getBoundingClientRect().top;
    
    let activePage = 1;
    let minDistance = Infinity;

    pageWrappers.forEach((wrapper, index) => {
      const rect = wrapper.getBoundingClientRect();
      // Calculate how close the top of this page is to the top of the viewing area
      const distance = Math.abs(rect.top - containerTop);
      if (distance < minDistance) {
        minDistance = distance;
        activePage = index + 1;
      }
    });

    if (pageNum !== activePage) {
      pageNum = activePage;
      pageNumEl.textContent = activePage;
    }
  });
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
