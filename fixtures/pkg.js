/**
 * Add two numbers together.
 * @summary Add
 * @param {number} a - First addend
 * @param {number} b - Second addend
 * @returns {number} sum - The sum
 */
function add(a, b) {
  return a + b;
}

/**
 * Greet a person by name.
 * @summary Greet
 * @param {text} name - Who to greet
 * @returns {text} greeting - The greeting
 */
function greet(name) {
  return `Hello, ${name}`;
}

module.exports = { add, greet };
