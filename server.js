const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool, Client } = require('pg');

const app = express();
const PORT = 5000;

// ==========================================
// ESCRIBE AQUÍ ABAJO TU CONTRASEÑA DE POSTGRESQL ENTRE LAS COMILLAS
const MI_PASSWORD = 'tu_contraseña'; 
// ==========================================

async function arrancarSistema() {
    // 1. Crear la base de datos automáticamente si no existe
    const clientTemp = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'postgres',
        password: MI_PASSWORD,
        port: 5432,
    });

    try {
        await clientTemp.connect();
        const check = await clientTemp.query("SELECT 1 FROM pg_database WHERE datname = 'musictube_db'");
        if (check.rows.length === 0) {
            await clientTemp.query('CREATE DATABASE musictube_db;');
            console.log('✔ Base de datos creada automáticamente.');
        }
        await clientTemp.end();
    } catch (err) {
        console.log('Error al conectar con Postgres. Revisa tu contraseña en el archivo server.js');
    }

    // 2. Conectar a la base de datos y crear las tablas automáticamente
    const pool = new Pool({
        user: 'postgres',
        host: 'localhost',
        database: 'musictube_db',
        password: MI_PASSWORD,
        port: 5432,
    });

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS videos (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                file_path VARCHAR(500) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✔ Tablas listas y verificadas.');
    } catch (err) {
        console.error('Error al crear tablas:', err);
    }

    // 3. Configurar el servidor web
    app.use(cors());
    app.use(express.json());

    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
    }

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'uploads/'),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });

    const upload = multer({ 
        storage: storage,
        limits: { fileSize: 2000 * 1024 * 1024 } 
    });

    app.use('/uploads', express.static(uploadDir));

    // Ruta para recibir videos
    app.post('/api/upload', upload.single('video'), async (req, res) => {
        try {
            const { title, description } = req.body;
            if (!req.file) return res.status(400).json({ error: 'No se adjuntó ningún video.' });

            const filePath = `/uploads/${req.file.filename}`;
            const originalName = req.file.originalname;

            const query = `INSERT INTO videos (title, description, file_path, original_name) VALUES ($1, $2, $3, $4) RETURNING *;`;
            const nuevoVideo = await pool.query(query, [title, description, filePath, originalName]);

            res.status(201).json({ message: '¡Video subido con éxito!', video: nuevoVideo.rows[0] });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error en el servidor.' });
        }
    });

    // Ruta para listar los videos
    app.get('/api/videos', async (req, res) => {
        try {
            const todos = await pool.query('SELECT * FROM videos ORDER BY created_at DESC');
            res.json(todos.rows);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener videos.' });
        }
    });

    app.listen(PORT, () => {
        console.log(`🚀 ¡Servidor funcionando en http://localhost:${PORT}`);
    });
}

arrancarSistema();