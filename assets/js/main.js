// Ambient Interface Micro-interactions
document.addEventListener("DOMContentLoaded", () => {
    const primaryButton = document.querySelector(".fixed button");
    
    if (primaryButton) {
        primaryButton.addEventListener("click", () => {
            // Direct initialization to route communication
            window.location.href = "mailto:markerickserrano1@gmail.com?subject=Project%20Workspace%20Inquiry";
        });
    }
});