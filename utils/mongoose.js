/**
 * Asynchronously connects to the MongoDB database.
 * Logs an error message if the connection fails.
 *
 * @async
 * @function connectDB
 * @returns {Promise<void>} A promise that resolves when the connection is successful.
 * @throws Will log an error message if the connection fails.
 */

const mongoose = require("mongoose");
const data = require("../data/config.json");
const logger = require("../utils/logger");

const connectDB = async () => {
  try {
    await mongoose.connect(data.mongoDB);
  } catch (error) {
    logger.error("Database connection error:", error);
  }
};

module.exports = connectDB;
