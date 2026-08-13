const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Database storage setup
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'takoot.db');
let sqlite3 = null;
let db = null;

try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.warn('[DB] sqlite3 module not available, using JSON file database fallback.');
}

// Security: Password Hashing using Node.js built-in crypto (scrypt)
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, storedSalt, storedHash) {
  const hash = crypto.scryptSync(password, storedSalt, 64).toString('hex');
  return hash === storedHash;
}

// Single-Pack Fallback Store if SQLite native module is not compiled
const JSON_DB_FILE = path.join(DATA_DIR, 'takoot_db.json');

class JsonDatabaseStore {
  constructor() {
    this.filePath = JSON_DB_FILE;
    this.data = { users: [], quizzes: [], userSeq: 1, quizSeq: 1 };
    this.load();
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.error('[DB] Failed to parse json db file, reinitializing', err);
      }
    } else {
      this.save();
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  findUserByUsername(username) {
    return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  findUserById(id) {
    return this.data.users.find(u => u.id === id);
  }

  createUser(username, passwordHash, salt, role = 'teacher') {
    const newUser = {
      id: this.data.userSeq++,
      username,
      password_hash: passwordHash,
      salt,
      role,
      created_at: new Date().toISOString()
    };
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  saveQuiz(title, description, xmlContent, questionCount, createdBy) {
    const newQuiz = {
      id: this.data.quizSeq++,
      title,
      description: description || '',
      xml_content: xmlContent,
      question_count: questionCount || 0,
      created_by: createdBy || 1,
      created_at: new Date().toISOString()
    };
    this.data.quizzes.push(newQuiz);
    this.save();
    return newQuiz;
  }

  getAllQuizzes() {
    return this.data.quizzes.map(q => ({
      id: q.id,
      title: q.title,
      description: q.description,
      question_count: q.question_count,
      created_by: q.created_by,
      created_at: q.created_at
    }));
  }

  getQuizById(id) {
    return this.data.quizzes.find(q => q.id === Number(id));
  }

  deleteQuiz(id) {
    const initialLen = this.data.quizzes.length;
    this.data.quizzes = this.data.quizzes.filter(q => q.id !== Number(id));
    this.save();
    return this.data.quizzes.length < initialLen;
  }
}

let jsonStore = null;

// Initialize Database (SQLite with automatic JSON store fallback)
function initDatabase() {
  return new Promise((resolve, reject) => {
    if (!sqlite3) {
      jsonStore = new JsonDatabaseStore();
      seedDefaultAdmin();
      console.log('[DB] Single-pack JSON storage initialized successfully.');
      return resolve();
    }

    db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) {
        console.warn('[DB] SQLite connection failed, falling back to JSON storage:', err.message);
        jsonStore = new JsonDatabaseStore();
        seedDefaultAdmin();
        return resolve();
      }

      db.serialize(() => {
        // Create Users table
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT DEFAULT 'teacher',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create Quizzes table
        db.run(`
          CREATE TABLE IF NOT EXISTS quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            xml_content TEXT NOT NULL,
            question_count INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users (id)
          )
        `, (err) => {
          if (err) {
            console.error('[DB] Error creating tables:', err.message);
            return reject(err);
          }
          seedDefaultAdmin();
          console.log('[DB] SQLite database initialized successfully at:', DB_FILE);
          resolve();
        });
      });
    });
  });
}

// Seed default admin account & default quiz library if empty
async function seedDefaultAdmin() {
  const existingAdmin = await getUserByUsername('admin');
  if (!existingAdmin) {
    const { salt, hash } = hashPassword('admin123');
    await createUser('admin', hash, salt, 'admin');
    console.log('[DB] Default admin account seeded: Username="admin", Password="admin123"');
  }
  await seedDefaultQuizzes();
}

async function seedDefaultQuizzes() {
  try {
    const quizzes = await getAllQuizzes();
    if (!quizzes || quizzes.length === 0) {
      const certiportPath = path.join(__dirname, 'public', 'certiport_db_quiz.xml');
      if (fs.existsSync(certiportPath)) {
        const xml = fs.readFileSync(certiportPath, 'utf8');
        await saveQuiz({
          title: 'Certiport Database & SQL Server Fundamentals',
          description: '30 practice questions covering Relational DBs, SQL DDL/DML, Constraints & Joins',
          xmlContent: xml,
          questionCount: 30,
          createdBy: 1
        });
        console.log('[DB] Seeded Certiport Database & SQL Server quiz (30 questions)');
      }
    }
  } catch (e) {
    console.warn('[DB] Could not seed default quiz:', e.message);
  }
}

// API methods
function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    if (jsonStore) {
      return resolve(jsonStore.findUserByUsername(username));
    }
    db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    if (jsonStore) {
      return resolve(jsonStore.findUserById(id));
    }
    db.get('SELECT id, username, role, created_at FROM users WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function createUser(username, passwordHash, salt, role = 'teacher') {
  return new Promise((resolve, reject) => {
    if (jsonStore) {
      return resolve(jsonStore.createUser(username, passwordHash, salt, role));
    }
    db.run(
      'INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)',
      [username, passwordHash, salt, role],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, username, role });
      }
    );
  });
}

function saveQuiz({ title, description, xmlContent, questionCount, createdBy }) {
  return new Promise((resolve, reject) => {
    if (jsonStore) {
      return resolve(jsonStore.saveQuiz(title, description, xmlContent, questionCount, createdBy));
    }
    db.run(
      'INSERT INTO quizzes (title, description, xml_content, question_count, created_by) VALUES (?, ?, ?, ?, ?)',
      [title, description || '', xmlContent, questionCount || 0, createdBy || 1],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, title, description, question_count: questionCount, created_by: createdBy });
      }
    );
  });
}

function getAllQuizzes() {
  return new Promise((resolve, reject) => {
    if (jsonStore) {
      return resolve(jsonStore.getAllQuizzes());
    }
    db.all(
      `SELECT q.id, q.title, q.description, q.question_count, q.created_by, q.created_at, u.username as author 
       FROM quizzes q 
       LEFT JOIN users u ON q.created_by = u.id 
       ORDER BY q.id DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function getQuizById(id) {
  return new Promise((resolve, reject) => {
    if (jsonStore) {
      return resolve(jsonStore.getQuizById(id));
    }
    db.get('SELECT * FROM quizzes WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function deleteQuiz(id) {
  return new Promise((resolve, reject) => {
    if (jsonStore) {
      return resolve(jsonStore.deleteQuiz(id));
    }
    db.run('DELETE FROM quizzes WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
}

module.exports = {
  initDatabase,
  hashPassword,
  verifyPassword,
  getUserByUsername,
  getUserById,
  createUser,
  saveQuiz,
  getAllQuizzes,
  getQuizById,
  deleteQuiz
};
