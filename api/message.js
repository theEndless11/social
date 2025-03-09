const pool = require('../utils/db'); // Importing MySQL connection pool
const { publishToAbly } = require('../utils/ably');

// Set CORS headers
const setCorsHeaders = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Serverless API handler for chat messages
module.exports = async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        console.log(`[${req.method}] Request received at: ${new Date().toISOString()}`);

        // 🔹 Handle GET request to fetch messages and their seen status
        if (req.method === 'GET') {
            const { username, chatWith } = req.query;

            if (!username || !chatWith) {
                console.error('❌ Missing query parameters: username or chatWith');
                return res.status(400).json({ error: 'Missing required query parameters: username or chatWith' });
            }

            const usernameLower = username.toLowerCase();
            const chatWithLower = chatWith.toLowerCase();

            console.log(`📩 Fetching messages for: ${usernameLower} ↔️ ${chatWithLower}`);

            const sql = `
                SELECT id, username, chatwith, message, photo, timestamp, seen
                FROM messages
                WHERE (username = ? AND chatwith = ?) OR (username = ? AND chatwith = ?)
                ORDER BY timestamp
            `;

            try {
                const [messages] = await pool.execute(sql, [usernameLower, chatWithLower, chatWithLower, usernameLower]);

                if (messages.length > 0) {
                    console.log(`✅ Fetched ${messages.length} messages`);

                    const formattedMessages = messages.map(msg => ({
                        id: msg.id,
                        username: msg.username,
                        chatWith: msg.chatwith,
                        message: msg.message,
                        photo: msg.photo,
                        timestamp: msg.timestamp,
                        seen: msg.seen,
                        side: msg.username === usernameLower ? 'user' : 'other',
                    }));

                    return res.status(200).json({ messages: formattedMessages });
                } else {
                    console.log('⚠️ No messages found for this chat');
                    return res.status(404).json({ error: 'No messages found for this chat' });
                }
            } catch (error) {
                console.error('❌ Error fetching messages:', error);
                return res.status(500).json({ error: 'Database error while fetching messages' });
            }
        }

        // 🔹 Handle PATCH request to update the 'seen' status
        if (req.method === 'PATCH' && req.query.action === 'messageSeen') {
            const { messageId, seenBy } = req.body;

            if (!messageId || !seenBy) {
                console.error('❌ Missing required fields: messageId or seenBy');
                return res.status(400).json({ error: 'Missing required fields: messageId or seenBy' });
            }

            const messageIdNum = parseInt(messageId, 10);
            if (isNaN(messageIdNum)) {
                return res.status(400).json({ error: 'Invalid messageId' });
            }

            const sql = `
                UPDATE messages
                SET seen = TRUE
                WHERE id = ? AND chatwith = ?
            `;

            try {
                const [result] = await pool.execute(sql, [messageIdNum, seenBy]);

                if (result.affectedRows > 0) {
                    console.log(`✅ Message ID ${messageIdNum} marked as seen by ${seenBy}`);
                    return res.status(200).json({ message: 'Message seen acknowledgment saved successfully' });
                } else {
                    console.error('❌ Failed to update message seen status');
                    return res.status(404).json({ error: 'Message not found or not updated' });
                }
            } catch (error) {
                console.error('❌ Error updating seen status:', error);
                return res.status(500).json({ error: 'Database error while updating seen status' });
            }
        }

        // 🔹 Handle POST request to send a message
        if (req.method === 'POST') {
            const { username, chatWith, message, photo } = req.body;

            console.log(`📩 POST request received: ${username} → ${chatWith}, Message: "${message}"`);

            if (!username || !chatWith || (!message && !photo)) {
                console.error('❌ Missing fields in POST request');
                return res.status(400).json({ error: 'Missing required fields: username, chatWith, message/photo' });
            }

            const usernameLower = username.toLowerCase();
            const chatWithLower = chatWith.toLowerCase();
            let photoPath = null;

            if (photo && photo.startsWith('data:image')) {
                photoPath = photo;
            }

            const sql = `
                INSERT INTO messages (username, chatwith, message, photo, timestamp, seen) 
                VALUES (?, ?, ?, ?, NOW(), FALSE)
            `;

            try {
                const [result] = await pool.execute(sql, [usernameLower, chatWithLower, message || '', photoPath || null]);

                if (result.affectedRows > 0) {
                    console.log('✅ Message inserted successfully');

                    const messageData = {
                        username: usernameLower,
                        chatWith: chatWithLower,
                        message,
                        photo: photoPath
                    };

                    try {
                        console.log('📡 Publishing to Ably:', messageData);
                        await publishToAbly(`chat-${chatWithLower}-${usernameLower}`, 'newMessage', messageData);
                        console.log('✅ Message published to Ably');
                    } catch (error) {
                        console.error('❌ Error publishing to Ably:', error);
                        return res.status(500).json({ error: 'Failed to publish message to Ably' });
                    }

                    return res.status(201).json({ message: 'Message sent successfully' });
                } else {
                    console.error('❌ Message insertion failed');
                    return res.status(500).json({ error: 'Failed to insert message into the database' });
                }
            } catch (error) {
                console.error('❌ Error inserting message:', error);
                return res.status(500).json({ error: 'Database error while inserting message' });
            }
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error('❌ Unexpected error:', error);
        return res.status(500).json({ error: 'Unexpected server error' });
    }
};
