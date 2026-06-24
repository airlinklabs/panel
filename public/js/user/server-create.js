(function () {
    function buildCustomSelect(container) {
        const selectId = container.dataset.for;
        const select   = document.getElementById(selectId);
        if (!select) return;

        const trigger = document.createElement("div");
        trigger.className = "cs-trigger";

        const label = document.createElement("span");
        label.className = "cs-label";
        trigger.appendChild(label);

        const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        arrow.setAttribute("viewBox", "0 0 24 24"); arrow.setAttribute("fill", "none");
        arrow.setAttribute("stroke", "currentColor"); arrow.setAttribute("stroke-width", "2");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("d", "M19 9l-7 7-7-7");
        arrow.appendChild(path); trigger.appendChild(arrow);

        const dropdown = document.createElement("div");
        dropdown.className = "cs-dropdown";
        dropdown.style.display = "none";

        container.appendChild(trigger);
        container.appendChild(dropdown);

        function syncFromSelect() {
            dropdown.innerHTML = "";
            const opts = Array.from(select.options);
            let hasSelected = false;
            opts.forEach(function (opt) {
                const item = document.createElement("div");
                item.className = "cs-option" + (opt.disabled ? " disabled" : "") + (opt.selected && !opt.disabled ? " selected" : "");
                item.textContent = opt.text;
                item.dataset.value = opt.value;
                if (!opt.disabled) {
                    item.addEventListener("click", function (e) {
                        e.stopPropagation();
                        select.value = opt.value;
                        select.dispatchEvent(new Event("change", { bubbles: true }));
                        syncLabel();
                        close();
                    });
                }
                dropdown.appendChild(item);
            });
            syncLabel();
        }

        function syncLabel() {
            const sel = select.options[select.selectedIndex];
            if (sel && !sel.disabled) {
                label.textContent = sel.text;
                label.classList.remove("cs-placeholder");
            } else {
                const placeholder = Array.from(select.options).find(function(o) { return o.disabled && o.selected; });
                label.textContent = placeholder ? placeholder.text : "Select...";
                label.classList.add("cs-placeholder");
            }
            Array.from(dropdown.children).forEach(function (item) {
                item.classList.toggle("selected", item.dataset.value === select.value);
            });
        }

        function open() {
            dropdown.style.display = "block";
            trigger.classList.add("open");
            syncFromSelect();
        }

        function close() {
            dropdown.style.display = "none";
            trigger.classList.remove("open");
        }

        trigger.addEventListener("click", function (e) {
            e.stopPropagation();
            dropdown.style.display === "none" ? open() : close();
        });

        document.addEventListener("click", close);

        const observer = new MutationObserver(syncFromSelect);
        observer.observe(select, { childList: true, subtree: true, attributes: true });
        select.addEventListener("change", syncLabel);

        syncFromSelect();
    }

    function initAll() {
        document.querySelectorAll(".custom-select").forEach(buildCustomSelect);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAll);
    } else {
        initAll();
    }
})();
