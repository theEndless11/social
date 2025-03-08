const { promisePool } = require('../utils/db'); // Importing MySQL connection pool
const { publishToAbly } = require('../utils/ably');

// Set CORS headers
const setCorsHeaders = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

        // DELETE: Remove a message
        if (req.method === 'DELETE') {
            const { messageId, username, chatWith } = req.body;

            if (!messageId || !username || !chatWith) {
                return res.status(400).json({ error: 'Missing required fields: messageId, username, chatWith' });
            }

            const usernameLower = username.toLowerCase();
            const chatWithLower = chatWith.toLowerCase();

            const sql = `
                DELETE FROM messages 
                WHERE id = ? AND ((username = ? AND chatwith = ?) OR (username = ? AND chatwith = ?))
            `;

            try {
                const [result] = await promisePool.execute(sql, [messageId, usernameLower, chatWithLower, chatWithLower, usernameLower]);

                if (result.affectedRows > 0) {
                    console.log(`✅ Message ID ${messageId} deleted`);
                    return res.status(200).json({ success: true });
                } else {
                    return res.status(404).json({ error: 'Message not found' });
                }
            } catch (error) {
                console.error('❌ Error deleting message:', error);
                return res.status(500).json({ error: 'Database error while deleting message' });
            }
        }

        // GET: Fetch messages
        if (req.method === 'GET') {
            const { username, chatWith } = req.query;

            if (!username || !chatWith) {
                return res.status(400).json({ error: 'Missing required query parameters: username or chatWith' });
            }

            const usernameLower = username.toLowerCase();
            const chatWithLower = chatWith.toLowerCase();

            const sql = `
                SELECT * FROM messages 
                WHERE (username = ? AND chatwith = ?) OR (username = ? AND chatwith = ?) 
                ORDER BY timestamp
            `;

            try {
                const [messages] = await promisePool.execute(sql, [usernameLower, chatWithLower, chatWithLower, usernameLower]);

                if (messages.length > 0) {
                    const formattedMessages = messages.map(message => ({
                        id: message.id,
                        username: message.username,
                        chatWith: message.chatwith,
                        message: message.message,
                        photo: message.photo,
                        timestamp: message.timestamp,
                        side: message.username === usernameLower ? 'user' : 'other', 
                    }));

                    return res.status(200).json({ messages: formattedMessages });
                } else {
                    return res.status(404).json({ error: 'No messages found for this chat' });
                }
            } catch (error) {
                console.error('❌ Error fetching messages:', error);
                return res.status(500).json({ error: 'Database error while fetching messages' });
            }
        }

        // POST: Send a new message
        if (req.method === 'POST') {
            const { username, chatWith, message, photo } = req.body;

            if (!username || !chatWith || (!message && !photo)) {
                return res.status(400).json({ error: 'Missing required fields: username, chatWith, message/photo' });
            }

            const usernameLower = username.toLowerCase();
            const chatWithLower = chatWith.toLowerCase();
            let photoPath = null;

            if (photo && photo.startsWith('data:image')) {
                photoPath = photo; 
            }

            const sql = `
                INSERT INTO messages (username, chatwith, message, photo, timestamp) 
                VALUES (?, ?, ?, ?, NOW())
            `;

            try {
                const [result] = await promisePool.execute(sql, [usernameLower, chatWithLower, message || '', photoPath || null]);

                if (result.affectedRows > 0) {
                    console.log('✅ Message inserted successfully');

                    const messageData = { username: usernameLower, chatWith: chatWithLower, message, photo: photoPath };

                    try {
                        await publishToAbly(`chat-${chatWithLower}-${usernameLower}`, 'newMessage', messageData);
                        console.log('✅ Message published to Ably');
                    } catch (error) {
                        console.error('❌ Error publishing to Ably:', error);
                        return res.status(500).json({ error: 'Failed to publish message to Ably' });
                    }

                    return res.status(200).json({ message: 'Message sent successfully' });
                } else {
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

