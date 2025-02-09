/**
 * Mongoose schema for server queue.
 *
 * @typedef {Object} ServerQueueSchema
 * @property {string} _id - Server ID as the document ID.
 * @property {string} serverName - Server name.
 * @property {string|null} [category=null] - Category ID for VCs.
 * @property {Map<string, string[]>} preferences - Default preferences.
 * @property {Array<Object>} usedStats - Array of used statistics.
 * @property {string} usedStats.userId - User ID, indexed for better performance.
 * @property {number} usedStats.statNumber - Statistic number.
 * @property {number} usedStats.stars - Number of stars.
 * @property {Object} queue - Queue object containing different levels.
 * @property {Array<Object>} queue.2 - Queue for level 2.
 * @property {string} queue.2.userId - User ID.
 * @property {number} queue.2.statNumber - Statistic number.
 * @property {number} queue.2.stars - Number of stars.
 * @property {Date} [queue.2.timestamp=Date.now] - Timestamp of the queue entry.
 * @property {Array<Object>} queue.3 - Queue for level 3.
 * @property {string} queue.3.userId - User ID.
 * @property {number} queue.3.statNumber - Statistic number.
 * @property {number} queue.3.stars - Number of stars.
 * @property {Date} [queue.3.timestamp=Date.now] - Timestamp of the queue entry.
 * @property {Array<Object>} queue.4 - Queue for level 4.
 * @property {string} queue.4.userId - User ID.
 * @property {number} queue.4.statNumber - Statistic number.
 * @property {number} queue.4.stars - Number of stars.
 * @property {Date} [queue.4.timestamp=Date.now] - Timestamp of the queue entry.
 */

const mongoose = require("mongoose");
const data = require("../data/config.json");
const logger = require("../utils/logger");

const serverQueueSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Server ID as the document ID
  serverName: { type: String, required: true }, // Server name
  category: { type: String, default: null }, // Category ID for VCs
  preferences: { type: Map, of: [String] }, // Default preferences
  usedStats: [
    {
      userId: { type: String, required: true, index: true }, // Indexed for better performance
      statNumber: { type: Number, required: true },
      stars: { type: Number, required: true },
    },
  ],
  queue: {
    2: [
      {
        userId: { type: String, required: true },
        statNumber: { type: Number, required: true },
        stars: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    3: [
      {
        userId: { type: String, required: true },
        statNumber: { type: Number, required: true },
        stars: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    4: [
      {
        userId: { type: String, required: true },
        statNumber: { type: Number, required: true },
        stars: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
});

const ServerQueue = mongoose.model(
  "ServerQueue",
  serverQueueSchema,
  "serverqueues"
);
module.exports = ServerQueue;
