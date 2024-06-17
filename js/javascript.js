const hamburger = document.querySelector(".hamburger");
const navMenu = document.querySelector(".nav-menu");

hamburger.addEventListener("click", mobileMenu);

function mobileMenu() {
    hamburger.classList.toggle("active");
    navMenu.classList.toggle("active");
}

const navLink = document.querySelectorAll(".nav-link");

navLink.forEach(n => n.addEventListener("click", closeMenu));

function closeMenu() {
    hamburger.classList.remove("active");
    navMenu.classList.remove("active");
}

// CALCULATOR
let expression = '';

function appendNumber(number) {
  expression += number;
  document.getElementById('display').value = expression;
}

function appendOperator(operator) {
  if (expression !== '') {
    expression += operator;
    document.getElementById('display').value = expression;
  }
}

function clearDisplay() {
  expression = '';
  document.getElementById('display').value = '';
}

function calculateResult() {
  try {
    const result = eval(expression);
    document.getElementById('display').value = result;
    expression = '';
  } catch (error) {
    document.getElementById('display').value = 'Error';
  }
}