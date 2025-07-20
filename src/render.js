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
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.classList.add('link');
            line.setAttribute('x1', parent.x + parent.w);
            line.setAttribute('y1', parent.y + parent.h / 2);
            line.setAttribute('x2', node.x);
            line.setAttribute('y2', node.y + node.h / 2);
            linkGroup.appendChild(line);
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

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', 10);
        text.setAttribute('y', 25);
        text.textContent = node.text;
        g.appendChild(text);

        nodeGroup.appendChild(g);
    }
}
