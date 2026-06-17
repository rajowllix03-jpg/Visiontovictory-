// Initializing search, stats, and state variables for Student portal
let allSubjects = [];
let allTopics = [];
let allPDFs = [];

// Navigation state controller
let currentView = 'home'; // 'home' or 'subject' or 'search'
let selectedSubjectId = null;
let selectedSubjectName = "";

// Initialize client components
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  
  // Set default event listeners
  const homeBreadcrumb = document.getElementById('breadcrumb-home');
  homeBreadcrumb.addEventListener('click', (e) => {
    e.preventDefault();
    renderHomeView();
  });

  // Global search implementation
  const searchInput = document.getElementById('global-search');
  const searchBtn = document.getElementById('search-btn');

  const executeSearch = () => {
    const query = searchInput.value.trim();
    if (query !== '') {
      renderSearchView(query);
    } else {
      renderHomeView();
    }
  };

  searchBtn.addEventListener('click', executeSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      executeSearch();
    }
  });

  // Initial Boot loader
  fetchInitialPlatformData();
});

// Toast notification helper
function showFeedbackToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? 'check-circle' : 'alert-triangle';
  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s forwards reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Show/Hide loader spinner in viewing container
function setViewLoaderToggle(visible) {
  const spinner = document.getElementById('view-spinner');
  spinner.style.display = visible ? 'flex' : 'none';
}

// Bootstrapper: Load initial statistical data
async function fetchInitialPlatformData() {
  setViewLoaderToggle(true);
  try {
    const subjectsResponse = await fetch('/api/pdf/subjects');
    const topicsResponse = await fetch('/api/pdf/topics');
    const pdfsResponse = await fetch('/api/pdf/pdfs');

    allSubjects = await subjectsResponse.json();
    allTopics = await topicsResponse.json();
    allPDFs = await pdfsResponse.json();

    // Populate Statistics Cards
    document.getElementById('stat-subjects-val').innerText = allSubjects.length;
    document.getElementById('stat-topics-val').innerText = allTopics.length;
    document.getElementById('stat-pdfs-val').innerText = allPDFs.length;

    // Render Home Subject Grid
    renderHomeView();

  } catch (error) {
    console.error('Error bootstrapping client:', error);
    showFeedbackToast('Failed to connect to secure gateway database. Please reload.', 'error');
  } finally {
    setViewLoaderToggle(false);
  }
}

