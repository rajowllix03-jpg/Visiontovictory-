// Active admin database states
let subjectsList = [];
let topicsList = [];
let pdfsList = [];

// Intercept all fetch requests globally to include standard Authorization header 
// to gracefully bypass third-party cookie restrictions inside the preview iframe
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function (resource, options = {}) {
    let token = localStorage.getItem('vision_admin_token');
    if (!token) {
      const urlParams = new URLSearchParams(window.location.search);
      token = urlParams.get('token');
      if (token) {
        localStorage.setItem('vision_admin_token', token);
      }
    }

    if (token) {
      if (!options.headers) {
        options.headers = {};
      }
      if (options.headers instanceof Headers) {
        if (!options.headers.has('Authorization')) {
          options.headers.set('Authorization', `Bearer ${token}`);
        }
      } else {
        if (!options.headers['Authorization']) {
          options.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }
    return originalFetch(resource, options);
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // Redirect to login if user session is not actively authenticated in backend
  verifyAdminSession();

  // 1. Hook up all actions & submit events
  setupUploadCascadingSelectors();
  setupSubjectFormHandlers();
  setupTopicFormHandlers();
  setupPdfFormHandlers();
  setupPdfDragAndDropZone();
  setupLogoutHandler();

  // Search filter catalog
  const catalogSearch = document.getElementById('pdf-search-catalog');
  catalogSearch.addEventListener('input', () => {
    renderPdfsCatalog(catalogSearch.value.trim());
  });
});

// Toast notification for dashboard events
function showToastMessage(message, type = 'success') {
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

// Center Modal notifications for mission-critical actions (e.g. PDF uploading)
function showStatusModal(title, message, isSuccess = true) {
  const existing = document.getElementById('status-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'status-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(11, 15, 25, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: fadeIn 0.2s ease-out;
  `;

  const modal = document.createElement('div');
  modal.className = 'glass-card';
  modal.style.cssText = `
    max-width: 420px;
    width: 90%;
    padding: 32px;
    border-radius: 16px;
    background: #0F172A;
    border: 1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'};
    box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 24px ${isSuccess ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};
    text-align: center;
    animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `;

  const iconName = isSuccess ? 'check-circle' : 'alert-triangle';
  const iconColor = isSuccess ? '#10B981' : '#EF4444';
  const bgAlpha = isSuccess ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
  
  modal.innerHTML = `
    <div style="background: ${bgAlpha}; width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 20px auto; display: flex; align-items: center; justify-content: center; border: 1px solid ${iconColor};">
      <i data-lucide="${iconName}" style="color: ${iconColor}; width: 32px; height: 32px;"></i>
    </div>
    <h3 style="font-size: 1.5rem; margin-bottom: 12px; font-family: var(--font-sans); color: ${isSuccess ? '#10B981' : '#EF4444'}; font-weight: 700;">${title}</h3>
    <p style="color: #94A3B8; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.6; font-family: var(--font-sans);">${message}</p>
    <button class="gold-btn" style="width: 100%; justify-content: center; font-size: 14px; padding: 12px; border-radius: 8px;" id="status-modal-close-btn">
      <span>Close Window</span>
    </button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  if (window.lucide) {
    window.lucide.createIcons();
  }

  const closeBtn = modal.querySelector('#status-modal-close-btn');
  const closeModal = () => {
    overlay.style.animation = 'fadeOut 0.15s ease-out forwards';
    setTimeout(() => {
      overlay.remove();
    }, 150);
  };

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });
}

// Check if modern Admin session exists in current cookies
async function verifyAdminSession() {
  try {
    const response = await fetch('/api/admin/session');
    const status = await response.json();
    if (!status.authenticated) {
      window.location.href = '/admin-login';
    } else {
      // Boot up full datasets loaders
      loadDashboardMasterData();
    }
  } catch (err) {
    console.error('Session verify failure:', err);
    window.location.href = '/admin-login';
  }
}

// Master data loader: triggers statistics summaries and pulls grid data
async function loadDashboardMasterData() {
  try {
    // 1. Pull statistical counts
    const statsRes = await fetch('/api/admin/stats');
    if (statsRes.status === 401) {
      window.location.href = '/admin-login';
      return;
    }
    const statsData = await statsRes.json();
    document.getElementById('stats-subjects').innerText = statsData.subjects;
    document.getElementById('stats-topics').innerText = statsData.topics;
    document.getElementById('stats-pdfs').innerText = statsData.pdfs;
    document.getElementById('stats-last').innerText = statsData.lastUpload;

    // 2. Load lists
    const subjectsRes = await fetch('/api/pdf/subjects');
    const topicsRes = await fetch('/api/pdf/topics');
    const pdfsRes = await fetch('/api/pdf/pdfs');

    subjectsList = await subjectsRes.json();
    topicsList = await topicsRes.json();
    pdfsList = await pdfsRes.json();

    // 3. Render respective control tables
    renderSubjectsTable();
    renderTopicsTable();
    renderPdfsCatalog();

    // 4. Update core form selectors
    populateFormSelectors();

  } catch (error) {
    console.error('Master load error:', error);
    showToastMessage('Could not retrieve database indexes.', 'error');
  }
}

/**
 * SUBJECT SECTION OPERATIONS
 */
function setupSubjectFormHandlers() {
  const form = document.getElementById('add-subject-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('subject-name-input');
    const name = nameInput.value.trim();

    try {
      const res = await fetch('/api/admin/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();

      if (res.ok) {
        showToastMessage('New subject created successfully!');
        nameInput.value = '';
        loadDashboardMasterData();
      } else {
        showToastMessage(data.error || 'Failed to add subject.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Internal server connection error.', 'error');
    }
  });

  // Action listeners for saving inline edits
  document.getElementById('save-sub-edit-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-sub-id').value;
    const name = document.getElementById('edit-sub-name').value.trim();

    if (!name) return showToastMessage('Subject name is required', 'error');

    try {
      const res = await fetch(`/api/admin/subjects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();

      if (res.ok) {
        showToastMessage('Subject updated successfully!');
        document.getElementById('subject-inline-editor').style.display = 'none';
        loadDashboardMasterData();
      } else {
        showToastMessage(data.error || 'Failed to update subject', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Server connection error.', 'error');
    }
  });

  document.getElementById('cancel-sub-edit-btn').addEventListener('click', () => {
    document.getElementById('subject-inline-editor').style.display = 'none';
  });
}

function renderSubjectsTable() {
  const tbody = document.getElementById('subjects-table-body');
  tbody.innerHTML = '';

  if (subjectsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: #64748B;">No subjects configured yet</td></tr>';
    return;
  }

  subjectsList.forEach(sub => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${escapeHTML(sub.name)}</b></td>
      <td style="text-align: right;">
        <div class="row-actions" style="justify-content: flex-end;">
          <button class="gold-outline-btn" style="padding: 4px 8px; font-size: 12px;" onclick="triggerSubjectEdit(${sub.id}, '${escapeSingleQuotes(sub.name)}')">
            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
          </button>
          <button class="danger-btn" style="padding: 4px 8px; font-size: 12px;" onclick="triggerSubjectDelete(${sub.id}, '${escapeSingleQuotes(sub.name)}')">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

window.triggerSubjectEdit = function(id, name) {
  const editor = document.getElementById('subject-inline-editor');
  editor.style.display = 'block';
  document.getElementById('edit-sub-id').value = id;
  document.getElementById('edit-sub-name').value = name;
  document.getElementById('edit-sub-name').focus();
};

window.triggerSubjectDelete = async function(id, name) {
  if (confirm(`CRITICAL WARNING:\n\nAre you absolutely sure you want to delete Subject "${name}"?\n\nDeleting this subject will permanently destroy all underlying topics and uploaded PDFs from local storage. This action is irreversible.`)) {
    try {
      const res = await fetch(`/api/admin/subjects/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToastMessage('Subject and all child files completely deleted.');
        loadDashboardMasterData();
      } else {
        showToastMessage(data.error || 'Failed to remove subject', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Server gateway error while performing delete.', 'error');
    }
  }
};


/**
 * TOPIC SECTION OPERATIONS
 */
function setupTopicFormHandlers() {
  const form = document.getElementById('add-topic-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subjectId = document.getElementById('topic-subject-select').value;
    const nameInput = document.getElementById('topic-name-input');
    const name = nameInput.value.trim();

    try {
      const res = await fetch('/api/admin/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject_id: subjectId })
      });
      const data = await res.json();

      if (res.ok) {
        showToastMessage('New modular topic created!');
        nameInput.value = '';
        loadDashboardMasterData();
      } else {
        showToastMessage(data.error || 'Failed to create topic', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Internal network socket error.', 'error');
    }
  });

  // Action listeners for inline topic renaming
  document.getElementById('save-topic-edit-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-topic-id').value;
    const name = document.getElementById('edit-topic-name').value.trim();

    if (!name) return showToastMessage('Topic title name is required', 'error');

    try {
      const res = await fetch(`/api/admin/topics/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();

      if (res.ok) {
        showToastMessage('Topic renamed successfully!');
        document.getElementById('topic-inline-editor').style.display = 'none';
        loadDashboardMasterData();
      } else {
        showToastMessage(data.error || 'Failed to update topic', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Server connection error.', 'error');
    }
  });

  document.getElementById('cancel-topic-edit-btn').addEventListener('click', () => {
    document.getElementById('topic-inline-editor').style.display = 'none';
  });
}

function renderTopicsTable() {
  const tbody = document.getElementById('topics-table-body');
  tbody.innerHTML = '';

  if (topicsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #64748B;">No topics configured yet</td></tr>';
    return;
  }

  topicsList.forEach(topic => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${escapeHTML(topic.name)}</b></td>
      <td><span style="color: #64748B; font-weight: 500;">${escapeHTML(topic.subject_name || 'Unassigned')}</span></td>
      <td style="text-align: right;">
        <div class="row-actions" style="justify-content: flex-end;">
          <button class="gold-outline-btn" style="padding: 4px 8px; font-size: 12px;" onclick="triggerTopicEdit(${topic.id}, '${escapeSingleQuotes(topic.name)}')">
            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
          </button>
          <button class="danger-btn" style="padding: 4px 8px; font-size: 12px;" onclick="triggerTopicDelete(${topic.id}, '${escapeSingleQuotes(topic.name)}')">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

window.triggerTopicEdit = function(id, name) {
  const editor = document.getElementById('topic-inline-editor');
  editor.style.display = 'block';
  document.getElementById('edit-topic-id').value = id;
  document.getElementById('edit-topic-name').value = name;
  document.getElementById('edit-topic-name').focus();
};

window.triggerTopicDelete = async function(id, name) {
  if (confirm(`Are you sure you want to delete topic "${name}"?\n\nThis will physically purge all linked PDF attachments immediately.`)) {
    try {
      const res = await fetch(`/api/admin/topics/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToastMessage('Topic and associated documents deleted.');
        loadDashboardMasterData();
      } else {
        showToastMessage(data.error || 'Failed to remove topic', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Database communication failure.', 'error');
    }
  }
};


/**
 * SECURE PDF CATALOG & UPLOAD SECTION
 */
async function updateTopicOptions(subjectId, selectedTopicId = null) {
  const topicSelect = document.getElementById('pdf-topic-select');
  if (!subjectId) {
    topicSelect.disabled = true;
    topicSelect.innerHTML = '<option value="">-- Select Subject first --</option>';
    return;
  }

  topicSelect.innerHTML = '<option value="">Loading topics...</option>';
  topicSelect.disabled = true;

  try {
    const res = await fetch(`/api/pdf/topics?subject_id=${subjectId}`);
    const filtered = res.ok ? await res.json() : [];

    topicSelect.innerHTML = '<option value="">-- Choose Topic --</option>';
    if (filtered.length === 0) {
      topicSelect.innerHTML = '<option value="">-- No Topics available! --</option>';
      topicSelect.disabled = true;
      return;
    }

    filtered.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.innerText = t.name;
      if (selectedTopicId && String(t.id) === String(selectedTopicId)) {
        opt.selected = true;
      }
      topicSelect.appendChild(opt);
    });
    topicSelect.disabled = false;
  } catch (err) {
    console.warn('Fallback to local filtering:', err);
    const localFiltered = topicsList.filter(t => String(t.subject_id) === String(subjectId));
    topicSelect.innerHTML = '<option value="">-- Choose Topic --</option>';
    if (localFiltered.length === 0) {
      topicSelect.innerHTML = '<option value="">-- No Topics available --</option>';
      topicSelect.disabled = true;
      return;
    }
    localFiltered.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.innerText = t.name;
      if (selectedTopicId && String(t.id) === String(selectedTopicId)) {
        opt.selected = true;
      }
      topicSelect.appendChild(opt);
    });
    topicSelect.disabled = false;
  }
}

function setupUploadCascadingSelectors() {
  const subSelect = document.getElementById('pdf-subject-select');
  subSelect.addEventListener('change', () => {
    updateTopicOptions(subSelect.value);
  });
}

function setupPdfFormHandlers() {
  const form = document.getElementById('upload-pdf-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="golden-spinner" style="width:16px; height:16px; display:inline-block; border-width:2px; margin-right:8px; vertical-align:middle;"></span>Uploading secure payload...';

    const formData = new FormData(form);
    const titleVal = document.getElementById('pdf-title').value.trim();

    try {
      const res = await fetch('/api/admin/pdfs', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        showStatusModal('Upload Successful!', `The secure PDF document "${data.title || titleVal}" has been successfully published to the live portal catalog.`, true);
        form.reset();
        document.getElementById('file-zone-text').innerHTML = 'Drag & drop your PDF file here, or <b>browse</b>';
        document.getElementById('pdf-topic-select').disabled = true;
        document.getElementById('pdf-topic-select').innerHTML = '<option value="">-- Select Subject first --</option>';
        loadDashboardMasterData();
      } else {
        showStatusModal('Upload Failed!', data.error || 'Failed to complete document upload.', false);
      }
    } catch (err) {
      console.error(err);
      showStatusModal('Upload Connection Failed!', 'Connecting link to file upload portal timed out. Please check server logs.', false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // Action listeners for saving inline PDF names
  document.getElementById('save-pdf-edit-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-pdf-id').value;
    const title = document.getElementById('edit-pdf-title').value.trim();

    if (!title) return showToastMessage('PDF display title is required', 'error');

    try {
      const res = await fetch(`/api/admin/pdfs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      const data = await res.json();

      if (res.ok) {
        showToastMessage('PDF display title updated successfully!');
        document.getElementById('pdf-inline-editor').style.display = 'none';
        loadDashboardMasterData();
      } else {
        showToastMessage(data.error || 'Failed to rename document title', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Server response error.', 'error');
    }
  });

  document.getElementById('cancel-pdf-edit-btn').addEventListener('click', () => {
    document.getElementById('pdf-inline-editor').style.display = 'none';
  });
}

function setupPdfDragAndDropZone() {
  const dropZone = document.getElementById('drag-drop-zone');
  const fileInput = document.getElementById('pdfFile');
  const zoneText = document.getElementById('file-zone-text');

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (file.type !== 'application/pdf') {
        showToastMessage('Only standard PDF files are authorized for upload.', 'error');
        fileInput.value = '';
        return;
      }
      zoneText.innerHTML = `<i data-lucide="check" style="color: #10B981; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Chosen: <b>${escapeHTML(file.name)}</b> (${(file.size/1024/1024).toFixed(2)} MB)`;
      lucide.createIcons();
    }
  });

  // Highlight colors on hover
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = '#FBBF24';
      dropZone.style.background = 'rgba(245,158,11,0.08)';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      dropZone.style.background = 'rgba(0,0,0,0.4)';
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
      const file = files[0];
      if (file.type !== 'application/pdf') {
        showToastMessage('Authorized file payloads must be .pdf formatting.', 'error');
        return;
      }
      fileInput.files = files;
      zoneText.innerHTML = `<i data-lucide="check" style="color: #10B981; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Chosen: <b>${escapeHTML(file.name)}</b> (${(file.size/1024/1024).toFixed(2)} MB)`;
      lucide.createIcons();
    }
  });
}

