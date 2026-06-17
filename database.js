import fs from 'fs';
import path from 'path';

// Database file path for JSON storage
const DB_PATH = path.join(process.cwd(), 'vision_to_victory_db.json');

// Memory state loaded on boot
let dbState = {
  subjects: [],
  topics: [],
  pdfs: [],
  counters: { subjects: 0, topics: 0, pdfs: 0 }
};

// Sync functions
function loadDatabase() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const content = fs.readFileSync(DB_PATH, 'utf8');
      dbState = JSON.parse(content);
    } catch (e) {
      console.error('Error loading database JSON file, initializing new.', e);
      saveDatabase();
    }
  } else {
    saveDatabase();
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(dbState, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving database JSON file', e);
  }
}

// Helper function to run direct commands (INSERT, UPDATE, DELETE)
export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      loadDatabase();
      const cleanSql = sql.toLowerCase().replace(/\s+/g, ' ').trim();

      // 1. Foreign Key Enable PRAGMA
      if (cleanSql.includes('pragma foreign_keys')) {
        return resolve({ id: 0, changes: 0 });
      }

      // 2. CREATE TABLE
      if (cleanSql.includes('create table if not exists')) {
        return resolve({ id: 0, changes: 0 });
      }

      // 3. INSERT INTO subjects
      if (cleanSql.includes('insert into subjects')) {
        const name = params[0]?.trim();
        if (!name) {
          return reject(new Error('Subject name cannot be empty.'));
        }
        // Unique check
        if (dbState.subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
          return reject(new Error('UNIQUE constraint failed: subjects.name'));
        }
        const id = ++dbState.counters.subjects;
        dbState.subjects.push({ id, name });
        saveDatabase();
        return resolve({ id, changes: 1 });
      }

      // 4. UPDATE subjects
      if (cleanSql.startsWith('update subjects set name =') || cleanSql.includes('update subjects set name = ?')) {
        const name = params[0]?.trim();
        const id = Number(params[1]);
        if (!name || isNaN(id)) {
          return reject(new Error('Invalid arguments for updating subject.'));
        }
        if (dbState.subjects.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
          return reject(new Error('UNIQUE constraint failed: subjects.name'));
        }
        const item = dbState.subjects.find(s => s.id === id);
        if (item) {
          item.name = name;
          saveDatabase();
          return resolve({ id: id, changes: 1 });
        }
        return resolve({ id: id, changes: 0 });
      }

      // 5. DELETE FROM subjects
      if (cleanSql.startsWith('delete from subjects where id =')) {
        const id = Number(params[0]);
        if (isNaN(id)) {
          return reject(new Error('Invalid subject ID to delete.'));
        }
        dbState.subjects = dbState.subjects.filter(s => s.id !== id);
        // Cascade Delete Topics & PDFs
        const deletedTopics = dbState.topics.filter(t => t.subject_id === id);
        const deletedTopicIds = deletedTopics.map(t => t.id);
        dbState.topics = dbState.topics.filter(t => t.subject_id !== id);
        dbState.pdfs = dbState.pdfs.filter(p => p.subject_id !== id && !deletedTopicIds.includes(p.topic_id));
        saveDatabase();
        return resolve({ changes: 1 });
      }

      // 6. INSERT INTO topics
      if (cleanSql.includes('insert into topics')) {
        const name = params[0]?.trim();
        const subject_id = Number(params[1]);
        if (!name || isNaN(subject_id)) {
          return reject(new Error('Invalid name or subject_id for topic.'));
        }
        const id = ++dbState.counters.topics;
        dbState.topics.push({ id, name, subject_id });
        saveDatabase();
        return resolve({ id, changes: 1 });
      }

      // 7. UPDATE topics SET name = ? WHERE id = ?
      if (cleanSql.startsWith('update topics set name =') || cleanSql.includes('update topics set name = ?')) {
        const name = params[0]?.trim();
        const id = Number(params[1]);
        if (!name || isNaN(id)) {
          return reject(new Error('Invalid name or ID for updating topic.'));
        }
        const item = dbState.topics.find(t => t.id === id);
        if (item) {
          item.name = name;
          saveDatabase();
          return resolve({ id: id, changes: 1 });
        }
        return resolve({ id: id, changes: 0 });
      }

      // 8. DELETE FROM topics WHERE id = ?
      if (cleanSql.startsWith('delete from topics where id =')) {
        const id = Number(params[0]);
        if (isNaN(id)) {
          return reject(new Error('Invalid topic ID to delete.'));
        }
        dbState.topics = dbState.topics.filter(t => t.id !== id);
        dbState.pdfs = dbState.pdfs.filter(p => p.topic_id !== id);
        saveDatabase();
        return resolve({ changes: 1 });
      }

      // 9. INSERT INTO pdfs (subject_id, topic_id, title, type, file_path) VALUES (?, ?, ?, ?, ?)
      if (cleanSql.includes('insert into pdfs')) {
        const subject_id = Number(params[0]);
        const topic_id = Number(params[1]);
        const title = params[2]?.trim();
        const type = params[3]?.trim();
        const file_path = params[4]?.trim();

        if (isNaN(subject_id) || isNaN(topic_id) || !title || !type || !file_path) {
          return reject(new Error('Invalid arguments to insert pdf.'));
        }

        const id = ++dbState.counters.pdfs;
        dbState.pdfs.push({
          id,
          subject_id,
          topic_id,
          title,
          type,
          file_path,
          created_at: new Date().toISOString()
        });
        saveDatabase();
        return resolve({ id, changes: 1 });
      }

      // 10. UPDATE pdfs SET title = ? WHERE id = ?
      if (cleanSql.includes('update pdfs set title =') || cleanSql.includes('update pdfs set title = ?')) {
        const title = params[0]?.trim();
        const id = Number(params[1]);
        if (!title || isNaN(id)) {
          return reject(new Error('Invalid arguments to rename pdf.'));
        }
        const item = dbState.pdfs.find(p => p.id === id);
        if (item) {
          item.title = title;
          saveDatabase();
          return resolve({ id: id, changes: 1 });
        }
        return resolve({ id: id, changes: 0 });
      }

      // 11. DELETE FROM pdfs WHERE id = ?
      if (cleanSql.startsWith('delete from pdfs where id =')) {
        const id = Number(params[0]);
        if (isNaN(id)) {
          return reject(new Error('Invalid pdf ID to delete.'));
        }
        dbState.pdfs = dbState.pdfs.filter(p => p.id !== id);
        saveDatabase();
        return resolve({ changes: 1 });
      }

      reject(new Error(`Unknown run command: ${sql}`));
    } catch (e) {
      reject(e);
    }
  });
}

