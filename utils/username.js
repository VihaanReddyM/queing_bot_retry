function getUsername(input) {
  const username = input.replace(/\[.*\] /, ''); // Removes everything before and including the space after the closing bracket
  return username;
}

module.exports = getUsername;