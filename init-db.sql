DROP TABLE IF EXISTS transactions;

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) CHECK (type IN ('income', 'expense')),
    amount DECIMAL(12,2) NOT NULL,
    description TEXT NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
