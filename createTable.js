const pool = require('./db.js');
const fs = require('fs');
const path = require('path');

const createTable = async () => {
  try {
    // Primero verificar la conexión
    const testConnection = await pool.query('SELECT NOW()');
    console.log('Database connection successful');

    // Leer y ejecutar el archivo SQL
    const sqlFile = fs.readFileSync(path.join(__dirname, 'init-db.sql'), 'utf8');
    console.log('SQL File content:', sqlFile); // Debug
    
    // Ejecutar el SQL en un bloque try separado
    try {
      await pool.query(sqlFile);
      console.log('SQL executed successfully');
    } catch (sqlError) {
      console.error('Error executing SQL:', sqlError.message);
      throw sqlError;
    }

    // Verificar que la tabla se creó
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('Table transactions exists and is ready');
    } else {
      throw new Error('Table was not created successfully');
    }

  } catch (error) {
    console.error('Database setup failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Ejecutar y manejar errores
createTable()
  .then(() => {
    console.log('Database setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to setup database:', error);
    process.exit(1);
  });
