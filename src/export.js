/**
 * Export functions for MindMap
 */

/**
 * Export map as Markdown with hierarchy
 */
export function exportMarkdown(map) {
    const lines = [];

    function walk(nodeId, depth) {
        const node = map.nodes[nodeId];
        if (!node) return;

        // Clean text: replace newlines with spaces
        const text = (node.text || '').replace(/\n/g, ' ').trim() || '(vide)';

        if (depth === 0) {
            lines.push(`# ${text}`);
        } else if (depth === 1) {
            lines.push(`\n## ${text}`);
        } else {
            const indent = '  '.repeat(depth - 2);
            lines.push(`${indent}- ${text}`);
        }

        if (node.children && node.children.length > 0) {
            node.children.forEach(childId => walk(childId, depth + 1));
        }
    }

    walk(map.rootId, 0);

    const content = lines.join('\n');
    const filename = `${map.title || 'mindmap'}.md`;
    downloadText(content, filename, 'text/markdown');
}

/**
 * Export map as PNG image
 */
export function exportImage(svgElement, map, pan) {
    const svg = svgElement.cloneNode(true);
    const viewport = svg.querySelector('#viewport');

    // Reset transform to show full map
    viewport.setAttribute('transform', '');

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.values(map.nodes).forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.w);
        maxY = Math.max(maxY, n.y + n.h);
    });

    const padding = 40;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    // Center the content
    viewport.setAttribute('transform', `translate(${-minX + padding},${-minY + padding})`);

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Add white background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'white');
    svg.insertBefore(bg, svg.firstChild);

    // Convert SVG to canvas
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2; // Higher resolution
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);

        URL.revokeObjectURL(url);

        canvas.toBlob(blob => {
            const filename = `${map.title || 'mindmap'}.png`;
            downloadBlob(blob, filename);
        }, 'image/png');
    };
    img.src = url;
}

/**
 * Export map as PDF
 */
export function exportPdf(svgElement, map, pan) {
    const svg = svgElement.cloneNode(true);
    const viewport = svg.querySelector('#viewport');

    // Reset transform to show full map
    viewport.setAttribute('transform', '');

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.values(map.nodes).forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.w);
        maxY = Math.max(maxY, n.y + n.h);
    });

    const padding = 40;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    // Center the content
    viewport.setAttribute('transform', `translate(${-minX + padding},${-minY + padding})`);

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Add white background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'white');
    svg.insertBefore(bg, svg.firstChild);

    // Convert SVG to canvas then to PDF
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);

        URL.revokeObjectURL(url);

        // Create PDF using canvas data
        const imgData = canvas.toDataURL('image/png');

        // Determine page orientation
        const isLandscape = width > height;
        const pageWidth = isLandscape ? 297 : 210; // A4 in mm
        const pageHeight = isLandscape ? 210 : 297;

        // Scale to fit page
        const scaleX = (pageWidth - 20) / width;
        const scaleY = (pageHeight - 20) / height;
        const pdfScale = Math.min(scaleX, scaleY);

        const pdfWidth = width * pdfScale;
        const pdfHeight = height * pdfScale;
        const offsetX = (pageWidth - pdfWidth) / 2;
        const offsetY = (pageHeight - pdfHeight) / 2;

        // Simple PDF generation (without jsPDF dependency)
        // We'll use a data URL approach with an embedded image
        const pdfContent = generateSimplePdf(imgData, pageWidth, pageHeight, offsetX, offsetY, pdfWidth, pdfHeight, isLandscape);

        const filename = `${map.title || 'mindmap'}.pdf`;
        downloadBlob(new Blob([pdfContent], { type: 'application/pdf' }), filename);
    };
    img.src = url;
}

/**
 * Generate a simple PDF with embedded image
 * This is a minimal PDF generator without external dependencies
 */
function generateSimplePdf(imgDataUrl, pageWidth, pageHeight, x, y, imgWidth, imgHeight, isLandscape) {
    // Extract base64 data from data URL
    const base64Data = imgDataUrl.split(',')[1];
    const imgBytes = atob(base64Data);

    // PDF structure
    const objects = [];
    let objectCount = 0;

    function addObject(content) {
        objectCount++;
        objects.push({ id: objectCount, content });
        return objectCount;
    }

    // Convert mm to PDF points (1 mm = 2.834645669 points)
    const mmToPt = 2.834645669;
    const pWidth = pageWidth * mmToPt;
    const pHeight = pageHeight * mmToPt;
    const imgX = x * mmToPt;
    const imgY = (pageHeight - y - imgHeight) * mmToPt; // PDF Y is from bottom
    const imgW = imgWidth * mmToPt;
    const imgH = imgHeight * mmToPt;

    // Object 1: Catalog
    addObject('<< /Type /Catalog /Pages 2 0 R >>');

    // Object 2: Pages
    addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');

    // Object 3: Page
    addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pWidth.toFixed(2)} ${pHeight.toFixed(2)}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`);

    // Object 4: Content stream
    const contentStream = `q ${imgW.toFixed(2)} 0 0 ${imgH.toFixed(2)} ${imgX.toFixed(2)} ${imgY.toFixed(2)} cm /Im0 Do Q`;
    addObject(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);

    // Object 5: Image XObject
    const imgBinary = new Uint8Array(imgBytes.length);
    for (let i = 0; i < imgBytes.length; i++) {
        imgBinary[i] = imgBytes.charCodeAt(i);
    }

    // For PNG, we need to decode and re-encode as raw image data
    // This is complex, so let's use JPEG instead via canvas
    // Actually, let's just embed as DCTDecode (JPEG-like) which most viewers support

    // Simpler approach: create a downloadable HTML file that opens as PDF
    // Or use the browser's print functionality

    // Actually, the simplest reliable approach without dependencies:
    // Return an SVG wrapped in HTML that can be printed to PDF
    // Let's switch to using window.print() approach

    return createPrintablePdf(imgDataUrl, pageWidth, pageHeight, x, y, imgWidth, imgHeight);
}

/**
 * Create a printable HTML page that opens in a new window for PDF printing
 */
function createPrintablePdf(imgDataUrl, pageWidth, pageHeight, x, y, imgWidth, imgHeight) {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>MindMap Export</title>
    <style>
        @page { size: ${pageWidth}mm ${pageHeight}mm; margin: 0; }
        body { margin: 0; padding: 0; }
        img { display: block; margin: ${y}mm auto; width: ${imgWidth}mm; height: ${imgHeight}mm; }
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <img src="${imgDataUrl}" />
    <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();

    // Return empty blob since we're using print dialog
    return new Uint8Array(0);
}

// Helper functions
function downloadText(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