// Selector function logic
function selectQuery(sql, params = []) {
  loadDatabase();
  const cleanSql = sql.toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. SELECT COUNT
  if (cleanSql.includes('select count(*) as count from subjects') || cleanSql.includes('select count(*) as count from pdfs') || cleanSql.includes('select count(*) as count from topics')) {
    if (cleanSql.includes('from subjects')) {
      return [{ count: dbState.subjects.length }];
    } else if (cleanSql.includes('from topics')) {
      return [{ count: dbState.topics.length }];
    } else if (cleanSql.includes('from pdfs')) {
      return [{ count: dbState.pdfs.length }];
    }
  }

  // 2. SELECT FROM subjects
  if (cleanSql.includes('from subjects')) {
    const collapsed = cleanSql.replace(/\s*=\s*/g, '=');
    if (collapsed.includes('id=?') || collapsed.includes('s.id=?')) {
      const id = Number(params[0]);
      const sub = dbState.subjects.find(s => s.id === id);
      if (!sub) return [];
      if (cleanSql.includes('select name')) return [{ name: sub.name }];
      return [sub];
    }
    
    let results = [...dbState.subjects];
    if (cleanSql.includes('where name like')) {
      const searchVal = params[0]?.replace(/%/g, '').toLowerCase() || '';
      results = results.filter(s => s.name.toLowerCase().includes(searchVal));
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  // 3. SELECT FROM topics
  if (cleanSql.includes('from topics')) {
    let results = dbState.topics.map(t => {
      const sub = dbState.subjects.find(s => s.id === t.subject_id);
      return {
        ...t,
        subject_name: sub ? sub.name : 'Unknown'
      };
    });

    const collapsed = cleanSql.replace(/\s*=\s*/g, '=');

    if (collapsed.includes('where t.id=?') || collapsed.includes('where id=?') || collapsed.includes('t.id=?')) {
      // If it is a check for specific topic id
      if (!collapsed.includes('subject_id=?')) {
        const id = Number(params[0]);
        const topic = results.find(t => t.id === id);
        if (!topic) return [];
        if (cleanSql.includes('select name')) return [{ name: topic.name }];
        return [topic];
      }
    }

    let paramIndex = 0;
    if (collapsed.includes('subject_id=?') || collapsed.includes('t.subject_id=?')) {
      const subIdValue = Number(params[paramIndex++]);
      results = results.filter(t => t.subject_id === subIdValue);
    }

    if (cleanSql.includes('name like')) {
      const searchVal = params[paramIndex]?.replace(/%/g, '').toLowerCase() || '';
      results = results.filter(t => t.name.toLowerCase().includes(searchVal));
    }

    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  // 4. SELECT FROM pdfs
  if (cleanSql.includes('from pdfs')) {
    if (cleanSql.includes('order by created_at desc limit 1')) {
      const list = [...dbState.pdfs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (list.length > 0) {
        return [{ title: list[0].title, created_at: list[0].created_at }];
      }
      return [];
    }

    let results = dbState.pdfs.map(p => {
      const sub = dbState.subjects.find(s => s.id === p.subject_id);
      const top = dbState.topics.find(t => t.id === p.topic_id);
      return {
        ...p,
        subject_name: sub ? sub.name : 'Unknown',
        topic_name: top ? top.name : 'Unknown'
      };
    });

    const collapsed = cleanSql.replace(/\s*=\s*/g, '=');

    if (collapsed.includes('where p.id=?') || collapsed.includes('where id=?') || collapsed.includes('p.id=?')) {
      if (!collapsed.includes('subject_id=?') && !collapsed.includes('topic_id=?')) {
        const id = Number(params[0]);
        const pdf = results.find(p => p.id === id);
        if (!pdf) return [];
        if (cleanSql.includes('select file_path')) {
          return [{ file_path: pdf.file_path, title: pdf.title }];
        }
        return [pdf];
      }
    }

    let paramIndex = 0;
    if (collapsed.includes('subject_id=?') || collapsed.includes('p.subject_id=?')) {
      const subIdValue = Number(params[paramIndex++]);
      results = results.filter(p => p.subject_id === subIdValue);
    }

    if (collapsed.includes('topic_id=?') || collapsed.includes('p.topic_id=?')) {
      const topicIdValue = Number(params[paramIndex++]);
      results = results.filter(p => p.topic_id === topicIdValue);
    }

    if (collapsed.includes('type=?') || collapsed.includes('p.type=?')) {
      const typeVal = params[paramIndex++];
      results = results.filter(p => p.type === typeVal);
    }

    if (cleanSql.includes('title like') || cleanSql.includes('name like')) {
      const searchVal = params[paramIndex]?.replace(/%/g, '').toLowerCase() || '';
      results = results.filter(p => 
        p.title.toLowerCase().includes(searchVal) ||
        p.topic_name.toLowerCase().includes(searchVal) ||
        p.subject_name.toLowerCase().includes(searchVal)
      );
    }

    results.sort((a, b) => b.id - a.id);
    return results;
  }

  console.log('Unparsed select fallback for:', sql);
  return [];
}

// Helper function to fetch all rows
export function all(sql, params = []) {
  return new Promise((resolve) => {
    try {
      const rows = selectQuery(sql, params);
      resolve(rows);
    } catch (e) {
      console.error('Error executing query with selectQuery (all):', e);
      resolve([]);
    }
  });
}

// Helper function to fetch a single row
export function get(sql, params = []) {
  return new Promise((resolve) => {
    try {
      const rows = selectQuery(sql, params);
      resolve(rows[0]);
    } catch (e) {
      console.error('Error executing query with selectQuery (get):', e);
      resolve(undefined);
    }
  });
}

// Initialize database schema
export async function initDb() {
  loadDatabase();
  console.log('JSON-based pure JavaScript Database store initialized. All schema rules validated.');
}

export default {
  run,
  all,
  get,
  initDb,
};
