const projectRepository = [
    {
        id: 0,
        title: "BU Polangui Interactive Navigation System",
        shortDesc: "Developed the BU Polangui Interactive Navigation System, a mobile-based campus navigation and communication platform featuring a 3D campus map, avatar-guided navigation, and real-time announcements using React Native, Node.js, and MongoDB.",
        fullDesc: "Developed the BU Polangui Interactive Navigation System, a mobile-based campus navigation and communication platform featuring a 3D campus map, avatar-guided navigation, and real-time announcements.\n\nThis framework streamlines onboarding workflows for incoming students and university guests alike. It integrates high-fidelity spatial asset structures mapped into real-time render nodes over modern lightweight state controls.",
        image: "assets/images/gallery/JETHLEE.jpg", //PICTURE TROY, botang mo sa assets/images
        stack: "PHP / MySQL"
    },
    {
        id: 1,
        title: "ProcureEase",
        shortDesc: "Developed ProcureEase, a subscription-based procurement management platform designed to streamline transactions between government agencies and accredited suppliers for office supplies, equipment, and other government-related resources.",
        fullDesc: "Developed ProcureEase, a subscription-based procurement management platform designed to streamline transactions between government agencies and accredited suppliers for office supplies, equipment, and other government-related resources.\n\nFeatures secure transactional authentication matrices, real-time dynamic inventory audits, automated supply pipeline fulfillment alerts, and direct relational record keeping.",
        image: "assets/images/gallery/JETHCHAN.jpg", //PICTURE TROY
        stack: "PHP"
    }
];

document.addEventListener("DOMContentLoaded", () => {
    const mainGrid = document.getElementById("mainProjectGrid");
    const viewAllBtn = document.getElementById("viewAllProjectsBtn");

    const allProjModal = document.getElementById("allProjectsModal");
    const closeAllBtn = document.getElementById("closeAllProjectsBtn");
    const modalProjectsGrid = document.getElementById("modalProjectsGrid");

    const detailModal = document.getElementById("detailProjectModal");
    const closeDetailBtn = document.getElementById("closeDetailProjectBtn");

    const mTitle = document.getElementById("modalProjTitle");
    const mDesc = document.getElementById("modalProjDesc");
    const mImage = document.getElementById("modalProjImage");
    const mStack = document.getElementById("modalProjStack");

    const toggleModal = (modal, show) => {
        if (show) {
            modal.classList.remove("invisible", "opacity-0");
        } else {
            modal.classList.add("invisible", "opacity-0");
        }
    };

    const createProjectCard = (project) => {
        return `
            <div data-id="${project.id}" class="project-card-trigger bg-surface/40 border border-element hover:border-line rounded-xl p-5 flex flex-col justify-between group transition-all duration-300 cursor-pointer">
                <div>
                    <div class="flex justify-between items-start gap-2 mb-2">
                        <h3 class="font-bold text-sm text-white group-hover:text-brandLight transition">${project.title}</h3>
                    </div>
                    <p class="text-xs text-textMuted leading-relaxed mb-4">
                        ${project.shortDesc}
                    </p>
                </div>
                <div class="flex items-center justify-between mt-2 pt-2 border-t border-element">
                    <span class="text-[10px] font-mono text-slate-500">${project.stack}</span>
                    <span class="text-xs text-white transform translate-x-[-4px] opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition duration-300">→</span>
                </div>
            </div>
        `;
    };

    // Main Dashboard naka Limit sa 4 projects
    const renderPrimaryFeed = () => {
        const displayedProjects = projectRepository.slice(0, 4);
        mainGrid.innerHTML = displayedProjects.map(p => createProjectCard(p)).join('');
    };

    // View All Portfolio Directory Box Layer
    const renderDirectoryGrid = () => {
        modalProjectsGrid.innerHTML = projectRepository.map(p => createProjectCard(p)).join('');
    };

    const launchProjectDetail = (id) => {
        const targetProj = projectRepository.find(p => p.id === parseInt(id));
        if (targetProj) {
            mTitle.textContent = targetProj.title;
            mDesc.textContent = targetProj.fullDesc;
            mImage.src = targetProj.image;
            mStack.textContent = targetProj.stack;
            toggleModal(detailModal, true);
        }
    };

    document.addEventListener("click", (e) => {
        const card = e.target.closest(".project-card-trigger");
        if (card) {
            const id = card.getAttribute("data-id");
            launchProjectDetail(id);
        }
    });

    viewAllBtn.addEventListener("click", () => {
        renderDirectoryGrid();
        toggleModal(allProjModal, true);
    });

    closeAllBtn.addEventListener("click", () => toggleModal(allProjModal, false));
    closeDetailBtn.addEventListener("click", () => toggleModal(detailModal, false));

    window.addEventListener("click", (e) => {
        if (e.target === allProjModal) toggleModal(allProjModal, false);
        if (e.target === detailModal) toggleModal(detailModal, false);
    });

    // Run Engine Initializers
    renderPrimaryFeed();
});