const desktop = document.querySelector(".desktop");
const moodButtons = [...document.querySelectorAll("[data-set-mood]")];
const moods = ["waiting", "happy", "sad", "angry"];
let moodIndex = 0;

function setMood(mood) {
  desktop.dataset.mood = mood;
  moodIndex = Math.max(0, moods.indexOf(mood));
  moodButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.setMood === mood);
  });
}

document.addEventListener("click", (event) => {
  const moodButton = event.target.closest("[data-set-mood]");
  if (moodButton) {
    setMood(moodButton.dataset.setMood);
    return;
  }

  if (!event.target.closest("[data-cycle-mood]")) {
    return;
  }

  setMood(moods[(moodIndex + 1) % moods.length]);
});

setMood(desktop.dataset.mood);
