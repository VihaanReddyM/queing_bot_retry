const mongoose = require('mongoose');
const data = require('../data/config.json');
const logger = require('../utils/logger');

const serverQueueSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Server ID as the document ID
    serverName: { type: String, required: true }, // Server name
    category: { type: String, default: null }, // Category ID for VCs
    preferences: { type: Map, of: [String]}, // Default preferences
    usedStats: [
        {
            userId: { type: String, required: true, index: true }, // Indexed for better performance
            statNumber: { type: Number, required: true },
        }
    ],
    queue: {
        "2": [
            {
                userId: { type: String, required: true },
                statNumber: { type: Number, required: true },
                timestamp: { type: Date, default: Date.now },
            },
        ],
        "3": [
            {
                userId: { type: String, required: true },
                statNumber: { type: Number, required: true },
                timestamp: { type: Date, default: Date.now },
            },
        ],
        "4": [
            {
                userId: { type: String, required: true },
                statNumber: { type: Number, required: true },
                timestamp: { type: Date, default: Date.now },
            },
        ],
    },
});

const ServerQueue = mongoose.model('ServerQueue', serverQueueSchema, 'serverqueues');
module.exports = ServerQueue;
