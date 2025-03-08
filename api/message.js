const pool = require('../utils/db'); // Importing MySQL connection pool
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

        // Handle GET request to fetch messages
        if (req.method === 'GET') {
            const { username, chatWith } = req.query;

            if (!username || !chatWith) {
                console.error('❌ Missing query parameters: username or chatWith');
                return res.status(400).json({ error: 'Missing required query parameters: username or chatWith' });
            }

            const usernameLower = username.toLowerCase();
            const chatWithLower = chatWith.toLowerCase();

            console.log(`📩 Fetching messages for username: ${usernameLower} ↔️ chatWith: ${chatWithLower}`);

            // Query to fetch messages between two users
            const sql = `
                SELECT * FROM messages 
                WHERE (username = $1 AND chatwith = $2) OR (username = $3 AND chatwith = $4) 
                ORDER BY timestamp
            `;

            try {
                const result = await pool.query(sql, [usernameLower, chatWithLower, chatWithLower, usernameLower]);
                const messages = result.rows;

                if (messages.length > 0) {
                    console.log(`✅ Fetched ${messages.length} messages`);

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
                    console.log('⚠️ No messages found for this chat');
                    return res.status(404).json({ error: 'No messages found for this chat' });
                }
            } catch (error) {
                console.error('❌ Error fetching messages from database:', error);
                return res.status(500).json({ error: 'Failed to fetch messages from the database' });
            }
        }
     // Handle DELETE request to delete a message from the database
if (req.method === 'DELETE') {
    const { messageId, username, chatWith } = req.body;

    console.log('DELETE request received with messageId:', messageId, 'username:', username, 'chatWith:', chatWith);

    if (!messageId || !username || !chatWith) {
        console.error('Missing fields in DELETE request');
        return res.status(400).json({ error: 'Missing required fields: messageId, username, chatWith' });
    }

    // Ensure both username and chatWith are in lowercase to avoid case sensitivity issues
    const usernameLower = username.toLowerCase();
    const chatWithLower = chatWith.toLowerCase();

    // Delete the message from the database
    const sql = `DELETE FROM messages WHERE id = $1 AND (username = $2 AND chatwith = $3) OR (username = $3 AND chatwith = $2)`;
    try {
        const result = await pool.query(sql, [messageId, usernameLower, chatWithLower]);

        if (result.rowCount > 0) {
            console.log('Message deleted from the database');
            return res.status(200).json({ success: true });
        } else {
            console.error('Message not found or could not be deleted');
            return res.status(404).json({ error: 'Message not found' });
        }
    } catch (err) {
        console.error('Error deleting message from database:', err);
        return res.status(500).json({ error: 'Failed to delete message from the database' });
    }
}


        // Handle POST request to send a message (with optional photo)
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
                photoPath = photo;  // Store the base64 string directly
            }

            // Insert the message into the database
            const sql = `
                INSERT INTO messages (username, chatwith, message, photo, timestamp) 
                VALUES ($1, $2, $3, $4, NOW())
            `;

            try {
                const result = await pool.query(sql, [usernameLower, chatWithLower, message || '', photoPath || null]);

                if (result.rowCount > 0) {
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

                    return res.status(200).json({ message: 'Message sent successfully' });
                } else {
                    console.error('❌ Message insertion failed');
                    return res.status(500).json({ error: 'Failed to insert message into the database' });
                }
            } catch (error) {
                console.error('❌ Error inserting message into database:', error);
                return res.status(500).json({ error: 'Database error while inserting message' });
            }
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error('❌ Unexpected error:', error);
        return res.status(500).json({ error: 'Unexpected server error' });
    }
};
