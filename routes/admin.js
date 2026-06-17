import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Setup temp uploads folder for multer
const tempDir = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ dest: tempDir });

// Helper to sanitize subject and topic folder names
function sanitizeFolderName(name) {
  return name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
}

/**
 * 1. ADMIN AUTHORIZATION & LOGIN FLOW
 */

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'VisionToVictory2026';

  if (password === adminPassword) {
    req.session.isAdmin = true;
    const token = Buffer.from(adminPassword).toString('base64');
    
    // Save session explicitly before redirecting or responding
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to create login session.' });
      }
      res.json({ success: true, token, message: 'Logged in successfully.' });
    });
  } else {
    res.status(401).json({ error: 'Incorrect password. Access denied.' });
  }
});

// GET /api/admin/session
router.get('/session', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const adminPassword = process.env.ADMIN_PASSWORD || 'VisionToVictory2026';
  const validToken = Buffer.from(adminPassword).toString('base64');

  let hasToken = false;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === validToken) {
      hasToken = true;
    }
  } else if (req.query && req.query.token === validToken) {
    hasToken = true;
  }

  if (hasToken) {
    if (req.session) {
      req.session.isAdmin = true;
    }
    return res.json({ authenticated: true });
  }

  if (req.session && req.session.isAdmin) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.clearCookie('connect.sid'); // Clear default Express Session cookie
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

/**
 * 2. ADMIN DASHBOARD STATISTICS
 */

// GET /api/admin/stats (Protected)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const subjectsCountRow = await db.get('SELECT COUNT(*) as count FROM subjects');
    const topicsCountRow = await db.get('SELECT COUNT(*) as count FROM topics');
    const pdfsCountRow = await db.get('SELECT COUNT(*) as count FROM pdfs');

    const lastUploadRow = await db.get('SELECT title, created_at FROM pdfs ORDER BY created_at DESC LIMIT 1');

    res.json({
      subjects: subjectsCountRow.count,
      topics: topicsCountRow.count,
      pdfs: pdfsCountRow.count,
      lastUpload: lastUploadRow ? lastUploadRow.title : 'None',
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    res.status(500).json({ error: 'Could not fetch statistics' });
  }
});

/**
 * 3. SUBJECT MANAGEMENT
 */

// POST /api/admin/subjects
router.post('/subjects', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Subject name is required' });
  }

  try {
    const trimmedName = name.trim();
    const result = await db.run('INSERT INTO subjects (name) VALUES (?)', [trimmedName]);
    res.status(201).json({ success: true, id: result.id, name: trimmedName });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Subject already exists' });
    }
    console.error('Error adding subject:', error);
    res.status(500).json({ error: 'Failed to add subject' });
  }
});

// PUT /api/admin/subjects/:id
router.put('/subjects/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Subject name is required' });
  }

  try {
    const trimmedName = name.trim();
    // Get original subject name before rename to rename physical folders if they exist
    const originalSubject = await db.get('SELECT * FROM subjects WHERE id = ?', [id]);
    if (!originalSubject) {
      return res.status(444).json({ error: 'Subject not found' });
    }

    await db.run('UPDATE subjects SET name = ? WHERE id = ?', [trimmedName, id]);

    // Handle physical directory renaming if folders exist
    const originalPath = path.join(process.cwd(), 'uploads', sanitizeFolderName(originalSubject.name));
    const newPath = path.join(process.cwd(), 'uploads', sanitizeFolderName(trimmedName));
    if (fs.existsSync(originalPath)) {
      try {
        await fs.promises.rename(originalPath, newPath);
      } catch (renameErr) {
        console.error('Error renaming physical folder for subject:', renameErr);
      }
    }

    res.json({ success: true, id, name: trimmedName });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Subject name already exists' });
    }
    console.error('Error updates subject:', error);
    res.status(500).json({ error: 'Failed to update subject' });
  }
});

// DELETE /api/admin/subjects/:id
router.delete('/subjects/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const subject = await db.get('SELECT * FROM subjects WHERE id = ?', [id]);
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Get all PDFs linked to this subject to delete them physically first
    const pdfs = await db.all('SELECT file_path FROM pdfs WHERE subject_id = ?', [id]);
    
    // Delete database records (Cascades automatically through foreign keys)
    await db.run('DELETE FROM subjects WHERE id = ?', [id]);

    // Physically delete subject directory if it exists
    const subjectFolder = path.join(process.cwd(), 'uploads', sanitizeFolderName(subject.name));
    if (fs.existsSync(subjectFolder)) {
      try {
        await fs.promises.rm(subjectFolder, { recursive: true, force: true });
      } catch (rmError) {
        console.error('Failed to physically delete subject folder:', rmError);
      }
    }

    res.json({ success: true, message: 'Subject and all child topics/PDFs deleted successfully' });
  } catch (error) {
    console.error('Error deleting subject:', error);
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

/**
 * 4. TOPIC MANAGEMENT
 */

// POST /api/admin/topics
router.post('/topics', requireAdmin, async (req, res) => {
  const { name, subject_id } = req.body;
  if (!name || name.trim() === '' || !subject_id) {
    return res.status(400).json({ error: 'Topic name and Subject ID are required' });
  }

  try {
    const trimmedName = name.trim();
    const result = await db.run('INSERT INTO topics (name, subject_id) VALUES (?, ?)', [trimmedName, subject_id]);
    res.status(201).json({ success: true, id: result.id, name: trimmedName, subject_id });
  } catch (error) {
    console.error('Error adding topic:', error);
    res.status(500).json({ error: 'Failed to add topic' });
  }
});

// PUT /api/admin/topics/:id
router.put('/topics/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Topic name is required' });
  }

  try {
    const trimmedName = name.trim();
    const originalTopic = await db.get('SELECT t.*, s.name as subject_name FROM topics t JOIN subjects s ON t.subject_id = s.id WHERE t.id = ?', [id]);
    if (!originalTopic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    await db.run('UPDATE topics SET name = ? WHERE id = ?', [trimmedName, id]);

    // Handle physical directory renaming
    const originalPath = path.join(process.cwd(), 'uploads', sanitizeFolderName(originalTopic.subject_name), sanitizeFolderName(originalTopic.name));
    const newPath = path.join(process.cwd(), 'uploads', sanitizeFolderName(originalTopic.subject_name), sanitizeFolderName(trimmedName));
    if (fs.existsSync(originalPath)) {
      try {
        await fs.promises.rename(originalPath, newPath);
      } catch (err) {
        console.error('Error renaming physical folder for topic:', err);
      }
    }

    res.json({ success: true, id, name: trimmedName });
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(500).json({ error: 'Failed to update topic' });
  }
});

