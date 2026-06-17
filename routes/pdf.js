import express from 'express';
import path from 'path';
import fs from 'fs';
import db from '../database.js';

const router = express.Router();

/**
 * 1. STUDENT RESOURCE RETRIEVAL API
 */

// GET /api/subjects - Get all subjects (supports search)
router.get('/subjects', async (req, res) => {
  const { search } = req.query;
  try {
    let query = 'SELECT * FROM subjects';
    let params = [];
    if (search && search.trim() !== '') {
      query += ' WHERE name LIKE ?';
      params.push(`%${search.trim()}%`);
    }
    query += ' ORDER BY name ASC';
    const subjects = await db.all(query, params);
    res.json(subjects);
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ error: 'Failed to retrieve subjects' });
  }
});

// GET /api/topics - Get topics for a specific subject or all topics
router.get('/topics', async (req, res) => {
  const { subject_id, search } = req.query;
  try {
    let query = 'SELECT t.*, s.name as subject_name FROM topics t JOIN subjects s ON t.subject_id = s.id';
    let params = [];
    const conditions = [];

    if (subject_id) {
      conditions.push('t.subject_id = ?');
      params.push(subject_id);
    }
    if (search && search.trim() !== '') {
      conditions.push('t.name LIKE ?');
      params.push(`%${search.trim()}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY t.name ASC';

    const topics = await db.all(query, params);
    res.json(topics);
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: 'Failed to retrieve topics' });
  }
});

// GET /api/pdfs - Get pdfs listing (can filter by topic, search, or type)
router.get('/pdfs', async (req, res) => {
  const { topic_id, search, type } = req.query;
  try {
    let query = `
      SELECT p.id, p.subject_id, p.topic_id, p.title, p.type, p.created_at,
             s.name as subject_name, t.name as topic_name
      FROM pdfs p
      JOIN subjects s ON p.subject_id = s.id
      JOIN topics t ON p.topic_id = t.id
    `;
    let params = [];
    const conditions = [];

    if (topic_id) {
      conditions.push('p.topic_id = ?');
      params.push(topic_id);
    }
    if (type) {
      conditions.push('p.type = ?');
      params.push(type);
    }
    if (search && search.trim() !== '') {
      conditions.push('(p.title LIKE ? OR t.name LIKE ? OR s.name LIKE ?)');
      const wild = `%${search.trim()}%`;
      params.push(wild, wild, wild);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY p.id DESC';

    const pdfs = await db.all(query, params);
    res.json(pdfs);
  } catch (error) {
    console.error('Error fetching PDFs:', error);
    res.status(500).json({ error: 'Failed to retrieve PDFs' });
  }
});

// GET /api/pdfs/metadata/:id - Get dynamic metadata about a specific PDF for viewer initialization
router.get('/pdfs/metadata/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pdf = await db.get(`
      SELECT p.id, p.title, p.type, s.name as subject_name, t.name as topic_name
      FROM pdfs p
      JOIN subjects s ON p.subject_id = s.id
      JOIN topics t ON p.topic_id = t.id
      WHERE p.id = ?
    `, [id]);

    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    res.json(pdf);
  } catch (error) {
    console.error('Error fetching pdf metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 2. SECURE PDF STEAMING ROUTE
 * Reads the actual PDF from the secure local filesystem directory and streams it to the viewer.
 * No direct URLs are exposed to the client. Matches requested viewer architecture.
 */
router.get('/stream/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pdf = await db.get('SELECT file_path, title FROM pdfs WHERE id = ?', [id]);
    if (!pdf) {
      return res.status(404).send('PDF not found');
    }

    const fullFilePath = path.join(process.cwd(), pdf.file_path);

    // Verify if file physically exists
    if (!fs.existsSync(fullFilePath)) {
      console.error(`Physical file not found: ${fullFilePath}`);
      return res.status(404).send('The requested document is temporarily unavailable.');
    }

    // Set client headers to disable caching, download suggestions, and frame bypasses
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline'); // Prevents prompt download dialog
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');

    // Create a read stream and pipe it to standard response stream
    const fileStream = fs.createReadStream(fullFilePath);
    fileStream.on('error', (streamErr) => {
      console.error('Error while streaming manual file:', streamErr);
      if (!res.headersSent) {
        res.status(500).send('Error while loading PDF stream.');
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    console.error('Error handling secure stream API:', error);
    res.status(500).send('An internal secure gateway error occurred.');
  }
});

export default router;
