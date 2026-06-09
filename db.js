'use strict';
const { neon } = require('@neondatabase/serverless');
const sql = process.env.PUZ_DATABASE_URL ? neon(process.env.PUZ_DATABASE_URL) : null;

async function initDb() {
    await sql`
        CREATE TABLE IF NOT EXISTS balances (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            balance NUMERIC(10,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `;
    await sql`ALTER TABLE balances ADD COLUMN IF NOT EXISTS stripe_connect_id TEXT`;
    await sql`
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            amount NUMERIC(10,2) NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            payment_intent_id TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS withdrawals (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            amount NUMERIC(10,2) NOT NULL,
            status TEXT DEFAULT 'pending',
            stripe_transfer_id TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `;
}

async function getBalance(email) {
    const rows = await sql`SELECT balance FROM balances WHERE email = ${email}`;
    return rows[0]?.balance || 0;
}

async function addBalance(email, amount, description, paymentIntentId) {
    await sql`
        INSERT INTO balances (email, balance) VALUES (${email}, ${amount})
        ON CONFLICT (email) DO UPDATE SET balance = balances.balance + ${amount}, updated_at = NOW()
    `;
    await sql`
        INSERT INTO transactions (email, amount, type, description, payment_intent_id)
        VALUES (${email}, ${amount}, 'credit', ${description}, ${paymentIntentId})
    `;
}

async function deductBalance(email, amount) {
    await sql`
        UPDATE balances SET balance = balance - ${amount}, updated_at = NOW()
        WHERE email = ${email}
    `;
    await sql`
        INSERT INTO transactions (email, amount, type, description)
        VALUES (${email}, ${amount}, 'debit', 'withdrawal')
    `;
}

async function getLatestPaymentIntent(email) {
    const rows = await sql`
        SELECT payment_intent_id FROM transactions
        WHERE email = ${email} AND payment_intent_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
    `;
    return rows[0]?.payment_intent_id;
}

async function createWithdrawal(email, amount, transferId) {
    await sql`
        INSERT INTO withdrawals (email, amount, status, stripe_transfer_id)
        VALUES (${email}, ${amount}, 'completed', ${transferId})
    `;
}

async function getConnectAccount(email) {
    const rows = await sql`SELECT stripe_connect_id FROM balances WHERE email = ${email}`;
    return rows[0]?.stripe_connect_id;
}

async function saveConnectAccount(email, connectId) {
    await sql`
        UPDATE balances SET stripe_connect_id = ${connectId}, updated_at = NOW()
        WHERE email = ${email}
    `;
}

module.exports = { initDb, getBalance, addBalance, deductBalance, getLatestPaymentIntent, createWithdrawal, getConnectAccount, saveConnectAccount };
