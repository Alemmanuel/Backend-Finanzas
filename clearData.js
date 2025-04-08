const pool = require('./db.js');

const clearData = async () => {
    try {
        // Usar TRUNCATE para mantener la estructura de la tabla pero eliminar todos los datos
        await pool.query('TRUNCATE TABLE transactions RESTART IDENTITY');
        console.log('✅ Todos los datos han sido eliminados exitosamente.');
        console.log('ℹ️ La estructura de la tabla se ha mantenido intacta.');
    } catch (error) {
        console.error('❌ Error al limpiar los datos:', error.message);
    } finally {
        try {
            await pool.end();
            console.log('🔌 Conexión a la base de datos cerrada.');
        } catch (err) {
            console.error('Error al cerrar la conexión:', err.message);
        }
    }
};

// Ejecutar la limpieza
clearData().then(() => {
    console.log('🏁 Proceso de limpieza completado.');
}).catch(err => {
    console.error('❌ Error en el proceso:', err);
    process.exit(1);
});
