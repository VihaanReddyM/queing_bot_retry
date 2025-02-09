/**
 * Extracts the number of stars from a given input string.
 *
 * @param {string} input - The input string containing the stars.
 * @returns {number} The number of stars found in the input string, or NaN if no stars are found.
 */

const logger = require("./logger");

function getUsername(input) {
  const username = input.replace(/\[.*?\] /, ""); // Removes the bracket block and trailing space
  return username;
}

function getstars(input) {
  const match = input.match(/\[\s*(\d+)\s*[⭐🌠]*/);
  if (!match) {
    logger.error(`No stars found in nickname: ${input}`);
    return NaN; // or handle the error appropriately
  }
  return parseInt(match[1], 10);
}

module.exports = {
  getUsername,
  getstars,
};
