/* global document */

function initializeFlow() {
  const nodes = [...document.querySelectorAll("[data-flow-node]")];
  const details = [...document.querySelectorAll("[data-flow-detail]")];
  if (!nodes.length || !details.length) return;

  function selectFlowStep(step) {
    nodes.forEach((node) => {
      node.setAttribute("aria-pressed", String(node.dataset.flowNode === step));
    });
    details.forEach((detail) => {
      detail.hidden = detail.dataset.flowDetail !== step;
    });
  }

  nodes.forEach((node) => {
    node.addEventListener("click", () => selectFlowStep(node.dataset.flowNode));
  });
  selectFlowStep(nodes[0].dataset.flowNode);
}

function initializeSimulator() {
  const root = document.querySelector("[data-simulator]");
  if (!root) return;
  const states = [...root.querySelectorAll("[data-simulator-state]")];
  const previous = root.querySelector("[data-simulator-previous]");
  const next = root.querySelector("[data-simulator-next]");
  const counter = root.querySelector("[data-simulator-counter]");
  let index = 0;

  function render() {
    states.forEach((state, stateIndex) => {
      state.hidden = stateIndex !== index;
    });
    previous.disabled = index === 0;
    next.disabled = index === states.length - 1;
    counter.textContent = `Schritt ${index + 1} von ${states.length}`;
  }

  previous.addEventListener("click", () => {
    index = Math.max(0, index - 1);
    render();
  });
  next.addEventListener("click", () => {
    index = Math.min(states.length - 1, index + 1);
    render();
  });
  render();
}

function initializeQuizzes() {
  document.querySelectorAll("[data-quiz-question]").forEach((question) => {
    const options = [...question.querySelectorAll("[data-answer]")];
    const feedback = question.querySelector("[data-quiz-feedback]");
    options.forEach((option) => {
      option.addEventListener("click", () => {
        const correct = option.dataset.answer === "correct";
        options.forEach((candidate) => {
          candidate.classList.remove("is-correct", "is-wrong");
          candidate.removeAttribute("aria-pressed");
        });
        option.classList.add(correct ? "is-correct" : "is-wrong");
        option.setAttribute("aria-pressed", "true");
        feedback.dataset.tone = correct ? "correct" : "wrong";
        feedback.textContent = correct
          ? question.dataset.correctFeedback
          : question.dataset.wrongFeedback;
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initializeFlow();
  initializeSimulator();
  initializeQuizzes();
});
