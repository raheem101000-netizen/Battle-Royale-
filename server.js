'use strict';
require('dotenv').config();
process.chdir(__dirname);
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server: IOServer } = require('socket.io');
const puz = require('./puz-server');

const app = express();
const server = http.createServer(app);
const io = new IOServer(server);

const roomServer = require('./room-server');
roomServer.setupRoomEvents(io);

const homePath = path.join(__dirname, 'web/home.html');
console.log('home.html exists:', fs.existsSync(homePath), homePath);

app.get('/', (req, res) => {
    console.log('GET /');
    res.sendFile(homePath);
});
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'web/index.html')));
app.get('/puz', (req, res) => res.sendFile(path.join(__dirname, 'web/index.html')));
app.get('/rooms', (req, res) => res.sendFile(path.join(__dirname, 'web/rooms.html')));
app.use(express.static(path.join(__dirname, 'web')));

io.on('connection', (socket) => {
    socket.on('puz:join', ({roomId, name, color}) => {
        let room = puz.puzRooms[roomId];
        if(!room) room = puz.createPuzRoom(roomId);
        socket.join(roomId);
        puz.addHumanPlayer(room, socket.id, name, color);
        const humans = Object.values(room.players).filter(p=>!p.isBot);
        const hostId = humans[0].id;
        io.to(roomId).emit('puz:lobby', {players:humans.map(p=>({id:p.id,name:p.name,color:p.color})), hostId});
    });
    socket.on('puz:start', ({roomId}) => {
        const room = puz.puzRooms[roomId];
        if(!room || room.active) return;
        const humans = Object.values(room.players).filter(p=>!p.isBot).length;
        const botsNeeded = 0;
        puz.startPuzRoom(room, io);
        io.to(roomId).emit('puz:started', {walls:room.walls});
    });
    socket.on('puz:input', ({roomId, input}) => {
        const room = puz.puzRooms[roomId];
        if(!room || !room.players[socket.id]) return;
        room.players[socket.id].input = input;
    });
    socket.on('puz:reload', ({roomId}) => {
        const room = puz.puzRooms[roomId];
        if(!room || !room.players[socket.id]) return;
        const p = room.players[socket.id];
        if(!p.reloading && p.ammo < p.maxAmmo){p.reloading=true;p.reloadTimer=90;}
    });
    socket.on('puz:position', (data) => {
        socket.to(data.roomId).emit('puz:position', data);
    });
    socket.on('disconnect', () => {
        Object.values(puz.puzRooms).forEach(room => {
            if(room.players[socket.id]) {
                room.players[socket.id].alive = false;
                room.aliveCount--;
                delete room.players[socket.id];
            }
        });
    });
});

// ── Stripe & Payments ────────────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const db = require('./db');
const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (process.env.PUZ_DATABASE_URL) db.initDb().catch(console.error);

const paidPlayers = {};

// Webhook — must be before express.json()
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const email = session.customer_details?.email;
        const paymentIntentId = session.payment_intent;
        const roomId = session.metadata?.roomId;
        const playerName = session.metadata?.playerName;
        if (email && paymentIntentId) {
            await db.addBalance(email, 0, 'entry_fee_paid', paymentIntentId);
            if (roomId) {
                if (!paidPlayers[roomId]) paidPlayers[roomId] = [];
                paidPlayers[roomId].push({ email, playerName });
            }
        }
    }
    res.json({ received: true });
});

app.use(express.json());