// 1. Render Home View with Subject Cards
function renderHomeView() {
  currentView = 'home';
  selectedSubjectId = null;
  selectedSubjectName = "";

  // Reset breadcrumbs state
  const breadcrumbs = document.getElementById('view-breadcrumbs');
  breadcrumbs.innerHTML = `
    <span style="color: #64748B;"><i data-lucide="home" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>Subjects</span>
  `;

  // Reset header section titles
  document.getElementById('view-title').innerText = 'Scholastic Subjects';
  document.getElementById('view-suffix-info').innerText = 'Select a subject to expand learning topics';

  const container = document.getElementById('dynamic-content-slot');
  if (allSubjects.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 24px; color: #64748B;">
        <i data-lucide="folder-search" style="width: 48px; height: 48px; color: #F59E0B; margin: 0 auto 16px auto; display: block;"></i>
        <h3>No subjects configured yet</h3>
        <p style="font-size: 0.9rem; margin-top: 6px;">Check back later or configure themes inside the Admin Panel.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Generate beautiful subject cards with custom icons
  let html = `<div class="subjects-container">`;
  allSubjects.forEach(subject => {
    // Count topics linked to subject
    const topicCount = allTopics.filter(t => String(t.subject_id) === String(subject.id)).length;
    
    html += `
      <div class="glass-card subject-item-card" onclick="renderSubjectTopicsView(${subject.id}, '${escapeSingleQuotes(subject.name)}')">
        <div class="subject-icon">
          <i data-lucide="book-open"></i>
        </div>
        <h3 class="gold-gradient-text">${escapeHTML(subject.name)}</h3>
        <p class="subject-topics-count">${topicCount} Module Topics</p>
      </div>
    `;
  });
  html += `</div>`;

  container.innerHTML = html;
  lucide.createIcons();
}

// 2. Render Subject View (Shows list of custom topics containing segregated PDFs)
async function renderSubjectTopicsView(subjectId, subjectName) {
  currentView = 'subject';
  selectedSubjectId = subjectId;
  selectedSubjectName = subjectName;

  // Render breadcrumbs with home connection
  const breadcrumbs = document.getElementById('view-breadcrumbs');
  breadcrumbs.innerHTML = `
    <a href="#" id="breadcrumb-back-home" style="color: #FBBF24; text-decoration: none;"><i data-lucide="home" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>Subjects</a>
    <span style="color: #64748B; margin: 0 8px;">/</span>
    <span style="color: #FFFFFF;">${escapeHTML(subjectName)}</span>
  `;

  document.getElementById('breadcrumb-back-home').addEventListener('click', (e) => {
    e.preventDefault();
    renderHomeView();
  });

  document.getElementById('view-title').innerText = `${subjectName} Modules`;
  document.getElementById('view-suffix-info').innerText = 'Expand study materials and try assignments';

  const container = document.getElementById('dynamic-content-slot');
  setViewLoaderToggle(true);

  try {
    // Fetch modular topics under this subject
    const response = await fetch(`/api/pdf/topics?subject_id=${subjectId}`);
    const subjectTopics = await response.json();

    if (subjectTopics.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 24px; color: #64748B;">
          <i data-lucide="folder-search" style="width: 48px; height: 48px; color: #F59E0B; margin: 0 auto 16px auto; display: block;"></i>
          <h3>No topics built for this subject yet</h3>
          <p style="font-size: 0.9rem; margin-top: 6px;">Upload a lecture PDF mapping to create topics.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    // Load active PDFs relative to this subject to group them under corresponding topics
    const pdfResponse = await fetch(`/api/pdf/pdfs?topic_id=`); // Load all PDFs
    const pdfsList = await pdfResponse.json();

    let html = `<div class="topics-grid">`;
    subjectTopics.forEach(topic => {
      const topicPdfs = pdfsList.filter(p => String(p.topic_id) === String(topic.id));
      const classPdfs = topicPdfs.filter(p => p.type === 'class');
      const practicePdfs = topicPdfs.filter(p => p.type === 'practice');

      html += `
        <div class="glass-card topic-details-card" style="display: flex; flex-direction: column; height: 100%;">
          <h3 class="gold-gradient-text" style="border-bottom: 1px solid rgba(245,158,11,0.15); padding-bottom: 10px; margin-bottom: 16px;">
            <i data-lucide="graduation-cap" style="color: #F59E0B; width: 18px; height: 18px;"></i>
            <span>${escapeHTML(topic.name)}</span>
          </h3>

          <!-- Class PDFs layout -->
          <div style="margin-bottom: 20px; flex: 1;">
            <p style="font-size: 0.85rem; color: #FBBF24; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="book-marked" style="width: 14px; height: 14px;"></i>
              <span>Class lectures</span>
            </p>
            <ul class="topic-pdf-list">
              ${classPdfs.length === 0 
                ? `<li style="font-size: 0.85rem; color: #64748B; padding: 6px 12px;">No lectures uploaded yet</li>` 
                : classPdfs.map(p => `
                  <li class="topic-pdf-item" onclick="launchSecurePDFViewer(${p.id})">
                    <div class="pdf-meta">
                      <i data-lucide="file-text"></i>
                      <span>${escapeHTML(p.title)}</span>
                    </div>
                    <i data-lucide="play-circle" style="color: #FBBF24; width: 16px; height: 16px;"></i>
                  </li>
                `).join('')}
            </ul>
          </div>

          <!-- Practice PDFs layout -->
          <div>
            <p style="font-size: 0.85rem; color: #94A3B8; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
              <span>Home Practice Sheets</span>
            </p>
            <ul class="topic-pdf-list">
              ${practicePdfs.length === 0 
                ? `<li style="font-size: 0.85rem; color: #64748B; padding: 6px 12px;">No practice sheets configured</li>` 
                : practicePdfs.map(p => `
                  <li class="topic-pdf-item" onclick="launchSecurePDFViewer(${p.id})">
                    <div class="pdf-meta">
                      <i data-lucide="file-question"></i>
                      <span>${escapeHTML(p.title)}</span>
                    </div>
                    <i data-lucide="check-circle-2" style="color: #F59E0B; width: 16px; height: 16px;"></i>
                  </li>
                `).join('')}
            </ul>
          </div>

        </div>
      `;
    });
    html += `</div>`;

    container.innerHTML = html;
    lucide.createIcons();

  } catch (error) {
    console.error('Error fetching subject topics:', error);
    showFeedbackToast('Failed to retrieve curriculum database.', 'error');
  } finally {
    setViewLoaderToggle(false);
  }
}

// 3. Render Search Results View (Queries backend securely and displays layout blocks)
async function renderSearchView(query) {
  currentView = 'search';

  const breadcrumbs = document.getElementById('view-breadcrumbs');
  breadcrumbs.innerHTML = `
    <a href="#" id="breadcrumb-search-home" style="color: #FBBF24; text-decoration: none;"><i data-lucide="home" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>Subjects</a>
    <span style="color: #64748B; margin: 0 8px;">/</span>
    <span style="color: #FFFFFF;">Search Results</span>
  `;

  document.getElementById('breadcrumb-search-home').addEventListener('click', (e) => {
    e.preventDefault();
    renderHomeView();
  });

  document.getElementById('view-title').innerText = `Results for "${escapeHTML(query)}"`;
  document.getElementById('view-suffix-info').innerText = 'Secure documents matched through search criteria';

  const container = document.getElementById('dynamic-content-slot');
  setViewLoaderToggle(true);

  try {
    const searchResponse = await fetch(`/api/pdf/pdfs?search=${encodeURIComponent(query)}`);
    const results = await searchResponse.json();

    if (results.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 24px; color: #64748B;">
          <i data-lucide="search-code" style="width: 48px; height: 48px; color: #F59E0B; margin: 0 auto 16px auto; display: block;"></i>
          <h3>No secure files matched your search</h3>
          <p style="font-size: 0.9rem; margin-top: 6px;">Try adjusting keywords or selecting direct subject directories instead.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    // Render results grid layout cleanly
    let html = `
      <div style="margin-bottom: 20px; font-size: 0.95rem; color: #94A3B8;">
        Matched <span style="color: #F59E0B; font-weight: 600;">${results.length}</span> lectures in curriculum
      </div>
      <div class="topics-grid">
    `;

    results.forEach(p => {
      const icon = p.type === 'class' ? 'file-text' : 'file-question';
      const typeLabel = p.type === 'class' ? 'Class Lecture' : 'Home Practice';
      
      html += `
        <div class="glass-card topic-pdf-item" style="padding: 20px; flex-direction: column; align-items: flex-start; gap: 12px; cursor: pointer;" onclick="launchSecurePDFViewer(${p.id})">
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
            <span style="font-size: 0.75rem; color: #FBBF24; background: rgba(245,158,11,0.15); border: 1.5px solid var(--color-gold-border); padding: 2px 8px; border-radius: 99px; font-weight: 500;">
              ${typeLabel}
            </span>
            <span style="font-size: 0.75rem; color: #64748B;">
              ${p.subject_name}
            </span>
          </div>
          <div>
            <h3 class="gold-gradient-text" style="font-size: 1.15rem; margin-bottom: 4px; font-family: var(--font-sans);">${escapeHTML(p.title)}</h3>
            <p style="font-size: 0.85rem; color: #94A3B8;">Topic: ${escapeHTML(p.topic_name)}</p>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; color: #F59E0B; font-size: 0.85rem; font-weight: 500; margin-top: 4px;">
            <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
            <span>Unlock Secured Viewer</span>
          </div>
        </div>
      `;
    });
    html += `</div>`;

    container.innerHTML = html;
    lucide.createIcons();

  } catch (error) {
    console.error('Search query API error:', error);
    showFeedbackToast('Failed to complete search query catalog.', 'error');
  } finally {
    setViewLoaderToggle(false);
  }
}

// Launch custom secure PDF.js player frame
function launchSecurePDFViewer(pdfId) {
  // Navigates securely to custom viewer, keeping file paths fully concealed
  window.location.href = `/viewer?id=${pdfId}`;
}

// 4. SANITIZATION AND ESCAPING HELPERS
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function escapeSingleQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}
