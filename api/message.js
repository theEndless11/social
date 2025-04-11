const pool = require('../utils/db'); // Importing MySQL connection pool
const { publishToAbly } = require('../utils/ably');

// Set CORS headers
const setCorsHeaders = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');  // Add PUT to the allowed methods
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

        // Handle GET request to fetch messages and their seen status
        if (req.method === 'GET') {
            const { username, chatWith } = req.query;

            if (!username || !chatWith) {
                console.error('❌ Missing query parameters: username or chatWith');
                return res.status(400).json({ error: 'Missing required query parameters: username or chatWith' });
            }

            const usernameLower = username.toLowerCase();
            const chatWithLower = chatWith.toLowerCase();

            console.log(`📩 Fetching messages for username: ${usernameLower} ↔️ chatWith: ${chatWithLower}`);

            // Query to fetch messages and their seen status
            const sql = `
                SELECT id, username, chatwith, message, photo, timestamp, seen
                FROM messages
                WHERE (username = $1 AND chatwith = $2) OR (username = $2 AND chatwith = $1)
                ORDER BY timestamp;
            `;

            try {
                const result = await pool.query(sql, [usernameLower, chatWithLower]);
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
                        seen: message.seen,  // Directly fetched 'seen' field
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
    if (req.method === 'PUT') {
      const { id } = req.body;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'Invalid or missing message ID' });
      }

      const messageId = parseInt(id);

      try {
        const result = await pool.query(
          'UPDATE messages SET seen = TRUE WHERE id = $1',
          [messageId]
        );

        if (result.rowCount > 0) {
          return res.status(200).json({ message: 'Message marked as seen' });
        } else {
          return res.status(404).json({ error: 'Message not found' });
        }
      } catch (error) {
        console.error('❌ Database error while updating seen status:', error);
        return res.status(500).json({ error: 'Database error' });
      }
    }

// ✅ Handle POST: send new message
if (req.method === 'POST') {
  const { username, chatWith, message, photo, timestamp } = req.body;

  console.log(`📩 POST request received: ${username} → ${chatWith}, Message: "${message}"`);

  // Check for required fields
  if (!username || !chatWith || (!message && !photo)) {
    console.error('❌ Missing fields in POST request');
    return res.status(400).json({ error: 'Missing required fields: username, chatWith, message/photo' });
  }

  const usernameLower = username.toLowerCase();
  const chatWithLower = chatWith.toLowerCase();
  
  // Check if the photo is a base64 string (image)
  const photoPath = photo?.startsWith('data:image') ? photo : null;

  // SQL query to insert the message into the database
  const sql = `
    INSERT INTO messages (username, chatwith, message, photo, timestamp)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  try {
    // Insert the message into the database and return the inserted row
    const result = await pool.query(sql, [
      usernameLower,
      chatWithLower,
      message || '', // Default to empty string if no message
      photoPath,
      timestamp || new Date().toISOString(), // Use provided timestamp or current time
    ]);

    const insertedMessage = result.rows[0]; // Assuming the first row contains the inserted message

    // If the insert failed
    if (!insertedMessage) {
      return res.status(500).json({ error: 'Failed to insert message into the database' });
    }

    // 🛰️ Send real message with ID back and publish to Ably
    try {
      console.log('📡 Publishing to Ably:', insertedMessage);
      await publishToAbly(`chat-${chatWithLower}-${usernameLower}`, 'newMessage', insertedMessage);
      console.log('✅ Message published to Ably');
    } catch (error) {
      console.error('❌ Error publishing to Ably:', error);
      return res.status(500).json({ error: 'Failed to publish message to Ably' });
    }

    // Return the full message with ID as the response
    return res.status(201).json({ message: insertedMessage });
  } catch (error) {
    console.error('❌ Error inserting message into DB:', error);
    return res.status(500).json({ error: 'Database error while inserting message' });
  }
}

    // ✅ If method is not supported
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('❌ Unexpected server error:', error);
    return res.status(500).json({ error: 'Unexpected server error' });
  }

};

