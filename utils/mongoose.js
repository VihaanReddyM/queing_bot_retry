const mongoose = require('mongoose');
const data = require('../data/config.json');
const logger = require('../utils/logger');

const connectDB = async () => {
    try {
        await mongoose.connect(data.mongoDB);
    } catch (error) {
        logger.error('Database connection error:', error);
    }
};

module.exports = connectDB;
