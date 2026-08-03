/* inline script 1 */

    (function() {
        if (window.imageViewerSystem) return;

        window.imageViewerSystem = () => {
            const modal = document.getElementById('imageViewerModal');
            const panel = document.getElementById('imageViewerPanel');
            const title = document.getElementById('imageViewerTitle');
            const image = document.getElementById('imageViewerContent');
            const sizeInfo = document.getElementById('imageViewerSize');
            const downloadBtn = document.getElementById('imageViewerDownload');

            let currentImagePath = '';
            let currentFileName = '';
            let currentServerUUID = '';
            let modalReturnFocus = null;

            const showImageViewer = (fileName, filePath, fileSize, serverUUID) => {
                currentImagePath = filePath;
                currentFileName = fileName;
                currentServerUUID = serverUUID;

                title.textContent = fileName;
                sizeInfo.textContent = fileSize;
                image.src = `/server/${serverUUID}/files/download/${encodeURIComponent(filePath)}`;

                modalReturnFocus = document.activeElement;
                modal.classList.remove('opacity-0', 'pointer-events-none');
                if (window.Animate) Animate.openModal(modal, panel);
                else { modal.classList.add('open'); panel.classList.add('open'); }

                panel.focus();
                document.addEventListener('keydown', handleKeyDown);
            };

            const closeImageViewer = () => {
                const done = function () {
                    modal.classList.add('opacity-0', 'pointer-events-none');
                };
                if (window.Animate) Animate.closeModal(modal, panel, done);
                else { modal.classList.remove('open'); panel.classList.remove('open'); done(); }
                document.removeEventListener('keydown', handleKeyDown);
                if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
                modalReturnFocus = null;
                setTimeout(() => {
                    image.src = '';
                }, 300);
            };

            const handleKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeImageViewer();
                    return;
                }
                if (event.key !== 'Tab') return;
                const focusable = Array.from(panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                    .filter(el => !el.disabled && el.offsetParent !== null);
                if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            };

            const downloadViewedImage = () => {
                if (currentImagePath && currentFileName && currentServerUUID) {
                    const url = `/server/${currentServerUUID}/files/download/${encodeURIComponent(currentImagePath)}`;
                    fetch(url, { method: 'GET' })
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Error downloading file: ${response.statusText}`);
                            }
                            return response.blob();
                        })
                        .then(blob => {
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = currentFileName;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            window.URL.revokeObjectURL(url);
                        })
                        .catch(error => {
                            console.error('Download failed:', error);
                            if (typeof showToast === 'function') {
                                showToast('Failed to download file', 'error');
                            }
                        });
                }
            };

            return { showImageViewer, closeImageViewer, downloadViewedImage };
        };

        const { showImageViewer, closeImageViewer, downloadViewedImage } = window.imageViewerSystem();
        window.showImageViewer = showImageViewer;
        window.closeImageViewer = closeImageViewer;
        window.downloadViewedImage = downloadViewedImage;
    })();
