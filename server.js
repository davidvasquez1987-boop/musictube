const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Conexión a PostgreSQL en la nube usando la variable de entorno de Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Probar conexión y crear la tabla si no existe
pool.connect()
    .then(async client => {
        console.log('✔ ¡Conectado exitosamente a PostgreSQL en la nube!');
        await client.query(`
            CREATE TABLE IF NOT EXISTS videos (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                file_path VARCHAR(500) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✔ Tabla "videos" verificada en la nube.');
        client.release();
    })
    .catch(err => console.error('❌ Error al conectar a la base de datos:', err));

app.use(cors());
app.use(express.json());

// Carpeta temporal de subida
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
    limits: { fileSize: 2000 * 1024 * 1024 } // Límite de 2GB
});

app.use('/uploads', express.static(uploadDir));

// Ruta para subir videos
app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        const { title, description } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'No se adjuntó ningún archivo de video.' });
        }

        const filePath = `/uploads/${req.file.filename}`;
        const originalName = req.file.originalname;

        const query = `
            INSERT INTO videos (title, description, file_path, original_name) 
            VALUES ($1, $2, $3, $4) RETURNING *;
        `;
        const values = [title, description, filePath, originalName];
        
        const nuevoVideo = await pool.query(query, values);

        res.status(201).json({
            message: '¡Video subido con éxito a la nube!',
            video: nuevoVideo.rows[0]
        });

    } catch (error) {
        console.error('Error detallado en el servidor:', error);
        res.status(500).json({ error: 'Error interno en el servidor: ' + error.message });
    }
});

// Ruta para listar videos
app.get('/api/videos', async (req, res) => {
    try {
        const todos = await pool.query('SELECT * FROM videos ORDER BY created_at DESC');
        res.json(todos.rows);
    } catch (error) {
        console.error('Error al obtener videos:', error);
        res.status(500).json({ error: 'Error al obtener los videos.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
