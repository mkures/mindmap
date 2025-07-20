import { NODE_PADDING, NODE_TEXT_H } from './layout.js';

export function render(map, svg, selectedId) {
    svg.innerHTML = '';
    const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    linkGroup.id = 'links';
    svg.appendChild(linkGroup);
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodeGroup.id = 'nodes';
    svg.appendChild(nodeGroup);

    // draw links
    Object.values(map.nodes).forEach(node => {
        if (node.parentId) {
            const parent = map.nodes[node.parentId];
            const x1 = parent.x + parent.w;
            const y1 = parent.y + parent.h / 2;
            const x2 = node.x;
            const y2 = node.y + node.h / 2;
            const mid = (x1 + x2) / 2;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('link');
            path.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
            path.setAttribute('fill', 'none');
            linkGroup.appendChild(path);
        }
    });

    // draw nodes
    for (const id in map.nodes) {
        const node = map.nodes[id];
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('node');
        g.setAttribute('data-id', id);
        if (id === selectedId) g.classList.add('selected');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', node.w);
        rect.setAttribute('height', node.h);
        if (node.color) rect.style.fill = node.color;
        g.appendChild(rect);

        let cursorY = NODE_PADDING;
        if (node.media && node.media.kind === 'image') {
            const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            img.classList.add('node-image');
            img.dataset.url = node.media.dataUrl;
            img.dataset.nw = node.media.naturalWidth;
            img.dataset.nh = node.media.naturalHeight;
            img.setAttribute('href', node.media.dataUrl);
            img.setAttribute('width', node.media.width);
            img.setAttribute('height', node.media.height);
            img.setAttribute('x', (node.w - node.media.width) / 2);
            img.setAttribute('y', cursorY);
            g.appendChild(img);
            cursorY += node.media.height + NODE_PADDING;
        }

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.w / 2);
        text.setAttribute('y', cursorY + NODE_TEXT_H / 2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = node.text;
        g.appendChild(text);

        nodeGroup.appendChild(g);
    }
}
