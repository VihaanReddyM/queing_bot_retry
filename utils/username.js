function getUsername(input) {
  const username = input.replace(/\[.*?\] /, ''); // Removes the bracket block and trailing space
  return username;
}

function getstars(input) {
  const match = input.match(/\[(\d+)\s*[⭐]*/); // Match numbers after '[' with optional spaces/stars
  if (!match) {
    console.error(`No stars found in nickname: ${input}`);
  }
  return parseInt(match[1], 10);
}

module.exports = {
  getUsername,
  getstars
};