// Multiplayer checkout — $2
app.post('/create-multiplayer-checkout', async (req, res) => {
    console.log('Checkout requested:', req.body);
    if(!stripe) {
        console.log('Stripe not configured');
        return res.status(503).json({ error: 'Payments not configured' });
    }
    try {
        const { roomId, playerName } = req.body;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Puz Royale Entry',
                        description: `Room: ${roomId}`,
                    },
                    unit_amount: 200,
                },
                quantity: 1,
            }],
            mode: 'payment',
            metadata: { roomId: roomId || '', playerName: playerName || '' },
            success_url: `${process.env.BASE_URL}/play?mode=multiplayer&room=${encodeURIComponent(roomId || '')}&paid=true`,
            cancel_url: `${process.env.BASE_URL}/`,
        });
        console.log('Checkout session created:', session.url);
        res.json({ url: session.url });
    } catch(err) {
        console.error('Stripe error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Check balance
app.get('/balance', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const balance = await db.getBalance(email);
    res.json({ balance });
});

async function payoutWinner(email, amount, description) {
    try {
        let connectId = await db.getConnectAccount(email);
        if (!connectId) {
            const account = await stripe.accounts.create({
                type: 'express',
                email,
                capabilities: { transfers: { requested: true } },
            });
            connectId = account.id;
            await db.addBalance(email, 0, 'account_created', null);
            await db.saveConnectAccount(email, connectId);
            const accountLink = await stripe.accountLinks.create({
                account: connectId,
                refresh_url: `${process.env.BASE_URL}/wallet`,
                return_url: `${process.env.BASE_URL}/wallet?onboarded=true`,
                type: 'account_onboarding',
            });
            if (resend) await resend.emails.send({
                from: `Puz Royale <${process.env.FROM_EMAIL}>`,
                to: email,
                subject: `You won $${amount}! Set up your payout account`,
                html: `
                    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;">
                        <h2 style="color:#FF3232;">🎉 You won $${amount}!</h2>
                        <p>Set up your payout account to receive your winnings. Takes 2-3 minutes, only needed once.</p>
                        <a href="${accountLink.url}" style="display:inline-block;background:#FF3232;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Set Up Payout →</a>
                        <p style="color:#999;font-size:12px;">Future winnings paid automatically to your card or bank.</p>
                    </div>
                `
            });
            await db.addBalance(email, amount, description, null);
            return { status: 'onboarding_required' };
        }
        const account = await stripe.accounts.retrieve(connectId);
        if (!account.charges_enabled) {
            const accountLink = await stripe.accountLinks.create({
                account: connectId,
                refresh_url: `${process.env.BASE_URL}/wallet`,
                return_url: `${process.env.BASE_URL}/wallet?onboarded=true`,
                type: 'account_onboarding',
            });
            if (resend) await resend.emails.send({
                from: `Puz Royale <${process.env.FROM_EMAIL}>`,
                to: email,
                subject: `Complete setup to receive $${amount}`,
                html: `
                    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;">
                        <h2 style="color:#FF3232;">💰 $${amount} is waiting</h2>
                        <a href="${accountLink.url}" style="display:inline-block;background:#FF3232;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Complete Setup →</a>
                    </div>
                `
            });
            await db.addBalance(email, amount, description, null);
            return { status: 'onboarding_incomplete' };
        }
        const transfer = await stripe.transfers.create({
            amount: Math.floor(amount * 100),
            currency: 'usd',
            destination: connectId,
            description,
        });
        await db.addBalance(email, amount, description, null);
        await db.deductBalance(email, amount);
        await db.createWithdrawal(email, amount, transfer.id);
        return { status: 'paid', transfer_id: transfer.id };
    } catch (err) {
        console.error('Payout error:', err);
        await db.addBalance(email, amount, description + '_fallback', null);
        throw err;
    }
}

// Game ended — pay winner
app.post('/game-ended', async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });
    try {
        const { roomId, winnerName } = req.body;
        const secret = req.headers['x-internal-secret'];
        if (secret !== process.env.INTERNAL_SECRET) return res.status(401).json({ error: 'Unauthorized' });
        const players = paidPlayers[roomId] || [];
        const prizes = { 3: 5, 4: 7, 5: 9, 6: 10, 7: 12, 8: 14 };
        const prize = prizes[players.length] || 5;
        const winner = players.find(p => p.playerName === winnerName);
        if (winner) await payoutWinner(winner.email, prize, `puz_royale_win_${roomId}`);
        delete paidPlayers[roomId];
        res.json({ success: true, winner: winner?.email, prize });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Wallet page
app.get('/wallet', (req, res) => res.sendFile(path.join(__dirname, 'web/wallet.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Puz Royale listening on port ' + PORT));
