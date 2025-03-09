// utils/ably.js
const Ably = require('ably');

// Your Ably API key
const ably = new Ably.Realtime('jrRn0w.qt07-A:Ur6zA0H-VSBww2ubVH61Kfgtnf8qf12wTYgkQjqNsiE');  // Replace with your API key

// Function to publish to a specific Ably channel
function publishToAbly(event, data) {
  const channel = ably.channels.get('joke');  // Replace with the dynamic channel name
  return channel.publish(event, data);
}

// Export the function
module.exports = { publishToAbly };