// DELETE /api/admin/topics/:id
router.delete('/topics/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const topic = await db.get('SELECT t.*, s.name as subject_name FROM topics t JOIN subjects s ON t.subject_id = s.id WHERE t.id = ?', [id]);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Delete db record first (Cascades delete to pdfs matching topic_id)
    await db.run('DELETE FROM topics WHERE id = ?', [id]);

    // Physically delete topic directory
    const topicFolder = path.join(process.cwd(), 'uploads', sanitizeFolderName(topic.subject_name), sanitizeFolderName(topic.name));
    if (fs.existsSync(topicFolder)) {
      try {
        await fs.promises.rm(topicFolder, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to physically remove topic folder:', err);
      }
    }

    res.json({ success: true, message: 'Topic and all contained PDFs deleted successfully' });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

/**
 * 5. PDF MANAGEMENT & SECURE UPLOAD
 */

// POST /api/admin/pdfs
router.post('/pdfs', requireAdmin, upload.single('pdfFile'), async (req, res) => {
  const { subject_id, topic_id, title, type } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'File upload failed. A PDF file is required.' });
  }

  if (!subject_id || !topic_id || !title || !type) {
    // Cleanup temporary file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'All fields (Subject, Topic, Title, Type) are required' });
  }

  if (type !== 'class' && type !== 'practice') {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'PDF Type must be either class or practice' });
  }

  try {
    // 1. Fetch Subject and Topic names from DB to establish the directory structure
    const subject = await db.get('SELECT name FROM subjects WHERE id = ?', [subject_id]);
    const topic = await db.get('SELECT name FROM topics WHERE id = ?', [topic_id]);

    if (!subject || !topic) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid Subject or Topic selected' });
    }

    // 2. Format structure folder paths
    const subjectDir = sanitizeFolderName(subject.name);
    const topicDir = sanitizeFolderName(topic.name);
    const finalDirPath = path.join(process.cwd(), 'uploads', subjectDir, topicDir, type);

    // Ensure physical directories exist
    await fs.promises.mkdir(finalDirPath, { recursive: true });

    // 3. Keep original name, but replace extension with sanitized version to ensure .pdf
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const safeBaseName = req.file.originalname.replace(/[^a-zA-Z0-9_\-\s.]/g, '').trim();
    const finalFileName = fileExt === '.pdf' ? safeBaseName : `${safeBaseName}.pdf`;
    const finalFilePath = path.join(finalDirPath, finalFileName);

    // 4. Move file from temp to final destination
    await fs.promises.rename(req.file.path, finalFilePath);

    // Save relative path for easy serving and relative operations
    const relativePath = path.join('uploads', subjectDir, topicDir, type, finalFileName);

    // 5. Insert PDF in database
    const result = await db.run(
      'INSERT INTO pdfs (subject_id, topic_id, title, type, file_path) VALUES (?, ?, ?, ?, ?)',
      [subject_id, topic_id, title.trim(), type, relativePath]
    );

    res.status(201).json({
      success: true,
      id: result.id,
      title: title.trim(),
      type,
      subject_id,
      topic_id,
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    console.error('Error during secure PDF upload:', error);
    res.status(500).json({ error: 'Failed to complete PDF upload' });
  }
});

// DELETE /api/admin/pdfs/:id
router.delete('/pdfs/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const pdf = await db.get('SELECT * FROM pdfs WHERE id = ?', [id]);
    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    // Delete from DB first
    await db.run('DELETE FROM pdfs WHERE id = ?', [id]);

    // Physically delete file if it exists
    const fullPhysicalPath = path.join(process.cwd(), pdf.file_path);
    if (fs.existsSync(fullPhysicalPath)) {
      try {
        await fs.promises.unlink(fullPhysicalPath);
      } catch (err) {
        console.error('Failed to delete physical file from storage:', err);
      }
    }

    res.json({ success: true, message: 'PDF deleted successfully' });
  } catch (error) {
    console.error('Error deleting PDF:', error);
    res.status(500).json({ error: 'Failed to delete PDF file' });
  }
});

// PUT /api/admin/pdfs/:id (Rename Display Title)
router.put('/pdfs/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'PDF display title is required' });
  }

  try {
    const pdf = await db.get('SELECT * FROM pdfs WHERE id = ?', [id]);
    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    await db.run('UPDATE pdfs SET title = ? WHERE id = ?', [title.trim(), id]);

    res.json({ success: true, id, title: title.trim() });
  } catch (error) {
    console.error('Error renaming PDF display title:', error);
    res.status(500).json({ error: 'Failed to rename PDF display title' });
  }
});

export default router;
