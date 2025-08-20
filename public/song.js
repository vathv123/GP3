const themeBtn = document.getElementById("themeBtn");
  const dropdown = themeBtn.querySelector(".dropdown");
  let isOpen = false;

  themeBtn.addEventListener("click", () => {
    if (!isOpen) {
      dropdown.style.display = "block";
      gsap.fromTo(dropdown, {opacity: 0, y: -10}, {opacity: 1, y: 0, duration: 0.3, ease: "power2.out"});
    } else {
      gsap.to(dropdown, {opacity: 0, y: -10, duration: 0.25, ease: "power2.in", onComplete: () => {
        dropdown.style.display = "none";
      }});
    }
    isOpen = !isOpen;
  });

  dropdown.querySelectorAll("li").forEach(item => {
    item.addEventListener("click", () => {
      const songFile = item.getAttribute("data-song");
      console.log("Loading song:", songFile); 
      themeBtn.firstChild.textContent = item.textContent; 
      // Here you can replace console.log with your actual song loading logic
      gsap.to(dropdown, {opacity: 0, y: -10, duration: 0.25, ease: "power2.in", onComplete: () => {
        dropdown.style.display = "none";
        isOpen = false;
      }});
    });
  });