function renderPdfsCatalog(searchFilter = '') {
  const tbody = document.getElementById('pdfs-table-body');
  tbody.innerHTML = '';

  let filtered = pdfsList;
  if (searchFilter) {
    const target = searchFilter.toLowerCase();
    filtered = pdfsList.filter(p => 
      p.title.toLowerCase().includes(target) || 
      p.topic_name.toLowerCase().includes(target) || 
      p.subject_name.toLowerCase().includes(target)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #64748B;">No document logs found</td></tr>';
    return;
  }

  filtered.forEach(pdf => {
    const tr = document.createElement('tr');
    const badgeColor = pdf.type === 'class' ? '#FBBF24' : '#10B981';
    const badgeText = pdf.type === 'class' ? 'Class' : 'Homework';

    tr.innerHTML = `
      <td><b>${escapeHTML(pdf.title)}</b></td>
      <td>
        <div style="font-size: 13px;">${escapeHTML(pdf.subject_name)}</div>
        <div style="font-size: 11px; color:#64748B;">Topic: ${escapeHTML(pdf.topic_name)}</div>
      </td>
      <td>
        <span style="font-size:11px; color: ${badgeColor}; border:1px solid ${badgeColor}40; background:${badgeColor}10; padding:2px 8px; border-radius:99px; font-weight:600; text-transform:uppercase;">
          ${badgeText}
        </span>
      </td>
      <td style="text-align: right;">
        <div class="row-actions" style="justify-content: flex-end;">
          <button class="gold-outline-btn" style="padding: 4px 8px; font-size: 12px;" onclick="triggerPdfEdit(${pdf.id}, '${escapeSingleQuotes(pdf.title)}')">
            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
          </button>
          <button class="danger-btn" style="padding: 4px 8px; font-size: 12px;" onclick="triggerPdfDelete(${pdf.id}, '${escapeSingleQuotes(pdf.title)}')">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

window.triggerPdfEdit = function(id, title) {
  const editor = document.getElementById('pdf-inline-editor');
  editor.style.display = 'block';
  document.getElementById('edit-pdf-id').value = id;
  document.getElementById('edit-pdf-title').value = title;
  document.getElementById('edit-pdf-title').focus();
};

window.triggerPdfDelete = async function(id, title) {
  if (confirm(`Confirm physical deletion:\n\nAre you sure you want to permanently erase PDF "${title}"?\n\nThis will purge the local folder file completely.`)) {
    try {
      const res = await fetch(`/api/admin/pdfs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToastMessage('Document deleted successfully.');
        loadDashboardMasterData();
      } else {
        showToastMessage(data.error || 'Failed to remove document', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Network failure during delete sequence.', 'error');
    }
  }
};


/**
 * REUSABLE DATA POPULATORS
 */
function populateFormSelectors() {
  const topicSubSelect = document.getElementById('topic-subject-select');
  const pdfSubSelect = document.getElementById('pdf-subject-select');
  const pdfTopicSelect = document.getElementById('pdf-topic-select');

  // Keep existing choices
  const currentTopicSel = topicSubSelect.value;
  const currentPdfSel = pdfSubSelect.value;
  const currentPdfTopicSel = pdfTopicSelect.value;

  topicSubSelect.innerHTML = '<option value="">-- Choose Subject --</option>';
  pdfSubSelect.innerHTML = '<option value="">-- Choose Subject --</option>';

  subjectsList.forEach(sub => {
    const opt1 = document.createElement('option');
    opt1.value = sub.id;
    opt1.innerText = sub.name;
    topicSubSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = sub.id;
    opt2.innerText = sub.name;
    pdfSubSelect.appendChild(opt2);
  });

  // Restore selections if valid
  if (currentTopicSel && subjectsList.some(s => String(s.id) === String(currentTopicSel))) {
    topicSubSelect.value = currentTopicSel;
  }
  if (currentPdfSel && subjectsList.some(s => String(s.id) === String(currentPdfSel))) {
    pdfSubSelect.value = currentPdfSel;
    updateTopicOptions(currentPdfSel, currentPdfTopicSel);
  }
}

function setupLogoutHandler() {
  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/logout', { method: 'POST' });
      if (res.ok) {
        localStorage.removeItem('vision_admin_token');
        window.location.href = '/admin-login';
      } else {
        showToastMessage('Logout connection failed.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToastMessage('Could not connect to session endpoint.', 'error');
    }
  });
}

// 4. SANITIZATION HELPERS
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
