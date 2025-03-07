// utils/ably.js
const Ably = require('ably');

// Your Ably API key
const ably = new Ably.Realtime('jrRn0w.bxfGbA:DwW2svyt4ahbcu6ZTgEdPge_9Gx3G3DSGOo6LezEvJ4');  // Replace with your API key

// Function to publish to a specific Ably channel
function publishToAbly(event, data) {
  const channel = ably.channels.get('your-channel-name');  // Replace with the dynamic channel name
  return channel.publish(event, data);
}

// Export the function
module.exports = { publishToAbly };
